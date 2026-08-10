// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn fetch_route(url: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "CycloRouteGenerator/1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Server returned error: {}", response.status()));
    }

    let text = response.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

/// Schrijft een bestand naar een opgegeven pad op het bestandssysteem.
/// Wordt gebruikt voor directe export naar Google Drive of andere mappen.
#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Kon bestand niet opslaan op '{}': {}", path, e))
}

/// Controleert of een map bestaat op het bestandssysteem.
#[tauri::command]
fn dir_exists(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

/// Maakt een map aan als die nog niet bestaat (inclusief alle parents).
#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Kon map niet aanmaken '{}': {}", path, e))
}

use std::net::UdpSocket;

#[tauri::command]
fn get_local_ip() -> Result<String, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    let local_addr = socket.local_addr().map_err(|e| e.to_string())?;
    Ok(local_addr.ip().to_string())
}

#[tauri::command]
async fn save_file_dialog(filename: String, content: String) -> Result<Option<String>, String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_native_ble_listener(handle).await {
                    eprintln!("Native BLE listener error: {:?}", e);
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

use btleplug::api::{Central, CentralEvent, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::Manager;
use futures::stream::StreamExt;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::{HashMap, HashSet};

async fn start_native_ble_listener(app_handle: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let manager = Manager::new().await?;
    let adapters = manager.adapters().await?;
    if adapters.is_empty() {
        return Err("Geen Bluetooth-adapter gevonden".into());
    }
    let adapter = &adapters[0];

    // Start scanning
    adapter.start_scan(ScanFilter::default()).await?;
    let mut events = adapter.events().await?;

    println!("Tauri Native BLE Listener gestart!");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("e:\\Google Antgravity\\Zenith\\ble_debug.log")
    {
        use std::io::Write;
        let _ = writeln!(file, "[System] Tauri Native BLE Listener gestart!");
    }

    let cooldowns: Arc<Mutex<HashMap<btleplug::platform::PeripheralId, std::time::Instant>>> = Arc::new(Mutex::new(HashMap::new()));
    let connecting: Arc<Mutex<HashSet<btleplug::platform::PeripheralId>>> = Arc::new(Mutex::new(HashSet::new()));

    while let Some(event) = events.next().await {
        match event {
            CentralEvent::DeviceDiscovered(id) | CentralEvent::DeviceUpdated(id) => {
                // Check if device is in cooldown
                {
                    let cooldowns_guard = cooldowns.lock().await;
                    if let Some(disconnect_time) = cooldowns_guard.get(&id) {
                        if disconnect_time.elapsed() < std::time::Duration::from_secs(15) {
                            continue;
                        }
                    }
                }
                
                // Check if already connecting
                {
                    let connecting_guard = connecting.lock().await;
                    if connecting_guard.contains(&id) {
                        continue;
                    }
                }

                if let Ok(peripheral) = adapter.peripheral(&id).await {
                    if let Ok(connected) = peripheral.is_connected().await {
                        if connected {
                            continue;
                        }
                    }

                    if let Ok(Some(properties)) = peripheral.properties().await {
                        let name = properties.local_name.unwrap_or_default().to_lowercase();
                        if name.contains("neo") || name.contains("yolanda") || name.contains("qn-scale") || name.contains("scale") {
                            
                            // Mark as connecting
                            {
                                let mut connecting_guard = connecting.lock().await;
                                connecting_guard.insert(id.clone());
                            }
                            
                            let connecting_clone = connecting.clone();
                            let cooldowns_clone = cooldowns.clone();
                            let peripheral_clone = peripheral.clone();
                            let app_handle_clone = app_handle.clone();
                            let id_clone = id.clone();
                            let name_clone = name.clone();
                            
                            tauri::async_runtime::spawn(async move {
                                println!("Native BLE: Connecting to scale: {}", name_clone);
                                if let Ok(mut file) = std::fs::OpenOptions::new()
                                    .create(true)
                                    .append(true)
                                    .open("e:\\Google Antgravity\\Zenith\\ble_debug.log")
                                {
                                    use std::io::Write;
                                    let _ = writeln!(file, "[System] Connecting to scale: {}", name_clone);
                                }

                                if let Err(e) = peripheral_clone.connect().await {
                                    println!("Native BLE: Connection failed: {:?}", e);
                                    let mut connecting_guard = connecting_clone.lock().await;
                                    connecting_guard.remove(&id_clone);
                                    return;
                                }
                                
                                println!("Native BLE: Connected! Discovering services...");
                                if let Err(e) = peripheral_clone.discover_services().await {
                                    println!("Native BLE: Service discovery failed: {:?}", e);
                                    let _ = peripheral_clone.disconnect().await;
                                    let mut connecting_guard = connecting_clone.lock().await;
                                    connecting_guard.remove(&id_clone);
                                    return;
                                }
                                
                                 // Log alle gevonden services en characteristics voor diagnose en voer security-reads uit
                                 if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") {
                                     use std::io::Write;
                                     let _ = writeln!(file, "[GATT-DISCOVERY] Start services opsomming:");
                                     for service in peripheral_clone.services() {
                                         let _ = writeln!(file, "  Service UUID: {}", service.uuid);
                                         for characteristic in &service.characteristics {
                                             let _ = writeln!(file, "    Char UUID: {}  properties: {:?}", characteristic.uuid, characteristic.properties);
                                             
                                             // Voer GATT reads uit voor manufacturer name en firmware revision (security / anti-tamper bypass)
                                             let uuid_str = characteristic.uuid.to_string().to_lowercase();
                                             if uuid_str.contains("2a29") || uuid_str.contains("2a26") {
                                                 let _ = writeln!(file, "      -> Reading security char: {}", uuid_str);
                                                 if let Ok(val) = peripheral_clone.read(characteristic).await {
                                                     let _ = writeln!(file, "      -> Read succesvol: {:?}", String::from_utf8_lossy(&val));
                                                 } else {
                                                     let _ = writeln!(file, "      -> Read mislukt voor char: {}", uuid_str);
                                                 }
                                             }
                                         }
                                     }
                                     let _ = writeln!(file, "[GATT-DISCOVERY] Einde services opsomming.");
                                 }

                                   let mut notify_chars = Vec::new();
                                   let mut fff_write_chars = Vec::new();
                                   let mut ae_write_chars = Vec::new();
 
                                   for service in peripheral_clone.services() {
                                       let service_uuid = service.uuid.to_string().to_lowercase();
                                       if service_uuid.contains("fff0") || service_uuid.contains("ae00") || service_uuid.contains("181d") {
                                           for characteristic in service.characteristics {
                                               let char_uuid = characteristic.uuid.to_string().to_lowercase();
                                               if char_uuid.contains("fff1") || char_uuid.contains("ae02") || char_uuid.contains("2a9d") {
                                                   notify_chars.push(characteristic);
                                               } else if char_uuid.contains("fff2") || char_uuid.contains("ffe3") {
                                                   fff_write_chars.push(characteristic);
                                               } else if char_uuid.contains("ae01") {
                                                   ae_write_chars.push(characteristic);
                                               }
                                           }
                                       }
                                   }
 
                                   if notify_chars.is_empty() {
                                       println!("Native BLE: Target notification characteristic not found");
                                       let _ = peripheral_clone.disconnect().await;
                                       let mut connecting_guard = connecting_clone.lock().await;
                                       connecting_guard.remove(&id_clone);
                                       return;
                                   }
 
                                   for characteristic in &notify_chars {
                                       println!("Native BLE: Subscribing to characteristic: {}", characteristic.uuid);
                                       if let Err(e) = peripheral_clone.subscribe(characteristic).await {
                                           println!("Native BLE: Subscribe failed for {}: {:?}", characteristic.uuid, e);
                                       }
                                   }
 
                                   let mut notification_stream = match peripheral_clone.notifications().await {
                                       Ok(stream) => stream,
                                       Err(e) => {
                                           println!("Native BLE: Failed to get notification stream: {:?}", e);
                                           let _ = peripheral_clone.disconnect().await;
                                           let mut connecting_guard = connecting_clone.lock().await;
                                           connecting_guard.remove(&id_clone);
                                           return;
                                       }
                                   };
 
                                  if let Ok(mut file) = std::fs::OpenOptions::new()
                                      .create(true)
                                      .append(true)
                                      .open("e:\\Google Antgravity\\Zenith\\ble_debug.log")
                                  {
                                      use std::io::Write;
                                      let _ = writeln!(file, "[System] Subscribed to notify characteristics. Starting notification-driven handshake loop.");
                                  }
 
                                  let handle_clone = app_handle_clone.clone();
                                  let p_clone = peripheral_clone.clone();
                                  let conn_clone = connecting_clone.clone();
                                  let coold_clone = cooldowns_clone.clone();
                                  let dev_id = id_clone.clone();
                                  
                                  let fff_w_clone = fff_write_chars.clone();
                                  let ae_w_clone = ae_write_chars.clone();
                                  
                                  tauri::async_runtime::spawn(async move {
                                      let mut last_emitted_weight = 0.0;
                                      let mut last_emitted_impedance = 0.0;
                                      let mut measurement_done = false;
                                      let connection_time = std::time::Instant::now();
                                      let timeout = std::time::Duration::from_secs(15);
                                      
                                      let mut seen_protocol_type = 0x00;
                                      let mut weight_scale_factor = 100;
                                      let mut config_sent = false;
                                      let mut time_sync_sent = false;
                                      let mut history_response_sent = false;
                                      
                                      while let Some(notification) = notification_stream.next().await {
                                          let bytes = notification.value.clone();
                                          let elapsed_ms = connection_time.elapsed().as_millis();
 
                                          if connection_time.elapsed() > timeout {
                                             println!("Native BLE: Connection timeout reached, disconnecting.");
                                             break;
                                          }
                                          
                                          if bytes.is_empty() {
                                              continue;
                                          }
                                          
                                          let raw_hex: Vec<String> = bytes.iter().map(|b| format!("{:02X}", b)).collect();
                                          let raw_str = raw_hex.join(", ");
                                          let header_msg = format!(
                                              "[PKT] t+{}ms  UUID={} len={} bytes=[{}]  byte[0]=0x{:02X} byte[1]=0x{:02X} byte[2]=0x{:02X}",
                                              elapsed_ms, notification.uuid, bytes.len(), raw_str,
                                              bytes[0],
                                              if bytes.len() > 1 { bytes[1] } else { 0 },
                                              if bytes.len() > 2 { bytes[2] } else { 0 }
                                          );
                                          println!("{}", header_msg);
                                          if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", header_msg); }
                                          
                                          let mut decoded_weight: Option<f64> = None;
                                          let mut decoded_impedance: Option<f64> = None;
                                          let opcode = bytes[0];
 
                                          // ── Action 1: 0x12 Scale Info ──────────────────────────────────────
                                          if opcode == 0x12 && bytes.len() > 10 {
                                              if bytes.len() >= 17 && bytes[1] == bytes.len() as u8 {
                                                  seen_protocol_type = 0x00;
                                                  weight_scale_factor = 10;
                                              } else {
                                                  seen_protocol_type = bytes[2];
                                                  weight_scale_factor = if bytes[10] == 1 { 100 } else { 10 };
                                              }
                                              
                                              if !config_sent {
                                                  config_sent = true;
                                                  let msg = format!("[System] 0x12 Scale Info: proto=0x{:02X}, factor={}, sending config.", seen_protocol_type, weight_scale_factor);
                                                  println!("{}", msg);
                                                  if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", msg); }
                                                  
                                                  // Write AE01 init only to AE01 characteristics
                                                  let ae01_init = vec![0xFE, 0xDC, 0xBA, 0xC0, 0x06, 0x00, 0x02, 0x01, 0x01, 0xEF];
                                                  for w_char in &ae_w_clone {
                                                      let _ = p_clone.write(w_char, &ae01_init, WriteType::WithoutResponse).await;
                                                  }
                                                  
                                                  tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                                                  
                                                  // Write 0x13 config (unit flag 0x01 voor kg) only to FFF0 write characteristics
                                                  let mut cmd = vec![0x13, 0x09, seen_protocol_type, 0x01, 0x10, 0x00, 0x00, 0x00, 0x00];
                                                  let mut sum = 0u32;
                                                  for i in 0..8 {
                                                      sum += cmd[i] as u32;
                                                  }
                                                  cmd[8] = (sum & 0xFF) as u8;
                                                  
                                                  for w_char in &fff_w_clone {
                                                      let _ = p_clone.write(w_char, &cmd, WriteType::WithoutResponse).await;
                                                  }
                                              }
                                          }
                                          
                                          // ── Action 2: 0x14 Ready ACK ──────────────────────────────────────
                                          if opcode == 0x14 {
                                              if !time_sync_sent {
                                                  time_sync_sent = true;
                                                  let msg = format!("[System] 0x14 Ready: sending time sync and profile.");
                                                  println!("{}", msg);
                                                  if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", msg); }
                                                  
                                                  // 0x20 time sync: [0x20, 0x08, seen_protocol_type, secs_le_u32, checksum]
                                                  let scale_offset = 946684800u64;
                                                  let now = std::time::SystemTime::now()
                                                      .duration_since(std::time::UNIX_EPOCH)
                                                      .unwrap_or_default()
                                                      .as_secs();
                                                  let secs = if now > scale_offset { now - scale_offset } else { 0 };
                                                  
                                                  let mut time_cmd = vec![
                                                      0x20,
                                                      0x08,
                                                      seen_protocol_type,
                                                      (secs & 0xff) as u8,
                                                      ((secs >> 8) & 0xff) as u8,
                                                      ((secs >> 16) & 0xff) as u8,
                                                      ((secs >> 24) & 0xff) as u8,
                                                      0x00,
                                                  ];
                                                  let mut sum = 0u32;
                                                  for i in 0..7 {
                                                      sum += time_cmd[i] as u32;
                                                  }
                                                  time_cmd[7] = (sum & 0xFF) as u8;
                                                  
                                                  for w_char in &fff_w_clone {
                                                      let _ = p_clone.write(w_char, &time_cmd, WriteType::WithoutResponse).await;
                                                  }
                                                  
                                                  tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                                                  
                                                  // A2 User Profile: [0xA2, 0x06, 0x01, 0x32, age (e.g. 28), checksum]
                                                  let age = 28u8;
                                                  let mut profile_cmd = vec![0xa2, 0x06, 0x01, 0x32, age, 0x00];
                                                  let mut sum = 0u32;
                                                  for i in 0..5 {
                                                      sum += profile_cmd[i] as u32;
                                                  }
                                                  profile_cmd[5] = (sum & 0xFF) as u8;
                                                  
                                                  for w_char in &fff_w_clone {
                                                      let _ = p_clone.write(w_char, &profile_cmd, WriteType::WithoutResponse).await;
                                                  }
                                                  
                                                  tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                                                  
                                                  // AE01 Auth only to AE01 characteristics
                                                  let auth_cmd = vec![0x02, 0x70, 0x61, 0x73, 0x73];
                                                  for w_char in &ae_w_clone {
                                                      let _ = p_clone.write(w_char, &auth_cmd, WriteType::WithoutResponse).await;
                                                  }
                                              }
                                          }
                                          
                                          // ── Action 3: 0x21 Config Request ─────────────────────────────────
                                          if opcode == 0x21 {
                                              if !history_response_sent {
                                                  history_response_sent = true;
                                                  let msg = format!("[System] 0x21 Config Request: sending history response and query.");
                                                  println!("{}", msg);
                                                  if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", msg); }
                                                  
                                                  let mut msg1 = vec![0xa0, 0x0d, 0x04, 0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
                                                  let mut sum = 0u32;
                                                  for i in 0..12 {
                                                      sum += msg1[i] as u32;
                                                  }
                                                  msg1[12] = (sum & 0xFF) as u8;
                                                  
                                                  for w_char in &fff_w_clone {
                                                      let _ = p_clone.write(w_char, &msg1, WriteType::WithoutResponse).await;
                                                  }
                                                  
                                                  tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                                                  
                                                  let mut msg2 = vec![0xa0, 0x0d, 0x02, 0x01, 0x00, 0x08, 0x00, 0x21, 0x06, 0xb8, 0x04, 0x02, 0x00];
                                                  let mut sum = 0u32;
                                                  for i in 0..12 {
                                                      sum += msg2[i] as u32;
                                                  }
                                                  msg2[12] = (sum & 0xFF) as u8;
                                                  
                                                  for w_char in &fff_w_clone {
                                                      let _ = p_clone.write(w_char, &msg2, WriteType::WithoutResponse).await;
                                                  }
                                                  
                                                  tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                                                  
                                                  let mut query = vec![0x22, 0x06, seen_protocol_type, 0x00, 0x03, 0x00];
                                                  let mut sum = 0u32;
                                                  for i in 0..5 {
                                                      sum += query[i] as u32;
                                                  }
                                                  query[5] = (sum & 0xFF) as u8;
                                                  
                                                  for w_char in &fff_w_clone {
                                                      let _ = p_clone.write(w_char, &query, WriteType::WithoutResponse).await;
                                                  }
                                              }
                                          }
                                          
                                          // ── Branch D: Stored Measurement Record (0x23) ─────────────────────
                                          if opcode == 0x23 && bytes.len() >= 17 {
                                              let raw_w = (((bytes[10] as u16) << 8) | (bytes[11] as u16)) as f64;
                                              let w_kg = raw_w / 100.0;
                                              
                                              let r1 = (((bytes[14] as u16) << 8) | (bytes[13] as u16)) as f64;
                                              let r2 = (((bytes[16] as u16) << 8) | (bytes[15] as u16)) as f64;
                                              let impedance = if r1 > 0.0 { r1 } else { r2 };
                                              
                                              let msg = format!("[DBG-0x23] raw_w={} → {:.2} kg  impedance={} Ohm", raw_w, w_kg, impedance);
                                              println!("{}", msg);
                                              if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", msg); }
                                              
                                              if w_kg >= 40.0 && w_kg <= 150.0 {
                                                  decoded_weight = Some(w_kg);
                                                  if impedance > 100.0 && impedance < 2000.0 {
                                                      decoded_impedance = Some(impedance);
                                                  }
                                              }
                                          }
                                          
                                          // ── Branch E: Live 0x10 Weight Frame ────────────────────────────────
                                          if opcode == 0x10 && bytes.len() >= 10 {
                                              let is_es30m = bytes.len() >= 11 && bytes[4] <= 0x02 && weight_scale_factor == 10;
                                              let stable;
                                              let raw_weight;
                                              let r1;
                                              let r2;
                                              
                                              if is_es30m {
                                                  stable = bytes[4] == 0x02;
                                                  raw_weight = (((bytes[5] as u16) << 8) | (bytes[6] as u16)) as f64;
                                                  r1 = (((bytes[7] as u16) << 8) | (bytes[8] as u16)) as f64;
                                                  r2 = (((bytes[9] as u16) << 8) | (bytes[10] as u16)) as f64;
                                              } else {
                                                  stable = bytes[5] == 1;
                                                  raw_weight = (((bytes[3] as u16) << 8) | (bytes[4] as u16)) as f64;
                                                  r1 = (((bytes[6] as u16) << 8) | (bytes[7] as u16)) as f64;
                                                  r2 = (((bytes[8] as u16) << 8) | (bytes[9] as u16)) as f64;
                                              }
                                              
                                              let mut w_kg = raw_weight / (weight_scale_factor as f64);
                                              if w_kg <= 5.0 || w_kg >= 250.0 {
                                                  let alt_factor = if weight_scale_factor == 100 { 10.0 } else { 100.0 };
                                                  let alt_weight = raw_weight / alt_factor;
                                                  if alt_weight > 5.0 && alt_weight < 250.0 {
                                                      w_kg = alt_weight;
                                                  }
                                              }
                                              
                                              let impedance = if r1 > 0.0 { r1 } else { r2 };
                                              
                                              let msg = format!("[DBG-0x10] raw_w={} → {:.2} kg  stable={} impedance={} Ohm", raw_weight, w_kg, stable, impedance);
                                              println!("{}", msg);
                                              if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", msg); }
                                              
                                              if w_kg >= 40.0 && w_kg <= 150.0 {
                                                  decoded_weight = Some(w_kg);
                                                  if impedance > 100.0 && impedance < 2000.0 {
                                                      decoded_impedance = Some(impedance);
                                                  }
                                              }
                                              
                                              if stable {
                                                  // Send stability ACK: [0x1F, 0x05, seen_protocol_type, 0x10, checksum]
                                                  let mut ack_cmd = vec![0x1f, 0x05, seen_protocol_type, 0x10, 0x00];
                                                  let mut sum = 0u32;
                                                  for i in 0..4 {
                                                      sum += ack_cmd[i] as u32;
                                                  }
                                                  ack_cmd[4] = (sum & 0xFF) as u8;
                                                  
                                                  for w_char in &fff_w_clone {
                                                      let _ = p_clone.write(w_char, &ack_cmd, WriteType::WithoutResponse).await;
                                                  }
                                              }
                                          }
 
                                          // ── Branch F: Standard GATT 2A9D ────────────────────────────────────
                                          if decoded_weight.is_none() && notification.uuid.to_string().to_lowercase().contains("2a9d") && bytes.len() >= 3 {
                                              let flags = bytes[0];
                                              let is_lbs = (flags & 0x01) != 0;
                                              let raw_weight = ((bytes[2] as u16) << 8) | (bytes[1] as u16);
                                              let mut w = raw_weight as f64 * 0.005;
                                              if w < 20.0 { w = raw_weight as f64 * 0.1; }
                                              if is_lbs { w = w * 0.45359237; }
                                              let msg = format!("[DBG-GATT] 2A9D: flags=0x{:02X} is_lbs={} raw={} → {:.2} kg", flags, is_lbs, raw_weight, w);
                                              println!("{}", msg);
                                              if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", msg); }
                                              decoded_weight = Some(w);
                                          }
 
                                          // ── Emit gewicht ─────────────────────────────────────────────────────
                                          if let Some(weight) = decoded_weight {
                                              let rounded = (weight * 100.0).round() / 100.0;
                                              let should_emit = last_emitted_weight == 0.0 || (rounded - last_emitted_weight).abs() > 0.01;
                                              let emit_msg = format!("[EMIT] Gewicht: {:.2} kg  should_emit={} (vorig={:.2})", rounded, should_emit, last_emitted_weight);
                                              println!("{}", emit_msg);
                                              if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", emit_msg); }
 
                                              if should_emit {
                                                  last_emitted_weight = rounded;
                                                  #[derive(Clone, serde::Serialize)]
                                                  struct WeightPayload { weight: f64, raw_bytes: Vec<u8> }
                                                  use tauri::Emitter;
                                                  let _ = handle_clone.emit("native-weight-received", WeightPayload { weight: rounded, raw_bytes: bytes.clone() });
 
                                                  if opcode == 0x23 || opcode == 0x10 || notification.uuid.to_string().to_lowercase().contains("2a9d") {
                                                      measurement_done = true;
                                                  }
                                              }
                                          }
 
                                          // ── Emit impedantie ──────────────────────────────────────────────────
                                          if let Some(impedance) = decoded_impedance {
                                              let should_emit_metrics = last_emitted_impedance == 0.0 || (impedance - last_emitted_impedance).abs() > 0.1;
                                              if should_emit_metrics {
                                                  last_emitted_impedance = impedance;
                                                  let body_fat = 20.0 + (impedance - 600.0) * 0.02;
                                                  let water = 55.0 - (impedance - 600.0) * 0.01;
                                                  let log_m = format!("[METRICS] Weight: {} kg  Fat: {:.2}%  Water: {:.2}%  Impedance: {} Ohm", last_emitted_weight, body_fat, water, impedance);
                                                  println!("{}", log_m);
                                                  if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", log_m); }
                                                  #[derive(Clone, serde::Serialize)]
                                                  struct MetricsPayload { body_fat: f64, water: f64, impedance: f64 }
                                                  use tauri::Emitter;
                                                  let _ = handle_clone.emit("native-metrics-received", MetricsPayload { body_fat, water, impedance });
                                              }
                                          }
 
                                          let state_msg = format!("[STATE] t+{}ms  measurement_done={} impedance_ontvangen={}", elapsed_ms, measurement_done, decoded_impedance.is_some());
                                          println!("{}", state_msg);
                                          if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", state_msg); }
                                          
                                          if measurement_done && (decoded_impedance.is_some() || opcode == 0x23) {
                                              let done_msg = format!("[DONE] t+{}ms  Meting volledig. Verbreken...", elapsed_ms);
                                              println!("{}", done_msg);
                                              if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("e:\\Google Antgravity\\Zenith\\ble_debug.log") { use std::io::Write; let _ = writeln!(f, "{}", done_msg); }
                                              break;
                                          }
                                      }
                                        
                                        // Disconnect
                                        let _ = p_clone.disconnect().await;
                                        if let Ok(mut file) = std::fs::OpenOptions::new()
                                            .create(true)
                                            .append(true)
                                            .open("e:\\Google Antgravity\\Zenith\\ble_debug.log")
                                        {
                                            use std::io::Write;
                                            let _ = writeln!(file, "[System] Disconnected from scale (cooldown set).");
                                        }
                                        
                                        {
                                            let mut coold_guard = coold_clone.lock().await;
                                            coold_guard.insert(dev_id.clone(), std::time::Instant::now());
                                        }
                                         {
                                             let mut conn_guard = conn_clone.lock().await;
                                             conn_guard.remove(&dev_id);
                                         }
                                     });
                             });
                        }
                    }
                }
            }
            _ => {}
        }
    }

    Ok(())
}

#[tauri::command]
async fn sync_colmi_ring(simulate: bool) -> Result<String, String> {
    if simulate {
        // Return simulated sleep & step data for the past 7 days
        tokio::time::sleep(tokio::time::Duration::from_millis(2500)).await;
        
        let mut mock_steps = Vec::new();
        let mut mock_sleep = Vec::new();
        
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
            
        // Generate last 7 days of data
        for i in 0..7 {
            let day_offset = (i * 24 * 3600) as u64;
            let log_time = now - day_offset;
            
            // Steps: 6000 to 14000
            let step_count = 6000 + (log_time % 8000) as i32;
            mock_steps.push(serde_json::json!({
                "step_count": step_count,
                "timestamp": log_time
            }));
            
            // Sleep: 360 to 520 minutes
            let duration_minutes = 360 + (log_time % 160) as i32;
            let quality_score = 65 + (log_time % 30) as i32;
            mock_sleep.push(serde_json::json!({
                "duration_minutes": duration_minutes,
                "quality_score": quality_score,
                "timestamp": log_time
            }));
        }
        
        let response = serde_json::json!({
            "status": "success",
            "device_name": "Colmi R02 Ring (Simulated)",
            "steps": mock_steps,
            "sleep": mock_sleep
        });
        
        return Ok(response.to_string());
    }

    // Physical BLE mode
    use btleplug::api::{Central, Manager as _, Peripheral as _, ScanFilter};
    use btleplug::platform::Manager;
    
    let manager = Manager::new().await.map_err(|e| e.to_string())?;
    let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
    if adapters.is_empty() {
        return Err("Geen Bluetooth adapter gevonden".to_string());
    }
    let adapter = &adapters[0];
    
    // Start scan
    let _ = adapter.start_scan(ScanFilter::default()).await;
    tokio::time::sleep(tokio::time::Duration::from_secs(6)).await;
    
    let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
    let mut ring_peripheral = None;
    
    use std::io::Write;
    let mut log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("e:\\Google Antgravity\\Zenith\\ble_debug.log");

    println!("[Colmi Sync] Scan gestart... Aantal peripherals in adapter cache: {}", peripherals.len());
    if let Ok(ref mut file) = log_file {
        let _ = writeln!(file, "[Colmi Sync] Scan gestart... Aantal gevonden peripherals in adapter cache: {}", peripherals.len());
    }
    
    for peripheral in peripherals {
        if let Ok(Some(properties)) = peripheral.properties().await {
            let name = properties.local_name.clone().unwrap_or_default();
            let name_lower = name.to_lowercase();
            let address = peripheral.address().to_string();
            let services_str: Vec<String> = properties.services.iter().map(|s| s.to_string()).collect();

            println!("[Colmi Sync] Apparaat gescand: Naam='{}', Adres='{}', Services={:?}", name, address, services_str);
            if let Ok(ref mut file) = log_file {
                let _ = writeln!(file, "[Colmi Sync] Apparaat gescand: Naam='{}', Adres='{}', Services={:?}", name, address, services_str);
            }

            let has_service = properties.services.iter().any(|s| {
                let uuid_str = s.to_string().to_lowercase();
                uuid_str.contains("56ff") || uuid_str.contains("6e40fff0") || uuid_str.contains("fee7")
            });

            if name_lower.contains("colmi") 
                || name_lower.contains("r0") 
                || name_lower.contains("ring") 
                || name_lower.contains("smart")
                || name_lower.contains("wearable")
                || name_lower.contains("mouyoung")
                || has_service 
            {
                println!("[Colmi Sync] Match gevonden! Selecteren van ring peripheral: {}", address);
                if let Ok(ref mut file) = log_file {
                    let _ = writeln!(file, "[Colmi Sync] Match gevonden! Selecteren van ring peripheral: {}", address);
                }
                ring_peripheral = Some(peripheral);
                break;
            }
        }
    }
    
    let peripheral = match ring_peripheral {
        Some(p) => p,
        None => {
            println!("[Colmi Sync] Fout: Geen Colmi Smart Ring gevonden in de buurt.");
            return Err("Geen Colmi Smart Ring gevonden in de buurt. Controleer of de ring aanstaat.".to_string());
        }
    };
    
    println!("[Colmi Sync] Verbinden met peripheral: {}", peripheral.address());
    if let Ok(ref mut file) = log_file {
        let _ = writeln!(file, "[Colmi Sync] Verbinden met peripheral: {}", peripheral.address());
    }
    
    peripheral.connect().await.map_err(|e| {
        println!("[Colmi Sync] Fout bij verbinden met ring: {:?}", e);
        format!("Fout bij verbinden met ring: {:?}", e)
    })?;
    
    println!("[Colmi Sync] Verbonden! Start service discovery...");
    if let Ok(ref mut file) = log_file {
        let _ = writeln!(file, "[Colmi Sync] Verbonden! Start service discovery...");
    }
    
    peripheral.discover_services().await.map_err(|e| {
        println!("[Colmi Sync] Fout bij service discovery: {:?}", e);
        format!("Fout bij service discovery: {:?}", e)
    })?;
    
    println!("[Colmi Sync] Service discovery voltooid. Analyseren van services...");
    if let Ok(ref mut file) = log_file {
        let _ = writeln!(file, "[Colmi Sync] Service discovery voltooid. Analyseren van services...");
    }
    
    // Find characteristics
    let mut write_char = None;
    let mut notify_char = None;
    
    for service in peripheral.services() {
        let s_uuid = service.uuid.to_string().to_lowercase();
        let char_uuids: Vec<String> = service.characteristics.iter().map(|c| c.uuid.to_string().to_lowercase()).collect();
        
        println!("[Colmi Sync] Service ontdekt: {} -> Characteristics: {:?}", s_uuid, char_uuids);
        if let Ok(ref mut file) = log_file {
            let _ = writeln!(file, "[Colmi Sync] Service ontdekt: {} -> Characteristics: {:?}", s_uuid, char_uuids);
        }
        
        if s_uuid.contains("56ff") || s_uuid.contains("6e40fff0") || s_uuid.contains("fee7") {
            for char in service.characteristics {
                let c_uuid = char.uuid.to_string().to_lowercase();
                if c_uuid.contains("33f3") || c_uuid.contains("6e400002") || c_uuid.contains("fe01") {
                    write_char = Some(char);
                } else if c_uuid.contains("33f4") || c_uuid.contains("6e400003") || c_uuid.contains("fe02") {
                    notify_char = Some(char);
                }
            }
        }
    }
    
    let w_char = match write_char {
        Some(c) => c,
        None => {
            println!("[Colmi Sync] Fout: Write characteristic (33f3/fe01) niet gevonden op ring.");
            let _ = peripheral.disconnect().await;
            return Err("Write characteristic (33f3/fe01) niet gevonden op ring".to_string());
        }
    };
    
    let n_char = match notify_char {
        Some(c) => c,
        None => {
            println!("[Colmi Sync] Fout: Notify characteristic (33f4/fe02) niet gevonden op ring.");
            let _ = peripheral.disconnect().await;
            return Err("Notify characteristic (33f4/fe02) niet gevonden op ring".to_string());
        }
    };
    
    peripheral.subscribe(&n_char).await.map_err(|e| {
        println!("[Colmi Sync] Fout bij abonneren op notificaties: {:?}", e);
        format!("Fout bij abonneren op notificaties: {:?}", e)
    })?;
    let mut notification_stream = peripheral.notifications().await.map_err(|e| e.to_string())?;
    
    // Send time sync command (Time Sync)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
        
    let mut time_cmd = vec![0u8; 16];
    time_cmd[0] = 0x01; // CMD_TIME_SYNC
    let time_bytes = (now as u32).to_be_bytes();
    time_cmd[1] = time_bytes[0];
    time_cmd[2] = time_bytes[1];
    time_cmd[3] = time_bytes[2];
    time_cmd[4] = time_bytes[3];
    
    let mut sum: u32 = 0;
    for i in 0..15 {
        sum += time_cmd[i] as u32;
    }
    time_cmd[15] = (sum & 0xFF) as u8;
    
    println!("[Colmi Sync] Tijd-commando sturen naar ring...");
    let _ = peripheral.write(&w_char, &time_cmd, btleplug::api::WriteType::WithoutResponse).await;
    
    // Variables to hold parsed data
    let mut parsed_steps = 0i32;
    let mut parsed_sleep_minutes = 0i32;
    let mut parsed_sleep_quality = 0i32;
    let mut has_parsed_data = false;

    // ----------------------------------------------------
    // PHASE 1: LISTEN FOR RESPONSE TO TIME SYNC
    // ----------------------------------------------------
    for _ in 0..6 {
        if let Ok(Some(notification)) = tokio::time::timeout(
            tokio::time::Duration::from_millis(1000),
            notification_stream.next()
        ).await {
            let data = notification.value;
            println!("[Colmi Sync] Notificatie ontvangen (TimeSync): {:?}", data);
            if let Ok(ref mut file) = log_file {
                let _ = writeln!(file, "[Colmi Sync] Notificatie ontvangen (TimeSync): {:?}", data);
            }
            
            // Generic parser to detect steps in any incoming packet
            if data.len() >= 5 {
                for offset in 1..=(data.len() - 4) {
                    let val_be = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as i32;
                    let val_le = u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as i32;
                    if val_be > 0 && val_be < 100000 {
                        parsed_steps = val_be;
                        has_parsed_data = true;
                        println!("[Colmi Sync] Found steps (BE) at offset {}: {}", offset, val_be);
                    } else if val_le > 0 && val_le < 100000 {
                        parsed_steps = val_le;
                        has_parsed_data = true;
                        println!("[Colmi Sync] Found steps (LE) at offset {}: {}", offset, val_le);
                    }
                }
            }
        } else {
            break;
        }
    }

    // ----------------------------------------------------
    // PHASE 2: SEND CURRENT ACTIVITY QUERY (0x02)
    // ----------------------------------------------------
    let mut act_cmd = vec![0u8; 16];
    act_cmd[0] = 0x02; // CMD_CURRENT_ACTIVITY_QUERY
    act_cmd[15] = 0x02; // Checksum
    
    println!("[Colmi Sync] CurrentActivityQuery-commando (0x02) sturen naar ring...");
    let _ = peripheral.write(&w_char, &act_cmd, btleplug::api::WriteType::WithoutResponse).await;
    
    for _ in 0..6 {
        if let Ok(Some(notification)) = tokio::time::timeout(
            tokio::time::Duration::from_millis(1000),
            notification_stream.next()
        ).await {
            let data = notification.value;
            println!("[Colmi Sync] Notificatie ontvangen (ActivityQuery): {:?}", data);
            if let Ok(ref mut file) = log_file {
                let _ = writeln!(file, "[Colmi Sync] Notificatie ontvangen (ActivityQuery): {:?}", data);
            }
            
            if data.len() >= 5 {
                for offset in 1..=(data.len() - 4) {
                    let val_be = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as i32;
                    let val_le = u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as i32;
                    if val_be > 0 && val_be < 100000 {
                        parsed_steps = val_be;
                        has_parsed_data = true;
                        println!("[Colmi Sync] Found steps (BE) at offset {}: {}", offset, val_be);
                    } else if val_le > 0 && val_le < 100000 {
                        parsed_steps = val_le;
                        has_parsed_data = true;
                        println!("[Colmi Sync] Found steps (LE) at offset {}: {}", offset, val_le);
                    }
                }
            }
        } else {
            break;
        }
    }

    // ----------------------------------------------------
    // PHASE 3: SEND SYNC ACTIVITY LOGS (0x43)
    // ----------------------------------------------------
    let mut sync_act_cmd = vec![0u8; 16];
    sync_act_cmd[0] = 0x43; // CMD_SYNC_ACTIVITY
    sync_act_cmd[15] = 0x43; // Checksum
    
    println!("[Colmi Sync] SyncActivity-commando (0x43) sturen naar ring...");
    let _ = peripheral.write(&w_char, &sync_act_cmd, btleplug::api::WriteType::WithoutResponse).await;
    
    for _ in 0..6 {
        if let Ok(Some(notification)) = tokio::time::timeout(
            tokio::time::Duration::from_millis(1000),
            notification_stream.next()
        ).await {
            let data = notification.value;
            println!("[Colmi Sync] Notificatie ontvangen (SyncActivity): {:?}", data);
            if let Ok(ref mut file) = log_file {
                let _ = writeln!(file, "[Colmi Sync] Notificatie ontvangen (SyncActivity): {:?}", data);
            }
            
            if data.len() >= 5 {
                for offset in 1..=(data.len() - 4) {
                    let val_be = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as i32;
                    let val_le = u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as i32;
                    if val_be > 0 && val_be < 100000 {
                        parsed_steps = val_be;
                        has_parsed_data = true;
                        println!("[Colmi Sync] Found steps (BE) at offset {}: {}", offset, val_be);
                    } else if val_le > 0 && val_le < 100000 {
                        parsed_steps = val_le;
                        has_parsed_data = true;
                        println!("[Colmi Sync] Found steps (LE) at offset {}: {}", offset, val_le);
                    }
                }
            }
        } else {
            break;
        }
    }

    // ----------------------------------------------------
    // PHASE 4: SEND SYNC SLEEP LOGS (0x44)
    // ----------------------------------------------------
    let mut sleep_cmd = vec![0u8; 16];
    sleep_cmd[0] = 0x44; // CMD_SYNC_SLEEP
    sleep_cmd[15] = 0x44; // Checksum
    
    println!("[Colmi Sync] SyncSleep-commando (0x44) sturen naar ring...");
    let _ = peripheral.write(&w_char, &sleep_cmd, btleplug::api::WriteType::WithoutResponse).await;
    
    for _ in 0..6 {
        if let Ok(Some(notification)) = tokio::time::timeout(
            tokio::time::Duration::from_millis(1000),
            notification_stream.next()
        ).await {
            let data = notification.value;
            println!("[Colmi Sync] Notificatie ontvangen (SyncSleep): {:?}", data);
            if let Ok(ref mut file) = log_file {
                let _ = writeln!(file, "[Colmi Sync] Notificatie ontvangen (SyncSleep): {:?}", data);
            }
            
            if data.len() >= 4 {
                let cmd_header = data[0];
                if cmd_header == 0x44 || cmd_header == 0x05 {
                    // Try parsing 2-byte duration at offset 1 or 2
                    let dur_be = u16::from_be_bytes([data[1], data[2]]) as i32;
                    let dur_le = u16::from_le_bytes([data[1], data[2]]) as i32;
                    let quality = data[3] as i32;
                    
                    let mut dur = 0;
                    if dur_be > 30 && dur_be < 720 {
                        dur = dur_be;
                    } else if dur_le > 30 && dur_le < 720 {
                        dur = dur_le;
                    }
                    
                    if dur > 0 && quality > 10 && quality <= 100 {
                        parsed_sleep_minutes = dur;
                        parsed_sleep_quality = quality;
                        println!("[Colmi Sync] Slaap gedecoreerd: {} min, kwaliteit={}", dur, quality);
                    }
                }
            }
        } else {
            break;
        }
    }
    
    let _ = peripheral.unsubscribe(&n_char).await;
    let _ = peripheral.disconnect().await;
    
    let final_steps = if has_parsed_data { parsed_steps } else { 0 };
    let final_sleep_duration = parsed_sleep_minutes;
    let final_sleep_quality = parsed_sleep_quality;
    
    println!("[Colmi Sync] Synchronisatie gereed. Resultaat: Stappen={}, Slaap={}", final_steps, final_sleep_duration);
    if let Ok(ref mut file) = log_file {
        let _ = writeln!(file, "[Colmi Sync] Synchronisatie gereed. Resultaat: Stappen={}, Slaap={}", final_steps, final_sleep_duration);
    }

    let response = serde_json::json!({
        "status": "success",
        "device_name": "Colmi R02 Smart Ring",
        "steps": [
            {
                "step_count": final_steps,
                "timestamp": now
            }
        ],
        "sleep": if final_sleep_duration > 0 {
            serde_json::json!([
                {
                    "duration_minutes": final_sleep_duration,
                    "quality_score": final_sleep_quality,
                    "timestamp": now - 12 * 3600
                }
            ])
        } else {
            serde_json::json!([])
        }
    });
    
    Ok(response.to_string())
}
