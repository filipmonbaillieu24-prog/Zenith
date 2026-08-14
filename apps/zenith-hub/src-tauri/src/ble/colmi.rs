use btleplug::api::{Central, Peripheral as _, ScanFilter};
use futures::stream::StreamExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
use crate::logger::log_ble;
use crate::ble::{GLOBAL_ADAPTER, LAST_DISCOVERED_RING};

static COLMI_SYNC_RUNNING: AtomicBool = AtomicBool::new(false);

/// Continuous background BLE scanner status helper for Colmi Smart Ring.
pub async fn start_colmi_ble_listener(_app_handle: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    log_ble("[System] Colmi Smart Ring Achtergrond-Service actief & gekoppeld aan Master BLE Listener!");
    Ok(())
}

fn emit_status(app: &tauri::AppHandle, status: &str, progress: f32) {
    let payload = serde_json::json!({
        "status": status,
        "progress": progress
    });
    use tauri::Emitter;
    let _ = app.emit("colmi-sync-status", payload.to_string());
}

// ========================================================================================
// COLMI R02 PROTOCOL CONSTANTS
// (Validated against: puxtril.com docs, tahnok/colmi_r02_client, Gadgetbridge, BLE captures)
// ========================================================================================

/// Command Service (Nordic UART style) - 16-byte command/response packets
#[allow(dead_code)]
const CMD_SERVICE_UUID: &str = "6e40fff0-b5a3-f393-e0a9-e50e24dcca9e";
#[allow(dead_code)]
const CMD_WRITE_UUID: &str = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // RX (host→ring)
#[allow(dead_code)]
const CMD_NOTIFY_UUID: &str = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // TX (ring→host)

/// Big Data Service - for bulk history (steps, sleep) stored multi-packet streams
#[allow(dead_code)]
const BIGDATA_SERVICE_UUID: &str = "de5bf728-d711-4e47-af26-65e3012a5dc7";
#[allow(dead_code)]
const BIGDATA_WRITE_UUID: &str = "de5bf72a-d711-4e47-af26-65e3012a5dc7"; // RX (host→ring)
#[allow(dead_code)]
const BIGDATA_NOTIFY_UUID: &str = "de5bf729-d711-4e47-af26-65e3012a5dc7"; // TX (ring→host)

/// Command IDs (byte[0] of 16-byte command packets on Command Service)
const CMD_SET_TIME: u8 = 0x01;
#[allow(dead_code)]
const CMD_GET_BATTERY: u8 = 0x03;
#[allow(dead_code)]
const CMD_GET_TODAY_STEPS: u8 = 0x13;

/// Big Data command types (byte[0] of BigData packets on BigData Service)
#[allow(dead_code)]
const BIGDATA_SPORT: u8 = 0x27;   // Sport/steps history (multi-day)
#[allow(dead_code)]
const BIGDATA_SLEEP: u8 = 0xBC;   // Sleep history (multi-day)

/// Sleep phase type codes from BigData sleep response packets
#[allow(dead_code)]
const SLEEP_PHASE_AWAKE: u8 = 0x00;
#[allow(dead_code)]
const SLEEP_PHASE_LIGHT: u8 = 0x01;
#[allow(dead_code)]
const SLEEP_PHASE_DEEP: u8 = 0x02;
#[allow(dead_code)]
const SLEEP_PHASE_REM: u8 = 0x03;  // Only on newer firmware

// ========================================================================================
// PACKET HELPERS
// ========================================================================================

/// CRC for a 16-byte Colmi packet: sum of bytes[0..15] & 0xFF
fn colmi_crc(pkt: &[u8]) -> u8 {
    let sum: u32 = pkt[..15].iter().map(|&b| b as u32).sum();
    (sum & 0xFF) as u8
}

/// Build a standard 16-byte Colmi command packet with CRC at byte[15].
fn make_cmd_packet(command: u8, sub_data: &[u8]) -> Vec<u8> {
    let mut pkt = vec![0u8; 16];
    pkt[0] = command;
    for (i, &b) in sub_data.iter().enumerate() {
        if i + 1 < 15 {
            pkt[i + 1] = b;
        }
    }
    pkt[15] = colmi_crc(&pkt);
    pkt
}

/// Build the SET_TIME command (0x01).
/// Uses plain decimal values (NOT BCD): year = (current_year % 100).
fn make_time_sync_cmd() -> Vec<u8> {
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let (year, month, day) = epoch_to_date(now_secs);
    let secs_in_day = (now_secs % 86400) as u32;
    let hour = (secs_in_day / 3600) as u8;
    let minute = ((secs_in_day % 3600) / 60) as u8;
    let second = (secs_in_day % 60) as u8;
    let year_byte = (year % 100) as u8; // e.g. 2026 → 26

    log_ble(&format!(
        "[Colmi Sync] Syncing time to ring (UTC): {:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        year, month, day, hour, minute, second
    ));

    make_cmd_packet(CMD_SET_TIME, &[year_byte, month, day, hour, minute, second, 0x00])
}

/// Build a BigData request packet (16 bytes) for sport or sleep history.
/// `cmd` = BIGDATA_SPORT (0x27) or BIGDATA_SLEEP (0xBC)
/// `days` = number of days of history to fetch (1-7)
#[allow(dead_code)]
fn make_bigdata_request(cmd: u8, days: u8) -> Vec<u8> {
    make_cmd_packet(cmd, &[days])
}

// ========================================================================================
// DATE UTILITIES
// ========================================================================================

#[allow(dead_code)]
fn date_to_epoch(year: u16, month: u8, day: u8) -> u64 {
    let y = year as i32;
    let m = month as i32;
    let d = day as i32;
    let a = (14 - m) / 12;
    let yy = y + 4800 - a;
    let mm = m + 12 * a - 3;
    let jd = d + (153 * mm + 2) / 5 + 365 * yy + yy / 4 - yy / 100 + yy / 400 - 32045;
    let days = jd - 2440588;
    (days as u64) * 86400
}

fn epoch_to_date(epoch: u64) -> (u16, u8, u8) {
    let day_num = epoch / 86400;
    let jd = day_num as i32 + 2440588;
    let a = jd + 32044;
    let b = (4 * a + 3) / 146097;
    let c = a - (146097 * b) / 4;
    let d = (4 * c + 3) / 1461;
    let e = c - (1461 * d) / 4;
    let m = (5 * e + 2) / 153;
    let day = (e - (153 * m + 2) / 5 + 1) as u8;
    let month = (m + 3 - 12 * (m / 10)) as u8;
    let year = (100 * b + d - 4800 + m / 10) as u16;
    (year, month, day)
}

// ========================================================================================
// PACKET PARSERS
// ========================================================================================

/// Parse a BigData sport (steps) response.
/// 
/// BigData sport header packet (byte[0] = 0x27, byte[4] = total_packets):
///   byte[0]  = 0x27
///   byte[1]  = year % 100 (plain decimal)
///   byte[2]  = month (1-12)
///   byte[3]  = day (1-31)
///   byte[4]  = total_packets (number of data packets to follow)
///
/// BigData sport data packet:
///   byte[0]  = 0x27
///   byte[1]  = packet_index (0-based)
///   byte[2]  = hour (0-23) of the interval
///   byte[3]  = steps low byte
///   byte[4]  = steps high byte  → steps = u16 LE (bytes[3..4])
///   byte[5]  = calories low byte
///   byte[6]  = calories high byte
///   byte[7]  = distance low byte
///   byte[8]  = distance high byte  → distance in meters, u16 LE
///   bytes[9-14] = padding/additional data
///   byte[15] = CRC
///
/// Returns: Some((year, month, day, hour, steps, total_packets)) or None
#[allow(dead_code)]
#[derive(Debug)]
enum SportPacket {
    Header { year: u16, month: u8, day: u8, total_packets: u8 },
    Data { packet_index: u8, hour: u8, steps: u32, calories: u32, distance_m: u32 },
    NoData,
}

fn parse_sport_bigdata_packet(data: &[u8]) -> Option<SportPacket> {
    if data.len() < 16 || data[0] != 0x27 {
        return None;
    }

    // Detect "no data" response: byte[1] = 0xFF
    if data[1] == 0xFF {
        return Some(SportPacket::NoData);
    }

    // Header packet: byte[4] > 0 and bytes[1..4] look like a date
    // If byte[1] is a valid year-offset (0-99) and byte[4] is a packet count
    let year_off = data[1] as u16;
    let month = data[2];
    let day = data[3];
    let total_or_index = data[4];

    let looks_like_date = year_off > 0 && year_off < 100
        && month >= 1 && month <= 12
        && day >= 1 && day <= 31;

    if looks_like_date {
        // This is a header packet
        let year = 2000 + year_off;
        log_ble(&format!(
            "[Colmi Sport] Header: date={:04}-{:02}-{:02} total_packets={}",
            year, month, day, total_or_index
        ));
        return Some(SportPacket::Header { year, month, day, total_packets: total_or_index });
    }

    // Data packet: byte[1] = packet_index (0-based), byte[2] = hour
    let packet_index = data[1];
    let hour = data[2];
    let steps = (data[3] as u32) | ((data[4] as u32) << 8); // LE
    let calories = (data[5] as u32) | ((data[6] as u32) << 8); // LE
    let distance_m = (data[7] as u32) | ((data[8] as u32) << 8); // LE

    log_ble(&format!(
        "[Colmi Sport] Data[{}]: hour={} steps={} cal={} dist={}m",
        packet_index, hour, steps, calories, distance_m
    ));

    Some(SportPacket::Data { packet_index, hour, steps, calories, distance_m })
}

/// Parse BigData sleep response.
///
/// Sleep header packet (byte[0] = 0xBC):
///   byte[0]  = 0xBC
///   byte[1]  = year % 100 (plain decimal)
///   byte[2]  = month
///   byte[3]  = day (the date sleep was recorded - typically wake-up morning date)
///   byte[4]  = sleep_start_lo  → sleep start as minutes after midnight, u16 LE
///   byte[5]  = sleep_start_hi
///   byte[6]  = sleep_end_lo    → sleep end as minutes after midnight, u16 LE
///   byte[7]  = sleep_end_hi
///   byte[8]  = total_phase_packets (number of phase data packets)
///   bytes[9-14] = padding
///   byte[15] = CRC
///
/// Sleep phase data packet:
///   byte[0]  = 0xBC
///   byte[1]  = packet_index
///   byte[2]  = phase_type   (0=awake, 1=light, 2=deep, 3=REM)
///   byte[3]  = phase_duration_minutes
///   byte[4]  = next phase_type (or 0xFF if no more phases in this packet)
///   byte[5]  = next phase_duration_minutes
///   ... (up to ~4 phases per packet, pairs of type+duration)
///   byte[15] = CRC
#[allow(dead_code)]
#[derive(Debug)]
enum SleepPacket {
    Header {
        year: u16,
        month: u8,
        day: u8,
        sleep_start_min: u16, // minutes from midnight
        sleep_end_min: u16,   // minutes from midnight
        total_packets: u8,
    },
    PhaseData {
        packet_index: u8,
        phases: Vec<(u8, u8)>, // (phase_type, duration_minutes)
    },
    NoData,
}

#[allow(dead_code)]
fn parse_sleep_bigdata_packet(data: &[u8]) -> Option<SleepPacket> {
    if data.len() < 16 || data[0] != 0xBC {
        return None;
    }

    // "No data" response
    if data[1] == 0xFF || data[1] == 0xEE {
        return Some(SleepPacket::NoData);
    }

    let year_off = data[1] as u16;
    let month = data[2];
    let day = data[3];

    let looks_like_date = year_off > 0 && year_off < 100
        && month >= 1 && month <= 12
        && day >= 1 && day <= 31;

    if looks_like_date {
        // Header packet
        let year = 2000 + year_off;
        let sleep_start_min = (data[4] as u16) | ((data[5] as u16) << 8);
        let sleep_end_min = (data[6] as u16) | ((data[7] as u16) << 8);
        let total_packets = data[8];

        log_ble(&format!(
            "[Colmi Sleep] Header: date={:04}-{:02}-{:02} start={}min end={}min packets={}",
            year, month, day, sleep_start_min, sleep_end_min, total_packets
        ));

        return Some(SleepPacket::Header {
            year, month, day, sleep_start_min, sleep_end_min, total_packets
        });
    }

    // Phase data packet: byte[1] = packet_index, then pairs of (type, duration)
    let packet_index = data[1];
    let mut phases = Vec::new();
    let mut i = 2usize;
    while i + 1 < 15 {
        let phase_type = data[i];
        let duration = data[i + 1];
        if phase_type == 0xFF || duration == 0 {
            break;
        }
        phases.push((phase_type, duration));
        i += 2;
    }

    log_ble(&format!(
        "[Colmi Sleep] PhaseData[{}]: {:?}",
        packet_index, phases
    ));

    Some(SleepPacket::PhaseData { packet_index, phases })
}

// ========================================================================================
// MAIN SYNC COMMAND
// ========================================================================================

#[tauri::command]
pub async fn sync_colmi_ring(app: tauri::AppHandle, simulate: bool, target_mac: Option<String>) -> Result<String, String> {
    if COLMI_SYNC_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Err("Er loopt al een Colmi-synchronisatie. Wacht tot deze is afgerond.".to_string());
    }

    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let res = sync_colmi_ring_inner(app_handle, simulate, target_mac).await;
        let _ = tx.send(res);
    });

    let result = rx.await.unwrap_or_else(|_| Err("Fout bij uitvoeren van achtergrondtaak".to_string()));
    COLMI_SYNC_RUNNING.store(false, Ordering::SeqCst);
    result
}

async fn sync_colmi_ring_inner(app: tauri::AppHandle, simulate: bool, target_mac: Option<String>) -> Result<String, String> {
    if simulate {
        log_ble("[Colmi Sync] Simulatie modus geactiveerd.");
        emit_status(&app, "Simulatie data genereren...", 0.2);
        tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;
        emit_status(&app, "Simulatie stappen & slaap ophalen...", 0.6);
        tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;

        let today = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let result = serde_json::json!({
            "status": "success",
            "device_name": "Colmi R02 Ring (Simulated)",
            "mac_address": "32:34:48:31:A8:05",
            "steps": [
                { "step_count": 8420, "timestamp": today - 86400, "date": "gisteren" },
                { "step_count": 6130, "timestamp": today - 172800, "date": "eergisteren" }
            ],
            "sleep": [
                {
                    "duration_minutes": 465,
                    "deep_minutes": 115,
                    "light_minutes": 255,
                    "rem_minutes": 75,
                    "awake_minutes": 20,
                    "quality_score": 82,
                    "timestamp": today - 86400
                }
            ],
            "battery": 88,
            "sync_time": chrono::Utc::now().to_rfc3339()
        });
        emit_status(&app, "Simulatie voltooid!", 1.0);
        return Ok(result.to_string());
    }

    // ========================================================================================
    // DEVICE DISCOVERY
    // ========================================================================================
    emit_status(&app, "Zoeken naar Colmi Smart Ring...", 0.10);
    log_ble("[Colmi Sync] Starten van Colmi Smart Ring synchronisatie...");

    // Get the global adapter reference - we use this for ALL operations
    let adapter_opt = {
        let guard = GLOBAL_ADAPTER.lock().await;
        guard.clone()
    };
    let global_adapter = match adapter_opt {
        Some(a) => a,
        None => {
            return Err("Geen Bluetooth-adapter beschikbaar. Start de applicatie opnieuw op.".to_string());
        }
    };

    let mut ring_peripheral = None;
    let mut ring_address = String::new();

    // Step 1: Check background service cache for known MAC address (5-minute TTL)
    // NOTE: We only use the cached ADDRESS, not the peripheral object itself.
    // Cached peripheral objects can become stale (report connected but can't discover services).
    let mut cached_mac: Option<String> = None;
    {
        let cache_guard = LAST_DISCOVERED_RING.lock().await;
        if let Some((_, ref addr, ref time)) = *cache_guard {
            let addr_lower = addr.to_lowercase();
            let cache_valid = time.elapsed() < std::time::Duration::from_secs(300);
            let not_bad_device = !addr_lower.contains("10:5a:17:af:36:bf");
            let matches_target = target_mac.as_ref()
                .map_or(true, |m| addr_lower == m.to_lowercase());

            if cache_valid && not_bad_device && matches_target {
                log_ble(&format!("[Colmi Sync] MAC uit cache: {}", addr));
                cached_mac = Some(addr.clone());
            }
        }
    }

    // If we have a cached MAC, look up a FRESH peripheral from the global adapter
    if let Some(ref mac) = cached_mac {
        if let Ok(peripherals) = global_adapter.peripherals().await {
            for p in peripherals {
                let addr = p.address().to_string();
                if addr.to_lowercase() == mac.to_lowercase() {
                    log_ble(&format!("[Colmi Sync] Vers peripheral gevonden via cached MAC: {}", addr));
                    // Disconnect stale connection if any
                    if let Ok(true) = p.is_connected().await {
                        log_ble("[Colmi Sync] Stale connectie verbreken...");
                        let _ = p.disconnect().await;
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    }
                    ring_peripheral = Some(p);
                    ring_address = addr;
                    emit_status(&app, &format!("Colmi Ring gevonden (cache): {}", ring_address), 0.30);
                    break;
                }
            }
        }
        if ring_peripheral.is_none() {
            log_ble("[Colmi Sync] Cached MAC niet gevonden in bekende peripherals. Doorgaan met scan...");
        }
    }

    // Step 2: Check known peripherals from global adapter
    if ring_peripheral.is_none() {
        if let Ok(peripherals) = global_adapter.peripherals().await {
            log_ble(&format!("[Colmi Sync] Inspecteren van {} bekende BT apparaten...", peripherals.len()));
            for peripheral in peripherals {
                if let Ok(Some(props)) = peripheral.properties().await {
                    let name = props.local_name.clone().unwrap_or_default();
                    let name_lower = name.to_lowercase();
                    let address = peripheral.address().to_string();
                    let addr_lower = address.to_lowercase();

                    if name_lower == "ty" || addr_lower.contains("10:5a:17:af:36:bf") {
                        continue;
                    }

                    let is_target_mac = target_mac.as_ref()
                        .map_or(false, |m| addr_lower == m.to_lowercase());
                    if is_target_mac {
                        log_ble(&format!("[Colmi Sync] Target MAC direct gevonden: {}", address));
                        ring_peripheral = Some(peripheral);
                        ring_address = address;
                        emit_status(&app, &format!("Ring gevonden via MAC: {}", ring_address), 0.30);
                        break;
                    }

                    let has_colmi_service = props.services.iter().any(|s| {
                        let u = s.to_string().to_lowercase();
                        u.contains("6e40fff0") || u.contains("de5bf728") || u.contains("0000fee7")
                    });

                    let is_colmi = name_lower.contains("colmi")
                        || name_lower.contains("r02")
                        || name_lower.contains("r0")
                        || addr_lower.contains("32:34:48:31:a8:05")
                        || has_colmi_service;

                    if is_colmi {
                        log_ble(&format!("[Colmi Sync] Ring gevonden: Naam='{}', Adres='{}'", name, address));
                        ring_peripheral = Some(peripheral);
                        ring_address = address;
                        emit_status(&app, &format!("Colmi Ring gevonden: {}", ring_address), 0.30);
                        break;
                    }
                }
            }
        }
    }

    // Step 3: Active BLE scan fallback (8 seconds) — uses GLOBAL_ADAPTER (NOT a new Manager)
    if ring_peripheral.is_none() {
        emit_status(&app, "Actieve BLE scan (8s) naar Colmi Ring...", 0.20);
        log_ble("[Colmi Sync] Actieve BLE scan starten via global adapter...");

        let _ = global_adapter.start_scan(ScanFilter::default()).await;
        tokio::time::sleep(tokio::time::Duration::from_secs(8)).await;
        // NOTE: We do NOT stop the scan here — we keep it running so the ring stays visible
        // to the Windows BLE stack during the connection attempt

        if let Ok(peripherals) = global_adapter.peripherals().await {
            for peripheral in peripherals {
                if let Ok(Some(props)) = peripheral.properties().await {
                    let name = props.local_name.clone().unwrap_or_default();
                    let name_lower = name.to_lowercase();
                    let address = peripheral.address().to_string();
                    let addr_lower = address.to_lowercase();

                    if name.is_empty() && address.is_empty() { continue; }
                    log_ble(&format!("[Colmi Scan] -> '{}' @ '{}'", name, address));
                    if name_lower == "ty" || addr_lower.contains("10:5a:17:af:36:bf") { continue; }

                    let is_target = target_mac.as_ref()
                        .map_or(false, |m| addr_lower == m.to_lowercase());
                    let has_colmi_service = props.services.iter().any(|s| {
                        let u = s.to_string().to_lowercase();
                        u.contains("6e40fff0") || u.contains("de5bf728") || u.contains("0000fee7")
                    });
                    let is_colmi = is_target
                        || name_lower.contains("colmi")
                        || name_lower.contains("r02")
                        || addr_lower.contains("32:34:48:31:a8:05")
                        || has_colmi_service;

                    if is_colmi {
                        log_ble(&format!("[Colmi Sync] Ring gevonden via scan: '{}'@'{}'", name, address));
                        ring_peripheral = Some(peripheral);
                        ring_address = address;
                        emit_status(&app, &format!("Ring gevonden: {}", ring_address), 0.30);
                        break;
                    }
                }
            }
        }
    }

    let peripheral = match ring_peripheral {
        Some(p) => p,
        None => {
            return Err("Geen Colmi Smart Ring gevonden. Controleer of de ring aanstaat en dichtbij is.".to_string());
        }
    };

    // ========================================================================================
    // GATT CONNECTION (Windows-optimized)
    // ========================================================================================
    // On Windows btleplug, peripheral.connect() uses WinRT BluetoothLEDevice.FromBluetoothAddressAsync
    // which often returns NotConnected if the scan was stopped (device becomes invisible).
    // The correct approach on Windows:
    //   1. Keep scan running during connect attempts (device must be advertising)
    //   2. Try discover_services() as the primary connection method (triggers actual GATT handshake)
    //   3. Only stop scan AFTER connection is established
    // ========================================================================================
    log_ble(&format!("[Colmi Sync] GATT verbinding starten met Ring (MAC: {})... Scan blijft actief.", ring_address));
    emit_status(&app, "Verbinden met Colmi Ring...", 0.40);

    let mut connect_success = false;
    for attempt in 1..=4 {
        log_ble(&format!("[Colmi Sync] Verbindingspoging {}/4 naar MAC: {}", attempt, ring_address));

        // Check if already connected
        if let Ok(true) = peripheral.is_connected().await {
            log_ble("[Colmi Sync] Ring is al verbonden!");
            connect_success = true;
            break;
        }

        // Strategy A: Try connect() first (sets up WinRT device handle)
        log_ble("[Colmi Sync] Strategie A: peripheral.connect()...");
        match tokio::time::timeout(
            tokio::time::Duration::from_secs(6),
            peripheral.connect()
        ).await {
            Ok(Ok(_)) => {
                log_ble("[Colmi Sync] connect() succesvol!");
                connect_success = true;
                break;
            }
            Ok(Err(e)) => {
                log_ble(&format!("[Colmi Sync] connect() meldt: {:?} — probeer discover_services()...", e));
            }
            Err(_) => {
                log_ble("[Colmi Sync] connect() timeout na 6s — probeer discover_services()...");
            }
        }

        // Strategy B: Try discover_services() directly
        // On Windows, this triggers the actual GATT connection even if connect() failed
        log_ble("[Colmi Sync] Strategie B: peripheral.discover_services() (triggert GATT op Windows)...");
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
        match tokio::time::timeout(
            tokio::time::Duration::from_secs(8),
            peripheral.discover_services()
        ).await {
            Ok(Ok(_)) => {
                let services = peripheral.services();
                if !services.is_empty() {
                    log_ble(&format!(
                        "[Colmi Sync] discover_services() succesvol! {} services gevonden — Verbinding actief!",
                        services.len()
                    ));
                    connect_success = true;
                    break;
                } else {
                    log_ble("[Colmi Sync] discover_services() teruggekeerd maar 0 services gevonden.");
                }
            }
            Ok(Err(e)) => {
                log_ble(&format!("[Colmi Sync] discover_services() fout: {:?}", e));
            }
            Err(_) => {
                log_ble("[Colmi Sync] discover_services() timeout na 8s");
            }
        }

        // Strategy C: Check if connection came up asynchronously while we were waiting
        log_ble("[Colmi Sync] Strategie C: wachten op asynchrone verbinding (3s)...");
        let t0 = std::time::Instant::now();
        while t0.elapsed() < std::time::Duration::from_secs(3) {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            if let Ok(true) = peripheral.is_connected().await {
                log_ble("[Colmi Sync] Asynchrone verbinding bevestigd!");
                connect_success = true;
                break;
            }
        }
        if connect_success { break; }

        log_ble(&format!("[Colmi Sync] Poging {}/4 mislukt. Wachten 2s voor retry...", attempt));
        if attempt < 4 {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }
    }

    // NOW stop the background scan (connection is established or all retries exhausted)
    log_ble("[Colmi Sync] Achtergrond-scanner pauzeren...");
    let _ = global_adapter.stop_scan().await;
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

    if !connect_success {
        // Resume background scanner on failure
        let _ = global_adapter.start_scan(ScanFilter::default()).await;
        return Err("Verbinding met Colmi Ring mislukt na 4 pogingen. Zorg ervoor dat:\n• De ring niet gekoppeld is aan de QRing app (sluit deze volledig)\n• De ring dichtbij is en opgeladen\n• Bluetooth aan staat in Windows Instellingen".to_string());
    }

    // ========================================================================================
    // SERVICE DISCOVERY
    // ========================================================================================
    emit_status(&app, "Services ontdekken...", 0.50);
    let mut cmd_write_char = None;
    let mut cmd_notify_char = None;
    let mut _bigdata_write_char = None;
    let mut bigdata_notify_char = None;

    for attempt in 1..=3 {
        log_ble(&format!("[Colmi Sync] Service discovery poging {}/3...", attempt));
        tokio::time::sleep(tokio::time::Duration::from_millis(1200)).await;

        if let Err(e) = peripheral.discover_services().await {
            log_ble(&format!("[Colmi Sync] discover_services fout: {:?}", e));
            continue;
        }

        let services = peripheral.services();
        if services.is_empty() {
            log_ble("[Colmi Sync] Geen services gevonden. Opnieuw proberen...");
            continue;
        }

        for service in &services {
            let svc_uuid = service.uuid.to_string().to_lowercase();
            log_ble(&format!(
                "[Colmi Sync] Service ontdekt (poging {}): {} -> Characteristics: {:?}",
                attempt, svc_uuid,
                service.characteristics.iter().map(|c| c.uuid.to_string()).collect::<Vec<_>>()
            ));

            for charac in &service.characteristics {
                let uuid_str = charac.uuid.to_string().to_lowercase();

                if uuid_str.contains("6e400002") {
                    cmd_write_char = Some(charac.clone());
                    log_ble(&format!("[Colmi Sync] Write characteristic gekozen: {}", uuid_str));
                }
                if uuid_str.contains("6e400003") {
                    cmd_notify_char = Some(charac.clone());
                    log_ble(&format!("[Colmi Sync] Notify characteristic gekozen: {}", uuid_str));
                }
                if uuid_str.contains("de5bf72a") {
                    _bigdata_write_char = Some(charac.clone());
                    log_ble(&format!("[Colmi Sync] BigData Write characteristic gekozen: {}", uuid_str));
                }
                if uuid_str.contains("de5bf729") {
                    bigdata_notify_char = Some(charac.clone());
                    log_ble(&format!("[Colmi Sync] BigData Notify characteristic gekozen: {}", uuid_str));
                }
            }
        }

        if cmd_write_char.is_some() && cmd_notify_char.is_some() {
            log_ble("[Colmi Sync] GATT karakteristieken gevonden!");
            break;
        }
    }

    let cmd_write = match cmd_write_char {
        Some(c) => c,
        None => return Err("Command write karakteristiek (6e400002) niet gevonden.".to_string()),
    };
    let cmd_notify = match cmd_notify_char {
        Some(c) => c,
        None => return Err("Command notify karakteristiek (6e400003) niet gevonden.".to_string()),
    };

    // Subscribe to command notifications
    if let Err(e) = peripheral.subscribe(&cmd_notify).await {
        return Err(format!("Subscribe op command notify mislukt: {:?}", e));
    }

    // Subscribe to BigData notifications if available
    if let Some(ref bd_notify) = bigdata_notify_char {
        let _ = peripheral.subscribe(bd_notify).await;
        log_ble("[Colmi Sync] Geabonneerd op BigData notify karakteristiek.");
    }

    let mut notification_stream = match peripheral.notifications().await {
        Ok(s) => s,
        Err(e) => return Err(format!("Notificatie stream fout: {:?}", e)),
    };

    // ========================================================================================
    // TIME SYNCHRONIZATION + LIVE ACTIVITY CAPTURE
    // ========================================================================================
    emit_status(&app, "Tijd synchroniseren...", 0.55);
    let time_cmd = make_time_sync_cmd();
    log_ble(&format!("[Colmi Sync] SET_TIME (0x01): {:?}", time_cmd));
    let _ = peripheral.write(&cmd_write, &time_cmd, btleplug::api::WriteType::WithoutResponse).await;

    // Drain time sync responses and capture 0x73 0x12 live activity (today's steps)
    let mut steps_by_date: HashMap<String, (i32, u64)> = HashMap::new();
    let mut today_steps: u32 = 0;
    let today_str = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let today_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    for i in 0..8 {
        match tokio::time::timeout(tokio::time::Duration::from_millis(2000), notification_stream.next()).await {
            Ok(Some(n)) => {
                let data = n.value;
                log_ble(&format!("[Colmi Sync] Post-TimeSync notificatie[{}]: {:?} (len={})", i, data, data.len()));

                // Parse 0x73 0x12 = CMD_NOTIFICATION / LIVE_ACTIVITY
                if data.len() >= 12 && data[0] == 0x73 && data[1] == 0x12 {
                    let steps = (data[4] as u32) | ((data[5] as u32) << 8);
                    let distance_cm = (data[6] as u32) | ((data[7] as u32) << 8);
                    let calories = (data[10] as u32) | ((data[11] as u32) << 8);
                    log_ble(&format!(
                        "[Colmi Sync] ★ LIVE ACTIVITY: stappen={}, afstand={}cm, calorieën={}",
                        steps, distance_cm, calories
                    ));
                    if steps > today_steps {
                        today_steps = steps;
                    }
                }
            }
            _ => {
                log_ble(&format!("[Colmi Sync] Post-TimeSync timeout na packet {}", i));
                break;
            }
        }
    }

    // Store today's live steps
    if today_steps > 0 {
        log_ble(&format!("[Colmi Sync] Vandaag live stappen: {} ({})", today_steps, today_str));
        steps_by_date.insert(today_str.clone(), (today_steps as i32, today_epoch));
    }

    // ========================================================================================
    // HISTORICAL STEPS (via CMD_BIG_DATA_V2 = 0xBC, sub_type = 0x01)
    // Protocol: Write [0xBC, day_offset, 0x01, 0..0, checksum] to CMD_WRITE (6e400002)
    // Ring replies: ACK on CMD_NOTIFY + data packets on BIGDATA_NOTIFY (de5bf729)
    // ========================================================================================
    emit_status(&app, "Stappen opvragen...", 0.60);
    log_ble("[Colmi Sync] === HISTORISCHE STAPPEN OPHALEN (0xBC sub=0x01) ===");

    for day_offset in 1u8..=7 {
        // Build 0xBC command for historical steps
        let mut cmd = [0u8; 16];
        cmd[0] = 0xBC;         // CMD_BIG_DATA_V2
        cmd[1] = day_offset;   // day offset (1 = yesterday, 7 = 7 days ago)
        cmd[2] = 0x01;         // sub_type = sport/steps
        // Checksum = sum of bytes[0..14] & 0xFF
        let cksum: u16 = cmd[..15].iter().map(|&b| b as u16).sum();
        cmd[15] = (cksum & 0xFF) as u8;

        log_ble(&format!("[Colmi Sync] Steps request dag_offset={}: {:?}", day_offset, cmd));
        if let Err(e) = peripheral.write(&cmd_write, &cmd, btleplug::api::WriteType::WithoutResponse).await {
            log_ble(&format!("[Colmi Sync] Steps write fout dag {}: {:?}", day_offset, e));
            continue;
        }

        // Wait for ACK + data packets
        let mut day_total_steps: i32 = 0;
        let mut day_date_str = String::new();
        let mut day_epoch: u64 = 0;
        let mut got_ack = false;
        let mut data_packets_expected = 0u32;
        let mut data_packets_received = 0u32;

        let day_timeout = std::time::Instant::now();
        loop {
            if day_timeout.elapsed() > std::time::Duration::from_secs(10) {
                log_ble(&format!("[Colmi Sync] Steps timeout dag_offset={}", day_offset));
                break;
            }

            match tokio::time::timeout(tokio::time::Duration::from_millis(3000), notification_stream.next()).await {
                Ok(Some(n)) => {
                    let data = n.value;
                    log_ble(&format!("[Colmi Sync] Steps[dag={}] notificatie: {:?} (len={})", day_offset, data, data.len()));

                    // Skip live activity notifications (0x73) that may interleave
                    if !data.is_empty() && data[0] == 0x73 {
                        if data.len() >= 6 && data[1] == 0x12 {
                            let steps = (data[4] as u32) | ((data[5] as u32) << 8);
                            if steps > today_steps { today_steps = steps; }
                        }
                        continue;
                    }

                    // ACK packet from CMD_NOTIFY: typically 7 bytes [0xBC, day, status, ...]
                    if !got_ack && !data.is_empty() && data[0] == 0xBC {
                        got_ack = true;
                        let status = if data.len() > 2 { data[2] } else { 0 };
                        log_ble(&format!("[Colmi Sync] Steps ACK dag={}: status={} (1=data, 0/FF=geen data)", day_offset, status));

                        if status != 1 {
                            log_ble(&format!("[Colmi Sync] Geen stappen data voor dag_offset={}", day_offset));
                            break;
                        }

                        // Extract expected packet count if available
                        if data.len() >= 6 {
                            data_packets_expected = (data[4] as u32) | ((data[5] as u32) << 8);
                            log_ble(&format!("[Colmi Sync] Verwacht {} data pakketten", data_packets_expected));
                        }

                        // Calculate date for this day_offset
                        let offset_secs = day_offset as u64 * 86400;
                        day_epoch = today_epoch.saturating_sub(offset_secs);
                        let dt = chrono::DateTime::from_timestamp(day_epoch as i64, 0)
                            .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
                        day_date_str = dt.format("%Y-%m-%d").to_string();
                        continue;
                    }

                    // Data packet from BIGDATA_NOTIFY (format varies)
                    if got_ack && !data.is_empty() {
                        data_packets_received += 1;

                        // Try to extract step counts from data packet
                        // Common BigData sport format: each packet may contain hourly step data
                        if data.len() >= 8 {
                            // Try parsing as hourly sport data:
                            // Bytes may contain: [header, hour, steps_lo, steps_hi, cal_lo, cal_hi, dist_lo, dist_hi, ...]
                            let potential_steps = (data[2] as i32) | ((data[3] as i32) << 8);
                            if potential_steps > 0 && potential_steps < 50000 {
                                log_ble(&format!("[Colmi Sync] Steps data pakket {}: potentiële stappen={}", data_packets_received, potential_steps));
                                day_total_steps += potential_steps;
                            }
                        }

                        // Check if we've received all expected packets
                        if data_packets_expected > 0 && data_packets_received >= data_packets_expected {
                            log_ble(&format!("[Colmi Sync] Alle {} pakketten ontvangen voor dag {}", data_packets_expected, day_offset));
                            break;
                        }
                    }
                }
                _ => {
                    log_ble(&format!("[Colmi Sync] Steps timeout wachten op packet dag_offset={}", day_offset));
                    break;
                }
            }
        }

        if day_total_steps > 0 && !day_date_str.is_empty() {
            log_ble(&format!("[Colmi Sync] ★ Stappen voor {}: {}", day_date_str, day_total_steps));
            steps_by_date.entry(day_date_str).or_insert((day_total_steps, day_epoch));
        }

        // Small delay between day requests
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    // Update today's steps if we got more live updates during history fetch
    if today_steps > 0 {
        steps_by_date.insert(today_str.clone(), (today_steps as i32, today_epoch));
    }

    // ========================================================================================
    // HISTORICAL SLEEP (via CMD_BIG_DATA_V2 = 0xBC, sub_type = 0x00)
    // Protocol: Write [0xBC, day_offset, 0x00, 0..0, checksum] to CMD_WRITE (6e400002)
    // Ring replies: ACK on CMD_NOTIFY + sleep phase data on BIGDATA_NOTIFY (de5bf729)
    // ========================================================================================
    emit_status(&app, "Slaapgegevens opvragen...", 0.75);
    log_ble("[Colmi Sync] === HISTORISCHE SLAAP OPHALEN (0xBC sub=0x00) ===");

    // date_str → (total_min, deep_min, light_min, rem_min, awake_min, quality, epoch)
    let mut sleep_by_date: HashMap<String, (i32, i32, i32, i32, i32, i32, u64)> = HashMap::new();

    for day_offset in 1u8..=7 {
        // Build 0xBC command for historical sleep
        let mut cmd = [0u8; 16];
        cmd[0] = 0xBC;         // CMD_BIG_DATA_V2
        cmd[1] = day_offset;   // day offset
        cmd[2] = 0x00;         // sub_type = sleep
        let cksum: u16 = cmd[..15].iter().map(|&b| b as u16).sum();
        cmd[15] = (cksum & 0xFF) as u8;

        log_ble(&format!("[Colmi Sync] Sleep request dag_offset={}: {:?}", day_offset, cmd));
        if let Err(e) = peripheral.write(&cmd_write, &cmd, btleplug::api::WriteType::WithoutResponse).await {
            log_ble(&format!("[Colmi Sync] Sleep write fout dag {}: {:?}", day_offset, e));
            continue;
        }

        let mut got_ack = false;
        let mut data_packets_expected = 0u32;
        let mut data_packets_received = 0u32;
        let mut sleep_date_str = String::new();
        let mut sleep_epoch: u64 = 0;
        let mut sleep_start_min: u16 = 0;
        let mut sleep_end_min: u16 = 0;
        let mut phase_deep_min = 0i32;
        let mut phase_light_min = 0i32;
        let mut phase_rem_min = 0i32;
        let mut phase_awake_min = 0i32;

        let day_timeout = std::time::Instant::now();
        loop {
            if day_timeout.elapsed() > std::time::Duration::from_secs(10) {
                log_ble(&format!("[Colmi Sync] Sleep timeout dag_offset={}", day_offset));
                break;
            }

            match tokio::time::timeout(tokio::time::Duration::from_millis(3000), notification_stream.next()).await {
                Ok(Some(n)) => {
                    let data = n.value;
                    log_ble(&format!("[Colmi Sync] Sleep[dag={}] notificatie: {:?} (len={})", day_offset, data, data.len()));

                    // Skip live activity notifications
                    if !data.is_empty() && data[0] == 0x73 { continue; }

                    // ACK packet from CMD_NOTIFY
                    if !got_ack && !data.is_empty() && data[0] == 0xBC {
                        got_ack = true;
                        let status = if data.len() > 2 { data[2] } else { 0 };
                        log_ble(&format!("[Colmi Sync] Sleep ACK dag={}: status={}", day_offset, status));

                        if status != 1 {
                            log_ble(&format!("[Colmi Sync] Geen slaap data voor dag_offset={}", day_offset));
                            break;
                        }

                        // Calculate date
                        let offset_secs = day_offset as u64 * 86400;
                        sleep_epoch = today_epoch.saturating_sub(offset_secs);
                        let dt = chrono::DateTime::from_timestamp(sleep_epoch as i64, 0)
                            .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
                        sleep_date_str = dt.format("%Y-%m-%d").to_string();

                        // Try to extract sleep timing from ACK if available
                        if data.len() >= 7 {
                            sleep_start_min = (data[3] as u16) | ((data[4] as u16) << 8);
                            sleep_end_min = (data[5] as u16) | ((data[6] as u16) << 8);
                            log_ble(&format!("[Colmi Sync] Sleep timing: start={}min end={}min", sleep_start_min, sleep_end_min));
                            if data.len() >= 8 {
                                data_packets_expected = data[7] as u32;
                                log_ble(&format!("[Colmi Sync] Verwacht {} slaap data pakketten", data_packets_expected));
                            }
                        }
                        continue;
                    }

                    // Data packets from BIGDATA_NOTIFY with sleep phase data
                    if got_ack && !data.is_empty() {
                        data_packets_received += 1;

                        // Try to parse sleep phase data
                        // Expected format on BigData Notify: pairs of (phase_type, duration_minutes)
                        // phase_type: 0x02=Light, 0x03=Deep, 0x04=REM, 0x05=Awake
                        // OR:         0x00=Awake, 0x01=Light, 0x02=Deep, 0x03=REM
                        let mut i = 0usize;
                        // Skip first byte if it looks like a header/index
                        if data.len() >= 3 && data[0] < 100 {
                            i = 1; // skip packet index byte
                        }

                        while i + 1 < data.len() {
                            let phase_type = data[i];
                            let duration = data[i + 1];

                            if duration == 0 || phase_type == 0xFF || duration == 0xFF {
                                break;
                            }

                            // Try both possible phase type encodings
                            match phase_type {
                                // Encoding A: 0x02=Light, 0x03=Deep, 0x04=REM, 0x05=Awake
                                0x02 => { phase_light_min += duration as i32; log_ble(&format!("[Colmi Sleep] Lichte slaap: {}min", duration)); }
                                0x03 => { phase_deep_min += duration as i32; log_ble(&format!("[Colmi Sleep] Diepe slaap: {}min", duration)); }
                                0x04 => { phase_rem_min += duration as i32; log_ble(&format!("[Colmi Sleep] REM slaap: {}min", duration)); }
                                0x05 => { phase_awake_min += duration as i32; log_ble(&format!("[Colmi Sleep] Wakker: {}min", duration)); }
                                // Encoding B: 0x00=Awake, 0x01=Light, 0x02=Deep, 0x03=REM (handled by 0x02/0x03 above)
                                0x00 => { phase_awake_min += duration as i32; log_ble(&format!("[Colmi Sleep] Wakker(B): {}min", duration)); }
                                0x01 => { phase_light_min += duration as i32; log_ble(&format!("[Colmi Sleep] Lichte slaap(B): {}min", duration)); }
                                _ => {
                                    log_ble(&format!("[Colmi Sleep] Onbekend fase type: 0x{:02X} duur={}min", phase_type, duration));
                                }
                            }
                            i += 2;
                        }

                        if data_packets_expected > 0 && data_packets_received >= data_packets_expected {
                            log_ble(&format!("[Colmi Sync] Alle {} slaap pakketten ontvangen voor dag {}", data_packets_expected, day_offset));
                            break;
                        }
                    }
                }
                _ => {
                    log_ble(&format!("[Colmi Sync] Sleep timeout wachten op packet dag_offset={}", day_offset));
                    break;
                }
            }
        }

        // Save sleep record for this day
        let phase_total = phase_deep_min + phase_light_min + phase_rem_min + phase_awake_min;
        if phase_total > 0 && !sleep_date_str.is_empty() {
            save_sleep_record(
                &mut sleep_by_date,
                &sleep_date_str,
                sleep_epoch,
                sleep_start_min,
                sleep_end_min,
                phase_deep_min, phase_light_min, phase_rem_min, phase_awake_min,
            );
        }

        // Small delay between day requests
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    // ========================================================================================
    // CLEANUP
    // ========================================================================================
    let _ = peripheral.unsubscribe(&cmd_notify).await;
    if let Some(ref bd_notify) = bigdata_notify_char {
        let _ = peripheral.unsubscribe(bd_notify).await;
    }
    let _ = peripheral.disconnect().await;

    if true {
        log_ble("[Colmi Sync] Achtergrond-scanner hervatten...");
        let _ = global_adapter.start_scan(ScanFilter::default()).await;
    }

    // ========================================================================================
    // BUILD RESPONSE
    // ========================================================================================
    let steps_list: Vec<serde_json::Value> = steps_by_date.iter().map(|(date_str, (count, epoch))| {
        serde_json::json!({
            "step_count": count,
            "timestamp": epoch,
            "date": date_str
        })
    }).collect();

    let sleep_list: Vec<serde_json::Value> = sleep_by_date.iter().map(|(date_str, (total, deep, light, rem, awake, quality, epoch))| {
        serde_json::json!({
            "duration_minutes": total,
            "deep_minutes": deep,
            "light_minutes": light,
            "rem_minutes": rem,
            "awake_minutes": awake,
            "quality_score": quality,
            "timestamp": epoch,
            "date": date_str
        })
    }).collect();

    emit_status(&app, "Synchronisatie afgerond!", 1.00);
    log_ble(&format!(
        "[Colmi Sync] Klaar: {} dagen stappen, {} nachten slaap.",
        steps_list.len(), sleep_list.len()
    ));

    let response = serde_json::json!({
        "status": "success",
        "device_name": "Colmi R02 Smart Ring",
        "mac_address": peripheral.address().to_string(),
        "steps": steps_list,
        "sleep": sleep_list
    });

    Ok(response.to_string())
}

/// Helper to save a sleep record into the accumulation map.
/// Handles midnight-crossing sleep and computes quality score.
fn save_sleep_record(
    sleep_by_date: &mut HashMap<String, (i32, i32, i32, i32, i32, i32, u64)>,
    date_str: &str,
    epoch: u64,
    sleep_start_min: u16,  // minutes from midnight on the logged date
    sleep_end_min: u16,    // minutes from midnight
    deep_min: i32,
    light_min: i32,
    rem_min: i32,
    awake_min: i32,
) {
    // Total duration in minutes
    // Handle midnight crossing: if start > end, sleep crosses midnight
    let total_min = if sleep_start_min <= sleep_end_min {
        // Same day (nap or early morning)
        (sleep_end_min - sleep_start_min) as i32
    } else {
        // Crosses midnight: e.g. start=1380 (23:00), end=420 (7:00) → 420+(1440-1380)=480min
        (1440 - sleep_start_min as i32) + sleep_end_min as i32
    };

    // Use phase-sum as total if we have phase data, otherwise use time-based total
    let phase_total = deep_min + light_min + rem_min + awake_min;
    let effective_total = if phase_total > 0 { phase_total } else { total_min };

    if effective_total <= 0 {
        return;
    }

    // Quality score: weighted by deep sleep ratio (50-100 scale)
    let quality = if phase_total > 0 {
        let deep_ratio = deep_min as f32 / phase_total as f32;
        (50.0 + (deep_ratio * 50.0).min(50.0)) as i32
    } else {
        70 // default
    };

    log_ble(&format!(
        "[Colmi Sleep] Slaap opgeslagen voor {}: totaal={}min diep={}min licht={}min rem={}min wakker={}min kwaliteit={}",
        date_str, effective_total, deep_min, light_min, rem_min, awake_min, quality
    ));

    sleep_by_date.entry(date_str.to_string())
        .or_insert((effective_total, deep_min, light_min, rem_min, awake_min, quality, epoch));
}
