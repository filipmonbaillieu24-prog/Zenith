use std::io::Write;

/// Schrijft een log-bericht naar console en naar het tijdelijke bestand `zenith_ble.log` in de OS-temp directory.
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
}
