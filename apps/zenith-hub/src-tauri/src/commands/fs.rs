/// Schrijft een bestand naar een opgegeven pad op het bestandssysteem.
#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Kon bestand niet opslaan op '{}': {}", path, e))
}

/// Controleert of een map bestaat op het bestandssysteem.
#[tauri::command]
pub fn dir_exists(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

/// Maakt een map aan als die nog niet bestaat (inclusief alle parents).
#[tauri::command]
pub fn ensure_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Kon map niet aanmaken '{}': {}", path, e))
}

/// Opent een dialoogvenster om een routebestand op te slaan.
#[tauri::command]
pub async fn save_file_dialog(filename: String, content: String) -> Result<Option<String>, String> {
    let file_path = rfd::FileDialog::new()
        .set_file_name(&filename)
        .add_filter("GPX route", &["gpx"])
        .add_filter("TCX route", &["tcx"])
        .save_file();
        
    if let Some(path) = file_path {
        std::fs::write(&path, content.as_bytes())
            .map_err(|e| format!("Kon bestand niet opslaan op '{:?}': {}", path, e))?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}
