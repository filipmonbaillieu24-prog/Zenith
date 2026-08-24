use btleplug::api::{Central, CentralEvent, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::Manager;
use futures::stream::StreamExt;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::logger::log_ble;

pub async fn start_scale_ble_listener(app_handle: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let manager = Manager::new().await?;
    let adapters = manager.adapters().await?;
    if adapters.is_empty() {
        return Err("No Bluetooth adapter found".into());
    }
    let adapter = &adapters[0];

    {
        let mut guard = crate::ble::GLOBAL_ADAPTER.lock().await;
        *guard = Some(adapter.clone());
    }

    adapter.start_scan(ScanFilter::default()).await?;
    let mut events = adapter.events().await?;

    log_ble("[System] Tauri Native Master BLE Listener started!");

    let cooldowns: Arc<Mutex<HashMap<btleplug::platform::PeripheralId, std::time::Instant>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let connecting: Arc<Mutex<HashSet<btleplug::platform::PeripheralId>>> =
        Arc::new(Mutex::new(HashSet::new()));

    while let Some(event) = events.next().await {
        match event {
            CentralEvent::DeviceDiscovered(id) | CentralEvent::DeviceUpdated(id) => {
                if let Ok(peripheral) = adapter.peripheral(&id).await {
                    if let Ok(Some(properties)) = peripheral.properties().await {
                        let name = properties.local_name.clone().unwrap_or_default();
                        let name_lower = name.to_lowercase();
                        let address = peripheral.address().to_string();
                        let addr_lower = address.to_lowercase();

                        // Ring detection & caching in background service
                        if !(name_lower == "ty" || addr_lower.contains("10:5a:17:af:36:bf")) {
                            let has_ring_service = properties.services.iter().any(|s| {
                                let uuid_str = s.to_string().to_lowercase();
                                uuid_str.contains("6e40fff0")
                                    || uuid_str.contains("0000fee7")
                                    || uuid_str.contains("56ff")
                            });

                            let is_ring = name_lower.contains("colmi")
                                || name_lower.contains("r02")
                                || name_lower.contains("r0")
                                || name_lower.contains("ring")
                                || addr_lower.contains("32:34:48:31:a8:05")
                                || has_ring_service;

                            if is_ring {
                                log_ble(&format!(
                                    "[Background Listener] Colmi Ring detected! Name='{}' Address='{}'",
                                    name, address
                                ));
                                let mut cache_guard = crate::ble::LAST_DISCOVERED_RING.lock().await;
                                *cache_guard = Some((peripheral.clone(), address.clone(), std::time::Instant::now()));
                            }
                        }

                        // Scale detection - Neo Health / Yolanda / common brands
                        let is_scale = name_lower.contains("neo")
                            || name_lower.contains("onyx")
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
                                // Standard GATT Weight Scale (0x181D), Body Composition (0x181B),
                                // or common vendor-custom scale UUIDs (FFF0)
                                u.contains("181d") || u.contains("181b") || u.contains("0000fff0")
                            });

                        if is_scale {
                            // Cooldown check
                            {
                                let cooldowns_guard = cooldowns.lock().await;
                                if let Some(disconnect_time) = cooldowns_guard.get(&id) {
                                    if disconnect_time.elapsed() < std::time::Duration::from_secs(15) {
                                        continue;
                                    }
                                }
                            }

                            // Already-connecting check
                            {
                                let connecting_guard = connecting.lock().await;
                                if connecting_guard.contains(&id) {
                                    continue;
                                }
                            }

                            // Already connected check
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
                                handle_scale_connection(
                                    peripheral_clone,
                                    app_handle_clone,
                                    id_clone,
                                    name_clone,
                                    connecting_clone,
                                    cooldowns_clone,
                                ).await;
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

fn decode_bcd_weight(b_int: u8, b_frac: u8) -> Option<f64> {
    let high_int = b_int >> 4;
    let low_int = b_int & 0x0F;
    if high_int > 9 || low_int > 9 {
        return None;
    }
    let int_part = (high_int * 10 + low_int) as f64;
    if int_part < 20.0 || int_part > 250.0 {
        return None;
    }

    // b_frac contains decimal part and flags
    // Mask off bit 7 (0x80 = stable) and bit 5 (0x20 = imp)
    let clean = b_frac & 0x1F;
    let high_f = clean >> 4;
    let low_f = clean & 0x0F;

    let frac_part = if high_f <= 9 && low_f <= 9 {
        (high_f * 10 + low_f) as f64 / 100.0
    } else {
        (clean as f64) / 100.0
    };

    Some(((int_part + frac_part) * 100.0).round() / 100.0)
}

async fn handle_scale_connection(
    peripheral: btleplug::platform::Peripheral,
    app_handle: tauri::AppHandle,
    id: btleplug::platform::PeripheralId,
    name: String,
    connecting: Arc<Mutex<HashSet<btleplug::platform::PeripheralId>>>,
    cooldowns: Arc<Mutex<HashMap<btleplug::platform::PeripheralId, std::time::Instant>>>,
) {
    log_ble(&format!("[Scale] Connecting to scale: {}", name));

    if let Err(e) = peripheral.connect().await {
        log_ble(&format!("[Scale] Connection failed: {:?}", e));
        let mut connecting_guard = connecting.lock().await;
        connecting_guard.remove(&id);
        return;
    }

    log_ble("[Scale] Connected! Discovering services...");
    if let Err(e) = peripheral.discover_services().await {
        log_ble(&format!("[Scale] Service discovery failed: {:?}", e));
        let _ = peripheral.disconnect().await;
        let mut connecting_guard = connecting.lock().await;
        connecting_guard.remove(&id);
        return;
    }

    // Find write and notify characteristics
    let mut fff_write_char = None;
    let mut has_standard_weight = false;

    for service in peripheral.services() {
        let svc_uuid = service.uuid.to_string().to_lowercase();
        for charac in &service.characteristics {
            let uuid_s = charac.uuid.to_string().to_lowercase();

            // Standard GATT Weight Measurement characteristic (0x2A9D)
            if uuid_s.contains("2a9d") {
                has_standard_weight = true;
            }

            // Custom vendor write chars (FFF0/FFF1/FFF2 services - Yolanda/Neo Health)
            if uuid_s.contains("fff1") || uuid_s.contains("fff2") {
                fff_write_char = Some(charac.clone());
            }

            // Subscribe to all notifiable/indicatable characteristics
            if charac.properties.contains(btleplug::api::CharPropFlags::NOTIFY)
                || charac.properties.contains(btleplug::api::CharPropFlags::INDICATE)
            {
                let _ = peripheral.subscribe(charac).await;
            }
        }
        let _ = svc_uuid;
    }

    let mut notifications = match peripheral.notifications().await {
        Ok(stream) => stream,
        Err(e) => {
            log_ble(&format!("[Scale] Failed notifications stream: {:?}", e));
            let _ = peripheral.disconnect().await;
            let mut conn_guard = connecting.lock().await;
            conn_guard.remove(&id);
            return;
        }
    };

    let start_time = std::time::Instant::now();
    let mut last_emitted_weight = 0.0f64;
    let mut last_emitted_impedance = 0.0f64;
    // Stability tracking
    let mut candidate_weight = 0.0f64;
    let mut consecutive_count: u32 = 0;
    let mut measurement_done = false;

    // Maximum session time: 60 seconds
    while start_time.elapsed() < std::time::Duration::from_secs(60) {
        let elapsed_ms = start_time.elapsed().as_millis();
        let notification = match tokio::time::timeout(
            std::time::Duration::from_millis(5000),
            notifications.next()
        ).await {
            Ok(Some(n)) => n,
            _ => break,
        };

        let bytes = notification.value.clone();
        let hex_str = bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
        log_ble(&format!("[RAW] t+{}ms  UUID={}  Hex=[ {} ]", elapsed_ms, notification.uuid, hex_str));

        if bytes.is_empty() {
            continue;
        }

        let mut decoded_weight: Option<f64> = None;
        let mut decoded_impedance: Option<f64> = None;
        let opcode = bytes[0];
        let uuid_str = notification.uuid.to_string().to_lowercase();

        // =====================================================
        // 1. Standard GATT Weight Measurement (0x2A9D)
        // =====================================================
        if uuid_str.contains("2a9d") && bytes.len() >= 3 {
            let flags = bytes[0];
            let is_lbs = (flags & 0x01) != 0;
            let is_final = (flags & 0x20) != 0; // bit 5 = measurement resolved
            let raw_weight = ((bytes[2] as u16) << 8) | (bytes[1] as u16); // little-endian
            let mut w = raw_weight as f64 * 0.005; // 5g resolution (standard)
            if w < 20.0 { w = raw_weight as f64 * 0.1; } // 100g resolution fallback
            if is_lbs { w *= 0.45359237; }

            log_ble(&format!(
                "[DBG-GATT 2A9D] flags=0x{:02X} is_lbs={} is_final={} raw={} -> {:.3} kg",
                flags, is_lbs, is_final, raw_weight, w
            ));

            if w > 10.0 && w < 300.0 {
                decoded_weight = Some(w);
                // Standard GATT "measurement resolved" bit indicates stable final weight
                if is_final {
                    // Force immediate emit
                    consecutive_count = 3;
                }
            }
        }

        // =====================================================
        // 2b. Neo Health Onyx / BCD scale protocol (Opcode 0x12 / 0x11)
        //     Packet format: [ 12 11 FF 86 B0 ... ]
        //     Byte 0-1: 0x12 0x11 (Header / Opcode)
        //     Byte 3: BCD weight integer kg (0x86 -> 86 kg)
        //     Byte 4: BCD weight fraction + flags (0xB0 -> 0.10 kg)
        // =====================================================
        if decoded_weight.is_none() && bytes.len() >= 5 && (opcode == 0x12 || opcode == 0x11) {
            let b3 = bytes[3];
            let b4 = bytes[4];
            if let Some(w) = decode_bcd_weight(b3, b4) {
                decoded_weight = Some(w);
                let is_stable = (b4 & 0x80) != 0 || (bytes[2] == 0xFF);
                log_ble(&format!(
                    "[DBG-NEO-HEALTH 0x12] BCD weight={:.2} kg (b3=0x{:02X}, b4=0x{:02X}, is_stable={})",
                    w, b3, b4, is_stable
                ));

                if is_stable {
                    consecutive_count = 3;
                }
            }
        }

        // =====================================================
        // 3. Generic Yolanda multi-format (bytes 2-3 or 3-4 decode)
        //    Handles various Neo Health / Yolanda packet variants
        // =====================================================
        if decoded_weight.is_none() && bytes.len() >= 4 && opcode != 0xCF && opcode != 0xCE && opcode != 0x12 {
            // Try bytes[2..3] big-endian / 100
            let raw_w23 = ((bytes[2] as u16) << 8) | (bytes[3] as u16);
            let w23 = raw_w23 as f64 / 100.0;
            if w23 > 10.0 && w23 < 300.0 {
                decoded_weight = Some(w23);
                log_ble(&format!("[DBG-GEN] bytes[2..3] BE/100 = {:.2} kg", w23));

                // Check for impedance at bytes[4..5]
                if bytes.len() >= 6 {
                    let raw_imp = ((bytes[4] as u16) << 8) | (bytes[5] as u16);
                    if raw_imp > 100 && raw_imp < 2000 {
                        decoded_impedance = Some(raw_imp as f64);
                    }
                }

                // Send ACK for protocols that require it
                if let Some(ref w_char) = fff_write_char {
                    let ack = vec![0x02, 0x00, 0x00, 0x00];
                    let _ = peripheral.write(w_char, &ack, WriteType::WithoutResponse).await;
                }
            }
        }

        // =====================================================
        // 4. Universal fallback: scan all adjacent byte pairs
        // =====================================================
        if decoded_weight.is_none() && bytes.len() >= 3 {
            // Skip offset 0 if opcode is a known header byte (0x12, 0x11, 0xCF, 0xCE, 0x02, 0xFF)
            let start_idx = if opcode == 0x12 || opcode == 0x11 || opcode == 0xCF || opcode == 0xCE || opcode == 0x02 || opcode == 0xFF {
                1
            } else {
                0
            };

            'outer: for i in start_idx..(bytes.len() - 1) {
                // Check BCD decode on bytes[i..i+1] first
                if let Some(bcd_w) = decode_bcd_weight(bytes[i], bytes[i + 1]) {
                    if bcd_w >= 30.0 && bcd_w <= 220.0 {
                        decoded_weight = Some(bcd_w);
                        log_ble(&format!(
                            "[UNIVERSAL-FALLBACK BCD] Parsed BCD weight {:.2} kg at byte offset {}",
                            bcd_w, i
                        ));
                        break 'outer;
                    }
                }

                let be100 = ((bytes[i] as u16) << 8 | bytes[i + 1] as u16) as f64 / 100.0;
                let le100 = ((bytes[i + 1] as u16) << 8 | bytes[i] as u16) as f64 / 100.0;
                let be10 = ((bytes[i] as u16) << 8 | bytes[i + 1] as u16) as f64 / 10.0;

                for &candidate in &[be100, le100, be10] {
                    if candidate >= 30.0 && candidate <= 220.0 {
                        decoded_weight = Some((candidate * 100.0).round() / 100.0);
                        log_ble(&format!(
                            "[UNIVERSAL-FALLBACK] Parsed weight {:.2} kg at byte offset {}",
                            candidate, i
                        ));
                        break 'outer;
                    }
                }
            }
        }

        // =====================================================
        // Stability & emit logic
        // =====================================================
        if let Some(weight) = decoded_weight {
            let rounded = (weight * 100.0).round() / 100.0;

            if (rounded - candidate_weight).abs() < 0.05 {
                consecutive_count += 1;
            } else {
                candidate_weight = rounded;
                consecutive_count = 1;
            }

            // Check if this is an explicit final measurement from scale hardware
            let is_explicit_final = opcode == 0xCE  // Yolanda stable opcode
                || opcode == 0x10 || opcode == 0x23 // Other common stable opcodes
                || (bytes.len() >= 2 && (bytes[1] & 0x20 != 0)); // "measurement resolved" flag byte

            let is_stabilized = is_explicit_final || consecutive_count >= 3;

            log_ble(&format!(
                "[SCALE-STABILITY] Weight={:.2}kg explicit_final={} consecutive={}/3 stabilized={}",
                rounded, is_explicit_final, consecutive_count, is_stabilized
            ));

            if is_stabilized && (rounded - last_emitted_weight).abs() > 0.01 {
                last_emitted_weight = rounded;
                log_ble(&format!("[EMIT-FINAL-WEIGHT] Stable weight determined: {:.2} kg", rounded));

                #[derive(Clone, serde::Serialize)]
                struct WeightPayload {
                    weight: f64,
                    raw_bytes: Vec<u8>,
                    is_stable: bool,
                }
                use tauri::Emitter;
                let _ = app_handle.emit("native-weight-received", WeightPayload {
                    weight: rounded,
                    raw_bytes: bytes.clone(),
                    is_stable: true,
                });

                measurement_done = true;
            }
        }

        // Emit body composition metrics (impedance -> fat%, water%)
        if let Some(impedance) = decoded_impedance {
            if (impedance - last_emitted_impedance).abs() > 0.1 {
                last_emitted_impedance = impedance;
                let body_fat = 20.0 + (impedance - 600.0) * 0.02;
                let water = 55.0 - (impedance - 600.0) * 0.01;
                log_ble(&format!(
                    "[METRICS] Weight={:.2}kg Fat={:.1}% Water={:.1}% Impedance={:.0}Ohm",
                    last_emitted_weight, body_fat, water, impedance
                ));

                #[derive(Clone, serde::Serialize)]
                struct MetricsPayload {
                    body_fat: f64,
                    water: f64,
                    impedance: f64,
                }
                use tauri::Emitter;
                let _ = app_handle.emit("native-metrics-received", MetricsPayload {
                    body_fat,
                    water,
                    impedance,
                });
            }
        }

        // End session after stable weight + impedance, or after stable weight + a few extra seconds
        if measurement_done {
            if decoded_impedance.is_some() || opcode == 0x23 {
                log_ble(&format!("[Scale] t+{}ms Measurement complete. Disconnecting...", elapsed_ms));
                break;
            }
            // Give the scale 5 more seconds to send impedance data before disconnecting
            if start_time.elapsed() > std::time::Duration::from_secs(50) {
                log_ble("[Scale] Timeout after stable weight. Disconnecting...");
                break;
            }
        }
    }

    let _ = peripheral.disconnect().await;
    log_ble("[Scale] Disconnected (cooldown set).");

    {
        let mut coold_guard = cooldowns.lock().await;
        coold_guard.insert(id.clone(), std::time::Instant::now());
    }
    {
        let mut conn_guard = connecting.lock().await;
        conn_guard.remove(&id);
    }

    let _ = has_standard_weight;
}
