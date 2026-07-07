// Titan Toti — Skills System (Rust)
// Statische Skills die System-Befehle ausfuehren
// KEINE Backticks in diesem File

use serde::{Deserialize, Serialize};
use regex::Regex;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub pattern: String,
    pub category: String,
    pub requires_system: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SkillMatchResult {
    pub matched: bool,
    pub skill_name: String,
    pub args: Vec<String>,
    pub result: String,
    pub success: bool,
}

pub fn list_skills_json() -> Result<String, String> {
    serde_json::to_string(&all_skills()).map_err(|e| format!("Serialize-Fehler: {}", e))
}

fn all_skills() -> Vec<SkillInfo> {
    vec![
        SkillInfo {
            name: "open_app".to_string(),
            description: "Oeffnet eine App (z.B. 'oeffne Safari', 'öffne Terminal')".to_string(),
            pattern: r"(?i)^(öffne|oeffne|open|starte)\s+(.+)".to_string(),
            category: "System".to_string(),
            requires_system: true,
        },
        SkillInfo {
            name: "screenshot".to_string(),
            description: "Macht einen Screenshot und speichert ihn unter /tmp/titan_screenshot.png".to_string(),
            pattern: r"(?i)^(screenshot|bildschirm foto|bildschirmfoto)".to_string(),
            category: "System".to_string(),
            requires_system: true,
        },
        SkillInfo {
            name: "system_info".to_string(),
            description: "Zeigt System-Informationen an (system_profiler)".to_string(),
            pattern: r"(?i)^(system ?info|systeminfo|system ?info|hardware ?info)".to_string(),
            category: "System".to_string(),
            requires_system: true,
        },
        SkillInfo {
            name: "read_file".to_string(),
            description: "Liest eine Datei (z.B. 'lese datei /pfad/zur/datei')".to_string(),
            pattern: r"(?i)^(lese|lies|read|zeige)\s+(datei|file)?\s*(.+)".to_string(),
            category: "Dateien".to_string(),
            requires_system: true,
        },
        SkillInfo {
            name: "write_file".to_string(),
            description: "Schreibt eine Datei (z.B. 'schreibe datei /pfad')".to_string(),
            pattern: r"(?i)^(schreibe|write|speichere)\s+(datei|file)?\s*(.+)".to_string(),
            category: "Dateien".to_string(),
            requires_system: true,
        },
        SkillInfo {
            name: "list_dir".to_string(),
            description: "Listet ein Verzeichnis auf (z.B. 'liste /Users')".to_string(),
            pattern: r"(?i)^(liste|list|ls|zeige)\s+(?:verzeichnis|ordner|dir)?\s*(.+)".to_string(),
            category: "Dateien".to_string(),
            requires_system: true,
        },
        SkillInfo {
            name: "run_command".to_string(),
            description: "Fuehrt einen System-Befehl aus (z.B. 'führe aus echo hallo')".to_string(),
            pattern: r"(?i)^(führe aus|fuehre aus|führe|fuehre|run|exec|execute)\s+(.+)".to_string(),
            category: "System".to_string(),
            requires_system: true,
        },
        SkillInfo {
            name: "web_search".to_string(),
            description: "Sucht im Web (z.B. 'web suche kalter Kaffee')".to_string(),
            pattern: r"(?i)^(web suche|suche|google|search)\s+(.+)".to_string(),
            category: "Web".to_string(),
            requires_system: true,
        },
        SkillInfo {
            name: "terminal".to_string(),
            description: "Oeffnet die Terminal-App".to_string(),
            pattern: r"(?i)^(terminal|öffne terminal|oeffne terminal)".to_string(),
            category: "System".to_string(),
            requires_system: true,
        },
        SkillInfo {
            name: "finder".to_string(),
            description: "Oeffnet den Finder".to_string(),
            pattern: r"(?i)^(finder|öffne finder|oeffne finder)".to_string(),
            category: "System".to_string(),
            requires_system: true,
        },
        SkillInfo {
            name: "date_time".to_string(),
            description: "Zeigt Datum und Uhrzeit an".to_string(),
            pattern: r"(?i)^(datum|uhrzeit|datum und uhrzeit|wie spät|wie viel uhr|wie spat)".to_string(),
            category: "System".to_string(),
            requires_system: true,
        },
    ]
}

pub async fn match_and_execute(message: &str, system_access: bool) -> Result<String, String> {
    let msg_trimmed = message.trim();
    let skills = all_skills();

    for skill in &skills {
        if let Ok(re) = Regex::new(&skill.pattern) {
            if let Some(caps) = re.captures(msg_trimmed) {
                let mut args: Vec<String> = Vec::new();
                for i in 1..caps.len() {
                    if let Some(m) = caps.get(i) {
                        let arg = m.as_str().trim().to_string();
                        if !arg.is_empty() {
                            args.push(arg);
                        }
                    }
                }

                let result = execute_skill(&skill.name, &args, system_access).await?;
                return Ok(result);
            }
        }
    }

    // Kein Skill hat gepasst
    let no_match = SkillMatchResult {
        matched: false,
        skill_name: String::new(),
        args: Vec::new(),
        result: String::new(),
        success: false,
    };
    serde_json::to_string(&no_match).map_err(|e| format!("Serialize-Fehler: {}", e))
}

pub async fn execute_skill(skill_name: &str, args: &[String], system_access: bool) -> Result<String, String> {
    if !system_access {
        let result = SkillMatchResult {
            matched: true,
            skill_name: skill_name.to_string(),
            args: args.to_vec(),
            result: "System-Zugriff ist deaktiviert".to_string(),
            success: false,
        };
        return serde_json::to_string(&result).map_err(|e| format!("Serialize-Fehler: {}", e));
    }

    let (result_text, success) = match skill_name {
        "open_app" => {
            let app = args.first().cloned().unwrap_or_default();
            if app.is_empty() {
                ("Keine App angegeben".to_string(), false)
            } else {
                run_system("open", &["-a", &app]).await
            }
        }
        "screenshot" => {
            run_system("screencapture", &["/tmp/titan_screenshot.png"]).await
        }
        "system_info" => {
            run_system("system_profiler", &["SPHardwareDataType"]).await
        }
        "read_file" => {
            let path = args.last().cloned().unwrap_or_default();
            if path.is_empty() {
                ("Kein Pfad angegeben".to_string(), false)
            } else {
                match tokio::fs::read_to_string(&path).await {
                    Ok(content) => (content, true),
                    Err(e) => (format!("Fehler: {}", e), false),
                }
            }
        }
        "write_file" => {
            let path = args.first().cloned().unwrap_or_default();
            if path.is_empty() {
                ("Kein Pfad angegeben".to_string(), false)
            } else {
                match tokio::fs::write(&path, "").await {
                    Ok(_) => (format!("Datei erstellt: {}", path), true),
                    Err(e) => (format!("Fehler: {}", e), false),
                }
            }
        }
        "list_dir" => {
            let path = args.last().cloned().unwrap_or_default();
            if path.is_empty() {
                ("Kein Pfad angegeben".to_string(), false)
            } else {
                match tokio::fs::read_dir(&path).await {
                    Ok(mut entries) => {
                        let mut listing = Vec::new();
                        while let Ok(Some(entry)) = entries.next_entry().await {
                            listing.push(entry.file_name().to_string_lossy().to_string());
                        }
                        listing.sort();
                        (listing.join("\n"), true)
                    }
                    Err(e) => (format!("Fehler: {}", e), false),
                }
            }
        }
        "run_command" => {
            let cmd_str = args.join(" ");
            if cmd_str.is_empty() {
                ("Kein Command angegeben".to_string(), false)
            } else {
                run_system("sh", &["-c", &cmd_str]).await
            }
        }
        "web_search" => {
            let query = args.join(" ");
            if query.is_empty() {
                ("Keine Suchanfrage angegeben".to_string(), false)
            } else {
                let url = format!("https://www.google.com/search?q={}", urlencoding_minimal(&query));
                run_system("open", &[&url]).await
            }
        }
        "terminal" => {
            run_system("open", &["-a", "Terminal"]).await
        }
        "finder" => {
            run_system("open", &["."]).await
        }
        "date_time" => {
            run_system("date", &["+%A, %d. %B %Y, %H:%M:%S Uhr"]).await
        }
        _ => (format!("Unbekannter Skill: {}", skill_name), false),
    };

    let result = SkillMatchResult {
        matched: true,
        skill_name: skill_name.to_string(),
        args: args.to_vec(),
        result: result_text,
        success,
    };
    serde_json::to_string(&result).map_err(|e| format!("Serialize-Fehler: {}", e))
}

async fn run_system(cmd: &str, args: &[&str]) -> (String, bool) {
    match tokio::process::Command::new(cmd)
        .args(args)
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let text = if stdout.is_empty() { stderr } else { stdout };
            let truncated = if text.len() > 2000 { format!("{}...(gekürzt)", &text[..2000]) } else { text };
            (truncated, output.status.success())
        }
        Err(e) => (format!("Command-Fehler: {}", e), false),
    }
}

fn urlencoding_minimal(s: &str) -> String {
    s.chars().map(|c| {
        if c.is_alphanumeric() || c == '-' || c == '.' || c == '_' || c == '~' {
            c.to_string()
        } else {
            format!("%{:02X}", c as u8)
        }
    }).collect()
}