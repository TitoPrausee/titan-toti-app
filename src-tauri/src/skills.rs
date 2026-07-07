// Titan Toti — Skill Hub (generische Skills, KEINE persoenlichen Daten)
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
    pub command_template: Option<String>,
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

pub fn get_skill_details_json(skill_name: &str) -> Result<String, String> {
    let skills = all_skills();
    let skill = skills.iter().find(|s| s.name == skill_name || s.name == skill_name)
        .or_else(|| skills.iter().find(|s| s.name.to_lowercase() == skill_name.to_lowercase()));
    match skill {
        Some(s) => serde_json::to_string(s).map_err(|e| format!("Serialize-Fehler: {}", e)),
        None => Err("Skill nicht gefunden".to_string()),
    }
}

fn all_skills() -> Vec<SkillInfo> {
    vec![
        SkillInfo {
            name: "datei_lesen".to_string(),
            description: "Lese eine Datei und fasse zusammen".to_string(),
            pattern: r"(?i)^(lese|lies|read|zeige)\s+(datei|file)?\s*(.+)".to_string(),
            category: "Dateien".to_string(),
            requires_system: true,
            command_template: Some("cat {arg0}".to_string()),
        },
        SkillInfo {
            name: "datei_schreiben".to_string(),
            description: "Schreibe Content in eine Datei".to_string(),
            pattern: r"(?i)^(schreibe|write|speichere)\s+(datei|file)?\s*(.+)".to_string(),
            category: "Dateien".to_string(),
            requires_system: true,
            command_template: None,
        },
        SkillInfo {
            name: "verzeichnis_auflisten".to_string(),
            description: "Zeige Dateien in einem Ordner".to_string(),
            pattern: r"(?i)^(liste|list|ls|zeige)\s+(verzeichnis|ordner|dir)?\s*(.+)".to_string(),
            category: "Dateien".to_string(),
            requires_system: true,
            command_template: Some("ls -la {arg0}".to_string()),
        },
        SkillInfo {
            name: "screenshot".to_string(),
            description: "Mach einen Screenshot und analysiere ihn".to_string(),
            pattern: r"(?i)^(screenshot|bildschirm foto|bildschirmfoto)".to_string(),
            category: "System".to_string(),
            requires_system: true,
            command_template: Some("screencapture /tmp/titan_screenshot.png".to_string()),
        },
        SkillInfo {
            name: "system_info".to_string(),
            description: "Zeige System-Informationen".to_string(),
            pattern: r"(?i)^(system.?info|systeminfo|hardware.?info)".to_string(),
            category: "System".to_string(),
            requires_system: true,
            command_template: Some("system_profiler SPHardwareDataType".to_string()),
        },
        SkillInfo {
            name: "app_oeffnen".to_string(),
            description: "Oeffne eine macOS App".to_string(),
            pattern: r"(?i)^(oeffne|öffne|open|starte)\s+(.+)".to_string(),
            category: "System".to_string(),
            requires_system: true,
            command_template: Some("open -a {arg0}".to_string()),
        },
        SkillInfo {
            name: "web_suche".to_string(),
            description: "Oeffne Google/DuckDuckGo im Browser".to_string(),
            pattern: r"(?i)^(web suche|suche|google|search)\s+(.+)".to_string(),
            category: "Web".to_string(),
            requires_system: true,
            command_template: None,
        },
        SkillInfo {
            name: "terminal".to_string(),
            description: "Oeffne Terminal".to_string(),
            pattern: r"(?i)^(terminal|oeffne terminal|öffne terminal)".to_string(),
            category: "System".to_string(),
            requires_system: true,
            command_template: Some("open -a Terminal".to_string()),
        },
        SkillInfo {
            name: "code_ausfuehren".to_string(),
            description: "Fuehre Python/Shell Code aus".to_string(),
            pattern: r"(?i)^(fuehre aus|führe aus|fuehre|führe|run|exec|execute)\s+(.+)".to_string(),
            category: "System".to_string(),
            requires_system: true,
            command_template: Some("sh -c {arg0}".to_string()),
        },
        SkillInfo {
            name: "bild_analysieren".to_string(),
            description: "Analysiere ein Bild mit Vision".to_string(),
            pattern: r"(?i)^(analysiere|analyse|analyze)\s+(bild|image|foto)\s*(.+)".to_string(),
            category: "Vision".to_string(),
            requires_system: true,
            command_template: None,
        },
        SkillInfo {
            name: "dateien_vergleichen".to_string(),
            description: "Vergleiche zwei Dateien".to_string(),
            pattern: r"(?i)^(vergleiche|compare|diff)\s+(.+)".to_string(),
            category: "Dateien".to_string(),
            requires_system: true,
            command_template: Some("diff {arg0} {arg1}".to_string()),
        },
        SkillInfo {
            name: "ordner_durchsuchen".to_string(),
            description: "Suche nach Files in einem Ordner".to_string(),
            pattern: r"(?i)^(suche in|find in|durchsuche)\s+(.+)".to_string(),
            category: "Dateien".to_string(),
            requires_system: true,
            command_template: Some("find {arg0} -name {arg1}".to_string()),
        },
        SkillInfo {
            name: "git_status".to_string(),
            description: "Zeige Git Status in einem Verzeichnis".to_string(),
            pattern: r"(?i)^(git status|git)".to_string(),
            category: "Entwicklung".to_string(),
            requires_system: true,
            command_template: Some("git status".to_string()),
        },
        SkillInfo {
            name: "prozess_liste".to_string(),
            description: "Zeige laufende Prozesse".to_string(),
            pattern: r"(?i)^(prozesse|ps|prozess liste|process list)".to_string(),
            category: "System".to_string(),
            requires_system: true,
            command_template: Some("ps aux".to_string()),
        },
        SkillInfo {
            name: "netzwerk_scan".to_string(),
            description: "Zeige Netzwerk-Verbindungen".to_string(),
            pattern: r"(?i)^(netzwerk|network|netstat|verbindungen)".to_string(),
            category: "System".to_string(),
            requires_system: true,
            command_template: Some("netstat -an".to_string()),
        },
        SkillInfo {
            name: "cron_job".to_string(),
            description: "Erstelle einen wiederkehrenden Task".to_string(),
            pattern: r"(?i)^(cron|crontab|wiederkehrend)".to_string(),
            category: "System".to_string(),
            requires_system: true,
            command_template: Some("crontab -l".to_string()),
        },
        SkillInfo {
            name: "pdf_lesen".to_string(),
            description: "Extrahiere Text aus PDF".to_string(),
            pattern: r"(?i)^(lese pdf|pdf|extrahiere pdf)".to_string(),
            category: "Dateien".to_string(),
            requires_system: true,
            command_template: Some("textutil -convert txt -stdout {arg0}".to_string()),
        },
        SkillInfo {
            name: "zip_erstellen".to_string(),
            description: "Komprimiere Dateien".to_string(),
            pattern: r"(?i)^(zip|komprimiere|archiv)".to_string(),
            category: "Dateien".to_string(),
            requires_system: true,
            command_template: Some("zip -r {arg0} {arg1}".to_string()),
        },
        SkillInfo {
            name: "uebersetzen".to_string(),
            description: "Uebersetze Text".to_string(),
            pattern: r"(?i)^(uebersetze|übersetze|translate)\s+(.+)".to_string(),
            category: "Text".to_string(),
            requires_system: false,
            command_template: None,
        },
        SkillInfo {
            name: "datum_uhrzeit".to_string(),
            description: "Zeigt Datum und Uhrzeit an".to_string(),
            pattern: r"(?i)^(datum|uhrzeit|datum und uhrzeit|wie spät|wie viel uhr|wie spat)".to_string(),
            category: "System".to_string(),
            requires_system: true,
            command_template: Some("date +%A,%d.%B%Y,%H:%M:%S".to_string()),
        },
        SkillInfo {
            name: "finder".to_string(),
            description: "Oeffnet den Finder".to_string(),
            pattern: r"(?i)^(finder|oeffne finder|öffne finder)".to_string(),
            category: "System".to_string(),
            requires_system: true,
            command_template: Some("open .".to_string()),
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
    let normalized = skill_name.to_lowercase();
    let normalized = normalized.replace(" ", "_");

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

    let (result_text, success) = match normalized.as_str() {
        "app_oeffnen" | "open_app" => {
            let app = args.last().cloned().unwrap_or_default();
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
        "datei_lesen" | "read_file" => {
            let path = args.last().cloned().unwrap_or_default();
            if path.is_empty() {
                ("Kein Pfad angegeben".to_string(), false)
            } else {
                match tokio::fs::read_to_string(&path).await {
                    Ok(content) => {
                        let truncated = if content.len() > 5000 {
                            format!("{}...(gekuerzt)", &content[..5000])
                        } else {
                            content
                        };
                        (truncated, true)
                    }
                    Err(e) => (format!("Fehler: {}", e), false),
                }
            }
        }
        "datei_schreiben" | "write_file" => {
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
        "verzeichnis_auflisten" | "list_dir" => {
            let path = args.last().cloned().unwrap_or_default();
            if path.is_empty() {
                ("Kein Pfad angegeben".to_string(), false)
            } else {
                match tokio::fs::read_dir(&path).await {
                    Ok(mut entries) => {
                        let mut listing = Vec::new();
                        while let Ok(Some(entry)) = entries.next_entry().await {
                            let meta = entry.metadata().await.ok();
                            let name = entry.file_name().to_string_lossy().to_string();
                            let kind = if meta.as_ref().map(|m| m.is_dir()).unwrap_or(false) { "dir" } else { "file" };
                            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                            listing.push(format!("[{}] {} ({} bytes)", kind, name, size));
                        }
                        listing.sort();
                        (listing.join("\n"), true)
                    }
                    Err(e) => (format!("Fehler: {}", e), false),
                }
            }
        }
        "code_ausfuehren" | "run_command" => {
            let cmd_str = args.join(" ");
            if cmd_str.is_empty() {
                ("Kein Command angegeben".to_string(), false)
            } else {
                run_system("sh", &["-c", &cmd_str]).await
            }
        }
        "web_suche" => {
            let query = args.join(" ");
            if query.is_empty() {
                ("Keine Suchanfrage angegeben".to_string(), false)
            } else {
                let url = format!("https://duckduckgo.com/?q={}", urlencoding_minimal(&query));
                run_system("open", &[&url]).await
            }
        }
        "terminal" => {
            run_system("open", &["-a", "Terminal"]).await
        }
        "finder" => {
            run_system("open", &["."]).await
        }
        "datum_uhrzeit" | "date_time" => {
            run_system("date", &["+%A, %d. %B %Y, %H:%M:%S Uhr"]).await
        }
        "dateien_vergleichen" => {
            if args.len() < 2 {
                ("Benoetige zwei Dateipfade".to_string(), false)
            } else {
                run_system("diff", &[&args[0], &args[1]]).await
            }
        }
        "ordner_durchsuchen" => {
            let path = args.first().cloned().unwrap_or_else(|| ".".to_string());
            let pattern = args.get(1).cloned().unwrap_or_else(|| "*".to_string());
            run_system("find", &[&path, "-name", &pattern]).await
        }
        "git_status" => {
            let cwd = args.first().cloned();
            let mut cmd = tokio::process::Command::new("git");
            cmd.args(&["status"]);
            if let Some(d) = cwd {
                cmd.current_dir(d);
            }
            match cmd.output().await {
                Ok(output) => {
                    let text = String::from_utf8_lossy(&output.stdout).to_string();
                    let err = String::from_utf8_lossy(&output.stderr).to_string();
                    let combined = if text.is_empty() { err } else { text };
                    (combined, output.status.success())
                }
                Err(e) => (format!("Fehler: {}", e), false),
            }
        }
        "prozess_liste" => {
            run_system("ps", &["aux"]).await
        }
        "netzwerk_scan" => {
            run_system("netstat", &["-an"]).await
        }
        "cron_job" => {
            run_system("crontab", &["-l"]).await
        }
        "pdf_lesen" => {
            let path = args.last().cloned().unwrap_or_default();
            if path.is_empty() {
                ("Kein PDF-Pfad angegeben".to_string(), false)
            } else {
                run_system("textutil", &["-convert", "txt", "-stdout", &path]).await
            }
        }
        "zip_erstellen" => {
            if args.len() < 2 {
                ("Benoetige zip-name und ordner".to_string(), false)
            } else {
                run_system("zip", &["-r", &args[0], &args[1]]).await
            }
        }
        "uebersetzen" => {
            ("Uebersetzung erfordert LLM - bitte nutze den Chat".to_string(), true)
        }
        "bild_analysieren" => {
            ("Bild-Analyse erfordert Vision - bitte nutze analyze_image".to_string(), true)
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
            let truncated = if text.len() > 5000 { format!("{}...(gekuerzt)", &text[..5000]) } else { text };
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