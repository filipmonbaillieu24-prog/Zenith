/// These commands let the user write ride/route exports into an arbitrary,
/// user-configured sync folder (e.g. a Google Drive folder), so the target
/// path can legitimately be anywhere on disk and can't be sandboxed to a
/// single app-data directory. Instead, reject path traversal and refuse to
/// touch OS/program directories a legitimate export would never target.
fn reject_unsafe_path(path: &str) -> Result<(), String> {
    if path.split(['/', '\\']).any(|seg| seg == "..") {
        return Err("Path traversal ('..') is not allowed.".to_string());
    }

    let lower = path.to_lowercase();
    const DENYLIST_SUBSTRINGS: &[&str] = &[
        "\\windows\\",
        "\\program files\\",
        "\\program files (x86)\\",
        "\\start menu\\",
        "\\startup\\",
        "/system/",
        "/library/launchagents",
        "/library/launchdaemons",
        "/applications/",
        "/usr/",
        "/bin/",
        "/sbin/",
        "/etc/",
    ];
    if DENYLIST_SUBSTRINGS.iter().any(|s| lower.contains(s)) {
        return Err("Refusing to write to a system/program directory.".to_string());
    }

    Ok(())
}

/// Writes a file to a given path on the filesystem.
#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    reject_unsafe_path(&path)?;
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Could not save file to '{}': {}", path, e))
}

/// Checks whether a folder exists on the filesystem.
#[tauri::command]
pub fn dir_exists(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

/// Creates a folder if it doesn't already exist (including all parents).
#[tauri::command]
pub fn ensure_dir(path: String) -> Result<(), String> {
    reject_unsafe_path(&path)?;
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Could not create folder '{}': {}", path, e))
}

/// Opens a dialog to save a route file.
#[tauri::command]
pub async fn save_file_dialog(filename: String, content: String) -> Result<Option<String>, String> {
    let file_path = rfd::FileDialog::new()
        .set_file_name(&filename)
        .add_filter("GPX route", &["gpx"])
        .add_filter("TCX route", &["tcx"])
        .save_file();
        
    if let Some(path) = file_path {
        std::fs::write(&path, content.as_bytes())
            .map_err(|e| format!("Could not save file to '{:?}': {}", path, e))?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}
