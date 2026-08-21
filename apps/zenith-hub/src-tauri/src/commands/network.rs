use std::net::UdpSocket;
use std::time::Duration;

/// Hosts this CORS-bypass proxy is allowed to reach. Keep in sync with the
/// route-planning APIs actually called from apps/zenith-aero/src/utils/{routing,weather}.ts.
const ALLOWED_ROUTE_HOSTS: &[&str] = &[
    "api.open-meteo.com",
    "archive-api.open-meteo.com",
    "brouter.de",
    "nominatim.openstreetmap.org",
];

const MAX_RESPONSE_BYTES: usize = 5 * 1024 * 1024; // 5 MB

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub async fn fetch_route(url: String) -> Result<String, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    if parsed.scheme() != "https" {
        return Err("Only https:// URLs are allowed".to_string());
    }
    let host = parsed.host_str().unwrap_or("");
    if !ALLOWED_ROUTE_HOSTS.contains(&host) {
        return Err(format!("Host '{}' is not on the route-provider allowlist", host));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(parsed)
        .header("User-Agent", "CycloRouteGenerator/1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Server returned error: {}", response.status()));
    }

    if let Some(len) = response.content_length() {
        if len as usize > MAX_RESPONSE_BYTES {
            return Err("Response too large".to_string());
        }
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("Response too large".to_string());
    }

    String::from_utf8(bytes.to_vec()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_local_ip() -> Result<String, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    let local_addr = socket.local_addr().map_err(|e| e.to_string())?;
    Ok(local_addr.ip().to_string())
}
