fn main() {
    // Force rebuild when tauri.conf.json changes (version, config, etc.)
    // Without this, Windows may cache stale version info in the executable resources
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
