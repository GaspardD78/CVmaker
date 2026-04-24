use std::sync::{Arc, Mutex, OnceLock};
#[cfg(not(target_os = "android"))]
use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_http::reqwest;

mod email;
pub use email::send_email;

#[cfg(not(target_os = "android"))]
use headless_chrome::{Browser, LaunchOptions};
#[cfg(not(target_os = "android"))]
use headless_chrome::browser::default_executable;
use std::io::Write;
#[cfg(not(target_os = "android"))]
use tempfile::Builder;

// ── WebView session state ─────────────────────────────────────────────────────
// Holds a non-headless Chrome browser open during the user login flow.
// Wrapped in Arc<Mutex<Option<…>>> so it can be safely shared across commands.
#[cfg(not(target_os = "android"))]
type LoginBrowserState = Arc<Mutex<Option<Browser>>>;

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

/// Effectue la requête POST vers l'API APEC et gère l'encodage de la réponse.
///
/// L'API APEC (https://www.apec.fr/cms/webservices/rechercheOffre) renvoie du
/// JSON encodé en ISO-8859-1 / Windows-1252 (serveur legacy). Le plugin
/// tauri-plugin-http tente de sérialiser le corps via IPC en UTF-8 strict et
/// lève une erreur "invalid utf-8 sequence" avant même que le JS ne reçoive
/// les données. On contourne en faisant la requête directement avec reqwest,
/// en lisant les octets bruts, puis en décodant : UTF-8 d'abord, Latin-1 en
/// repli (chaque octet Latin-1 correspond au même point de code Unicode).
#[tauri::command]
async fn fetch_apec_api(body: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("APEC client: {}", e))?;

    let resp = client
        .post("https://www.apec.fr/cms/webservices/rechercheOffre")
        .header(reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .header(reqwest::header::CONTENT_TYPE, "application/json; charset=utf-8")
        .header(reqwest::header::ACCEPT, "application/json, text/plain, */*")
        .header(reqwest::header::ACCEPT_LANGUAGE, "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
        .header(reqwest::header::REFERER,
            "https://www.apec.fr/candidat/recherche-emploi.html/emploi")
        .header("Origin", "https://www.apec.fr")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("APEC réseau: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("APEC HTTP {}", resp.status().as_u16()));
    }

    let bytes = resp.bytes().await
        .map_err(|e| format!("APEC lecture corps: {}", e))?;

    // Tentative UTF-8 stricte, repli Latin-1 (ISO-8859-1) si échec.
    match std::str::from_utf8(&bytes) {
        Ok(text) => Ok(text.to_string()),
        Err(_)   => Ok(bytes.iter().map(|&b| b as char).collect()),
    }
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
fn session_dir(app: &tauri::AppHandle, site_id: &str) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    // Sanitize site_id to avoid path traversal
    let safe = site_id.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();
    if safe.is_empty() {
        return Err("site_id invalide".into());
    }
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("browser-sessions").join(safe))
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
) -> Result<String, String> {
    // Early check: browser available?
    default_executable().map_err(|e| format!("Chrome/Chromium introuvable: {}", e))?;

    let dir = session_dir(&app, &site_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Création dossier session: {}", e))?;

    let timeout = std::time::Duration::from_secs(timeout_secs.unwrap_or(20));

    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let mut opts = LaunchOptions::default_builder();
        opts.headless(true)
            .user_data_dir(Some(dir))
            .window_size(Some((1440, 900)));
        if let Some(ua) = user_agent.as_ref() {
            // headless_chrome takes &'static str in args — we leak the UA string.
            // Short-lived leak, acceptable for the lifetime of the process.
            let flag: &'static str = Box::leak(format!("--user-agent={}", ua).into_boxed_str());
            opts.args(vec![std::ffi::OsStr::new(flag)]);
        }
        let launch_opts = opts.build().map_err(|e| e.to_string())?;
        let browser = Browser::new(launch_opts).map_err(|e| format!("Lancement Chrome: {}", e))?;

        let tab = browser.new_tab().map_err(|e| format!("Nouvel onglet: {}", e))?;
        tab.navigate_to(&url).map_err(|e| format!("Navigation: {}", e))?;

        if let Some(selector) = wait_selector {
            tab.wait_for_element_with_custom_timeout(&selector, timeout)
                .map_err(|e| format!("Sélecteur '{}' jamais rendu: {}", selector, e))?;
        } else {
            tab.wait_until_navigated().map_err(|e| format!("Attente navigation: {}", e))?;
            // Small grace period so client-side rendering has a chance
            std::thread::sleep(std::time::Duration::from_millis(1_500));
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
) -> Result<(), String> {
    default_executable().map_err(|e| format!("Chrome/Chromium introuvable: {}", e))?;

    let dir = session_dir(&app, &site_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Création dossier session: {}", e))?;

    // Close any previous login browser before opening a new one
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let launch_opts = LaunchOptions::default_builder()
            .headless(false)
            .user_data_dir(Some(dir))
            .window_size(Some((1200, 800)))
            .build()
            .map_err(|e| e.to_string())?;
        let browser = Browser::new(launch_opts).map_err(|e| format!("Lancement Chrome: {}", e))?;

        let tab = browser.new_tab().map_err(|e| format!("Nouvel onglet: {}", e))?;
        tab.navigate_to(&login_url).map_err(|e| format!("Navigation: {}", e))?;

        // Hand the browser to the shared state so it stays alive
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        *guard = Some(browser);
        Ok(())
    })
    .await
    .map_err(|e| format!("Tâche interrompue: {}", e))?
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn close_login_browser(state: tauri::State<'_, LoginBrowserState>) -> Result<(), String> {
    // Take the browser out of the state under the mutex, then drop it outside
    // the critical section so the subsequent flush-delay doesn't hold the lock.
    let taken = {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.take()
    };
    if taken.is_some() {
        drop(taken);
        // Give Chrome ~2 s to flush cookies to disk before the tab is fully gone.
        // Without this, headless_chrome sometimes kills the process faster than
        // SQLite flushes the cookie store, so sessionExists then returns false.
        tokio::time::sleep(std::time::Duration::from_millis(2_000)).await;
    }
    Ok(())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn session_exists(app: tauri::AppHandle, site_id: String) -> bool {
    // Chrome 110+ moved cookies into Default/Network/Cookies. Older versions
    // still use Default/Cookies. We accept either path to stay compatible.
    match session_dir(&app, &site_id) {
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
fn clear_session(app: tauri::AppHandle, site_id: String) -> Result<(), String> {
    let dir = session_dir(&app, &site_id)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Suppression session: {}", e))?;
    }
    Ok(())
}

// Android stubs — WebView scraping requires a desktop Chromium
#[cfg(target_os = "android")]
#[tauri::command]
async fn scrape_with_session(
    _site_id: String, _url: String, _wait_selector: Option<String>,
    _timeout_secs: Option<u64>, _user_agent: Option<String>,
) -> Result<String, String> {
    Err("Scraping WebView non supporté sur Android".into())
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn open_login_flow(_site_id: String, _login_url: String) -> Result<(), String> {
    Err("Login WebView non supporté sur Android".into())
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn close_login_browser() -> Result<(), String> { Ok(()) }

#[cfg(target_os = "android")]
#[tauri::command]
fn session_exists(_site_id: String) -> bool { false }

#[cfg(target_os = "android")]
#[tauri::command]
fn clear_session(_site_id: String) -> Result<(), String> { Ok(()) }

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
            #[cfg(not(target_os = "android"))]
            start_oauth_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
