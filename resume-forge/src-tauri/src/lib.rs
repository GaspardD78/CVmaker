use tauri_plugin_sql::{Migration, MigrationKind};

// ── Windows: handler COM pour ICoreWebView2PrintToPdfCompletedHandler ──────────
#[cfg(target_os = "windows")]
mod pdf_impl {
    use std::sync::{Arc, Mutex};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2PrintToPdfCompletedHandler,
        ICoreWebView2PrintToPdfCompletedHandler_Impl,
    };
    use windows::core::{HRESULT, implement};
    use windows::Win32::Foundation::BOOL;

    #[implement(ICoreWebView2PrintToPdfCompletedHandler)]
    pub struct PdfHandler {
        pub tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<Result<(), String>>>>>,
    }

    impl ICoreWebView2PrintToPdfCompletedHandler_Impl for PdfHandler {
        fn Invoke(&self, error_code: HRESULT, is_successful: BOOL) -> windows::core::Result<()> {
            if let Some(sender) = self.tx.lock().unwrap().take() {
                let result = if error_code.is_ok() && is_successful.as_bool() {
                    Ok(())
                } else {
                    Err(format!("Erreur PrintToPdf : {:08X}", error_code.0))
                };
                let _ = sender.send(result);
            }
            Ok(())
        }
    }
}

// ── Commande Tauri ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn export_native_pdf(
    window: tauri::WebviewWindow,
    output_path: String,
) -> Result<(), String> {
    do_export(window, output_path).await
}

// ── Linux : WebKitGTK PrintOperation ──────────────────────────────────────────
#[cfg(target_os = "linux")]
async fn do_export(window: tauri::WebviewWindow, output_path: String) -> Result<(), String> {
    use std::sync::{Arc, Mutex};

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let tx_arc = Arc::new(Mutex::new(Some(tx)));

    window
        .with_webview(move |webview| {
            use webkit2gtk::{PrintOperation, PrintOperationExt};

            let wv: webkit2gtk::WebView = webview.inner();

            // Paramètres GTK : sortie vers fichier PDF
            let settings = gtk::PrintSettings::new();
            settings.set_printer("Print to File");
            settings.set("output-file-format", Some("pdf"));
            settings.set("output-uri", Some(&format!("file://{output_path}")));

            // Format A4, marges nulles
            let page_setup = gtk::PageSetup::new();
            let paper = gtk::PaperSize::new(Some("iso_a4_210x297mm"));
            page_setup.set_paper_size(&paper);
            page_setup.set_top_margin(0.0, gtk::Unit::Mm);
            page_setup.set_bottom_margin(0.0, gtk::Unit::Mm);
            page_setup.set_left_margin(0.0, gtk::Unit::Mm);
            page_setup.set_right_margin(0.0, gtk::Unit::Mm);

            let op = PrintOperation::new(&wv);
            op.set_print_settings(&settings);
            op.set_page_setup(&page_setup);

            // Signaux de fin / erreur
            let tx_ok = tx_arc.clone();
            let tx_err = tx_arc.clone();

            op.connect_finished(move |_| {
                if let Some(s) = tx_ok.lock().unwrap().take() {
                    let _ = s.send(Ok(()));
                }
            });

            op.connect_failed(move |_, err| {
                if let Some(s) = tx_err.lock().unwrap().take() {
                    let _ = s.send(Err(err.message().to_string()));
                }
            });

            // Lancer l'impression sans boîte de dialogue
            op.print();
        })
        .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?
}

// ── Windows : WebView2 PrintToPdf ─────────────────────────────────────────────
#[cfg(target_os = "windows")]
async fn do_export(window: tauri::WebviewWindow, output_path: String) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::sync::{Arc, Mutex};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2PrintToPdfCompletedHandler, ICoreWebView2_7,
    };
    use windows::core::{Interface, PCWSTR};

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let tx_arc = Arc::new(Mutex::new(Some(tx)));

    window
        .with_webview(move |webview| {
            let controller = webview.controller();
            let wv = unsafe { controller.CoreWebView2().unwrap() };
            let wv7: ICoreWebView2_7 = wv.cast().unwrap();

            // Chemin en UTF-16
            let wide: Vec<u16> = OsStr::new(&output_path)
                .encode_wide()
                .chain(std::iter::once(0u16))
                .collect();

            let handler: ICoreWebView2PrintToPdfCompletedHandler =
                pdf_impl::PdfHandler { tx: tx_arc }.into();

            unsafe {
                wv7.PrintToPdf(PCWSTR(wide.as_ptr()), None, &handler)
                    .unwrap();
            }
        })
        .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())?
}

// ── Autres plateformes (macOS, etc.) ──────────────────────────────────────────
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
async fn do_export(
    _window: tauri::WebviewWindow,
    _output_path: String,
) -> Result<(), String> {
    Err("Export PDF natif non supporté sur cette plateforme".to_string())
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:resumeforge.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![export_native_pdf])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
