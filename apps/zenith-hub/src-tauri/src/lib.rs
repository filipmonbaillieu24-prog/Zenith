pub mod logger;
pub mod commands;
pub mod ble;

use commands::fs::{dir_exists, ensure_dir, save_file, save_file_dialog};
use commands::network::{fetch_route, get_local_ip, greet};
use ble::colmi::sync_colmi_ring;
use ble::scale::start_scale_ble_listener;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_scale_ble_listener(handle).await {
                    eprintln!("Scale BLE listener error: {:?}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            fetch_route, 
            save_file, 
            dir_exists, 
            ensure_dir, 
            get_local_ip,
            save_file_dialog,
            sync_colmi_ring
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
