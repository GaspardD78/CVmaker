use std::sync::OnceLock;
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
    ];

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(not(target_os = "android"))]
    {
        builder = builder.plugin(tauri_plugin_shell::init());
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
            #[cfg(not(target_os = "android"))]
            start_oauth_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
