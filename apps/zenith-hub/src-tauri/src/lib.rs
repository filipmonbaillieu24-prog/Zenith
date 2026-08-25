pub mod commands;

use commands::fs::{dir_exists, ensure_dir, save_file, save_file_dialog};
use commands::network::{fetch_route, get_local_ip, greet};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            fetch_route,
            save_file,
            dir_exists,
            ensure_dir,
            get_local_ip,
            save_file_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
