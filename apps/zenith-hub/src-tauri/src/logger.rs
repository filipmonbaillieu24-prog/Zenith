use std::io::Write;
use std::sync::Mutex;
use tauri::Emitter;

static APP_HANDLE: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);

pub fn set_app_handle(handle: tauri::AppHandle) {
    if let Ok(mut guard) = APP_HANDLE.lock() {
        *guard = Some(handle);
    }
}

/// Schrijft een log-bericht naar console, het logbestand en het frontend logboek.
pub fn log_ble(msg: &str) {
    println!("{}", msg);
    let log_path = std::env::temp_dir().join("zenith_ble.log");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    {
        let _ = writeln!(file, "{}", msg);
    }

    if let Ok(guard) = APP_HANDLE.lock() {
        if let Some(ref handle) = *guard {
            let _ = handle.emit("ble-log-message", msg);
        }
    }
}
