#[cfg(not(target_os = "android"))]
use std::sync::{Arc, Mutex};
use std::sync::OnceLock;
#[cfg(not(target_os = "android"))]
use std::process::Child;
#[cfg(not(target_os = "android"))]
use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_http::reqwest;

mod email;
pub use email::send_email;

mod dev_logger;

#[cfg(not(target_os = "android"))]
use headless_chrome::{Browser, LaunchOptions};
#[cfg(not(target_os = "android"))]
use headless_chrome::browser::default_executable;
#[cfg(not(target_os = "android"))]
use std::io::Write;
#[cfg(not(target_os = "android"))]
use tempfile::Builder;

// ── WebView session state ─────────────────────────────────────────────────────
// Login flow: we spawn Chrome as a plain subprocess (no CDP, no automation
// flags) so Cloudflare / FriendlyCaptcha anti-bot checks don't trip up the
// user. The child handle lets us kill the process when the user confirms.
#[cfg(not(target_os = "android"))]
type LoginBrowserState = Arc<Mutex<Option<Child>>>;

/// Resolved database URI, computed once at startup.
static DB_URI: OnceLock<String> = OnceLock::new();

/// Determine the database URI.
///
/// **Portable mode**: if a `.portable` marker file exists next to the
/// executable, the database is stored in a `data/` folder beside it
/// (ideal for USB sticks).  Otherwise the default Tauri-managed path
/// (`sqlite:resumeforge.db` → `%AppData%` / `~/.local/share/…`) is used.
fn resolve_db_uri() -> String {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let marker = exe_dir.join(".portable");
            if marker.exists() {
                let data_dir = exe_dir.join("data");
                // Create the data/ directory if it doesn't exist yet
                let _ = std::fs::create_dir_all(&data_dir);
                let db_path = data_dir.join("resumeforge.db");
                return format!("sqlite:{}", db_path.display());
            }
        }
    }
    // Default: let tauri-plugin-sql resolve to the platform app-data dir
    "sqlite:resumeforge.db".to_string()
}

/// Start a temporary HTTP server on localhost that captures the OAuth2 callback.
/// Only available on desktop (not Android).
/// Returns the port the server is listening on.
/// When the callback arrives, emits an "oauth://callback" event with the request path.
#[cfg(not(target_os = "android"))]
#[tauri::command]
fn start_oauth_server(app: tauri::AppHandle) -> Result<u16, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    tauri::async_runtime::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = std::str::from_utf8(&buf[..n]).unwrap_or("");

            // Extract path from "GET /callback?code=...&state=... HTTP/1.1"
            if let Some(path) = request.lines().next().and_then(|l| l.split_whitespace().nth(1)) {
                let body = concat!(
                    "<!DOCTYPE html><html><head><meta charset='UTF-8'>",
                    "<style>body{font-family:sans-serif;text-align:center;padding:60px;color:#333}</style>",
                    "</head><body>",
                    "<h2>&#x2705; Authentification réussie</h2>",
                    "<p>Vous pouvez fermer cet onglet et retourner dans ResumeForge.</p>",
                    "<script>setTimeout(()=>window.close(),2000);</script>",
                    "</body></html>"
                );
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
                drop(stream);
                let _ = app.emit("oauth://callback", path.to_string());
            }
        }
    });

    Ok(port)
}

#[tauri::command]
fn get_db_uri() -> String {
    DB_URI.get_or_init(resolve_db_uri).clone()
}

const APEC_SEARCH_PAGE: &str = "https://www.apec.fr/candidat/recherche-emploi.html/emploi";
const APEC_API_URL: &str = "https://www.apec.fr/cms/webservices/rechercheOffre";
const APEC_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
/// Durée de vie de la session APEC mise en cache (cookies de la page de recherche).
const APEC_SESSION_TTL: std::time::Duration = std::time::Duration::from_secs(600);

/// Cookies de session APEC obtenus par un GET préalable de la page de recherche,
/// réutilisés pour les pages suivantes d'une même recherche (comme un onglet ouvert).
static APEC_SESSION: std::sync::Mutex<Option<(std::time::Instant, String)>> =
    std::sync::Mutex::new(None);

/// Construit l'en-tête `Cookie` à partir des en-têtes `Set-Cookie` d'une réponse :
/// seule la paire `nom=valeur` de chaque cookie est renvoyée, comme le fait un navigateur.
fn build_cookie_header(set_cookies: &[String]) -> String {
    set_cookies
        .iter()
        .filter_map(|c| c.split(';').next())
        .map(str::trim)
        .filter(|pair| pair.contains('='))
        .collect::<Vec<_>>()
        .join("; ")
}

/// GET préalable de la page de recherche : un navigateur ordinaire l'ouvre avant
/// d'interroger l'API, et le site y dépose ses cookies de session.
async fn apec_session_cookies(client: &reqwest::Client) -> String {
    if let Ok(guard) = APEC_SESSION.lock() {
        if let Some((at, cookies)) = guard.as_ref() {
            if at.elapsed() < APEC_SESSION_TTL {
                return cookies.clone();
            }
        }
    }
    let resp = client
        .get(APEC_SEARCH_PAGE)
        .header(reqwest::header::USER_AGENT, APEC_USER_AGENT)
        .header(reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header(reqwest::header::ACCEPT_LANGUAGE, "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
        .send()
        .await;
    let cookies = match resp {
        Ok(r) => {
            let set_cookies: Vec<String> = r
                .headers()
                .get_all(reqwest::header::SET_COOKIE)
                .iter()
                .filter_map(|v| v.to_str().ok().map(String::from))
                .collect();
            build_cookie_header(&set_cookies)
        }
        // La page préalable est un « plus » : son échec ne bloque pas la recherche.
        Err(_) => String::new(),
    };
    if let Ok(mut guard) = APEC_SESSION.lock() {
        *guard = Some((std::time::Instant::now(), cookies.clone()));
    }
    cookies
}

/// Effectue la requête POST vers l'API APEC et gère l'encodage de la réponse.
///
/// L'API APEC (https://www.apec.fr/cms/webservices/rechercheOffre) renvoie du
/// JSON encodé en ISO-8859-1 / Windows-1252 (serveur legacy). Le plugin
/// tauri-plugin-http tente de sérialiser le corps via IPC en UTF-8 strict et
/// lève une erreur "invalid utf-8 sequence" avant même que le JS ne reçoive
/// les données. On contourne en faisant la requête directement avec reqwest,
/// en lisant les octets bruts, puis en décodant : UTF-8 d'abord, Latin-1 en
/// repli (chaque octet Latin-1 correspond au même point de code Unicode).
///
/// Usage d'un navigateur ordinaire (spec 006, phase 2) : GET préalable de la
/// page de recherche pour obtenir les cookies, puis POST avec `Origin`,
/// `Referer`, `Accept`, `Accept-Language`, `Content-Type`, `User-Agent` et les
/// cookies de session. Rien de plus : pas de rotation d'IP, pas d'empreinte
/// usurpée. Si le site répond 403 / 429 malgré cela, l'erreur est renvoyée
/// telle quelle (« APEC HTTP 403 ») et le côté TypeScript met la source en
/// pause 24 h plutôt que d'insister.
#[tauri::command]
async fn fetch_apec_api(body: String) -> Result<String, String> {
    // APEC's search backend regularly returns transient 5xx ("Erreur technique").
    // We retry up to 3 times with exponential backoff (500ms, 1s) — same pattern
    // as the France Travail parser — to avoid polluting the UI with errors for
    // server-side blips. 4xx are NOT retried (refusal or bad query: no point hammering).
    const MAX_ATTEMPTS: u32 = 3;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("APEC client: {}", e))?;

    let cookies = apec_session_cookies(&client).await;

    let mut last_status: Option<u16> = None;
    let mut last_net_err: Option<String> = None;

    for attempt in 0..MAX_ATTEMPTS {
        let mut request = client
            .post(APEC_API_URL)
            .header(reqwest::header::USER_AGENT, APEC_USER_AGENT)
            .header(reqwest::header::CONTENT_TYPE, "application/json; charset=utf-8")
            .header(reqwest::header::ACCEPT, "application/json, text/plain, */*")
            .header(reqwest::header::ACCEPT_LANGUAGE, "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
            .header(reqwest::header::REFERER, APEC_SEARCH_PAGE)
            .header("Origin", "https://www.apec.fr");
        if !cookies.is_empty() {
            request = request.header(reqwest::header::COOKIE, cookies.clone());
        }
        let send_result = request.body(body.clone()).send().await;

        let resp = match send_result {
            Ok(r) => r,
            Err(e) => {
                last_net_err = Some(format!("APEC réseau: {}", e));
                if attempt + 1 < MAX_ATTEMPTS {
                    let backoff_ms = 500u64 << attempt; // 500, 1000
                    tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
                    continue;
                }
                return Err(last_net_err.unwrap());
            }
        };

        let status = resp.status();
        if status.is_success() {
            let bytes = resp.bytes().await
                .map_err(|e| format!("APEC lecture corps: {}", e))?;
            // UTF-8 strict d'abord, repli Latin-1 (ISO-8859-1) si échec.
            return match std::str::from_utf8(&bytes) {
                Ok(text) => Ok(text.to_string()),
                Err(_)   => Ok(bytes.iter().map(|&b| b as char).collect()),
            };
        }

        last_status = Some(status.as_u16());

        // Retry only on 5xx — 4xx means a refusal or a bad request.
        if status.is_server_error() && attempt + 1 < MAX_ATTEMPTS {
            let backoff_ms = 500u64 << attempt; // 500, 1000
            tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
            continue;
        }

        // Refus : la session mise en cache n'est plus de confiance, on la
        // renouvellera à la prochaine tentative (après la pause de 24 h).
        if status.as_u16() == 401 || status.as_u16() == 403 || status.as_u16() == 429 {
            if let Ok(mut guard) = APEC_SESSION.lock() {
                *guard = None;
            }
        }

        return Err(format!("APEC HTTP {}", status.as_u16()));
    }

    Err(last_status
        .map(|s| format!("APEC HTTP {}", s))
        .unwrap_or_else(|| last_net_err.unwrap_or_else(|| "APEC: échec après plusieurs tentatives".into())))
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn generate_pdf(html: String) -> Result<Vec<u8>, String> {
    // Generate PDF inside a blocking thread so it doesn't freeze the UI or the async runtime.
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
        // 1. Check if a browser executable is found
        if let Err(e) = default_executable() {
            return Err(format!("Aucun navigateur basé sur Chromium n'a été trouvé sur le système : {}", e));
        }

        // 2. Write the HTML string to a temporary file
        let mut temp_file = Builder::new()
            .suffix(".html")
            .tempfile()
            .map_err(|e| e.to_string())?;
        temp_file.write_all(html.as_bytes()).map_err(|e| e.to_string())?;
        let temp_path = temp_file.into_temp_path();

        let file_url = url::Url::from_file_path(&temp_path)
            .map_err(|_| "Failed to convert temp file path to URL".to_string())?
            .to_string();

        // 3. Launch headless browser
        let browser = Browser::new(
            LaunchOptions::default_builder()
                .headless(true)
                .build()
                .map_err(|e| e.to_string())?
        ).map_err(|e| e.to_string())?;

        // 4. Navigate to the temporary file
        let tab = browser.new_tab().map_err(|e| e.to_string())?;
        tab.navigate_to(&file_url).map_err(|e| e.to_string())?;
        tab.wait_until_navigated().map_err(|e| e.to_string())?;

        // 5. Generate PDF
        let pdf_data = tab.print_to_pdf(Some(headless_chrome::types::PrintToPdfOptions {
            landscape: Some(false),
            display_header_footer: Some(false),
            print_background: Some(true),
            scale: Some(1.0),
            paper_width: Some(8.27), // A4 width in inches
            paper_height: Some(11.69), // A4 height in inches
            margin_top: Some(0.0),
            margin_bottom: Some(0.0),
            margin_left: Some(0.0),
            margin_right: Some(0.0),
            page_ranges: None,
            ignore_invalid_page_ranges: None,
            header_template: None,
            footer_template: None,
            prefer_css_page_size: Some(true),
            transfer_mode: None,
            generate_document_outline: None,
            generate_tagged_pdf: None,
        })).map_err(|e| e.to_string())?;

        Ok(pdf_data)
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn generate_pdf(_html: String) -> Result<Vec<u8>, String> {
    Err("L'export PDF vectoriel n'est pas supporté sur Android via cette méthode.".into())
}

// ── WebView scraping (Phase 2 — First2Apply integration) ────────────────────
//
// Architecture:
//   1. `open_login_flow` spawns a visible Chrome with a per-site `user_data_dir`
//      so the user can authenticate once. Cookies persist on disk.
//   2. `close_login_browser` drops the browser reference → Chrome exits →
//      cookies are flushed.
//   3. `scrape_with_session` reuses the same `user_data_dir` in headless mode
//      to retrieve the HTML of any page behind the session.
//   4. `session_exists` / `clear_session` manage the on-disk cookie store.
//
// Chrome can only run once per user_data_dir. The login flow and scraping
// are therefore mutually exclusive per site, which is enforced implicitly
// by the login-browser state.

#[cfg(not(target_os = "android"))]
fn session_dir(app: &tauri::AppHandle, site_id: &str, profile_id: Option<&str>) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    // Sanitize site_id to avoid path traversal
    let safe_site = site_id.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();
    if safe_site.is_empty() {
        return Err("site_id invalide".into());
    }
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    // If a profile_id is given, isolate sessions per profile to prevent
    // cookie sharing between different user accounts.
    if let Some(pid) = profile_id.filter(|p| !p.is_empty()) {
        let safe_pid = pid.chars()
            .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
            .collect::<String>();
        Ok(base.join("browser-sessions").join(format!("{}__{}", safe_pid, safe_site)))
    } else {
        Ok(base.join("browser-sessions").join(safe_site))
    }
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn scrape_with_session(
    app: tauri::AppHandle,
    site_id: String,
    url: String,
    wait_selector: Option<String>,
    timeout_secs: Option<u64>,
    user_agent: Option<String>,
    profile_id: Option<String>,
) -> Result<String, String> {
    // Early check: browser available?
    default_executable().map_err(|e| format!("Chrome/Chromium introuvable: {}", e))?;

    let dir = session_dir(&app, &site_id, profile_id.as_deref())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Création dossier session: {}", e))?;

    let timeout = std::time::Duration::from_secs(timeout_secs.unwrap_or(20));

    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let mut opts = LaunchOptions::default_builder();
        opts.headless(true)
            .user_data_dir(Some(dir))
            .window_size(Some((1440, 900)));

        // Stealth flags — mask `navigator.webdriver`, disable the banner that
        // broadcasts "automated test software" to anti-bot scripts.
        let mut extra_args: Vec<&'static std::ffi::OsStr> = vec![
            std::ffi::OsStr::new("--disable-infobars"),
            std::ffi::OsStr::new("--disable-blink-features=AutomationControlled"),
        ];
        if let Some(ua) = user_agent.as_ref() {
            let flag: &'static str = Box::leak(format!("--user-agent={}", ua).into_boxed_str());
            extra_args.push(std::ffi::OsStr::new(flag));
        }
        opts.args(extra_args);

        let launch_opts = opts.build().map_err(|e| e.to_string())?;
        let browser = Browser::new(launch_opts).map_err(|e| format!("Lancement Chrome: {}", e))?;

        let tab = browser.new_tab().map_err(|e| format!("Nouvel onglet: {}", e))?;
        tab.navigate_to(&url).map_err(|e| format!("Navigation: {}", e))?;

        tab.wait_until_navigated().map_err(|e| format!("Attente navigation: {}", e))?;

        if let Some(selector) = wait_selector {
            // Best-effort wait: if the selector never appears (site changed its DOM,
            // anti-bot redirect, session expired…) we still return the HTML and let
            // the TypeScript parser decide whether the content is usable.
            if let Err(e) = tab.wait_for_element_with_custom_timeout(&selector, timeout) {
                eprintln!(
                    "[scrape_with_session] Sélecteur '{}' non trouvé après {:?}: {} — extraction HTML quand même",
                    selector, timeout, e
                );
                // Short grace period so client-side rendering has one last chance
                std::thread::sleep(std::time::Duration::from_millis(3_000));
            }
        } else {
            // No selector — just wait for navigation + JS render grace period
            std::thread::sleep(std::time::Duration::from_millis(3_000));
        }

        tab.get_content().map_err(|e| format!("Extraction HTML: {}", e))
    })
    .await
    .map_err(|e| format!("Tâche interrompue: {}", e))?
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn open_login_flow(
    app: tauri::AppHandle,
    state: tauri::State<'_, LoginBrowserState>,
    site_id: String,
    login_url: String,
    profile_id: Option<String>,
    user_agent: Option<String>,
) -> Result<(), String> {
    // Resolve the Chrome/Chromium binary via headless_chrome's locator
    let chrome_path = default_executable()
        .map_err(|e| format!("Chrome/Chromium introuvable: {}", e))?;

    let dir = session_dir(&app, &site_id, profile_id.as_deref())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Création dossier session: {}", e))?;

    // Close any previous login browser before opening a new one
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    // Spawn Chrome as a pure subprocess — NO --enable-automation, NO CDP.
    let mut cmd = std::process::Command::new(&chrome_path);
    cmd.arg(format!("--user-data-dir={}", dir.display()))
       .arg("--window-size=1440,900")
       .arg("--no-first-run")
       .arg("--no-default-browser-check")
       .arg("--disable-infobars")
       .arg("--disable-blink-features=AutomationControlled");

    if let Some(ua) = user_agent {
        cmd.arg(format!("--user-agent={}", ua));
    }

    let child = cmd.arg(&login_url)
        .spawn()
        .map_err(|e| format!("Lancement Chrome: {}", e))?;

    let mut guard = state.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);
    Ok(())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn close_login_browser(state: tauri::State<'_, LoginBrowserState>) -> Result<(), String> {
    // Take the child handle out of the state under the mutex, then kill it
    // outside the critical section so the subsequent flush-delay doesn't
    // hold the lock.
    let taken = {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.take()
    };
    if let Some(mut child) = taken {
        // Best-effort: may already have exited if the user closed the window
        let _ = child.kill();
        let _ = child.wait();
        // Give Chrome ~2 s to flush cookies to disk before we consider the
        // login done. Without this, SQLite cookie writes sometimes race the
        // process teardown, so sessionExists then returns false.
        tokio::time::sleep(std::time::Duration::from_millis(2_000)).await;
    }
    Ok(())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn session_exists(app: tauri::AppHandle, site_id: String, profile_id: Option<String>) -> bool {
    // Chrome 110+ moved cookies into Default/Network/Cookies. Older versions
    // still use Default/Cookies. We accept either path to stay compatible.
    match session_dir(&app, &site_id, profile_id.as_deref()) {
        Ok(dir) => {
            let default_dir = dir.join("Default");
            default_dir.join("Network").join("Cookies").exists()
                || default_dir.join("Cookies").exists()
        }
        Err(_) => false,
    }
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn clear_session(app: tauri::AppHandle, site_id: String, profile_id: Option<String>) -> Result<(), String> {
    let dir = session_dir(&app, &site_id, profile_id.as_deref())?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Suppression session: {}", e))?;
    }
    Ok(())
}

// ── Android : login via WebView in-process ───────────────────────────────────
//
// On délègue à la classe Kotlin `com.jules.resume_forge.LoginLauncher` qui :
//   - lance `LoginActivity` (WebView plein écran) pour le login utilisateur ;
//   - lit / efface les cookies du `CookieManager` du process — partagé avec
//     la WebView Tauri principale, donc avec `scrapeWithIframe` côté JS.
//
// Le scraping en lui-même reste en JS (`scrapeWithIframe`) ; on garde un stub
// Rust qui renvoie une erreur si jamais le frontend l'appelle par erreur.

#[cfg(target_os = "android")]
fn android_domain_for_site(site_id: &str) -> &'static str {
    match site_id {
        "linkedin" => "https://www.linkedin.com",
        "indeed" => "https://secure.indeed.com",
        "hellowork" => "https://www.hellowork.com",
        "glassdoor" => "https://www.glassdoor.fr",
        "wttj" => "https://www.welcometothejungle.com",
        _ => "",
    }
}

#[cfg(target_os = "android")]
fn with_jni_env<F, R>(f: F) -> Result<R, String>
where
    F: for<'a> FnOnce(&mut jni::JNIEnv<'a>, jni::objects::JObject<'a>) -> Result<R, jni::errors::Error>,
{
    use jni::objects::JObject;
    use jni::JavaVM;
    let ctx = ndk_context::android_context();
    let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(|e| format!("JavaVM init: {e}"))?;
    let mut guard = vm
        .attach_current_thread()
        .map_err(|e| format!("attach JNI: {e}"))?;
    // AttachGuard derefs to JNIEnv ; on prend une réf mutable explicite.
    let env: &mut jni::JNIEnv = &mut guard;
    // SAFETY : le pointeur fourni par ndk-context reste valide tant que le
    // process vit ; on l'utilise comme `Context` (l'application context).
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    f(env, context).map_err(|e| format!("JNI call: {e}"))
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn scrape_with_session(
    site_id: String,
    url: String,
    wait_selector: Option<String>,
    timeout_secs: Option<u64>,
    user_agent: Option<String>,
    _profile_id: Option<String>,
) -> Result<String, String> {
    // L'iframe côté JS échouait systématiquement (X-Frame-Options DENY +
    // SecurityError sur cross-origin contentDocument). On délègue désormais
    // à `BackgroundScraper.scrapePageBlocking` côté Kotlin : WebView offscreen
    // qui partage le `CookieManager` avec `LoginActivity`, donc bénéficie des
    // sessions ouvertes par l'utilisateur. L'appel est bloquant côté JNI ;
    // on l'isole dans `spawn_blocking` pour ne pas geler le runtime tokio.
    let _ = site_id;
    let timeout = timeout_secs.unwrap_or(20) as i64;

    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        with_jni_env(|env, context| {
            use jni::objects::{JObject, JString, JValue};

            // Conversion en JObject explicite : JString → JObject sans
            // ambiguïté de borrow, et JObject::null() pour les Options vides.
            let url_obj: JObject = env.new_string(&url)?.into();
            let selector_obj: JObject = match wait_selector.as_deref() {
                Some(s) if !s.is_empty() => env.new_string(s)?.into(),
                _ => JObject::null(),
            };
            let ua_obj: JObject = match user_agent.as_deref() {
                Some(s) if !s.is_empty() => env.new_string(s)?.into(),
                _ => JObject::null(),
            };

            let res = env.call_static_method(
                "com/jules/resume_forge/BackgroundScraper",
                "scrapePageBlocking",
                "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;JLjava/lang/String;)Ljava/lang/String;",
                &[
                    JValue::Object(&context),
                    JValue::Object(&url_obj),
                    JValue::Object(&selector_obj),
                    JValue::Long(timeout),
                    JValue::Object(&ua_obj),
                ],
            )?;
            let obj = res.l()?;
            if obj.is_null() {
                return Ok(String::new());
            }
            let jstr = JString::from(obj);
            let s: String = env.get_string(&jstr)?.into();
            Ok(s)
        })
    })
    .await
    .map_err(|e| format!("Tâche scraping interrompue: {}", e))?
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn open_login_flow(
    site_id: String,
    login_url: String,
    _profile_id: Option<String>,
    _user_agent: Option<String>,
) -> Result<(), String> {
    let _ = site_id; // l'Activity n'a pas besoin du site_id, l'URL suffit
    with_jni_env(|env, context| {
        let url = env.new_string(&login_url)?;
        env.call_static_method(
            "com/jules/resume_forge/LoginLauncher",
            "openLogin",
            "(Landroid/content/Context;Ljava/lang/String;)V",
            &[(&context).into(), (&url).into()],
        )?;
        Ok(())
    })
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn close_login_browser() -> Result<(), String> {
    // L'utilisateur ferme la `LoginActivity` lui-même via le bouton « Fermer »
    // (ou le bouton retour). On no-op ici pour préserver la signature commune.
    Ok(())
}

#[cfg(target_os = "android")]
#[tauri::command]
fn session_exists(site_id: String, _profile_id: Option<String>) -> bool {
    let domain = android_domain_for_site(&site_id);
    if domain.is_empty() {
        return false;
    }
    let result: Result<bool, String> = with_jni_env(|env, _ctx| {
        use jni::objects::JString;
        let domain_j = env.new_string(domain)?;
        let res = env.call_static_method(
            "com/jules/resume_forge/LoginLauncher",
            "getCookies",
            "(Ljava/lang/String;)Ljava/lang/String;",
            &[(&domain_j).into()],
        )?;
        let obj = res.l()?;
        if obj.is_null() {
            return Ok(false);
        }
        let jstr = JString::from(obj);
        let s: String = env.get_string(&jstr)?.into();
        // Présence d'au moins un cookie côté domaine = session probablement
        // active. Le scraper détectera une éventuelle redirection vers /login.
        Ok(!s.trim().is_empty())
    });
    result.unwrap_or(false)
}

#[cfg(target_os = "android")]
#[tauri::command]
fn clear_session(site_id: String, _profile_id: Option<String>) -> Result<(), String> {
    let domain = android_domain_for_site(&site_id);
    if domain.is_empty() {
        return Ok(());
    }
    with_jni_env(|env, _ctx| {
        let domain_j = env.new_string(domain)?;
        env.call_static_method(
            "com/jules/resume_forge/LoginLauncher",
            "clearCookiesForDomain",
            "(Ljava/lang/String;)V",
            &[(&domain_j).into()],
        )?;
        Ok(())
    })
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_uri = DB_URI.get_or_init(resolve_db_uri).clone();

    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_application_attachments",
            sql: include_str!("../migrations/002_application_attachments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_compatibility_scoring",
            sql: include_str!("../migrations/003_compatibility_scoring.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_job_watch_module",
            sql: include_str!("../migrations/004_job_watch.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "job_watch_v2_text_uuid_salary_coords",
            sql: include_str!("../migrations/005_job_watch_v2.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_exclude_keywords",
            sql: include_str!("../migrations/006_exclude_keywords.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_job_feedback_table",
            sql: include_str!("../migrations/007_job_feedback.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_search_intent",
            sql: include_str!("../migrations/008_search_intent.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "job_watch_profile_isolation",
            sql: include_str!("../migrations/009_job_watch_profile.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "search_profile",
            sql: include_str!("../migrations/010_search_profile.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_rejection_fields",
            sql: include_str!("../migrations/011_add_rejection_fields.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_markdown_resume_columns",
            sql: include_str!("../migrations/012_markdown_resume.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "job_watch_fetch_log",
            sql: include_str!("../migrations/013_job_watch_fetch_log.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "fetch_log_breakdown",
            sql: include_str!("../migrations/014_fetch_log_breakdown.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "settings_per_profile",
            sql: include_str!("../migrations/015_settings_per_profile.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "linkedin_rss_to_linkedin",
            sql: include_str!("../migrations/016_linkedin_rss_to_linkedin.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "experience_reconciliation",
            sql: include_str!("../migrations/017_experience_reconciliation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "duplicate_dismissals",
            sql: include_str!("../migrations/018_duplicate_dismissals.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "job_watch_alerts",
            sql: include_str!("../migrations/019_job_watch_alerts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "cv_angles",
            sql: include_str!("../migrations/020_cv_angles.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "watch_sources_health",
            sql: include_str!("../migrations/021_watch_sources_health.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "offer_origin",
            sql: include_str!("../migrations/022_offer_origin.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "source_metrics",
            sql: include_str!("../migrations/023_source_metrics.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "emploi_territorial_unavailable",
            sql: include_str!("../migrations/024_emploi_territorial_unavailable.sql"),
            kind: MigrationKind::Up,
        },
    ];

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(not(target_os = "android"))]
    {
        builder = builder
            .plugin(tauri_plugin_shell::init())
            .manage::<LoginBrowserState>(Arc::new(Mutex::new(None)));
    }

    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&db_uri, migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            dev_logger::install_panic_hook(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_db_uri,
            send_email,
            generate_pdf,
            fetch_apec_api,
            scrape_with_session,
            open_login_flow,
            close_login_browser,
            session_exists,
            clear_session,
            dev_logger::dev_log_error,
            dev_logger::dev_read_errors,
            dev_logger::dev_clear_errors,
            dev_logger::dev_log_path,
            dev_logger::dev_save_bug_report,
            dev_logger::dev_list_bug_reports,
            dev_logger::dev_read_bug_report,
            dev_logger::dev_update_bug_report,
            dev_logger::dev_delete_bug_report,
            dev_logger::dev_open_bug_report_dir,
            #[cfg(not(target_os = "android"))]
            start_oauth_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod apec_tests {
    use super::build_cookie_header;

    #[test]
    fn cookie_header_keeps_only_name_value_pairs() {
        let set_cookies = vec![
            "JSESSIONID=abc123; Path=/; HttpOnly; Secure".to_string(),
            "lang=fr; Max-Age=3600".to_string(),
        ];
        assert_eq!(build_cookie_header(&set_cookies), "JSESSIONID=abc123; lang=fr");
    }

    #[test]
    fn cookie_header_ignores_malformed_entries() {
        let set_cookies = vec!["; Path=/".to_string(), "novalue".to_string()];
        assert_eq!(build_cookie_header(&set_cookies), "");
        assert_eq!(build_cookie_header(&[]), "");
    }
}
