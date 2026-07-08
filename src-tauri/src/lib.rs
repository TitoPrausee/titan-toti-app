// Titan Toti v2.3 — Standalone Backend (Rust) — MAJOR Overhaul
// Features: Activity Feed, Agent Spawning, System Access, Bypass Permissions,
//           Native Vision, Continuous Mode, 3-Zone Memory, Password Manager, Skill Hub
// KEINE Backticks in diesem File

mod activity;
mod agents;
mod memory;
mod settings;
mod skills;
mod update;
mod vision;

use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri_plugin_opener::OpenerExt;

const APP_VERSION: &str = "2.3.0";

pub const DEFAULT_SYSTEM_PROMPT: &str = "Du bist Titan Toti — ein lokaler KI-Assistent auf macOS. Du kannst auf das System zugreifen, Dateien lesen/schreiben, Commands ausfuehren und dem Nutzer helfen. Du sprichst Deutsch.";

// ============================================================================
// CHAT STRUCTS
// ============================================================================

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

#[derive(Serialize, Deserialize, Clone, Debug)]
struct CommandResult {
    stdout: String,
    stderr: String,
    exit_code: i32,
    duration_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct DirEntry {
    name: String,
    path: String,
    kind: String,
    size: u64,
    modified: String,
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn http_client_short() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Hilfsfunktion: Activity loggen
fn log_act(atype: &str, msg: &str) {
    activity::log(atype, msg, None);
}

// ============================================================================
// FEATURE 1: ACTIVITY FEED
// ============================================================================

#[tauri::command]
async fn log_activity(activity_type: String, message: String, timestamp: String) -> Result<bool, String> {
    activity::log_activity_cmd(activity_type, message, timestamp)
}

#[tauri::command]
async fn get_activities(limit: u32) -> Result<String, String> {
    activity::get_activities_cmd(limit)
}

#[tauri::command]
async fn clear_activities() -> Result<bool, String> {
    activity::clear_activities_cmd()
}

// ============================================================================
// FEATURE 2: AGENT SPAWNING
// ============================================================================

#[tauri::command]
async fn spawn_agent(task: String, context: String) -> Result<String, String> {
    agents::spawn_agent_cmd(task, context)
}

#[tauri::command]
async fn get_agent_status(agent_id: String) -> Result<String, String> {
    agents::get_agent_status_cmd(agent_id)
}

#[tauri::command]
async fn list_agents() -> Result<String, String> {
    agents::list_agents_cmd()
}

#[tauri::command]
async fn stop_agent(agent_id: String) -> Result<bool, String> {
    agents::stop_agent_cmd(agent_id)
}

#[tauri::command]
async fn pause_agent(agent_id: String) -> Result<bool, String> {
    agents::pause_agent_cmd(agent_id)
}

#[tauri::command]
async fn resume_agent(agent_id: String) -> Result<bool, String> {
    agents::resume_agent_cmd(agent_id)
}

// ============================================================================
// FEATURE 3: SYSTEM-ZUGRIFF (erweitert)
// ============================================================================

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    log_act("file_read", &format!("Datei gelesen: {}", path));
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Datei nicht lesbar: {}", e))
}

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<String, String> {
    // Bypass-Permission-Check
    if !settings::bypass_permissions() {
        return Ok(serde_json::json!({
            "requires_approval": true,
            "action": "write_file",
            "path": path,
            "content_length": content.len()
        }).to_string());
    }
    if let Some(parent) = std::path::Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Verzeichnis nicht erstellbar: {}", e))?;
    }
    tokio::fs::write(&path, &content)
        .await
        .map(|_| {
            log_act("file_write", &format!("Datei geschrieben: {}", path));
            serde_json::json!({"success": true, "path": path}).to_string()
        })
        .map_err(|e| format!("Datei nicht schreibbar: {}", e))
}

#[tauri::command]
async fn list_dir(path: String) -> Result<String, String> {
    log_act("action", &format!("Verzeichnis aufgelistet: {}", path));
    let mut entries = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| format!("Verzeichnis nicht lesbar: {}", e))?;

    let mut result = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| format!("{}", e))? {
        let name = entry.file_name().to_string_lossy().to_string();
        let entry_path = entry.path().to_string_lossy().to_string();
        let meta = entry.metadata().await.ok();
        let kind = if meta.as_ref().map(|m| m.is_dir()).unwrap_or(false) { "dir" } else { "file" };
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = meta.as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_default();
        result.push(DirEntry { name, path: entry_path, kind: kind.to_string(), size, modified });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    serde_json::to_string(&result).map_err(|e| format!("Serialize-Fehler: {}", e))
}

#[tauri::command]
async fn execute_command(command: String, args: Vec<String>, cwd: Option<String>) -> Result<String, String> {
    // /cmd und Skill-Befehle immer ausfuehren - der User ist Admin auf seinem eigenen Mac
    log_act("command", &format!("Ausgefuehrt: {} {}", command, args.join(" ")));

    let start = std::time::Instant::now();
    let mut cmd = tokio::process::Command::new(&command);
    cmd.args(&args);
    if let Some(d) = cwd {
        cmd.current_dir(d);
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // 30s Timeout
    let output = tokio::time::timeout(
        Duration::from_secs(30),
        cmd.output()
    ).await;

    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Ok(Ok(out)) => {
            let result = CommandResult {
                stdout: String::from_utf8_lossy(&out.stdout).to_string(),
                stderr: String::from_utf8_lossy(&out.stderr).to_string(),
                exit_code: out.status.code().unwrap_or(-1),
                duration_ms: elapsed,
            };
            serde_json::to_string(&result).map_err(|e| format!("Serialize-Fehler: {}", e))
        }
        Ok(Err(e)) => Err(format!("Command-Fehler: {}", e)),
        Err(_) => Err("Command-Timeout (30s)".to_string()),
    }
}

#[tauri::command]
async fn execute_command_async(command: String, args: Vec<String>) -> Result<String, String> {
    log_act("command", &format!("Async gestartet: {} {}", command, args.join(" ")));

    let pid = tokio::process::Command::new(&command)
        .args(&args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Command-Fehler: {}", e))?
        .id();

    Ok(serde_json::json!({
        "pid": pid,
        "status": "started"
    }).to_string())
}

#[tauri::command]
async fn get_system_info() -> Result<String, String> {
    log_act("action", "System-Info abgerufen");

    // OS Version
    let os_version = tokio::process::Command::new("sw_vers")
        .output().await
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    // Hostname
    let hostname = tokio::process::Command::new("hostname")
        .output().await
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    // Hardware info
    let hw_info = tokio::process::Command::new("system_profiler")
        .args(&["SPHardwareDataType"])
        .output().await
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    // Disk info
    let disk_info = tokio::process::Command::new("df")
        .args(&["-h", "/"])
        .output().await
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    // Memory
    let mem_info = tokio::process::Command::new("vm_stat")
        .output().await
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    Ok(serde_json::json!({
        "os_version": os_version.trim(),
        "hostname": hostname,
        "hardware": hw_info.trim(),
        "disk": disk_info.trim(),
        "memory": mem_info.trim()
    }).to_string())
}

#[tauri::command]
async fn screenshot() -> Result<String, String> {
    log_act("action", "Screenshot erstellt");
    let path = "/tmp/titan_screenshot.png";
    let output = tokio::process::Command::new("screencapture")
        .arg(path)
        .output()
        .await
        .map_err(|e| format!("Screenshot-Fehler: {}", e))?;

    if !output.status.success() {
        return Err("Screenshot konnte nicht erstellt werden".to_string());
    }

    // Base64 encode
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|e| format!("Screenshot nicht lesbar: {}", e))?;
    use base64::Engine as _;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(serde_json::json!({"image": b64, "path": path}).to_string())
}

#[tauri::command]
async fn open_app(app_name: String) -> Result<bool, String> {
    log_act("action", &format!("App geoeffnet: {}", app_name));
    tokio::process::Command::new("open")
        .args(&["-a", &app_name])
        .spawn()
        .map(|_| true)
        .map_err(|e| format!("Konnte App nicht oeffnen: {}", e))
}

#[tauri::command]
async fn open_url(url: String) -> Result<bool, String> {
    log_act("action", &format!("URL geoeffnet: {}", url));
    tokio::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map(|_| true)
        .map_err(|e| format!("Konnte URL nicht oeffnen: {}", e))
}

#[tauri::command]
async fn clipboard_read() -> Result<String, String> {
    log_act("action", "Zwischenablage gelesen");
    let output = tokio::process::Command::new("pbpaste")
        .output()
        .await
        .map_err(|e| format!("pbpaste-Fehler: {}", e))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
async fn clipboard_write(text: String) -> Result<bool, String> {
    log_act("action", "Zwischenablage geschrieben");
    use tokio::io::AsyncWriteExt;
    let mut child = tokio::process::Command::new("pbcopy")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("pbcopy-Fehler: {}", e))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(text.as_bytes()).await.map_err(|e| format!("Write-Fehler: {}", e))?;
    }
    child.wait().await.map(|_| true).map_err(|e| format!("Wait-Fehler: {}", e))
}

// ============================================================================
// FEATURE 4: SETTINGS / BYPASS PERMISSIONS
// ============================================================================

#[tauri::command]
async fn get_settings() -> Result<String, String> {
    settings::get_settings_cmd()
}

#[tauri::command]
async fn set_setting(key: String, value: String) -> Result<bool, String> {
    settings::set_setting_cmd(key, value)
}

// ============================================================================
// FEATURE 5: NATIVE VISION
// ============================================================================

#[tauri::command]
async fn analyze_image(image_path: String, question: String) -> Result<String, String> {
    let s = settings::get_settings();
    log_act("action", &format!("Bild analysiert: {}", image_path));
    vision::analyze_image(image_path, question, s.api_url, s.api_key, s.model).await
}

#[tauri::command]
async fn analyze_screenshot(question: String) -> Result<String, String> {
    let s = settings::get_settings();
    log_act("action", "Screenshot analysiert");
    vision::analyze_screenshot(question, s.api_url, s.api_key, s.model).await
}

#[tauri::command]
async fn list_vision_models(api_url: String, api_key: String) -> Result<String, String> {
    vision::list_vision_models(api_url, api_key).await
}

// ============================================================================
// FEATURE 6: CONTINUOUS MODE
// ============================================================================

#[tauri::command]
async fn start_continuous_task(goal: String) -> Result<String, String> {
    agents::start_continuous_task_cmd(goal)
}

#[tauri::command]
async fn pause_continuous_task(task_id: String) -> Result<bool, String> {
    agents::pause_continuous_task_cmd(task_id)
}

#[tauri::command]
async fn resume_continuous_task(task_id: String) -> Result<bool, String> {
    agents::resume_continuous_task_cmd(task_id)
}

#[tauri::command]
async fn stop_continuous_task(task_id: String) -> Result<bool, String> {
    agents::stop_continuous_task_cmd(task_id)
}

#[tauri::command]
async fn get_continuous_tasks() -> Result<String, String> {
    agents::get_continuous_tasks_cmd()
}

// ============================================================================
// FEATURE 7: 3-ZONE MEMORY SYSTEM
// ============================================================================

#[tauri::command]
async fn memory_add_core(key: String, value: String, tags: Vec<String>, entry_type: String) -> Result<bool, String> {
    let ok = memory::add_core(&key, &value, tags, &entry_type)?;
    log_act("memory_saved", &format!("Core-Eintrag hinzugefuegt: {}", key));
    Ok(ok)
}

#[tauri::command]
async fn memory_search_core(query: String) -> Result<String, String> {
    memory::search_core(&query)
}

#[tauri::command]
async fn memory_edit_core(entry_id: String, key: Option<String>, value: Option<String>) -> Result<bool, String> {
    memory::edit_core(&entry_id, key.as_deref(), value.as_deref())
}

#[tauri::command]
async fn memory_delete_core(entry_id: String) -> Result<bool, String> {
    memory::delete_core(&entry_id)
}

#[tauri::command]
async fn memory_add_skill(name: String, description: String, category: String, steps: Vec<String>) -> Result<bool, String> {
    let ok = memory::add_skill(&name, &description, &category, steps)?;
    log_act("memory_saved", &format!("Skill-Eintrag hinzugefuegt: {}", name));
    Ok(ok)
}

#[tauri::command]
async fn memory_search_skills(query: String) -> Result<String, String> {
    memory::search_skills(&query)
}

#[tauri::command]
async fn memory_delete_skill(entry_id: String) -> Result<bool, String> {
    memory::delete_skill(&entry_id)
}

#[tauri::command]
async fn memory_add_sensitive(
    entry_type: String,
    title: String,
    username: String,
    value: String,
    url: String,
    email: String,
    group: String,
    tags: Vec<String>,
) -> Result<bool, String> {
    let ok = memory::add_sensitive(&entry_type, &title, &username, &value, &url, &email, &group, tags)?;
    log_act("memory_saved", &format!("Sensitive-Eintrag hinzugefuegt: {}", title));
    Ok(ok)
}

#[tauri::command]
async fn memory_search_sensitive(query: String) -> Result<String, String> {
    memory::search_sensitive(&query)
}

#[tauri::command]
async fn memory_edit_sensitive(entry_id: String, fields: String) -> Result<bool, String> {
    let parsed: serde_json::Value = serde_json::from_str(&fields).map_err(|e| format!("JSON-Fehler: {}", e))?;
    memory::edit_sensitive(&entry_id, parsed)
}

#[tauri::command]
async fn memory_delete_sensitive(entry_id: String) -> Result<bool, String> {
    memory::delete_sensitive(&entry_id)
}

#[tauri::command]
async fn memory_get_sensitive_value(entry_id: String) -> Result<String, String> {
    memory::get_sensitive_value(&entry_id)
}

#[tauri::command]
async fn memory_get_zone(zone: String) -> Result<String, String> {
    memory::get_zone(&zone)
}

#[tauri::command]
async fn memory_get_all() -> Result<String, String> {
    memory::get_all()
}

#[tauri::command]
async fn memory_clear_zone(zone: String) -> Result<bool, String> {
    memory::clear_zone(&zone)
}

// ============================================================================
// FEATURE 8: PASSWORD MANAGER
// ============================================================================

#[tauri::command]
async fn password_manager_list(group: Option<String>) -> Result<String, String> {
    memory::password_manager_list(group.as_deref())
}

#[tauri::command]
async fn password_manager_search(query: String) -> Result<String, String> {
    memory::password_manager_search(&query)
}

#[tauri::command]
async fn password_manager_add(entry: String) -> Result<bool, String> {
    let parsed: serde_json::Value = serde_json::from_str(&entry).map_err(|e| format!("JSON-Fehler: {}", e))?;
    memory::password_manager_add(parsed)
}

#[tauri::command]
async fn password_manager_edit(entry_id: String, fields: String) -> Result<bool, String> {
    let parsed: serde_json::Value = serde_json::from_str(&fields).map_err(|e| format!("JSON-Fehler: {}", e))?;
    memory::password_manager_edit(&entry_id, parsed)
}

#[tauri::command]
async fn password_manager_delete(entry_id: String) -> Result<bool, String> {
    memory::password_manager_delete(&entry_id)
}

#[tauri::command]
async fn password_manager_link(entry_id: String, linked_id: String) -> Result<bool, String> {
    memory::password_manager_link(&entry_id, &linked_id)
}

#[tauri::command]
async fn password_manager_export() -> Result<String, String> {
    memory::password_manager_export()
}

#[tauri::command]
async fn password_manager_import(json: String) -> Result<bool, String> {
    memory::password_manager_import(&json)
}

// ============================================================================
// FEATURE 9: SKILL HUB
// ============================================================================

#[tauri::command]
async fn list_skills() -> Result<String, String> {
    skills::list_skills_json()
}

#[tauri::command]
async fn get_skill_details(skill_name: String) -> Result<String, String> {
    skills::get_skill_details_json(&skill_name)
}

#[tauri::command]
async fn execute_skill(skill_name: String, args: Vec<String>) -> Result<String, String> {
    log_act("skill", &format!("Skill ausgefuehrt: {}", skill_name));
    skills::execute_skill(&skill_name, &args, true).await
}

// ============================================================================
// CHAT (Ollama API)
// ============================================================================

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
    log_act("thinking", "Chat-Anfrage gesendet");
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
                                log_act("thinking", "Chat-Antwort erhalten");
                                return Ok(choice.message.content.clone());
                            }
                            last_error = "Keine choices in Response".to_string();
                        }
                        Err(e) => {
                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                                if let Some(content) = v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                                    return Ok(content.to_string());
                                }
                                if let Some(content) = v.get("response").and_then(|c| c.as_str()) {
                                    return Ok(content.to_string());
                                }
                            }
                            last_error = format!("Parse-Fehler: {} - {}", e, &text[..text.len().min(200)]);
                        }
                    }
                } else {
                    last_error = format!("HTTP {} - {}", status.as_u16(), &text[..text.len().min(200)]);
                }
            }
            Err(e) => {
                last_error = format!("Verbindungsfehler: {}", e);
            }
        }
    }

    log_act("error", &format!("Chat fehlgeschlagen: {}", last_error));
    Err(format!("Alle Modelle fehlgeschlagen. Letzter Fehler: {}", last_error))
}

#[tauri::command]
async fn ollama_list_models(api_url: String, api_key: String) -> Result<Vec<String>, String> {
    let base = api_url.trim_end_matches('/');
    let client = http_client();

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

#[tauri::command]
async fn ollama_health(api_url: String) -> Result<bool, String> {
    let base = api_url.trim_end_matches('/');
    let client = http_client_short();

    let url1 = format!("{}/api/version", base);
    if let Ok(resp) = client.get(&url1).send().await {
        if resp.status().is_success() {
            return Ok(true);
        }
    }
    let url2 = format!("{}/health", base);
    if let Ok(resp) = client.get(&url2).send().await {
        if resp.status().is_success() {
            return Ok(true);
        }
    }
    let url3 = format!("{}/v1/models", base);
    if let Ok(resp) = client.get(&url3).send().await {
        if resp.status().is_success() {
            return Ok(true);
        }
    }
    Ok(false)
}

/// System-Command ausfuehren (Legacy, ohne Permission-Check)
#[tauri::command]
async fn system_command(command: String, args: Vec<String>) -> Result<String, String> {
    log_act("command", &format!("System-Command: {} {}", command, args.join(" ")));
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

/// Skills: Match gegen User-Nachricht (Legacy)
#[tauri::command]
async fn skills_match(message: String, system_access: bool) -> Result<String, String> {
    skills::match_and_execute(&message, system_access).await
}

/// Skills: Bestimmten Skill ausfuehren (Legacy)
#[tauri::command]
async fn skills_execute(skill_name: String, args: Vec<String>, system_access: bool) -> Result<String, String> {
    skills::execute_skill(&skill_name, &args, system_access).await
}

#[tauri::command]
fn app_version() -> String {
    APP_VERSION.to_string()
}

#[tauri::command]
fn default_system_prompt() -> String {
    DEFAULT_SYSTEM_PROMPT.to_string()
}

#[tauri::command]
fn memory_path() -> String {
    memory::memory_file_path().to_string_lossy().to_string()
}

// ============================================================================
// OLLAMA DEVICE AUTH FLOW (v2.3)
// ============================================================================

static AUTH_RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static AUTH_DONE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

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

fn read_ollama_pubkey() -> Option<String> {
    let home = dirs::home_dir()?;
    let pub_path = home.join(".ollama").join("id_ed25519.pub");
    let content = std::fs::read_to_string(&pub_path).ok()?;
    let parts: Vec<&str> = content.trim().split_whitespace().collect();
    if parts.len() >= 2 {
        Some(parts[1].to_string())
    } else {
        Some(content.trim().to_string())
    }
}

#[tauri::command]
async fn start_ollama_auth(app: tauri::AppHandle) -> Result<String, String> {
    AUTH_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
    AUTH_DONE.store(false, std::sync::atomic::Ordering::SeqCst);

    let ollama_bin = find_ollama_binary();
    let pubkey = read_ollama_pubkey();

    let connect_url = match &pubkey {
        Some(pk) => format!("https://ollama.com/connect?name={}", pk),
        None => "https://ollama.com/connect".to_string(),
    };

    let browser_ok = open_url_nonblocking(&app, &connect_url);

    let has_binary = ollama_bin.is_some();
    if let Some(ref bin) = ollama_bin {
        AUTH_RUNNING.store(true, std::sync::atomic::Ordering::SeqCst);
        let bin_clone = bin.clone();
        tokio::spawn(async move {
            let result = tokio::process::Command::new(&bin_clone)
                .arg("signin")
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn();

            match result {
                Ok(mut child) => {
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

#[tauri::command]
async fn check_auth_status() -> Result<String, String> {
    let running = AUTH_RUNNING.load(std::sync::atomic::Ordering::SeqCst);
    let done = AUTH_DONE.load(std::sync::atomic::Ordering::SeqCst);

    if done {
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

    let authenticated = verify_ollama_auth().await;
    let response = serde_json::json!({
        "authenticated": authenticated,
        "message": if authenticated { "Bereits authentifiziert." } else { "Kein Auth-Flow aktiv. Bitte starte den Auth-Flow erneut." },
        "method": if authenticated { "device" } else { "none" }
    });
    serde_json::to_string(&response).map_err(|e| format!("JSON-Fehler: {}", e))
}

#[tauri::command]
async fn stop_auth() -> Result<bool, String> {
    AUTH_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
    Ok(true)
}

async fn verify_ollama_auth() -> bool {
    let client = http_client_short();
    let url = "http://localhost:11434/api/pull";
    let body = serde_json::json!({"name": "glm-5.2:cloud"});

    match client.post(url).json(&body).send().await {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                return true;
            }
            if status.as_u16() == 401 || status.as_u16() == 403 {
                return false;
            }
            return check_cloud_models().await;
        }
        Err(_) => {
            return check_signin_status().await;
        }
    }
}

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

async fn check_signin_status() -> bool {
    let bin = match find_ollama_binary() {
        Some(b) => b,
        None => return false,
    };
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

#[tauri::command]
async fn open_ollama_login(app: tauri::AppHandle) -> Result<bool, String> {
    let pubkey = read_ollama_pubkey();
    let login_url = match pubkey {
        Some(pk) => format!("https://ollama.com/connect?name={}", pk),
        None => "https://ollama.com/connect".to_string(),
    };
    open_url_nonblocking(&app, &login_url)
}

#[tauri::command]
async fn open_ollama_keys(app: tauri::AppHandle) -> Result<bool, String> {
    let keys_url = "https://ollama.com/settings/keys".to_string();
    open_url_nonblocking(&app, &keys_url)
}

fn open_url_nonblocking(app: &tauri::AppHandle, url: &str) -> Result<bool, String> {
    match app.opener().open_url(url, None::<&str>) {
        Ok(_) => return Ok(true),
        Err(e) => {
            eprintln!("Opener-Plugin fehlgeschaltet ({}), versuche std::process::Command", e);
        }
    }
    match std::process::Command::new("open").arg(url).spawn() {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Konnte Browser nicht oeffnen: {}", e)),
    }
}

// ============================================================================
// APP ENTRY POINT
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // Chat
            ollama_chat,
            ollama_list_models,
            ollama_health,
            system_command,
            // Activity Feed
            log_activity,
            get_activities,
            clear_activities,
            // Agent Spawning
            spawn_agent,
            get_agent_status,
            list_agents,
            stop_agent,
            pause_agent,
            resume_agent,
            // System Access
            read_file,
            write_file,
            list_dir,
            execute_command,
            execute_command_async,
            get_system_info,
            screenshot,
            open_app,
            open_url,
            clipboard_read,
            clipboard_write,
            // Settings / Bypass Permissions
            get_settings,
            set_setting,
            // Vision
            analyze_image,
            analyze_screenshot,
            list_vision_models,
            // Continuous Mode
            start_continuous_task,
            pause_continuous_task,
            resume_continuous_task,
            stop_continuous_task,
            get_continuous_tasks,
            // 3-Zone Memory
            memory_add_core,
            memory_search_core,
            memory_edit_core,
            memory_delete_core,
            memory_add_skill,
            memory_search_skills,
            memory_delete_skill,
            memory_add_sensitive,
            memory_search_sensitive,
            memory_edit_sensitive,
            memory_delete_sensitive,
            memory_get_sensitive_value,
            memory_get_zone,
            memory_get_all,
            memory_clear_zone,
            // Password Manager
            password_manager_list,
            password_manager_search,
            password_manager_add,
            password_manager_edit,
            password_manager_delete,
            password_manager_link,
            password_manager_export,
            password_manager_import,
            // Skill Hub
            list_skills,
            get_skill_details,
            execute_skill,
            // Legacy
            skills_match,
            skills_execute,
            app_version,
            default_system_prompt,
            memory_path,
            // Ollama Auth
            open_ollama_login,
            open_ollama_keys,
            start_ollama_auth,
            check_auth_status,
            stop_auth,
            // Update
            update::check_github_release,
            update::download_update,
            update::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von Titan Toti");
}