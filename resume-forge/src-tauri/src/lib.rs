use std::path::PathBuf;
use std::sync::OnceLock;
use tauri_plugin_sql::{Migration, MigrationKind};

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

#[tauri::command]
fn get_db_uri() -> String {
    DB_URI.get_or_init(resolve_db_uri).clone()
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
    ];

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(not(target_os = "android"))]
    {
        builder = builder.plugin(tauri_plugin_shell::init());
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&db_uri, migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_db_uri])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
