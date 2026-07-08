// Titan Toti — Memory System (3-Tier Flow + 3-Zone + Password Manager)
// Zones: immediate, shortterm, core, skills, sensitive
// Sensitive Zone: AES-256 verschluesselt, Password Manager mit Gruppierungen
// 3-Tier Flow: Immediate -> Short-Term -> Long-Term (core)
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
// CONSTANTS
// ============================================================================

const MAX_MESSAGES_PER_SESSION: usize = 1000;
const IMMEDIATE_MAX: usize = 100;
const IMMEDIATE_TTL_HOURS: i64 = 24;
const SHORTTERM_MAX: usize = 500;
const SHORTTERM_TTL_DAYS: i64 = 7;
const IMMEDIATE_PROMOTE_REFS: u32 = 3;
const SHORTTERM_PROMOTE_REFS: u32 = 5;

// ============================================================================
// STRUCTS
// ============================================================================

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Message {
    pub role: String,
    pub content: String,
    pub timestamp: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatSession {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub messages: Vec<Message>,
}

// --- 3-Tier Memory Entries (immediate, shortterm) ---

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MemoryEntry {
    pub id: String,
    pub key: String,
    pub value: String,
    pub tags: Vec<String>,
    pub timestamp: i64,
    pub references: u32,
}

impl MemoryEntry {
    fn new(key: &str, value: &str, tags: Vec<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            key: key.to_string(),
            value: value.to_string(),
            tags,
            timestamp: now_ts(),
            references: 0,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ImmediateZone {
    pub entries: Vec<MemoryEntry>,
    pub max: usize,
    pub ttl_hours: i64,
}

impl Default for ImmediateZone {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            max: IMMEDIATE_MAX,
            ttl_hours: IMMEDIATE_TTL_HOURS,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ShortTermZone {
    pub entries: Vec<MemoryEntry>,
    pub max: usize,
    pub ttl_days: i64,
}

impl Default for ShortTermZone {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            max: SHORTTERM_MAX,
            ttl_days: SHORTTERM_TTL_DAYS,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ZoneData {
    pub entries: Vec<MemoryEntry>,
}

// --- Core Zone (long-term facts) ---

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CoreEntry {
    pub id: String,
    pub timestamp: i64,
    pub r#type: String, // fact|preference|learning|conversation
    pub key: String,
    pub value: String,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CoreZone {
    pub entries: Vec<CoreEntry>,
}

// --- Skills Zone ---

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

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct SkillsZone {
    pub entries: Vec<SkillEntry>,
}

// --- Sensitive Zone (encrypted) ---

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
pub struct SensitiveZone {
    pub entries: Vec<SensitiveEntry>,
}

// --- Memory Store ---

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct MemoryStore {
    #[serde(default)]
    pub sessions: Vec<ChatSession>,
    #[serde(default)]
    pub immediate: ImmediateZone,
    #[serde(default)]
    pub shortterm: ShortTermZone,
    #[serde(default)]
    pub core_zone: CoreZone,
    #[serde(default)]
    pub skills_zone: SkillsZone,
    #[serde(default)]
    pub sensitive_zone: SensitiveZone,
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

fn hours_to_secs(h: i64) -> i64 {
    h * 3600
}

fn days_to_secs(d: i64) -> i64 {
    d * 86400
}

// ============================================================================
// VERSCHLUESSELUNG (AES-256-GCM)
// ============================================================================

fn machine_id() -> String {
    if let Ok(output) = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
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
    let host = std::env::var("HOSTNAME").unwrap_or_else(|_| "localhost".to_string());
    let user = std::env::var("USER").unwrap_or_else(|_| "user".to_string());
    format!("{}-{}", host, user)
}

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

fn encrypt_value(plaintext: &str) -> String {
    let key = derive_key();
    let cipher = match Aes256Gcm::new_from_slice(&key) {
        Ok(c) => c,
        Err(_) => return plaintext.to_string(),
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

fn decrypt_value(ciphertext_b64: &str) -> String {
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
        return MemoryStore::default();
    }
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(MemoryStore::default()),
        Err(_) => MemoryStore::default(),
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
// SESSION / MESSAGE (Chat-Historie)
// ============================================================================

pub fn create_session(name: &str) -> Result<String, String> {
    let mut store = load_store();
    let id = Uuid::new_v4().to_string();
    let session = ChatSession {
        id: id.clone(),
        name: if name.is_empty() { format!("Sitzung {}", store.sessions.len() + 1) } else { name.to_string() },
        created_at: now_ts(),
        messages: Vec::new(),
    };
    store.sessions.push(session);
    save_store(&store)?;
    Ok(id)
}

pub fn add_message(session_id: &str, role: &str, content: &str) -> Result<bool, String> {
    let mut store = load_store();
    let session = store.sessions.iter_mut().find(|s| s.id == session_id)
        .ok_or_else(|| "Session nicht gefunden".to_string())?;
    session.messages.push(Message {
        role: role.to_string(),
        content: content.to_string(),
        timestamp: now_ts(),
    });
    if session.messages.len() > MAX_MESSAGES_PER_SESSION {
        let excess = session.messages.len() - MAX_MESSAGES_PER_SESSION;
        session.messages.drain(0..excess);
    }
    save_store(&store)?;
    Ok(true)
}

pub fn get_sessions_json() -> Result<String, String> {
    let store = load_store();
    let simplified: Vec<Value> = store.sessions.iter().map(|s| {
        serde_json::json!({
            "id": s.id,
            "name": s.name,
            "created_at": s.created_at,
            "message_count": s.messages.len()
        })
    }).collect();
    serde_json::to_string(&simplified).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub fn get_messages_json(session_id: &str) -> Result<String, String> {
    let store = load_store();
    let session = store.sessions.iter().find(|s| s.id == session_id)
        .ok_or_else(|| "Session nicht gefunden".to_string())?;
    serde_json::to_string(&session.messages).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub fn delete_session(session_id: &str) -> Result<bool, String> {
    let mut store = load_store();
    let before = store.sessions.len();
    store.sessions.retain(|s| s.id != session_id);
    if store.sessions.len() < before {
        save_store(&store)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn search(query: &str) -> Result<String, String> {
    let store = load_store();
    let q = query.to_lowercase();
    let mut results: Vec<Value> = Vec::new();
    for session in &store.sessions {
        for msg in &session.messages {
            if msg.content.to_lowercase().contains(&q) {
                results.push(serde_json::json!({
                    "session_id": session.id,
                    "session_name": session.name,
                    "role": msg.role,
                    "content": msg.content,
                    "timestamp": msg.timestamp
                }));
            }
        }
    }
    serde_json::to_string(&results).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub fn clear_all() -> Result<bool, String> {
    let store = MemoryStore::default();
    save_store(&store)?;
    Ok(true)
}

// ============================================================================
// IMMEDIATE MEMORY (Tier 1)
// ============================================================================

pub fn add_immediate(key: &str, value: &str, tags: Vec<String>) -> Result<bool, String> {
    let mut store = load_store();
    let now = now_ts();
    let existing = store.immediate.entries.iter_mut().find(|e| e.key == key && e.value == value);
    if let Some(entry) = existing {
        entry.references += 1;
        entry.timestamp = now;
    } else {
        let mut entry = MemoryEntry::new(key, value, tags);
        entry.references = 1;
        store.immediate.entries.push(entry);
    }
    while store.immediate.entries.len() > store.immediate.max {
        store.immediate.entries.remove(0);
    }
    save_store(&store)?;
    let _ = flow();
    Ok(true)
}

pub fn get_immediate_json() -> Result<String, String> {
    let store = load_store();
    serde_json::to_string(&store.immediate.entries).map_err(|e| format!("Serialize-Fehler: {}", e))
}

// ============================================================================
// SHORT-TERM MEMORY (Tier 2)
// ============================================================================

pub fn get_shortterm_json() -> Result<String, String> {
    let store = load_store();
    serde_json::to_string(&store.shortterm.entries).map_err(|e| format!("Serialize-Fehler: {}", e))
}

// ============================================================================
// ZONE OPERATIONS (generic for immediate, shortterm, core, skills, sensitive)
// ============================================================================

fn get_flow_zone_entries<'a>(store: &'a mut MemoryStore, zone: &str) -> Result<&'a mut Vec<MemoryEntry>, String> {
    match zone {
        "immediate" => Ok(&mut store.immediate.entries),
        "shortterm" => Ok(&mut store.shortterm.entries),
        _ => Err(format!("Unbekannte Flow-Zone: {}", zone)),
    }
}

pub fn add_to_zone(zone: &str, key: &str, value: &str, tags: Vec<String>) -> Result<bool, String> {
    match zone {
        "immediate" => add_immediate(key, value, tags),
        "shortterm" => {
            let mut store = load_store();
            let mut entry = MemoryEntry::new(key, value, tags);
            entry.references = 1;
            store.shortterm.entries.push(entry);
            while store.shortterm.entries.len() > store.shortterm.max {
                store.shortterm.entries.remove(0);
            }
            save_store(&store)?;
            Ok(true)
        }
        "core" => add_core(key, value, tags, "fact"),
        "skills" => add_skill(key, value, "auto", Vec::new()),
        "sensitive" => add_sensitive("note", key, "", value, "", "", "Sonstiges", tags),
        _ => Err(format!("Unbekannte Zone: {}", zone)),
    }
}

pub fn search_zone(zone: &str, query: &str) -> Result<String, String> {
    match zone {
        "core" => search_core(query),
        "skills" => search_skills(query),
        "sensitive" => search_sensitive(query),
        "immediate" | "shortterm" => {
            let store = load_store();
            let entries_ref: &Vec<MemoryEntry> = if zone == "immediate" {
                &store.immediate.entries
            } else {
                &store.shortterm.entries
            };
            let q = query.to_lowercase();
            let filtered: Vec<&MemoryEntry> = if q.is_empty() {
                entries_ref.iter().collect()
            } else {
                entries_ref.iter().filter(|e| {
                    e.key.to_lowercase().contains(&q) || e.value.to_lowercase().contains(&q)
                }).collect()
            };
            serde_json::to_string(&filtered).map_err(|e| format!("Serialize-Fehler: {}", e))
        }
        _ => Err(format!("Unbekannte Zone: {}", zone)),
    }
}

pub fn get_zone_json(zone: &str) -> Result<String, String> {
    match zone {
        "immediate" => get_immediate_json(),
        "shortterm" => get_shortterm_json(),
        "core" => get_zone(zone),
        "skills" => get_zone(zone),
        "sensitive" => get_zone(zone),
        _ => Err(format!("Unbekannte Zone: {}", zone)),
    }
}

pub fn delete_from_zone(zone: &str, key_or_id: &str) -> Result<bool, String> {
    match zone {
        "core" => delete_core(key_or_id),
        "skills" => delete_skill(key_or_id),
        "sensitive" => delete_sensitive(key_or_id),
        "immediate" | "shortterm" => {
            let mut store = load_store();
            let entries = get_flow_zone_entries(&mut store, zone)?;
            let before = entries.len();
            entries.retain(|e| e.id != key_or_id && e.key != key_or_id);
            if entries.len() < before {
                save_store(&store)?;
                Ok(true)
            } else {
                Ok(false)
            }
        }
        _ => Err(format!("Unbekannte Zone: {}", zone)),
    }
}

pub fn edit_in_zone(zone: &str, id: &str, key: &str, value: &str, tags: Vec<String>) -> Result<bool, String> {
    match zone {
        "immediate" | "shortterm" => {
            let mut store = load_store();
            let entries = get_flow_zone_entries(&mut store, zone)?;
            let entry = entries.iter_mut().find(|e| e.id == id || e.key == id)
                .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
            entry.key = key.to_string();
            entry.value = value.to_string();
            entry.tags = tags;
            save_store(&store)?;
            Ok(true)
        }
        "core" => edit_core(id, Some(key), Some(value)),
        "skills" => {
            let mut store = load_store();
            let entry = store.skills_zone.entries.iter_mut().find(|e| e.id == id)
                .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
            entry.name = key.to_string();
            entry.description = value.to_string();
            save_store(&store)?;
            Ok(true)
        }
        "sensitive" => {
            let mut fields = serde_json::Map::new();
            fields.insert("title".to_string(), Value::String(key.to_string()));
            fields.insert("value".to_string(), Value::String(value.to_string()));
            edit_sensitive(id, Value::Object(fields))
        }
        _ => Err(format!("Unbekannte Zone: {}", zone)),
    }
}

// ============================================================================
// PROMOTE (Zone -> Zone)
// ============================================================================

pub fn promote(entry_id: &str, from_zone: &str, to_zone: &str) -> Result<bool, String> {
    match (from_zone, to_zone) {
        ("immediate", "shortterm") | ("shortterm", "immediate") => {
            let mut store = load_store();
            let from_entries = get_flow_zone_entries(&mut store, from_zone)?;
            let idx = from_entries.iter().position(|e| e.id == entry_id || e.key == entry_id);
            let entry = match idx {
                Some(i) => from_entries.remove(i),
                None => return Err("Eintrag nicht in Quell-Zone gefunden".to_string()),
            };
            let to_entries = get_flow_zone_entries(&mut store, to_zone)?;
            to_entries.push(entry);
            save_store(&store)?;
            Ok(true)
        }
        ("immediate", "core") | ("shortterm", "core") => {
            let mut store = load_store();
            let from_entries = get_flow_zone_entries(&mut store, from_zone)?;
            let idx = from_entries.iter().position(|e| e.id == entry_id || e.key == entry_id);
            let entry = match idx {
                Some(i) => from_entries.remove(i),
                None => return Err("Eintrag nicht in Quell-Zone gefunden".to_string()),
            };
            let core_entry = CoreEntry {
                id: entry.id,
                timestamp: entry.timestamp,
                r#type: "fact".to_string(),
                key: entry.key,
                value: entry.value,
                tags: entry.tags,
            };
            store.core_zone.entries.push(core_entry);
            save_store(&store)?;
            Ok(true)
        }
        (_, "core") => {
            // Generic promote to core (for skills, sensitive, etc.)
            add_core(entry_id, "", Vec::new(), "fact")
        }
        _ => Err(format!("Promote von {} nach {} nicht unterstuetzt", from_zone, to_zone)),
    }
}

// ============================================================================
// AUTO-CLEANUP
// ============================================================================

pub fn auto_cleanup() -> Result<serde_json::Value, String> {
    let mut store = load_store();
    let now = now_ts();
    let imm_ttl_secs = hours_to_secs(store.immediate.ttl_hours);
    let before_imm = store.immediate.entries.len();
    store.immediate.entries.retain(|e| (now - e.timestamp) < imm_ttl_secs);
    let removed_immediate = (before_imm - store.immediate.entries.len()) as u32;

    let st_ttl_secs = days_to_secs(store.shortterm.ttl_days);
    let before_st = store.shortterm.entries.len();
    store.shortterm.entries.retain(|e| (now - e.timestamp) < st_ttl_secs);
    let removed_shortterm = (before_st - store.shortterm.entries.len()) as u32;

    save_store(&store)?;

    Ok(serde_json::json!({
        "removed_immediate": removed_immediate,
        "removed_shortterm": removed_shortterm
    }))
}

// ============================================================================
// MEMORY FLOW (Immediate -> Short-Term -> Long-Term)
// ============================================================================

pub fn flow() -> Result<serde_json::Value, String> {
    let mut store = load_store();
    let now = now_ts();
    let mut promoted_to_shortterm: u32 = 0;
    let mut promoted_to_longterm: u32 = 0;
    let mut expired_immediate: u32 = 0;
    let mut expired_shortterm: u32 = 0;

    // 1. Abgelaufene Immediate Eintraege entfernen (> 24h)
    let imm_ttl_secs = hours_to_secs(store.immediate.ttl_hours);
    let before_imm = store.immediate.entries.len();
    store.immediate.entries.retain(|e| (now - e.timestamp) < imm_ttl_secs);
    expired_immediate = (before_imm - store.immediate.entries.len()) as u32;

    // 2. Abgelaufene Short-Term Eintraege entfernen (> 7d)
    let st_ttl_secs = days_to_secs(store.shortterm.ttl_days);
    let before_st = store.shortterm.entries.len();
    store.shortterm.entries.retain(|e| (now - e.timestamp) < st_ttl_secs);
    expired_shortterm = (before_st - store.shortterm.entries.len()) as u32;

    // 3. Immediate mit 3+ Referenzen -> Short-Term
    let to_promote_st: Vec<MemoryEntry> = store.immediate.entries
        .iter()
        .filter(|e| e.references >= IMMEDIATE_PROMOTE_REFS)
        .cloned()
        .collect();
    promoted_to_shortterm = to_promote_st.len() as u32;

    for entry in &to_promote_st {
        store.immediate.entries.retain(|e| e.id != entry.id);
        store.shortterm.entries.push(entry.clone());
    }
    while store.shortterm.entries.len() > store.shortterm.max {
        store.shortterm.entries.remove(0);
    }

    // 4. Short-Term mit 5+ Referenzen -> Long-Term (core)
    let to_promote_lt: Vec<MemoryEntry> = store.shortterm.entries
        .iter()
        .filter(|e| e.references >= SHORTTERM_PROMOTE_REFS)
        .cloned()
        .collect();
    promoted_to_longterm = to_promote_lt.len() as u32;

    for entry in &to_promote_lt {
        store.shortterm.entries.retain(|e| e.id != entry.id);
        let core_entry = CoreEntry {
            id: entry.id.clone(),
            timestamp: entry.timestamp,
            r#type: "fact".to_string(),
            key: entry.key.clone(),
            value: entry.value.clone(),
            tags: entry.tags.clone(),
        };
        store.core_zone.entries.push(core_entry);
    }

    save_store(&store)?;

    Ok(serde_json::json!({
        "promoted_to_shortterm": promoted_to_shortterm,
        "promoted_to_longterm": promoted_to_longterm,
        "expired_immediate": expired_immediate,
        "expired_shortterm": expired_shortterm
    }))
}

pub fn increment_reference(zone: &str, entry_id: &str) -> Result<bool, String> {
    let mut store = load_store();
    match zone {
        "immediate" => {
            let entry = store.immediate.entries.iter_mut().find(|e| e.id == entry_id || e.key == entry_id)
                .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
            entry.references += 1;
        }
        "shortterm" => {
            let entry = store.shortterm.entries.iter_mut().find(|e| e.id == entry_id || e.key == entry_id)
                .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
            entry.references += 1;
        }
        _ => return Err(format!("Unbekannte Zone: {}", zone)),
    }
    save_store(&store)?;
    Ok(true)
}

pub fn get_status_json() -> Result<String, String> {
    let store = load_store();
    let status = serde_json::json!({
        "immediate": {
            "count": store.immediate.entries.len(),
            "max": store.immediate.max,
            "ttl_hours": store.immediate.ttl_hours
        },
        "shortterm": {
            "count": store.shortterm.entries.len(),
            "max": store.shortterm.max,
            "ttl_days": store.shortterm.ttl_days
        },
        "core": { "count": store.core_zone.entries.len() },
        "skills": { "count": store.skills_zone.entries.len() },
        "sensitive": { "count": store.sensitive_zone.entries.len() },
        "sessions": { "count": store.sessions.len() }
    });
    serde_json::to_string(&status).map_err(|e| format!("Serialize-Fehler: {}", e))
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
    store.core_zone.entries.push(entry);
    save_store(&store)?;
    Ok(true)
}

pub fn search_core(query: &str) -> Result<String, String> {
    let store = load_store();
    let q = query.to_lowercase();
    let results: Vec<&CoreEntry> = store.core_zone.entries.iter()
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
    let entry = store.core_zone.entries.iter_mut()
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
    let before = store.core_zone.entries.len();
    store.core_zone.entries.retain(|e| e.id != entry_id);
    if store.core_zone.entries.len() < before {
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
    store.skills_zone.entries.push(entry);
    save_store(&store)?;
    Ok(true)
}

pub fn search_skills(query: &str) -> Result<String, String> {
    let store = load_store();
    let q = query.to_lowercase();
    let results: Vec<&SkillEntry> = store.skills_zone.entries.iter()
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
    let before = store.skills_zone.entries.len();
    store.skills_zone.entries.retain(|e| e.id != entry_id);
    if store.skills_zone.entries.len() < before {
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
    store.sensitive_zone.entries.push(entry);
    save_store(&store)?;
    Ok(true)
}

pub fn search_sensitive(query: &str) -> Result<String, String> {
    let store = load_store();
    let q = query.to_lowercase();
    let results: Vec<Value> = store.sensitive_zone.entries.iter()
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
    let entry = store.sensitive_zone.entries.iter_mut()
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
    let before = store.sensitive_zone.entries.len();
    for e in store.sensitive_zone.entries.iter_mut() {
        e.linked_ids.retain(|id| id != entry_id);
    }
    store.sensitive_zone.entries.retain(|e| e.id != entry_id);
    if store.sensitive_zone.entries.len() < before {
        save_store(&store)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn get_sensitive_value(entry_id: &str) -> Result<String, String> {
    let store = load_store();
    let entry = store.sensitive_zone.entries.iter()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
    Ok(decrypt_value(&entry.value))
}

// ============================================================================
// ZONE GET / CLEAR
// ============================================================================

pub fn get_zone(zone: &str) -> Result<String, String> {
    let store = load_store();
    match zone {
        "core" => serde_json::to_string(&store.core_zone).map_err(|e| format!("Serialize-Fehler: {}", e)),
        "skills" => serde_json::to_string(&store.skills_zone).map_err(|e| format!("Serialize-Fehler: {}", e)),
        "sensitive" => {
            let zone_view: Vec<Value> = store.sensitive_zone.entries.iter().map(|e| {
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
    let sensitive_view: Vec<Value> = store.sensitive_zone.entries.iter().map(|e| {
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
        "sessions": store.sessions,
        "immediate": store.immediate,
        "shortterm": store.shortterm,
        "core": store.core_zone,
        "skills": store.skills_zone,
        "sensitive": { "entries": sensitive_view }
    });
    serde_json::to_string(&all).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub fn clear_zone(zone: &str) -> Result<bool, String> {
    let mut store = load_store();
    match zone {
        "core" => store.core_zone.entries.clear(),
        "skills" => store.skills_zone.entries.clear(),
        "sensitive" => store.sensitive_zone.entries.clear(),
        "immediate" => store.immediate.entries.clear(),
        "shortterm" => store.shortterm.entries.clear(),
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
        Some(g) if !g.is_empty() => store.sensitive_zone.entries.iter()
            .filter(|e| e.group == g)
            .collect(),
        _ => store.sensitive_zone.entries.iter().collect(),
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
    let exists_a = store.sensitive_zone.entries.iter().any(|e| e.id == entry_id);
    let exists_b = store.sensitive_zone.entries.iter().any(|e| e.id == linked_id);
    if !exists_a || !exists_b {
        return Err("Einer der Eintraege existiert nicht".to_string());
    }
    let entry = store.sensitive_zone.entries.iter_mut()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| "Eintrag nicht gefunden".to_string())?;
    if !entry.linked_ids.contains(&linked_id.to_string()) {
        entry.linked_ids.push(linked_id.to_string());
    }
    let entry2 = store.sensitive_zone.entries.iter_mut()
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
    let export_data: Vec<Value> = store.sensitive_zone.entries.iter().map(|e| {
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
        store.sensitive_zone.entries.push(entry);
    }
    save_store(&store)?;
    Ok(true)
}