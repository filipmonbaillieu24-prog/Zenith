use btleplug::api::{Central, CentralEvent, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::Manager;
use futures::stream::StreamExt;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::logger::log_ble;
use crate::ble::{GLOBAL_ADAPTER, LAST_DISCOVERED_RING};

pub async fn start_native_ble_listener(app_handle: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let manager = Manager::new().await?;
    let adapters = manager.adapters().await?;
    if adapters.is_empty() {
        return Err("Geen Bluetooth-adapter gevonden".into());
    }
    let adapter = &adapters[0];

    {
        let mut guard = GLOBAL_ADAPTER.lock().await;
        *guard = Some(adapter.clone());
    }

    // Start scanning
    adapter.start_scan(ScanFilter::default()).await?;
    let mut events = adapter.events().await?;

    log_ble("[System] Tauri Native BLE Listener gestart!");

    let cooldowns: Arc<Mutex<HashMap<btleplug::platform::PeripheralId, std::time::Instant>>> = Arc::new(Mutex::new(HashMap::new()));
    let connecting: Arc<Mutex<HashSet<btleplug::platform::PeripheralId>>> = Arc::new(Mutex::new(HashSet::new()));

    while let Some(event) = events.next().await {
        match event {
            CentralEvent::DeviceDiscovered(id) | CentralEvent::DeviceUpdated(id) => {
                if let Ok(peripheral) = adapter.peripheral(&id).await {
                    if let Ok(Some(properties)) = peripheral.properties().await {
                        let name = properties.local_name.unwrap_or_default();
                        let name_lower = name.to_lowercase();
                        let address = peripheral.address().to_string();
                        let addr_lower = address.to_lowercase();

                        // Blacklist non-ring TY devices
                        if name_lower == "ty" || addr_lower.contains("10:5a:17:af:36:bf") {
                            // Skip non-ring TY device
                        } else {
                            let has_ring_service = properties.services.iter().any(|s| {
                                let uuid_str = s.to_string().to_lowercase();
                                uuid_str.contains("56ff") 
                                    || uuid_str.contains("6e40fff0") 
                                    || uuid_str.contains("fee7")
                            });

                            let is_ring = name_lower.contains("colmi") 
                                || name_lower.contains("r0") 
                                || name_lower.contains("ring") 
                                || addr_lower.contains("32:34:48:31:a8:05")
                                || has_ring_service;

                            if is_ring {
                                log_ble(&format!("[Background Listener] Colmi Ring gedetecteerd! Naam='{}', Adres='{}'", name, address));
                                let mut cache_guard = LAST_DISCOVERED_RING.lock().await;
                                *cache_guard = Some((peripheral.clone(), address.clone(), std::time::Instant::now()));
                            }
                        }

                        // Scale detection
                        let is_scale = name_lower.contains("neo") 
                            || name_lower.contains("yolanda") 
                            || name_lower.contains("qn-scale") 
                            || name_lower.contains("scale")
                            || name_lower.contains("health")
                            || name_lower.contains("icomon")
                            || name_lower.contains("fitdays")
                            || name_lower.contains("electronic")
                            || name_lower.contains("weight")
                            || name_lower.contains("body")
                            || name_lower.contains("fat")
                            || name_lower.contains("sensun")
                            || name_lower.contains("renpho")
                            || name_lower.contains("beurer")
                            || name_lower.contains("tanita")
                            || name_lower.contains("xiaomi")
                            || name_lower.contains("eufy")
                            || name_lower.contains("trisa")
                            || name_lower.contains("medisana")
                            || name_lower.contains("yunmai")
                            || name_lower.contains("sanitas")
                            || properties.services.iter().any(|s| {
                                let u = s.to_string().to_lowercase();
                                u.contains("181d") || u.contains("181b") || u.contains("fff0")
                            });

                        if is_scale {
                            // Check cooldown
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

                            if let Ok(connected) = peripheral.is_connected().await {
                                if connected {
                                    continue;
                                }
                            }
                            
                            // Mark connecting
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
                                log_ble(&format!("[System] Connecting to scale: {}", name_clone));

                                if let Err(e) = peripheral_clone.connect().await {
                                    log_ble(&format!("Native BLE: Connection failed: {:?}", e));
                                    let mut connecting_guard = connecting_clone.lock().await;
                                    connecting_guard.remove(&id_clone);
                                    return;
                                }
                                
                                log_ble("Native BLE: Connected! Discovering services...");
                                if let Err(e) = peripheral_clone.discover_services().await {
                                    log_ble(&format!("Native BLE: Service discovery failed: {:?}", e));
                                    let _ = peripheral_clone.disconnect().await;
                                    let mut connecting_guard = connecting_clone.lock().await;
                                    connecting_guard.remove(&id_clone);
                                    return;
                                }

                                let mut fff_write_char = None;
                                for service in peripheral_clone.services() {
                                    for charac in service.characteristics {
                                        let uuid_s = charac.uuid.to_string().to_lowercase();
                                        if uuid_s.contains("fff2") || uuid_s.contains("fff1") || uuid_s.contains("fff0") {
                                            fff_write_char = Some(charac.clone());
                                        }
                                        let _ = peripheral_clone.subscribe(&charac).await;
                                    }
                                }

                                let mut notifications = match peripheral_clone.notifications().await {
                                    Ok(stream) => stream,
                                    Err(e) => {
                                        log_ble(&format!("Native BLE: Failed notifications stream: {:?}", e));
                                        let _ = peripheral_clone.disconnect().await;
                                        let mut conn_guard = connecting_clone.lock().await;
                                        conn_guard.remove(&id_clone);
                                        return;
                                    }
                                };

                                let start_time = std::time::Instant::now();
                                let mut last_emitted_weight = 0.0;
                                let mut last_emitted_impedance = 0.0;
                                let mut measurement_done = false;
                                let dev_id = id_clone.clone();

                                let p_clone = peripheral_clone.clone();
                                let handle_clone = app_handle_clone.clone();
                                let conn_clone = connecting_clone.clone();
                                let coold_clone = cooldowns_clone.clone();
                                let fff_w_clone = fff_write_char.clone();

                                while start_time.elapsed() < std::time::Duration::from_secs(45) {
                                    let elapsed_ms = start_time.elapsed().as_millis();
                                    let notification = match tokio::time::timeout(
                                        std::time::Duration::from_millis(5000),
                                        notifications.next()
                                    ).await {
                                        Ok(Some(n)) => n,
                                        _ => break,
                                    };

                                    let bytes = notification.value;
                                    let hex_str = bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
                                    let log_line = format!("[RAW] t+{}ms  UUID={}  Hex=[ {} ]", elapsed_ms, notification.uuid, hex_str);
                                    log_ble(&log_line);

                                    let mut decoded_weight: Option<f64> = None;
                                    let mut decoded_impedance: Option<f64> = None;
                                    let opcode = if !bytes.is_empty() { bytes[0] } else { 0 };

                                    // Decode Yolanda / QN-Scale packets
                                    if bytes.len() >= 4 && (opcode == 0xCF || opcode == 0xCE) {
                                        let raw_weight = ((bytes[1] as u16) << 8) | (bytes[2] as u16);
                                        decoded_weight = Some(raw_weight as f64 / 100.0);
                                    } else if bytes.len() >= 4 {
                                        let raw_weight = ((bytes[2] as u16) << 8) | (bytes[3] as u16);
                                        let mut w = raw_weight as f64 / 100.0;
                                        if w > 250.0 { w = raw_weight as f64 / 10.0; }
                                        if w > 10.0 && w < 250.0 {
                                            decoded_weight = Some(w);
                                        }

                                        if bytes.len() >= 6 {
                                            let raw_imp = ((bytes[4] as u16) << 8) | (bytes[5] as u16);
                                            if raw_imp > 200 && raw_imp < 1500 {
                                                decoded_impedance = Some(raw_imp as f64);
                                            }
                                        }

                                        // ACK responses for Onyx / Yolanda scales
                                        if let Some(ref w_char) = fff_w_clone {
                                            let ack = vec![0x02, 0x00, 0x00, 0x00];
                                            let _ = p_clone.write(w_char, &ack, WriteType::WithoutResponse).await;
                                        }
                                    }

                                    // Standard GATT 2A9D
                                    if decoded_weight.is_none() && notification.uuid.to_string().to_lowercase().contains("2a9d") && bytes.len() >= 3 {
                                        let flags = bytes[0];
                                        let is_lbs = (flags & 0x01) != 0;
                                        let raw_weight = ((bytes[2] as u16) << 8) | (bytes[1] as u16);
                                        let mut w = raw_weight as f64 * 0.005;
                                        if w < 20.0 { w = raw_weight as f64 * 0.1; }
                                        if is_lbs { w = w * 0.45359237; }
                                        log_ble(&format!("[DBG-GATT] 2A9D: flags=0x{:02X} is_lbs={} raw={} -> {:.2} kg", flags, is_lbs, raw_weight, w));
                                        decoded_weight = Some(w);
                                    }

                                    // Universal Fallback Weight Byte Scanner
                                    if decoded_weight.is_none() && bytes.len() >= 3 {
                                        for i in 0..(bytes.len() - 1) {
                                            let be = ((bytes[i] as u16) << 8) | (bytes[i+1] as u16);
                                            let le = ((bytes[i+1] as u16) << 8) | (bytes[i] as u16);
                                            let candidates = [
                                                be as f64 / 100.0,
                                                be as f64 / 10.0,
                                                le as f64 / 100.0,
                                                le as f64 / 10.0,
                                            ];
                                            for &c in &candidates {
                                                if c >= 30.0 && c <= 220.0 {
                                                    decoded_weight = Some((c * 100.0).round() / 100.0);
                                                    log_ble(&format!("[UNIVERSAL-DECODER] Parsed scale weight: {:.2} kg at byte offset {}", c, i));
                                                    break;
                                                }
                                            }
                                            if decoded_weight.is_some() { break; }
                                        }
                                    }

                                    // Emit weight
                                    if let Some(weight) = decoded_weight {
                                        let rounded = (weight * 100.0).round() / 100.0;
                                        let should_emit = last_emitted_weight == 0.0 || (rounded - last_emitted_weight).abs() > 0.01;
                                        log_ble(&format!("[EMIT] Gewicht: {:.2} kg  should_emit={} (vorig={:.2})", rounded, should_emit, last_emitted_weight));

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

                                    // Emit metrics
                                    if let Some(impedance) = decoded_impedance {
                                        let should_emit_metrics = last_emitted_impedance == 0.0 || (impedance - last_emitted_impedance).abs() > 0.1;
                                        if should_emit_metrics {
                                            last_emitted_impedance = impedance;
                                            let body_fat = 20.0 + (impedance - 600.0) * 0.02;
                                            let water = 55.0 - (impedance - 600.0) * 0.01;
                                            log_ble(&format!("[METRICS] Weight: {} kg  Fat: {:.2}%  Water: {:.2}%  Impedance: {} Ohm", last_emitted_weight, body_fat, water, impedance));
                                            #[derive(Clone, serde::Serialize)]
                                            struct MetricsPayload { body_fat: f64, water: f64, impedance: f64 }
                                            use tauri::Emitter;
                                            let _ = handle_clone.emit("native-metrics-received", MetricsPayload { body_fat, water, impedance });
                                        }
                                    }

                                    if measurement_done && (decoded_impedance.is_some() || opcode == 0x23) {
                                        log_ble(&format!("[DONE] t+{}ms  Meting volledig. Verbreken...", elapsed_ms));
                                        break;
                                    }
                                }

                                let _ = p_clone.disconnect().await;
                                log_ble("[System] Disconnected from scale (cooldown set).");

                                {
                                    let mut coold_guard = coold_clone.lock().await;
                                    coold_guard.insert(dev_id.clone(), std::time::Instant::now());
                                }
                                {
                                    let mut conn_guard = conn_clone.lock().await;
                                    conn_guard.remove(&dev_id);
                                }
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
