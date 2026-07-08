// Titan Toti — Settings System
// Gespeichert in ~/.titan-toti/settings.json
// KEINE Backticks in diesem File

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

fn default_true() -> bool { true }
fn default_language() -> String { "de".to_string() }



#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub api_url: String,
    pub api_key: String,
    pub model: String,
    pub temperature: f64,
    pub max_tokens: u64,
    pub system_prompt: String,
    pub bypass_permissions: bool,
    pub auto_screenshot: bool,
    pub continuous_mode: bool,
    pub theme: String,
    #[serde(default = "default_true")]
    pub auto_learn: bool,
    #[serde(default = "default_true")]
    pub auto_skill_creation: bool,
    #[serde(default = "default_true")]
    pub memory_auto_flow: bool,
    #[serde(default = "default_language")]
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            api_url: "http://localhost:11434".to_string(),
            api_key: String::new(),
            model: "llama3.2".to_string(),
            temperature: 0.7,
            max_tokens: 4096,
            system_prompt: String::new(),
            bypass_permissions: false,
            auto_screenshot: false,
            continuous_mode: false,
            theme: "dark".to_string(),
            auto_learn: true,
            auto_skill_creation: true,
            memory_auto_flow: true,
            language: "de".to_string(),
        }
    }
}

static SETTINGS: Mutex<Option<Settings>> = Mutex::new(None);

fn settings_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".titan-toti")
}

fn settings_file_path() -> PathBuf {
    settings_dir().join("settings.json")
}

fn ensure_loaded() {
    let mut guard = SETTINGS.lock().unwrap();
    if guard.is_none() {
        let loaded = load_from_disk();
        *guard = Some(loaded);
    }
}

fn load_from_disk() -> Settings {
    let path = settings_file_path();
    if !path.exists() {
        return Settings::default();
    }
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| Settings::default()),
        Err(_) => Settings::default(),
    }
}

fn persist(settings: &Settings) {
    let dir = settings_dir();
    let _ = fs::create_dir_all(&dir);
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(settings_file_path(), json);
    }
}

pub fn get_settings_cmd() -> Result<String, String> {
    ensure_loaded();
    let guard = SETTINGS.lock().unwrap();
    if let Some(ref s) = *guard {
        // api_key maskieren fuer Frontend
        let masked = Settings {
            api_key: if s.api_key.is_empty() { String::new() } else { "***".to_string() },
            ..s.clone()
        };
        serde_json::to_string(&masked).map_err(|e| format!("Serialize-Fehler: {}", e))
    } else {
        serde_json::to_string(&Settings::default()).map_err(|e| format!("Serialize-Fehler: {}", e))
    }
}

pub fn set_setting_cmd(key: String, value: String) -> Result<bool, String> {
    ensure_loaded();
    let mut guard = SETTINGS.lock().unwrap();
    if let Some(ref mut s) = *guard {
        match key.as_str() {
            "api_url" => s.api_url = value,
            "api_key" => {
                // *** bedeutet: nicht aendern (maskierter Wert vom Frontend)
                if value != "***" { s.api_key = value; }
            }
            "model" => s.model = value,
            "temperature" => s.temperature = value.parse().unwrap_or(s.temperature),
            "max_tokens" => s.max_tokens = value.parse().unwrap_or(s.max_tokens),
            "system_prompt" => s.system_prompt = value,
            "bypass_permissions" => s.bypass_permissions = value == "true" || value == "1",
            "auto_screenshot" => s.auto_screenshot = value == "true" || value == "1",
            "continuous_mode" => s.continuous_mode = value == "true" || value == "1",
            "theme" => s.theme = value,
            "auto_learn" => s.auto_learn = value == "true" || value == "1",
            "auto_skill_creation" => s.auto_skill_creation = value == "true" || value == "1",
            "memory_auto_flow" => s.memory_auto_flow = value == "true" || value == "1",
            "language" => s.language = value,
            _ => return Err(format!("Unbekanntes Setting: {}", key)),
        }
        persist(s);
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Holt die aktuellen Settings (fuer interne Verwendung, unmaskiert).
pub fn get_settings() -> Settings {
    ensure_loaded();
    let guard = SETTINGS.lock().unwrap();
    guard.as_ref().cloned().unwrap_or_else(|| Settings::default())
}

/// Prueft ob bypass_permissions aktiv ist.
pub fn bypass_permissions() -> bool {
    get_settings().bypass_permissions
}