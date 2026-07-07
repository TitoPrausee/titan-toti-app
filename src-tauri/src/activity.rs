// Titan Toti — Activity Feed System
// Logging aller Aktionen in-memory + persistiert in activities.json
// KEINE Backticks in diesem File

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

const MAX_ACTIVITIES: usize = 500;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Activity {
    pub id: String,
    pub timestamp: String,
    pub r#type: String,
    pub message: String,
    pub details: Option<String>,
}

static ACTIVITIES: Mutex<Option<Vec<Activity>>> = Mutex::new(None);

fn activity_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".titan-toti")
}

fn activity_file_path() -> PathBuf {
    activity_dir().join("activities.json")
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn ensure_loaded() {
    let mut guard = ACTIVITIES.lock().unwrap();
    if guard.is_none() {
        let loaded = load_from_disk();
        *guard = Some(loaded);
    }
}

fn load_from_disk() -> Vec<Activity> {
    let path = activity_file_path();
    if !path.exists() {
        return Vec::new();
    }
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn persist(activities: &[Activity]) {
    let dir = activity_dir();
    let _ = fs::create_dir_all(&dir);
    if let Ok(json) = serde_json::to_string_pretty(activities) {
        let _ = fs::write(activity_file_path(), json);
    }
}

/// Fuegt eine Activity hinzu (intern, ohne Command-Wrapper).
pub fn log(activity_type: &str, message: &str, details: Option<&str>) -> bool {
    ensure_loaded();
    let mut guard = ACTIVITIES.lock().unwrap();
    if let Some(ref mut activities) = *guard {
        let activity = Activity {
            id: Uuid::new_v4().to_string(),
            timestamp: now_iso(),
            r#type: activity_type.to_string(),
            message: message.to_string(),
            details: details.map(|d| d.to_string()),
        };
        activities.push(activity);
        // Max 500, aelteste loeschen
        if activities.len() > MAX_ACTIVITIES {
            let excess = activities.len() - MAX_ACTIVITIES;
            activities.drain(0..excess);
        }
        persist(activities);
        return true;
    }
    false
}

pub fn log_activity_cmd(activity_type: String, message: String, timestamp: String) -> Result<bool, String> {
    ensure_loaded();
    let mut guard = ACTIVITIES.lock().unwrap();
    if let Some(ref mut activities) = *guard {
        let activity = Activity {
            id: Uuid::new_v4().to_string(),
            timestamp: if timestamp.is_empty() { now_iso() } else { timestamp },
            r#type: activity_type,
            message,
            details: None,
        };
        activities.push(activity);
        if activities.len() > MAX_ACTIVITIES {
            let excess = activities.len() - MAX_ACTIVITIES;
            activities.drain(0..excess);
        }
        persist(activities);
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn get_activities_cmd(limit: u32) -> Result<String, String> {
    ensure_loaded();
    let guard = ACTIVITIES.lock().unwrap();
    if let Some(ref activities) = *guard {
        let limit = limit as usize;
        let start = if activities.len() > limit { activities.len() - limit } else { 0 };
        let slice: Vec<&Activity> = activities[start..].iter().collect();
        serde_json::to_string(&slice).map_err(|e| format!("Serialize-Fehler: {}", e))
    } else {
        Ok("[]".to_string())
    }
}

pub fn clear_activities_cmd() -> Result<bool, String> {
    ensure_loaded();
    let mut guard = ACTIVITIES.lock().unwrap();
    if let Some(ref mut activities) = *guard {
        activities.clear();
        persist(activities);
        Ok(true)
    } else {
        Ok(false)
    }
}