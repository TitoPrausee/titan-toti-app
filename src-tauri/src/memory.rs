// Titan Toti — Memory System (lokal, JSON-basiert)
// KEINE Backticks in diesem File

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

const MAX_MESSAGES_PER_SESSION: usize = 1000;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Message {
    pub role: String,
    pub content: String,
    pub timestamp: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub messages: Vec<Message>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MemoryStore {
    pub sessions: Vec<Session>,
}

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

fn load_store() -> MemoryStore {
    let path = memory_file_path();
    if !path.exists() {
        return MemoryStore { sessions: Vec::new() };
    }
    match fs::read_to_string(&path) {
        Ok(content) => {
            serde_json::from_str(&content).unwrap_or(MemoryStore { sessions: Vec::new() })
        }
        Err(_) => MemoryStore { sessions: Vec::new() },
    }
}

fn save_store(store: &MemoryStore) -> Result<(), String> {
    let dir = memory_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Memory-Verzeichnis nicht erstellbar: {}", e))?;
    let json = serde_json::to_string_pretty(store).map_err(|e| format!("Serialize-Fehler: {}", e))?;
    fs::write(memory_file_path(), json).map_err(|e| format!("Memory-Datei nicht schreibbar: {}", e))?;
    Ok(())
}

pub fn create_session(name: &str) -> Result<String, String> {
    let mut store = load_store();
    let id = Uuid::new_v4().to_string();
    let session = Session {
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

    let msg = Message {
        role: role.to_string(),
        content: content.to_string(),
        timestamp: now_ts(),
    };
    session.messages.push(msg);

    // Max-Nachrichten-Limit
    if session.messages.len() > MAX_MESSAGES_PER_SESSION {
        let excess = session.messages.len() - MAX_MESSAGES_PER_SESSION;
        session.messages.drain(0..excess);
    }

    save_store(&store)?;
    Ok(true)
}

pub fn get_sessions_json() -> Result<String, String> {
    let store = load_store();
    // Return simplified list (without messages for perf)
    let simplified: Vec<serde_json::Value> = store.sessions.iter().map(|s| {
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
    let mut results: Vec<serde_json::Value> = Vec::new();

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
    let store = MemoryStore { sessions: Vec::new() };
    save_store(&store)?;
    Ok(true)
}