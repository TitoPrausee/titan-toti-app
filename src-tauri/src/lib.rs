// Titan Toti — Tauri Backend Commands
// Kommuniziert mit Titan-Toti API (Port 8460)
// KEINE Backticks in diesem File

use serde::{Deserialize, Serialize};
use std::time::Duration;

const APP_VERSION: &str = "1.0.0";

#[derive(Serialize, Deserialize, Clone)]
struct ChatRequest {
    message: String,
    session_id: String,
    invite_token: String,
    user_name: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChatResponse {
    response: String,
    session_id: String,
    user_name: String,
    remaining: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct InviteRequest {
    code: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct InviteResponse {
    valid: bool,
    token: String,
    label: String,
    daily_limit: i64,
    window: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct LogoutRequest {
    invite_token: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ExportRequest {
    invite_token: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct DeleteRequest {
    invite_token: String,
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// GET /health — prueft ob Titan-Toti online ist
#[tauri::command]
async fn health_check(server_url: String) -> Result<bool, String> {
    let url = format!("{}/health", server_url.trim_end_matches('/'));
    match client().get(&url).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// GET /health — detaliierte Status-Info
#[tauri::command]
async fn health_status(server_url: String) -> Result<String, String> {
    let url = format!("{}/health", server_url.trim_end_matches('/'));
    match client().get(&url).send().await {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_else(|_| "{}".into());
            Ok(text)
        }
        Err(e) => Err(format!("Verbindung fehlgeschlagen: {}", e)),
    }
}

/// POST /api/invite — Invite-Code verifizieren, gibt Token zurueck
#[tauri::command]
async fn invite(code: String, server_url: String) -> Result<String, String> {
    let url = format!("{}/api/invite", server_url.trim_end_matches('/'));
    let body = InviteRequest { code };
    match client().post(&url).json(&body).send().await {
        Ok(resp) => {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if status.is_success() {
                Ok(text)
            } else {
                Err(format!("Code abgelehnt: {}", text))
            }
        }
        Err(e) => Err(format!("Verbindung fehlgeschlagen: {}", e)),
    }
}

/// POST /api/chat — Nachricht an Titan-Toti senden
#[tauri::command]
async fn chat_send(
    message: String,
    session_id: String,
    invite_token: String,
    user_name: String,
    server_url: String,
) -> Result<String, String> {
    let url = format!("{}/api/chat", server_url.trim_end_matches('/'));
    let body = ChatRequest {
        message,
        session_id,
        invite_token,
        user_name,
    };
    match client().post(&url).json(&body).send().await {
        Ok(resp) => {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if status.is_success() {
                Ok(text)
            } else {
                Err(format!("Chat-Fehler ({}): {}", status.as_u16(), text))
            }
        }
        Err(e) => Err(format!("Verbindung fehlgeschlagen: {}", e)),
    }
}

/// POST /api/logout — Session beenden
#[tauri::command]
async fn logout(invite_token: String, server_url: String) -> Result<bool, String> {
    let url = format!("{}/api/logout", server_url.trim_end_matches('/'));
    let body = LogoutRequest { invite_token };
    match client().post(&url).json(&body).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(e) => Err(format!("Logout fehlgeschlagen: {}", e)),
    }
}

/// POST /api/export-data — DSGVO Art. 20: Datenexport
#[tauri::command]
async fn export_data(invite_token: String, server_url: String) -> Result<String, String> {
    let url = format!("{}/api/export-data", server_url.trim_end_matches('/'));
    let body = ExportRequest { invite_token };
    match client().post(&url).json(&body).send().await {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_default();
            Ok(text)
        }
        Err(e) => Err(format!("Export fehlgeschlagen: {}", e)),
    }
}

/// POST /api/delete-data — DSGVO Art. 17: Recht auf Loeschung
#[tauri::command]
async fn delete_data(invite_token: String, server_url: String) -> Result<bool, String> {
    let url = format!("{}/api/delete-data", server_url.trim_end_matches('/'));
    let body = DeleteRequest { invite_token };
    match client().post(&url).json(&body).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(e) => Err(format!("Loeschung fehlgeschlagen: {}", e)),
    }
}

/// GET /api/privacy-settings — Datenschutzeinstellungen
#[tauri::command]
async fn privacy_settings(server_url: String) -> Result<String, String> {
    let url = format!("{}/api/privacy-settings", server_url.trim_end_matches('/'));
    match client().get(&url).send().await {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_default();
            Ok(text)
        }
        Err(e) => Err(format!("Abruf fehlgeschlagen: {}", e)),
    }
}

/// GET /api/memory — Memory-Eintraege (falls Endpunkt verfuegbar)
#[tauri::command]
async fn get_memory(server_url: String) -> Result<String, String> {
    let url = format!("{}/api/memory", server_url.trim_end_matches('/'));
    match client().get(&url).send().await {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_default();
            Ok(text)
        }
        Err(e) => Err(format!("Memory nicht verfuegbar: {}", e)),
    }
}

/// GET /api/skills — Skills-Liste (falls Endpunkt verfuegbar)
#[tauri::command]
async fn get_skills(server_url: String) -> Result<String, String> {
    let url = format!("{}/api/skills", server_url.trim_end_matches('/'));
    match client().get(&url).send().await {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_default();
            Ok(text)
        }
        Err(e) => Err(format!("Skills nicht verfuegbar: {}", e)),
    }
}

/// Gibt die App-Version zurueck
#[tauri::command]
fn app_version() -> String {
    APP_VERSION.to_string()
}

/// HTTP GET fuer freie Endpunkte (datenschutz, impressum)
#[tauri::command]
async fn http_get(url: String) -> Result<String, String> {
    match client().get(&url).send().await {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_default();
            Ok(text)
        }
        Err(e) => Err(format!("Abruf fehlgeschlagen: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            health_status,
            invite,
            chat_send,
            logout,
            export_data,
            delete_data,
            privacy_settings,
            get_memory,
            get_skills,
            app_version,
            http_get,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von Titan Toti");
}