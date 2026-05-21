//! Dev-only error logger.
//!
//! Captures Rust panics and frontend-reported errors into a JSON-lines file
//! (`dev-errors.jsonl`) under the app log dir, readable from an in-app Dev
//! panel. Purely local: no network, no telemetry. Active in debug builds, or
//! in a packaged build when the `RESUMEFORGE_DEV_LOG` env var is set.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// One error record, serialized one-per-line.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevErrorEntry {
    /// Epoch milliseconds.
    pub timestamp: i64,
    /// Origin tag: "react", "window.onerror", "unhandledrejection",
    /// "rust-panic"…
    pub source: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stack: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
}

/// Serialize writes — the panic hook can fire from any thread.
static LOG_LOCK: Mutex<()> = Mutex::new(());

/// Whether the dev logger should be active.
pub fn enabled() -> bool {
    cfg!(debug_assertions) || std::env::var_os("RESUMEFORGE_DEV_LOG").is_some()
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn log_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("dev-errors.jsonl"))
}

fn append_entry(path: &PathBuf, entry: &DevErrorEntry) -> Result<(), String> {
    let line = serde_json::to_string(entry).map_err(|e| e.to_string())?;
    let _guard = LOG_LOCK.lock().map_err(|e| e.to_string())?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{line}").map_err(|e| e.to_string())
}

/// Append a frontend-reported error to the on-disk log.
#[tauri::command]
pub fn dev_log_error(app: AppHandle, entry: DevErrorEntry) -> Result<(), String> {
    append_entry(&log_path(&app)?, &entry)
}

/// Read the most recent entries, newest first (defaults to 200).
#[tauri::command]
pub fn dev_read_errors(app: AppHandle, limit: Option<usize>) -> Result<Vec<DevErrorEntry>, String> {
    let path = log_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut entries: Vec<DevErrorEntry> = content
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str::<DevErrorEntry>(l).ok())
        .collect();
    entries.reverse();
    entries.truncate(limit.unwrap_or(200));
    Ok(entries)
}

/// Empty the log file.
#[tauri::command]
pub fn dev_clear_errors(app: AppHandle) -> Result<(), String> {
    let path = log_path(&app)?;
    if path.exists() {
        fs::write(&path, b"").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Absolute path of the log file (for display / open-in-folder).
#[tauri::command]
pub fn dev_log_path(app: AppHandle) -> Result<String, String> {
    Ok(log_path(&app)?.to_string_lossy().into_owned())
}

/// Install a panic hook that appends Rust panics to the log, then delegates to
/// the previously-installed hook so default console output still happens.
pub fn install_panic_hook(app: &AppHandle) {
    if !enabled() {
        return;
    }
    let Ok(path) = log_path(app) else { return };

    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()));
        let entry = DevErrorEntry {
            timestamp: now_millis(),
            source: "rust-panic".into(),
            message: info.to_string(),
            stack: Some(std::backtrace::Backtrace::force_capture().to_string()),
            context: location,
        };
        let _ = append_entry(&path, &entry);
        previous(info);
    }));
}
