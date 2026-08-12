pub mod scale;
pub mod colmi;

use tokio::sync::Mutex;

pub static GLOBAL_ADAPTER: Mutex<Option<btleplug::platform::Adapter>> = Mutex::const_new(None);
