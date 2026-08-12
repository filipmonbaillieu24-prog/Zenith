pub mod scale;
pub mod colmi;

use tokio::sync::Mutex;

pub static LAST_DISCOVERED_RING: Mutex<Option<(btleplug::platform::Peripheral, String, std::time::Instant)>> = Mutex::const_new(None);
pub static GLOBAL_ADAPTER: Mutex<Option<btleplug::platform::Adapter>> = Mutex::const_new(None);
