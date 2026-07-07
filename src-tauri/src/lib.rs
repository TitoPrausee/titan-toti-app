// Titan Toti v2 — Standalone Backend (Rust)
// Direkte Ollama API Anbindung + Local Skills + Memory + System Access
// KEINE Backticks in diesem File

mod memory;
mod skills;
mod update;

use serde::{Deserialize, Serialize};
use std::time::Duration;

const APP_VERSION: &str = "2.0.0";

pub const DEFAULT_SYSTEM_PROMPT: &str = "Du bist Titan Toti — ein lokaler KI-Assistent auf macOS. Du kannst auf das System zugreifen, Dateien lesen/schreiben, Commands ausfuehren und dem Nutzer helfen. Du sprichst Deutsch.";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f64,
    max_tokens: Option<u64>,
    stream: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct OllamaChatResponse {
    choices: Vec<Choice>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Choice {
    message: ChatMessage,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct OllamaModelList {
    data: Vec<ModelInfo>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ModelInfo {
    id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct OllamaTags {
    models: Vec<TagModel>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct TagModel {
    name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct SystemCommandResult {
    success: bool,
    output: String,
    exit_code: i32,
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Direkter Chat-Call an Ollama (OpenAI-compatible /v1/chat/completions)
#[tauri::command]
async fn ollama_chat(
    api_url: String,
    api_key: String,
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f64,
    max_tokens: Option<u64>,
    fallback_models: Vec<String>,
) -> Result<String, String> {
    let url = format!("{}/v1/chat/completions", api_url.trim_end_matches('/'));
    let client = http_client();

    let mut models_to_try = vec![model.clone()];
    for m in fallback_models.iter() {
        if !models_to_try.contains(m) {
            models_to_try.push(m.clone());
        }
    }

    let mut last_error = String::new();

    for try_model in models_to_try.iter() {
        let body = OllamaChatRequest {
            model: try_model.clone(),
            messages: messages.clone(),
            temperature,
            max_tokens,
            stream: false,
        };

        let mut req = client.post(&url).json(&body);
        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", api_key));
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                if status.is_success() {
                    match serde_json::from_str::<OllamaChatResponse>(&text) {
                        Ok(parsed) => {
                            if let Some(choice) = parsed.choices.first() {
                                return Ok(choice.message.content.clone());
                            }
                            last_error = "Keine choices in Response".to_string();
                        }
                        Err(e) => {
                            // Native Ollama response fallback
                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                                if let Some(content) = v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                                    return Ok(content.to_string());
                                }
                                if let Some(content) = v.get("response").and_then(|c| c.as_str()) {
                                    return Ok(content.to_string());
                                }
                            }
                            last_error = format!("Parse-Fehler: {} — {}", e, &text[..text.len().min(200)]);
                        }
                    }
                } else {
                    last_error = format!("HTTP {} — {}", status.as_u16(), &text[..text.len().min(200)]);
                }
            }
            Err(e) => {
                last_error = format!("Verbindungsfehler: {}", e);
            }
        }
    }

    Err(format!("Alle Modelle fehlgeschlagen. Letzter Fehler: {}", last_error))
}

/// Liste verfuegbarer Modelle von Ollama
#[tauri::command]
async fn ollama_list_models(api_url: String, api_key: String) -> Result<Vec<String>, String> {
    let base = api_url.trim_end_matches('/');
    let client = http_client();

    // Versuch 1: OpenAI-compatible /v1/models
    let url1 = format!("{}/v1/models", base);
    let mut req = client.get(&url1);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }
    if let Ok(resp) = req.send().await {
        if resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            if let Ok(parsed) = serde_json::from_str::<OllamaModelList>(&text) {
                let names: Vec<String> = parsed.data.into_iter().map(|m| m.id).collect();
                if !names.is_empty() {
                    return Ok(names);
                }
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(arr) = v.get("models").and_then(|m| m.as_array()) {
                    let names: Vec<String> = arr.iter().filter_map(|m| {
                        m.get("name").and_then(|n| n.as_str()).or_else(|| m.get("id").and_then(|n| n.as_str())).map(|s| s.to_string())
                    }).collect();
                    if !names.is_empty() {
                        return Ok(names);
                    }
                }
            }
        }
    }

    // Versuch 2: Ollama native /api/tags
    let url2 = format!("{}/api/tags", base);
    if let Ok(resp) = client.get(&url2).send().await {
        if resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            if let Ok(parsed) = serde_json::from_str::<OllamaTags>(&text) {
                return Ok(parsed.models.into_iter().map(|m| m.name).collect());
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(arr) = v.get("models").and_then(|m| m.as_array()) {
                    let names: Vec<String> = arr.iter().filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())).collect();
                    return Ok(names);
                }
            }
        }
    }

    Err("Konnte Modelle nicht abrufen".to_string())
}

/// Health-Check fuer Ollama
#[tauri::command]
async fn ollama_health(api_url: String) -> Result<bool, String> {
    let base = api_url.trim_end_matches('/');
    let client = http_client();

    // Versuch /api/version
    let url1 = format!("{}/api/version", base);
    if let Ok(resp) = client.get(&url1).send().await {
        if resp.status().is_success() {
            return Ok(true);
        }
    }
    // Versuch /health
    let url2 = format!("{}/health", base);
    if let Ok(resp) = client.get(&url2).send().await {
        if resp.status().is_success() {
            return Ok(true);
        }
    }
    // Versuch /v1/models
    let url3 = format!("{}/v1/models", base);
    if let Ok(resp) = client.get(&url3).send().await {
        if resp.status().is_success() {
            return Ok(true);
        }
    }
    Ok(false)
}

/// System-Command ausfuehren
#[tauri::command]
async fn system_command(command: String, args: Vec<String>) -> Result<String, String> {
    let output = tokio::process::Command::new(&command)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Command-Fehler: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    let result = SystemCommandResult {
        success: output.status.success(),
        output: if stdout.is_empty() { stderr } else { stdout },
        exit_code,
    };
    serde_json::to_string(&result).map_err(|e| format!("Serialize-Fehler: {}", e))
}

/// Lokale Datei lesen
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Datei nicht lesbar: {}", e))
}

/// Lokale Datei schreiben
#[tauri::command]
async fn write_file(path: String, content: String) -> Result<bool, String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Verzeichnis nicht erstellbar: {}", e))?;
    }
    tokio::fs::write(&path, content)
        .await
        .map(|_| true)
        .map_err(|e| format!("Datei nicht schreibbar: {}", e))
}

/// Verzeichnis auflisten
#[tauri::command]
async fn list_dir(path: String) -> Result<Vec<String>, String> {
    let mut entries = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| format!("Verzeichnis nicht lesbar: {}", e))?;

    let mut result = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| format!("{}", e))? {
        let name = entry.file_name().to_string_lossy().to_string();
        let meta = entry.metadata().await.ok();
        let kind = if meta.as_ref().map(|m| m.is_dir()).unwrap_or(false) { "dir" } else { "file" };
        result.push(format!("[{}] {}", kind, name));
    }
    result.sort();
    Ok(result)
}

/// Memory: Session erstellen
#[tauri::command]
async fn memory_create_session(name: String) -> Result<String, String> {
    memory::create_session(&name)
}

/// Memory: Nachricht an Session anhaengen
#[tauri::command]
async fn memory_add_message(session_id: String, role: String, content: String) -> Result<bool, String> {
    memory::add_message(&session_id, &role, &content)
}

/// Memory: Alle Sessions abrufen
#[tauri::command]
async fn memory_get_sessions() -> Result<String, String> {
    memory::get_sessions_json()
}

/// Memory: Nachrichten einer Session abrufen
#[tauri::command]
async fn memory_get_messages(session_id: String) -> Result<String, String> {
    memory::get_messages_json(&session_id)
}

/// Memory: Session loeschen
#[tauri::command]
async fn memory_delete_session(session_id: String) -> Result<bool, String> {
    memory::delete_session(&session_id)
}

/// Memory: Suchen
#[tauri::command]
async fn memory_search(query: String) -> Result<String, String> {
    memory::search(&query)
}

/// Memory: Alles loeschen (DSGVO)
#[tauri::command]
async fn memory_clear_all() -> Result<bool, String> {
    memory::clear_all()
}

/// Skills: Liste abrufen
#[tauri::command]
async fn skills_list() -> Result<String, String> {
    skills::list_skills_json()
}

/// Skills: Match gegen User-Nachricht
#[tauri::command]
async fn skills_match(message: String, system_access: bool) -> Result<String, String> {
    skills::match_and_execute(&message, system_access).await
}

/// Skills: Bestimmten Skill ausfuehren
#[tauri::command]
async fn skills_execute(skill_name: String, args: Vec<String>, system_access: bool) -> Result<String, String> {
    skills::execute_skill(&skill_name, &args, system_access).await
}

/// Gibt App-Version zurueck
#[tauri::command]
fn app_version() -> String {
    APP_VERSION.to_string()
}

/// Gibt Default-System-Prompt zurueck
#[tauri::command]
fn default_system_prompt() -> String {
    DEFAULT_SYSTEM_PROMPT.to_string()
}

/// Memory-Pfad zurueckgeben
#[tauri::command]
fn memory_path() -> String {
    memory::memory_file_path().to_string_lossy().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ollama_chat,
            ollama_list_models,
            ollama_health,
            system_command,
            read_file,
            write_file,
            list_dir,
            memory_create_session,
            memory_add_message,
            memory_get_sessions,
            memory_get_messages,
            memory_delete_session,
            memory_search,
            memory_clear_all,
            skills_list,
            skills_match,
            skills_execute,
            app_version,
            default_system_prompt,
            memory_path,
            update::check_github_release,
            update::download_update,
            update::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von Titan Toti");
}