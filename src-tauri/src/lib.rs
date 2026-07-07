// Titan Toti v2.2 — Standalone Backend (Rust)
// Direkte Ollama API Anbindung + Local Skills + Memory + System Access
// KEINE Backticks in diesem File

mod memory;
mod skills;
mod update;

use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri_plugin_opener::OpenerExt;

const APP_VERSION: &str = "2.3.0";

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

// ============================================================================
// OLLAMA DEVICE AUTH FLOW (v2.3)
// ============================================================================
// Ollama nutzt einen ed25519-Key-Pair-Auth-Flow:
//   1. Client hat ~/.ollama/id_ed25519 (privat) + id_ed25519.pub (public)
//   2. Connect-URL: https://ollama.com/connect?name=<PUBKEY>
//   3. User oeffnet URL im Browser -> "Connect" Button -> klickt -> autorisiert
//   4. Ollama CLI "ollama signin" pollt im Hintergrund bis autorisiert
//   5. Danach kann man Cloud-Modelle pullen (z.B. glm-5.2:cloud)
// Die lokale Ollama API auf Port 11434 hat KEINEN Auth-Endpoint.
// Der Flow laeuft ueber die ollama CLI + ollama.com.
// ============================================================================

// Globaler State fuer den Auth-Flow
static AUTH_RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static AUTH_DONE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Findet den ollama Binary-Pfad auf dem System.
/// Prueft: PATH, /Applications/Ollama.app/Contents/Resources/ollama,
/// /usr/local/bin/ollama, /opt/homebrew/bin/ollama
fn find_ollama_binary() -> Option<String> {
    let candidates = vec![
        "ollama",
        "/Applications/Ollama.app/Contents/Resources/ollama",
        "/usr/local/bin/ollama",
        "/opt/homebrew/bin/ollama",
        "/usr/bin/ollama",
    ];
    for c in candidates.iter() {
        if std::process::Command::new(c).arg("--version").output().is_ok() {
            return Some(c.to_string());
        }
    }
    None
}

/// Liest den ollama ed25519 public key aus ~/.ollama/id_ed25519.pub
/// Format: ssh-ed25519 AAAA... [comment]
fn read_ollama_pubkey() -> Option<String> {
    let home = dirs::home_dir()?;
    let pub_path = home.join(".ollama").join("id_ed25519.pub");
    let content = std::fs::read_to_string(&pub_path).ok()?;
    // Format: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... [comment]"
    // Wir wollen nur den Key-Teil (das zweite Token)
    let parts: Vec<&str> = content.trim().split_whitespace().collect();
    if parts.len() >= 2 {
        Some(parts[1].to_string())
    } else {
        Some(content.trim().to_string())
    }
}

/// Startet den Ollama Device-Auth-Flow.
/// 1. Oeffnet https://ollama.com/connect?name=<PUBKEY> im Browser (non-blocking)
/// 2. Startet "ollama signin" im Hintergrund (pollt bis autorisiert)
/// 3. Returned sofort ein JSON mit Status
/// Der Frontend pollt check_auth_status() alle 2 Sekunden.
#[tauri::command]
async fn start_ollama_auth(app: tauri::AppHandle) -> Result<String, String> {
    // Reset state
    AUTH_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
    AUTH_DONE.store(false, std::sync::atomic::Ordering::SeqCst);

    // Schritt 1: Pruefen ob Ollama binary verfuegbar ist
    let ollama_bin = find_ollama_binary();

    // Schritt 2: Public Key lesen
    let pubkey = read_ollama_pubkey();

    // Schritt 3: Connect-URL bauen und Browser oeffnen
    let connect_url = match &pubkey {
        Some(pk) => format!("https://ollama.com/connect?name={}", pk),
        None => {
            // Kein Key-Pair vorhanden -> falls ollama binary da ist, wird
            // "ollama signin" den Key generieren. Andernfalls Fallback.
            "https://ollama.com/connect".to_string()
        }
    };

    let browser_ok = open_url_nonblocking(&app, &connect_url);

    // Schritt 4: Falls ollama binary verfuegbar -> "ollama signin" im Hintergrund starten
    // Das oeffnet ggf. nochmal den Browser und pollt bis der User "Connect" klickt.
    let has_binary = ollama_bin.is_some();
    if let Some(ref bin) = ollama_bin {
        AUTH_RUNNING.store(true, std::sync::atomic::Ordering::SeqCst);
        let bin_clone = bin.clone();
        // Background-Task: ollama signin ausfuehren
        tokio::spawn(async move {
            // ollama signin blockiert bis der User authentifiziert ist
            // oder bis es fehlschlaegt. Wir fuehren es asynchron aus.
            let result = tokio::process::Command::new(&bin_clone)
                .arg("signin")
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn();

            match result {
                Ok(mut child) => {
                    // Warte bis der Prozess beendet ist (oder timeout nach 120s)
                    let timeout = tokio::time::Duration::from_secs(120);
                    match tokio::time::timeout(timeout, child.wait()).await {
                        Ok(Ok(status)) => {
                            eprintln!("ollama signin beendet mit status: {}", status);
                            if status.success() {
                                AUTH_DONE.store(true, std::sync::atomic::Ordering::SeqCst);
                            }
                        }
                        Ok(Err(e)) => {
                            eprintln!("ollama signin Fehler: {}", e);
                        }
                        Err(_) => {
                            eprintln!("ollama signin timeout -> kill");
                            let _ = child.kill().await;
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Konnte ollama signin nicht starten: {}", e);
                }
            }
            AUTH_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
        });
    }

    // Schritt 5: JSON-Response bauen
    let response = serde_json::json!({
        "success": browser_ok.is_ok(),
        "message": if has_binary {
            "Browser geoeffnet. Bitte klicke im Browser auf 'Connect' um dich zu authentifizieren."
        } else {
            "Browser geoeffnet. Bitte klicke im Browser auf 'Connect'. Falls kein ollama CLI gefunden wurde, kopiere nach dem Login deinen API Key."
        },
        "connect_url": connect_url,
        "has_ollama_binary": has_binary,
        "has_pubkey": pubkey.is_some(),
        "browser_opened": browser_ok.is_ok()
    });

    serde_json::to_string(&response).map_err(|e| format!("JSON-Fehler: {}", e))
}

/// Prueft den Status des Ollama Device-Auth-Flows.
/// Return: {authenticated: bool, message: "...", method: "device"|"key"|"none"}
#[tauri::command]
async fn check_auth_status() -> Result<String, String> {
    let running = AUTH_RUNNING.load(std::sync::atomic::Ordering::SeqCst);
    let done = AUTH_DONE.load(std::sync::atomic::Ordering::SeqCst);

    if done {
        // Auth abgeschlossen -> verifizieren durch Cloud-Modell-Pull
        let authenticated = verify_ollama_auth().await;
        let response = serde_json::json!({
            "authenticated": authenticated,
            "message": if authenticated { "Authentifiziert!" } else { "Authentifizierung abgelaufen, aber Verifikation fehlgeschlagen." },
            "method": "device"
        });
        return serde_json::to_string(&response).map_err(|e| format!("JSON-Fehler: {}", e));
    }

    if running {
        let response = serde_json::json!({
            "authenticated": false,
            "message": "Warte auf Bestaetigung im Browser. Bitte klicke auf 'Connect'.",
            "method": "device"
        });
        return serde_json::to_string(&response).map_err(|e| format!("JSON-Fehler: {}", e));
    }

    // Weder running noch done -> pruefen ob bereits eingeloggt
    let authenticated = verify_ollama_auth().await;
    let response = serde_json::json!({
        "authenticated": authenticated,
        "message": if authenticated { "Bereits authentifiziert." } else { "Kein Auth-Flow aktiv. Bitte starte den Auth-Flow erneut." },
        "method": if authenticated { "device" } else { "none" }
    });
    serde_json::to_string(&response).map_err(|e| format!("JSON-Fehler: {}", e))
}

/// Bricht den Auth-Flow ab (killt den background signin Prozess).
#[tauri::command]
async fn stop_auth() -> Result<bool, String> {
    AUTH_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
    // Der background task prueft AUTH_RUNNING und beendet sich
    Ok(true)
}

/// Verifiziert Ollama-Auth durch Versuch einen Cloud-Modell-Pull.
/// Wenn der Pull funktioniert -> authentifiziert.
/// Wenn 401/403 -> nicht authentifiziert.
async fn verify_ollama_auth() -> bool {
    let client = http_client_short();
    // Versuche einen Cloud-Modell-Pull (kleiner stub)
    let url = "http://localhost:11434/api/pull";
    let body = serde_json::json!({"name": "glm-5.2:cloud"});

    match client.post(url).json(&body).send().await {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                // Erfolgreich -> authentifiziert
                return true;
            }
            if status.as_u16() == 401 || status.as_u16() == 403 {
                return false;
            }
            // Andere Status -> vielleicht authentifiziert aber anderer Fehler
            // Pruefe /api/tags fuer Cloud-Modelle
            return check_cloud_models().await;
        }
        Err(_) => {
            // Ollama API nicht erreichbar -> pruefe ollama signin Status
            return check_signin_status().await;
        }
    }
}

/// Prueft ob Cloud-Modelle in /api/tags verfuegbar sind (Indikator fuer Auth).
async fn check_cloud_models() -> bool {
    let client = http_client_short();
    match client.get("http://localhost:11434/api/tags").send().await {
        Ok(resp) => {
            if !resp.status().is_success() {
                return false;
            }
            let text = resp.text().await.unwrap_or_default();
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(models) = v.get("models").and_then(|m| m.as_array()) {
                    for m in models.iter() {
                        if let Some(name) = m.get("name").and_then(|n| n.as_str()) {
                            if name.ends_with(":cloud") {
                                return true;
                            }
                        }
                    }
                }
            }
            false
        }
        Err(_) => false,
    }
}

/// Prueft "ollama signin" Status durch Ausfuehrung (non-interactive).
/// Wenn "already signed in" -> true.
async fn check_signin_status() -> bool {
    let bin = match find_ollama_binary() {
        Some(b) => b,
        None => return false,
    };
    // ollama signin gibt "You are already signed in" aus wenn bereits eingeloggt
    match tokio::process::Command::new(&bin)
        .arg("signin")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = format!("{} {}", stdout, stderr);
            combined.contains("already signed in") || combined.contains("You are already")
        }
        Err(_) => false,
    }
}

/// HTTP Client mit kurzem Timeout fuer Auth-Checks
fn http_client_short() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Ollama Login im Browser oeffnen (Fallback / manuelle Methode).
/// Oeffnet https://ollama.com/connect im Standard-Browser.
/// Non-blocking: oeffnet Browser asynchron, returned sofort.
#[tauri::command]
async fn open_ollama_login(app: tauri::AppHandle) -> Result<bool, String> {
    let pubkey = read_ollama_pubkey();
    let login_url = match pubkey {
        Some(pk) => format!("https://ollama.com/connect?name={}", pk),
        None => "https://ollama.com/connect".to_string(),
    };
    open_url_nonblocking(&app, &login_url)
}

/// Ollama API Keys Seite im Browser oeffnen (Fallback).
/// Oeffnet https://ollama.com/settings/keys
/// Non-blocking: oeffnet Browser asynchron, returned sofort.
#[tauri::command]
async fn open_ollama_keys(app: tauri::AppHandle) -> Result<bool, String> {
    let keys_url = "https://ollama.com/settings/keys".to_string();
    open_url_nonblocking(&app, &keys_url)
}

/// Hilfsfunktion: Oeffnet URL im Standard-Browser, non-blocking.
/// Versucht zuerst tauri-plugin-opener, faellt auf std::process::Command zurueck.
fn open_url_nonblocking(app: &tauri::AppHandle, url: &str) -> Result<bool, String> {
    // Versuch 1: tauri-plugin-opener (non-blocking)
    match app.opener().open_url(url, None::<&str>) {
        Ok(_) => return Ok(true),
        Err(e) => {
            eprintln!("Opener-Plugin fehlgeschaltet ({}), versuche std::process::Command", e);
        }
    }
    // Versuch 2: std::process::Command mit spawn() (non-blocking, wartet nicht)
    match std::process::Command::new("open").arg(url).spawn() {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Konnte Browser nicht oeffnen: {}", e)),
    }
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
            open_ollama_login,
            open_ollama_keys,
            start_ollama_auth,
            check_auth_status,
            stop_auth,
            update::check_github_release,
            update::download_update,
            update::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von Titan Toti");
}