// Titan Toti — Agent Spawning & Continuous Mode
// Background-Tasks die kontinuierlich arbeiten mit tokio::spawn
// KEINE Backticks in diesem File

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use uuid::Uuid;

const MAX_AGENTS: usize = 3;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Agent {
    pub id: String,
    pub task: String,
    pub context: String,
    pub status: String, // running|paused|completed|failed
    pub progress: f64,
    pub current_step: String,
    pub steps: Vec<String>,
    pub result: String,
    pub created_at: i64,
    pub is_continuous: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ContinuousTask {
    pub id: String,
    pub goal: String,
    pub status: String, // running|paused|completed|failed|stopped
    pub steps_completed: u32,
    pub steps_failed: u32,
    pub last_result: String,
    pub created_at: i64,
}

static AGENTS: Mutex<Option<HashMap<String, Agent>>> = Mutex::new(None);
static CONTINUOUS_TASKS: Mutex<Option<HashMap<String, ContinuousTask>>> = Mutex::new(None);
static STOP_FLAGS: Mutex<Option<HashMap<String, bool>>> = Mutex::new(None);
static PAUSE_FLAGS: Mutex<Option<HashMap<String, bool>>> = Mutex::new(None);

fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn ensure_agents_loaded() {
    let mut guard = AGENTS.lock().unwrap();
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
}

fn ensure_continuous_loaded() {
    let mut guard = CONTINUOUS_TASKS.lock().unwrap();
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
}

fn ensure_stop_flags() {
    let mut guard = STOP_FLAGS.lock().unwrap();
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
}

fn ensure_pause_flags() {
    let mut guard = PAUSE_FLAGS.lock().unwrap();
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

// ============================================================================
// AGENT SPAWNING
// ============================================================================

pub fn spawn_agent_cmd(task: String, context: String) -> Result<String, String> {
    ensure_agents_loaded();
    ensure_stop_flags();
    ensure_pause_flags();

    let mut guard = AGENTS.lock().unwrap();
    let agents = guard.as_mut().unwrap();

    // Max 3 gleichzeitige Agenten
    let running_count = agents.values().filter(|a| a.status == "running").count();
    if running_count >= MAX_AGENTS {
        return Err("Maximal 3 gleichzeitige Agenten erlaubt".to_string());
    }

    let agent_id = Uuid::new_v4().to_string();

    // Stop-Flag zuruecksetzen
    let mut stop_guard = STOP_FLAGS.lock().unwrap();
    stop_guard.as_mut().unwrap().insert(agent_id.clone(), false);
    drop(stop_guard);

    let mut pause_guard = PAUSE_FLAGS.lock().unwrap();
    pause_guard.as_mut().unwrap().insert(agent_id.clone(), false);
    drop(pause_guard);

    let agent = Agent {
        id: agent_id.clone(),
        task: task.clone(),
        context: context.clone(),
        status: "running".to_string(),
        progress: 0.0,
        current_step: "Initialisierung...".to_string(),
        steps: Vec::new(),
        result: String::new(),
        created_at: now_ts(),
        is_continuous: false,
    };
    agents.insert(agent_id.clone(), agent);

    // Activity log
    crate::activity::log("agent_started", &format!("Agent gestartet: {}", task), Some(&agent_id));

    // Background-Task starten
    let aid = agent_id.clone();
    let atask = task.clone();
    let acontext = context.clone();
    tokio::spawn(async move {
        run_agent_loop(&aid, &atask, &acontext, false).await;
    });

    Ok(serde_json::json!({
        "agent_id": agent_id,
        "status": "running"
    }).to_string())
}

/// Der Agent-Loop: Plan -> Execute -> Log -> Repeat
async fn run_agent_loop(agent_id: &str, task: &str, context: &str, is_continuous: bool) {
    let settings = crate::settings::get_settings();

    // Schritt 1: Aufgabe planen via LLM
    let plan_prompt = format!(
        "Du bist Titan Toti, ein lokaler KI-Assistent. Du hast folgende Aufgabe erhalten:\n{}\n\nKontext:\n{}\n\nErstelle einen Plan mit konkreten Schritten. Antworte mit einer nummerierten Liste von Schritten.",
        task, context
    );

    let plan = call_llm(&settings, &plan_prompt).await;
    let steps: Vec<String> = plan.lines()
        .filter(|l| l.trim().starts_with(|c: char| c.is_numeric()))
        .map(|l| l.trim().to_string())
        .collect();

    // Schritte im Agent speichern
    {
        let mut guard = AGENTS.lock().unwrap();
        if let Some(ref mut agents) = *guard {
            if let Some(agent) = agents.get_mut(agent_id) {
                agent.steps = steps.clone();
                agent.current_step = "Plan erstellt, starte Ausfuehrung...".to_string();
            }
        }
    }

    crate::activity::log("thinking", &format!("Plan erstellt fuer: {}", task), Some(&plan));

    let total_steps = steps.len().max(1) as f64;

    // Schritt 2: Jeden Schritt ausfuehren
    for (i, step) in steps.iter().enumerate() {
        // Stop-Flag pruefen
        {
            let stop_guard = STOP_FLAGS.lock().unwrap();
            if let Some(ref flags) = *stop_guard {
                if let Some(&stop) = flags.get(agent_id) {
                    if stop {
                        update_agent_status(agent_id, "stopped", 1.0, "Agent gestoppt", "Agent durch Nutzer gestoppt");
                        crate::activity::log("agent_completed", &format!("Agent gestoppt: {}", task), None);
                        return;
                    }
                }
            }
        }

        // Pause-Flag pruefen (warten bis resumed)
        loop {
            {
                let pause_guard = PAUSE_FLAGS.lock().unwrap();
                if let Some(ref flags) = *pause_guard {
                    if let Some(&paused) = flags.get(agent_id) {
                        if paused {
                            update_agent_status(agent_id, "paused", (i as f64) / total_steps, "Pausiert", "");
                            // Warte 1 Sekunde und pruefe erneut
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }

        // Current step updaten
        update_agent_status(agent_id, "running", (i as f64) / total_steps, step, "");

        crate::activity::log("action", &format!("Schritt {}/{}: {}", i + 1, steps.len(), step), None);

        // Schritt via LLM ausfuehren
        let execute_prompt = format!(
            "Du bist Titan Toti. Du arbeitest an der Aufgabe: {}\n\nAktueller Schritt: {}\n\nFuehre diesen Schritt aus und beschreibe was du getan hast. Wenn du eine Datei lesen oder einen Befehl ausfuehren willst, beschreibe es klar.",
            task, step
        );

        let result = call_llm(&settings, &execute_prompt).await;
        crate::activity::log("action", &format!("Schritt {} Ergebnis: {}", i + 1, &result[..result.len().min(200)]), None);

        // Update agent
        {
            let mut guard = AGENTS.lock().unwrap();
            if let Some(ref mut agents) = *guard {
                if let Some(agent) = agents.get_mut(agent_id) {
                    agent.result = result.clone();
                    agent.progress = ((i + 1) as f64) / total_steps;
                }
            }
        }

        // Kurze Pause zwischen Schritten
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    // Fertig
    update_agent_status(agent_id, "completed", 1.0, "Abgeschlossen", "Aufgabe abgeschlossen");
    crate::activity::log("agent_completed", &format!("Agent abgeschlossen: {}", task), None);

    // Bei Continuous Mode: weitermachen
    if is_continuous {
        // Pruefe stop flag
        let should_stop = {
            let stop_guard = STOP_FLAGS.lock().unwrap();
            stop_guard.as_ref()
                .and_then(|f| f.get(agent_id))
                .copied()
                .unwrap_or(true)
        };
        if !should_stop {
            // Naechste Iteration
            Box::pin(run_agent_loop(agent_id, task, context, true)).await;
        }
    }
}

fn update_agent_status(agent_id: &str, status: &str, progress: f64, current_step: &str, result: &str) {
    let mut guard = AGENTS.lock().unwrap();
    if let Some(ref mut agents) = *guard {
        if let Some(agent) = agents.get_mut(agent_id) {
            agent.status = status.to_string();
            agent.progress = progress;
            if !current_step.is_empty() { agent.current_step = current_step.to_string(); }
            if !result.is_empty() { agent.result = result.to_string(); }
        }
    }
}

async fn call_llm(settings: &crate::settings::Settings, prompt: &str) -> String {
    let url = format!("{}/v1/chat/completions", settings.api_url.trim_end_matches('/'));
    let client = http_client();

    let body = serde_json::json!({
        "model": settings.model,
        "messages": [
            {"role": "system", "content": if settings.system_prompt.is_empty() {
                "Du bist Titan Toti, ein lokaler KI-Assistent auf macOS."
            } else {
                &settings.system_prompt
            }},
            {"role": "user", "content": prompt}
        ],
        "temperature": settings.temperature,
        "max_tokens": settings.max_tokens,
        "stream": false
    });

    let mut req = client.post(&url).json(&body);
    if !settings.api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", settings.api_key));
    }

    match req.send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                let text = resp.text().await.unwrap_or_default();
                // Versuche OpenAI-Format
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    if let Some(content) = v.get("choices").and_then(|c| c.get(0)).and_then(|c| c.get("message")).and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                        return content.to_string();
                    }
                    // Ollama native Format
                    if let Some(content) = v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                        return content.to_string();
                    }
                    if let Some(content) = v.get("response").and_then(|c| c.as_str()) {
                        return content.to_string();
                    }
                }
                return text;
            }
            format!("LLM-Fehler: HTTP {}", resp.status().as_u16())
        }
        Err(e) => format!("LLM-Verbindungsfehler: {}", e),
    }
}

pub fn get_agent_status_cmd(agent_id: String) -> Result<String, String> {
    ensure_agents_loaded();
    let guard = AGENTS.lock().unwrap();
    if let Some(ref agents) = *guard {
        if let Some(agent) = agents.get(&agent_id) {
            return serde_json::to_string(agent).map_err(|e| format!("Serialize-Fehler: {}", e));
        }
    }
    Err("Agent nicht gefunden".to_string())
}

pub fn list_agents_cmd() -> Result<String, String> {
    ensure_agents_loaded();
    let guard = AGENTS.lock().unwrap();
    if let Some(ref agents) = *guard {
        let list: Vec<&Agent> = agents.values().collect();
        return serde_json::to_string(&list).map_err(|e| format!("Serialize-Fehler: {}", e));
    }
    Ok("[]".to_string())
}

pub fn stop_agent_cmd(agent_id: String) -> Result<bool, String> {
    ensure_stop_flags();
    {
        let mut guard = STOP_FLAGS.lock().unwrap();
        if let Some(ref mut flags) = *guard {
            flags.insert(agent_id.clone(), true);
        }
    }
    update_agent_status(&agent_id, "stopped", 1.0, "Gestoppt", "Durch Nutzer gestoppt");
    Ok(true)
}

pub fn pause_agent_cmd(agent_id: String) -> Result<bool, String> {
    ensure_pause_flags();
    let mut guard = PAUSE_FLAGS.lock().unwrap();
    if let Some(ref mut flags) = *guard {
        flags.insert(agent_id, true);
    }
    Ok(true)
}

pub fn resume_agent_cmd(agent_id: String) -> Result<bool, String> {
    ensure_pause_flags();
    let mut guard = PAUSE_FLAGS.lock().unwrap();
    if let Some(ref mut flags) = *guard {
        flags.insert(agent_id.clone(), false);
    }
    update_agent_status(&agent_id, "running", 0.0, "Fortgesetzt", "");
    Ok(true)
}

// ============================================================================
// CONTINUOUS MODE
// ============================================================================

pub fn start_continuous_task_cmd(goal: String) -> Result<String, String> {
    ensure_continuous_loaded();
    ensure_stop_flags();
    ensure_pause_flags();
    ensure_agents_loaded();

    let mut guard = CONTINUOUS_TASKS.lock().unwrap();
    let tasks = guard.as_mut().unwrap();

    // Max 3 gleichzeitige
    let running = tasks.values().filter(|t| t.status == "running").count();
    if running >= MAX_AGENTS {
        return Err("Maximal 3 kontinuierliche Aufgaben erlaubt".to_string());
    }

    let task_id = Uuid::new_v4().to_string();

    // Stop-Flag zuruecksetzen
    {
        let mut stop_guard = STOP_FLAGS.lock().unwrap();
        stop_guard.as_mut().unwrap().insert(task_id.clone(), false);
    }
    {
        let mut pause_guard = PAUSE_FLAGS.lock().unwrap();
        pause_guard.as_mut().unwrap().insert(task_id.clone(), false);
    }

    let task = ContinuousTask {
        id: task_id.clone(),
        goal: goal.clone(),
        status: "running".to_string(),
        steps_completed: 0,
        steps_failed: 0,
        last_result: String::new(),
        created_at: now_ts(),
    };
    tasks.insert(task_id.clone(), task);

    crate::activity::log("agent_started", &format!("Kontinuierliche Aufgabe gestartet: {}", goal), Some(&task_id));

    // Background-Task
    let tid = task_id.clone();
    let tgoal = goal.clone();
    tokio::spawn(async move {
        run_continuous_loop(&tid, &tgoal).await;
    });

    Ok(serde_json::json!({
        "task_id": task_id,
        "status": "running"
    }).to_string())
}

async fn run_continuous_loop(task_id: &str, goal: &str) {
    let settings = crate::settings::get_settings();
    let mut iteration = 0u32;

    loop {
        iteration += 1;

        // Stop-Flag
        {
            let stop_guard = STOP_FLAGS.lock().unwrap();
            if let Some(ref flags) = *stop_guard {
                if let Some(&stop) = flags.get(task_id) {
                    if stop {
                        update_continuous_status(task_id, "stopped", "Gestoppt");
                        return;
                    }
                }
            }
        }

        // Pause-Flag
        loop {
            {
                let pause_guard = PAUSE_FLAGS.lock().unwrap();
                if let Some(ref flags) = *pause_guard {
                    if let Some(&paused) = flags.get(task_id) {
                        if paused {
                            update_continuous_status(task_id, "paused", "Pausiert");
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }

        crate::activity::log("thinking", &format!("Kontinuierliche Aufgabe - Iteration {}: {}", iteration, goal), None);

        // Planen
        let plan_prompt = format!(
            "Du bist Titan Toti. Du arbeitest kontinuierlich an folgendem Ziel:\n{}\n\nIteration {}.\nBisherige Schritte: {} erfolgreich, {} fehlgeschlagen.\nWas soll als naechstes getan werden? Erstelle einen konkreten Schritt.",
            goal, iteration, get_continuous_steps_completed(task_id), get_continuous_steps_failed(task_id)
        );

        let plan = call_llm(&settings, &plan_prompt).await;

        // Schritt ausfuehren
        let exec_prompt = format!(
            "Du bist Titan Toti. Ziel: {}\nFuehre diesen Schritt aus: {}\nBeschreibe das Ergebnis.",
            goal, plan
        );

        let result = call_llm(&settings, &exec_prompt).await;

        // Pruefen ob Ziel erreicht
        let check_prompt = format!(
            "Du bist Titan Toti. Ziel: {}\nBisherige Ergebnisse:\n{}\n\nIst das Ziel erreicht? Antworte nur mit JA oder NEIN und einer kurzen Begruendung.",
            goal, result
        );

        let check = call_llm(&settings, &check_prompt).await;

        let goal_reached = check.to_lowercase().starts_with("ja");

        // Update task
        {
            let mut guard = CONTINUOUS_TASKS.lock().unwrap();
            if let Some(ref mut tasks) = *guard {
                if let Some(t) = tasks.get_mut(task_id) {
                    t.steps_completed += 1;
                    t.last_result = result.clone();
                    if goal_reached {
                        t.status = "completed".to_string();
                    }
                }
            }
        }

        crate::activity::log("action", &format!("Schritt {} ausgefuehrt: {}", iteration, &result[..result.len().min(200)]), None);

        if goal_reached {
            crate::activity::log("agent_completed", &format!("Ziel erreicht: {}", goal), None);
            return;
        }

        // Kurze Pause
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
}

fn get_continuous_steps_completed(task_id: &str) -> u32 {
    let guard = CONTINUOUS_TASKS.lock().unwrap();
    guard.as_ref().and_then(|t| t.get(task_id)).map(|t| t.steps_completed).unwrap_or(0)
}

fn get_continuous_steps_failed(task_id: &str) -> u32 {
    let guard = CONTINUOUS_TASKS.lock().unwrap();
    guard.as_ref().and_then(|t| t.get(task_id)).map(|t| t.steps_failed).unwrap_or(0)
}

fn update_continuous_status(task_id: &str, status: &str, last_result: &str) {
    let mut guard = CONTINUOUS_TASKS.lock().unwrap();
    if let Some(ref mut tasks) = *guard {
        if let Some(t) = tasks.get_mut(task_id) {
            t.status = status.to_string();
            if !last_result.is_empty() { t.last_result = last_result.to_string(); }
        }
    }
}

pub fn pause_continuous_task_cmd(task_id: String) -> Result<bool, String> {
    ensure_pause_flags();
    let mut guard = PAUSE_FLAGS.lock().unwrap();
    if let Some(ref mut flags) = *guard {
        flags.insert(task_id, true);
    }
    Ok(true)
}

pub fn resume_continuous_task_cmd(task_id: String) -> Result<bool, String> {
    ensure_pause_flags();
    let mut guard = PAUSE_FLAGS.lock().unwrap();
    if let Some(ref mut flags) = *guard {
        flags.insert(task_id.clone(), false);
    }
    update_continuous_status(&task_id, "running", "");
    Ok(true)
}

pub fn stop_continuous_task_cmd(task_id: String) -> Result<bool, String> {
    ensure_stop_flags();
    {
        let mut guard = STOP_FLAGS.lock().unwrap();
        if let Some(ref mut flags) = *guard {
            flags.insert(task_id.clone(), true);
        }
    }
    update_continuous_status(&task_id, "stopped", "Gestoppt");
    Ok(true)
}

pub fn get_continuous_tasks_cmd() -> Result<String, String> {
    ensure_continuous_loaded();
    let guard = CONTINUOUS_TASKS.lock().unwrap();
    if let Some(ref tasks) = *guard {
        let list: Vec<&ContinuousTask> = tasks.values().collect();
        return serde_json::to_string(&list).map_err(|e| format!("Serialize-Fehler: {}", e));
    }
    Ok("[]".to_string())
}