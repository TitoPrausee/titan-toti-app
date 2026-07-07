// Titan Toti — 3-Zone Memory System (EINE Session)
// Zones: core, skills, sensitive
// Sensitive Zone: AES-256 verschluesselt, Password Manager mit Gruppierungen
// KEINE Backticks in diesem File

use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Sha256, Digest};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

// ============================================================================
// STRUCTS
// ============================================================================

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CoreEntry {
    pub id: String,
    pub timestamp: i64,
    pub r#type: String, // fact|preference|learning|conversation
    pub key: String,
    pub value: String,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SkillEntry {
    pub id: String,
    pub timestamp: i64,
    pub name: String,
    pub description: String,
    pub category: String,
    pub steps: Vec<String>,
    pub success_count: u32,
    pub last_used: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SensitiveEntry {
    pub id: String,
    pub timestamp: i64,
    pub r#type: String, // password|credential|api_key|token|note
    pub title: String,
    pub username: String,
    pub value: String, // verschluesselt (base64)
    pub url: String,
    pub email: String,
    pub group: String,
    pub tags: Vec<String>,
    pub linked_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CoreZone {
    pub entries: Vec<CoreEntry>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct SkillsZone {
    pub entries: Vec<SkillEntry>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct SensitiveZone {
    pub entries: Vec<SensitiveEntry>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Session {
    pub id: String,
    pub created_at: i64,
    pub core: CoreZone,
    pub skills: SkillsZone,
    pub sensitive: SensitiveZone,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MemoryStore {
    pub session: Session,
}

// ============================================================================
// PFAD-HILFSFUNKTIONEN
// ============================================================================

fn memory_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".titan-toti")
}

pub fn memory_file_path() -> PathBuf {
    memory_dir().join("memory.json")
}

fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

// ============================================================================
// VERSCHLUESSELUNG (AES-256-GCM)
// ============================================================================

/// Machine-ID fuer Key-Derivation. Auf macOS: IOPlatformUUID.
fn machine_id() -> String {
    // Versuche ioreest
    if let Ok(output) = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        // Suche nach IOPlatformUUID
        for line in stdout.lines() {
            if line.contains("IOPlatformUUID") {
                if let Some(uuid) = line.split('=').nth(1) {
                    let cleaned = uuid.trim().trim_matches('"').to_string();
                    if !cleaned.is_empty() {
                        return cleaned;
                    }
                }
            }
        }
    }
    // Fallback: hostname + username
    let host = std::env::var("HOSTNAME").unwrap_or_else(|_| "localhost".to_string());
    let user = std::env::var("USER").unwrap_or_else(|_| "user".to_string());
    format!("{}-{}", host, user)
}

/// Leitet einen 32-Byte Key aus der Machine-ID ab (SHA-256).
fn derive_key() -> [u8; 32] {
    let mid = machine_id();
    let mut hasher = Sha256::new();
    hasher.update(mid.as_bytes());
    hasher.update(b"titan-toti-salt-v1");
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

/// Verschluesselt einen String mit AES-256-GCM.
/// Return: base64( nonce(12) || ciphertext )
fn encrypt_value(plaintext: &str) -> String {
    let key = derive_key();
    let cipher = match Aes256Gcm::new_from_slice(&key) {
        Ok(c) => c,
        Err(_) => return plaintext.to_string(), // Fallback unverschluesselt
    };
    let nonce_bytes: [u8; 12] = rand_nonce();
    let nonce = Nonce::from_slice(&nonce_bytes);
    match cipher.encrypt(nonce, plaintext.as_bytes()) {
        Ok(ct) => {
            let mut combined = Vec::with_capacity(12 + ct.len());
            combined.extend_from_slice(&nonce_bytes);
            combined.extend_from_slice(&ct);
            B64.encode(&combined)
        }
        Err(_) => plaintext.to_string(),
    }
}

/// Entschluesselt einen mit encrypt_value verschluesselten String.
fn decrypt_value(ciphertext_b64: &str) -> String {
    // Wenn nicht base64-decodierbar oder zu kurz, return as-is (unverschluesselt)
    let combined = match B64.decode(ciphertext_b64) {
        Ok(c) => c,
        Err(_) => return ciphertext_b64.to_string(),
    };
    if combined.len() < 13 {
        return ciphertext_b64.to_string();
    }
    let key = derive_key();
    let cipher = match Aes256Gcm::new_from_slice(&key) {
        Ok(c) => c,
        Err(_) => return ciphertext_b64.to_string(),
    };
    let nonce = Nonce::from_slice(&combined[..12]);
    let ct = &combined[12..];
    match cipher.decrypt(nonce, ct) {
        Ok(pt) => String::from_utf8_lossy(&pt).to_string(),
        Err(_) => ciphertext_b64.to_string(),
    }
}

/// Generiert einen 12-Byte Nonce (pseudo-random aus Systemzeit + UUID).
fn rand_nonce() -> [u8; 12] {
    let mut bytes = [0u8; 12];
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let id = Uuid::new_v4();
    let id_bytes = id.as_bytes();
    for i in 0..8 {
        bytes[i] = ((ts >> (i * 8)) & 0xFF) as u8;
    }
    for i in 0..4 {
        bytes[8 + i] = id_bytes[i];
    }
    bytes
}

// ============================================================================
// STORE LADEN / SPEICHERN
// ============================================================================

fn load_store() -> MemoryStore {
    let path = memory_file_path();
    if !path.exists() {
        return default_store();
    }
    match fs::read_to_string(&path) {
        Ok(content) => {
            serde_json::from_str(&content).unwrap_or_else(|_| default_store())
        }
        Err(_) => default_store(),
    }
}

fn default_store() -> MemoryStore {
    MemoryStore {
        session: Session {
            id: "single-session".to_string(),
            created_at: now_ts(),
            core: CoreZone::default(),
            skills: SkillsZone::default(),
            sensitive: SensitiveZone::default(),
        },
    }
}

fn save_store(store: &MemoryStore) -> Result<(), String> {
    let dir = memory_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Memory-Verzeichnis nicht erstellbar: {}", e))?;
    let json = serde_json::to_string_pretty(store).map_err(|e| format!("Serialize-Fehler: {}", e))?;
    fs::write(memory_file_path(), json).map_err(|e| format!("Memory-Datei nicht schreibbar: {}", e))?;
    Ok(())
}

// ============================================================================
// CORE ZONE COMMANDS
// ============================================================================

pub fn add_core(key: &str, value: &str, tags: Vec<String>, entry_type: &str) -> Result<bool, String> {
    let mut store = load_store();
    let entry = CoreEntry {
        id: new_id(),
        timestamp: now_ts(),
        r#type: if entry_type.is_empty() { "fact".to_string() } else { entry_type.to_string() },
        key: key.to_string(),
        value: value.to_string(),
        tags,
    };
    store.session.core.entries.push(entry);
    save_store(&store)?;
    Ok(true)
}

pub fn search_core(query: &str) -> Result<String, String> {
    let store = load_store();
    let q = query.to_lowercase();
    let results: Vec<&CoreEntry> = store.session.core.entries.iter()
        .filter(|e| {
            e.key.to_lowercase().contains(&q) ||
            e.value.to_lowercase().contains(&q) ||
            e.tags.iter().any(|t| t.to_lowercase().contains(&q))
        })
        .collect();
    serde_json::to_string(&results).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub fn edit_core(entry_id: &str, key: Option<&str>, value: Option<&str>) -> Result<bool, String> {
    let mut store = load_store();
    let entry = store.session.core.entries.iter_mut()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
    if let Some(k) = key { entry.key = k.to_string(); }
    if let Some(v) = value { entry.value = v.to_string(); }
    entry.timestamp = now_ts();
    save_store(&store)?;
    Ok(true)
}

pub fn delete_core(entry_id: &str) -> Result<bool, String> {
    let mut store = load_store();
    let before = store.session.core.entries.len();
    store.session.core.entries.retain(|e| e.id != entry_id);
    if store.session.core.entries.len() < before {
        save_store(&store)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

// ============================================================================
// SKILLS ZONE COMMANDS
// ============================================================================

pub fn add_skill(name: &str, description: &str, category: &str, steps: Vec<String>) -> Result<bool, String> {
    let mut store = load_store();
    let entry = SkillEntry {
        id: new_id(),
        timestamp: now_ts(),
        name: name.to_string(),
        description: description.to_string(),
        category: category.to_string(),
        steps,
        success_count: 0,
        last_used: None,
    };
    store.session.skills.entries.push(entry);
    save_store(&store)?;
    Ok(true)
}

pub fn search_skills(query: &str) -> Result<String, String> {
    let store = load_store();
    let q = query.to_lowercase();
    let results: Vec<&SkillEntry> = store.session.skills.entries.iter()
        .filter(|e| {
            e.name.to_lowercase().contains(&q) ||
            e.description.to_lowercase().contains(&q) ||
            e.category.to_lowercase().contains(&q)
        })
        .collect();
    serde_json::to_string(&results).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub fn delete_skill(entry_id: &str) -> Result<bool, String> {
    let mut store = load_store();
    let before = store.session.skills.entries.len();
    store.session.skills.entries.retain(|e| e.id != entry_id);
    if store.session.skills.entries.len() < before {
        save_store(&store)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

// ============================================================================
// SENSITIVE ZONE COMMANDS (mit Verschluesselung)
// ============================================================================

pub fn add_sensitive(
    entry_type: &str,
    title: &str,
    username: &str,
    value: &str,
    url: &str,
    email: &str,
    group: &str,
    tags: Vec<String>,
) -> Result<bool, String> {
    let mut store = load_store();
    let encrypted_value = if value.is_empty() { String::new() } else { encrypt_value(value) };
    let entry = SensitiveEntry {
        id: new_id(),
        timestamp: now_ts(),
        r#type: if entry_type.is_empty() { "note".to_string() } else { entry_type.to_string() },
        title: title.to_string(),
        username: username.to_string(),
        value: encrypted_value,
        url: url.to_string(),
        email: email.to_string(),
        group: if group.is_empty() { "Sonstiges".to_string() } else { group.to_string() },
        tags,
        linked_ids: Vec::new(),
    };
    store.session.sensitive.entries.push(entry);
    save_store(&store)?;
    Ok(true)
}

pub fn search_sensitive(query: &str) -> Result<String, String> {
    let store = load_store();
    let q = query.to_lowercase();
    // Return ohne entschluesselte Werte (Sicherheit)
    let results: Vec<Value> = store.session.sensitive.entries.iter()
        .filter(|e| {
            e.title.to_lowercase().contains(&q) ||
            e.username.to_lowercase().contains(&q) ||
            e.url.to_lowercase().contains(&q) ||
            e.email.to_lowercase().contains(&q) ||
            e.group.to_lowercase().contains(&q) ||
            e.tags.iter().any(|t| t.to_lowercase().contains(&q))
        })
        .map(|e| {
            serde_json::json!({
                "id": e.id,
                "timestamp": e.timestamp,
                "type": e.r#type,
                "title": e.title,
                "username": e.username,
                "has_value": !e.value.is_empty(),
                "url": e.url,
                "email": e.email,
                "group": e.group,
                "tags": e.tags,
                "linked_ids": e.linked_ids
            })
        })
        .collect();
    serde_json::to_string(&results).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub fn edit_sensitive(entry_id: &str, fields: Value) -> Result<bool, String> {
    let mut store = load_store();
    let entry = store.session.sensitive.entries.iter_mut()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
    if let Some(t) = fields.get("title").and_then(|v| v.as_str()) { entry.title = t.to_string(); }
    if let Some(u) = fields.get("username").and_then(|v| v.as_str()) { entry.username = u.to_string(); }
    if let Some(v) = fields.get("value").and_then(|v| v.as_str()) {
        entry.value = if v.is_empty() { String::new() } else { encrypt_value(v) };
    }
    if let Some(u) = fields.get("url").and_then(|v| v.as_str()) { entry.url = u.to_string(); }
    if let Some(e) = fields.get("email").and_then(|v| v.as_str()) { entry.email = e.to_string(); }
    if let Some(g) = fields.get("group").and_then(|v| v.as_str()) { entry.group = g.to_string(); }
    if let Some(t) = fields.get("type").and_then(|v| v.as_str()) { entry.r#type = t.to_string(); }
    entry.timestamp = now_ts();
    save_store(&store)?;
    Ok(true)
}

pub fn delete_sensitive(entry_id: &str) -> Result<bool, String> {
    let mut store = load_store();
    let before = store.session.sensitive.entries.len();
    // Auch Links zu diesem Eintrag entfernen
    for e in store.session.sensitive.entries.iter_mut() {
        e.linked_ids.retain(|id| id != entry_id);
    }
    store.session.sensitive.entries.retain(|e| e.id != entry_id);
    if store.session.sensitive.entries.len() < before {
        save_store(&store)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Entschluesselt einen einzelnen Eintrag (fuer Password Manager Anzeige).
pub fn get_sensitive_value(entry_id: &str) -> Result<String, String> {
    let store = load_store();
    let entry = store.session.sensitive.entries.iter()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
    let decrypted = decrypt_value(&entry.value);
    Ok(decrypted)
}

// ============================================================================
// ZONE GET / CLEAR
// ============================================================================

pub fn get_zone(zone: &str) -> Result<String, String> {
    let store = load_store();
    match zone {
        "core" => serde_json::to_string(&store.session.core).map_err(|e| format!("Serialize-Fehler: {}", e)),
        "skills" => serde_json::to_string(&store.session.skills).map_err(|e| format!("Serialize-Fehler: {}", e)),
        "sensitive" => {
            // Sensitive ohne entschluesselte Werte
            let zone_view: Vec<Value> = store.session.sensitive.entries.iter().map(|e| {
                serde_json::json!({
                    "id": e.id,
                    "timestamp": e.timestamp,
                    "type": e.r#type,
                    "title": e.title,
                    "username": e.username,
                    "has_value": !e.value.is_empty(),
                    "url": e.url,
                    "email": e.email,
                    "group": e.group,
                    "tags": e.tags,
                    "linked_ids": e.linked_ids
                })
            }).collect();
            serde_json::to_string(&serde_json::json!({"entries": zone_view}))
                .map_err(|e| format!("Serialize-Fehler: {}", e))
        }
        _ => Err("Unbekannte Zone".to_string()),
    }
}

pub fn get_all() -> Result<String, String> {
    let store = load_store();
    // Sensitive ohne entschluesselte Werte
    let sensitive_view: Vec<Value> = store.session.sensitive.entries.iter().map(|e| {
        serde_json::json!({
            "id": e.id,
            "timestamp": e.timestamp,
            "type": e.r#type,
            "title": e.title,
            "username": e.username,
            "has_value": !e.value.is_empty(),
            "url": e.url,
            "email": e.email,
            "group": e.group,
            "tags": e.tags,
            "linked_ids": e.linked_ids
        })
    }).collect();

    let all = serde_json::json!({
        "session": {
            "id": store.session.id,
            "created_at": store.session.created_at,
            "core": store.session.core,
            "skills": store.session.skills,
            "sensitive": {
                "entries": sensitive_view
            }
        }
    });
    serde_json::to_string(&all).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub fn clear_zone(zone: &str) -> Result<bool, String> {
    let mut store = load_store();
    match zone {
        "core" => store.session.core.entries.clear(),
        "skills" => store.session.skills.entries.clear(),
        "sensitive" => store.session.sensitive.entries.clear(),
        _ => return Err("Unbekannte Zone".to_string()),
    }
    save_store(&store)?;
    Ok(true)
}

// ============================================================================
// PASSWORD MANAGER
// ============================================================================

pub fn password_manager_list(group: Option<&str>) -> Result<String, String> {
    let store = load_store();
    let entries: Vec<&SensitiveEntry> = match group {
        Some(g) if !g.is_empty() => store.session.sensitive.entries.iter()
            .filter(|e| e.group == g)
            .collect(),
        _ => store.session.sensitive.entries.iter().collect(),
    };
    let view: Vec<Value> = entries.iter().map(|e| {
        serde_json::json!({
            "id": e.id,
            "timestamp": e.timestamp,
            "type": e.r#type,
            "title": e.title,
            "username": e.username,
            "has_value": !e.value.is_empty(),
            "url": e.url,
            "email": e.email,
            "group": e.group,
            "tags": e.tags,
            "linked_ids": e.linked_ids
        })
    }).collect();
    serde_json::to_string(&view).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub fn password_manager_search(query: &str) -> Result<String, String> {
    search_sensitive(query)
}

pub fn password_manager_add(entry: Value) -> Result<bool, String> {
    let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("note");
    let title = entry.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let username = entry.get("username").and_then(|v| v.as_str()).unwrap_or("");
    let value = entry.get("value").and_then(|v| v.as_str()).unwrap_or("");
    let url = entry.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let email = entry.get("email").and_then(|v| v.as_str()).unwrap_or("");
    let group = entry.get("group").and_then(|v| v.as_str()).unwrap_or("Sonstiges");
    let tags: Vec<String> = entry.get("tags").and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    add_sensitive(entry_type, title, username, value, url, email, group, tags)
}

pub fn password_manager_edit(entry_id: &str, fields: Value) -> Result<bool, String> {
    edit_sensitive(entry_id, fields)
}

pub fn password_manager_delete(entry_id: &str) -> Result<bool, String> {
    delete_sensitive(entry_id)
}

pub fn password_manager_link(entry_id: &str, linked_id: &str) -> Result<bool, String> {
    if entry_id == linked_id {
        return Err("Kann nicht mit sich selbst verlinken".to_string());
    }
    let mut store = load_store();
    // Pruefen ob beide existieren
    let exists_a = store.session.sensitive.entries.iter().any(|e| e.id == entry_id);
    let exists_b = store.session.sensitive.entries.iter().any(|e| e.id == linked_id);
    if !exists_a || !exists_b {
        return Err("Einer der Eintraege existiert nicht".to_string());
    }
    // Bidirektionale Verlinkung
    let entry = store.session.sensitive.entries.iter_mut()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
    if !entry.linked_ids.contains(&linked_id.to_string()) {
        entry.linked_ids.push(linked_id.to_string());
    }
    let entry2 = store.session.sensitive.entries.iter_mut()
        .find(|e| e.id == linked_id)
        .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
    if !entry2.linked_ids.contains(&entry_id.to_string()) {
        entry2.linked_ids.push(entry_id.to_string());
    }
    save_store(&store)?;
    Ok(true)
}

pub fn password_manager_export() -> Result<String, String> {
    let store = load_store();
    // Export MIT entschluesselten Werten (fuer Backup/DSGVO)
    let export_data: Vec<Value> = store.session.sensitive.entries.iter().map(|e| {
        serde_json::json!({
            "id": e.id,
            "timestamp": e.timestamp,
            "type": e.r#type,
            "title": e.title,
            "username": e.username,
            "value": decrypt_value(&e.value),
            "url": e.url,
            "email": e.email,
            "group": e.group,
            "tags": e.tags,
            "linked_ids": e.linked_ids
        })
    }).collect();
    serde_json::to_string_pretty(&serde_json::json!({
        "exported_at": now_ts(),
        "entries": export_data
    })).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub fn password_manager_import(json_str: &str) -> Result<bool, String> {
    let parsed: Value = serde_json::from_str(json_str)
        .map_err(|e| format!("JSON Parse-Fehler: {}", e))?;
    let entries = parsed.get("entries").and_then(|v| v.as_array())
        .or_else(|| parsed.as_array())
        .ok_or_else(|| "Keine entries im JSON gefunden".to_string())?;

    let mut store = load_store();
    for entry_val in entries {
        let entry_type = entry_val.get("type").and_then(|v| v.as_str()).unwrap_or("note");
        let title = entry_val.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let username = entry_val.get("username").and_then(|v| v.as_str()).unwrap_or("");
        let value = entry_val.get("value").and_then(|v| v.as_str()).unwrap_or("");
        let url = entry_val.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let email = entry_val.get("email").and_then(|v| v.as_str()).unwrap_or("");
        let group = entry_val.get("group").and_then(|v| v.as_str()).unwrap_or("Sonstiges");
        let tags: Vec<String> = entry_val.get("tags").and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|t| t.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
        let linked_ids: Vec<String> = entry_val.get("linked_ids").and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|t| t.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();

        let encrypted_value = if value.is_empty() { String::new() } else { encrypt_value(value) };
        let entry = SensitiveEntry {
            id: new_id(),
            timestamp: now_ts(),
            r#type: entry_type.to_string(),
            title: title.to_string(),
            username: username.to_string(),
            value: encrypted_value,
            url: url.to_string(),
            email: email.to_string(),
            group: group.to_string(),
            tags,
            linked_ids,
        };
        store.session.sensitive.entries.push(entry);
    }
    save_store(&store)?;
    Ok(true)
}