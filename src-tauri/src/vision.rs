// Titan Toti — Vision System (Ollama API mit images field)
// KEINE Backticks in diesem File

use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone, Debug)]
struct OllamaChatMessage {
    role: String,
    content: String,
    images: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct OllamaVisionRequest {
    model: String,
    messages: Vec<OllamaChatMessage>,
    stream: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct OllamaVisionResponse {
    message: Option<OllamaChatMessage>,
    response: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct OllamaTagsResponse {
    models: Vec<TagModel>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct TagModel {
    name: String,
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn http_client_short() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Bekannte Vision-Modell-Patterns
fn is_vision_model(name: &str) -> bool {
    let n = name.to_lowercase();
    n.contains("llava") ||
    n.contains("llama3.2-vision") ||
    n.contains("llama3.2:11b-vision") ||
    n.contains("glm-4v") ||
    n.contains("qwen2.5-vl") ||
    n.contains("qwen2-vl") ||
    n.contains("minicpm-v") ||
    n.contains("moondream") ||
    n.contains("bakllava") ||
    n.contains("llama3.1-vision") ||
    n.contains("vision") ||
    n.contains("v1.6") ||
    n.contains("vl") ||
    n.contains("pixtral") ||
    n.contains("cogvlm") ||
    n.contains("fuyu")
}

/// Laedt ein Bild als Base64.
fn load_image_base64(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Bild nicht lesbar: {}", e))?;
    Ok(B64.encode(&bytes))
}

/// Analysiert ein Bild mit dem verbundenen Modell via Ollama API.
pub async fn analyze_image(
    image_path: String,
    question: String,
    api_url: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    // Bild laden
    let base64_img = load_image_base64(&image_path)?;

    // Ollama API: POST /api/chat mit images field
    let url = format!("{}/api/chat", api_url.trim_end_matches('/'));
    let client = http_client();

    let body = OllamaVisionRequest {
        model: model.clone(),
        messages: vec![OllamaChatMessage {
            role: "user".to_string(),
            content: if question.is_empty() {
                "Beschreibe dieses Bild im Detail.".to_string()
            } else {
                question
            },
            images: Some(vec![base64_img]),
        }],
        stream: false,
    };

    let mut req = client.post(&url).json(&body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req.send().await.map_err(|e| format!("Verbindungsfehler: {}", e))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        // Pruefen ob es ein Modell-Fehler ist (kein Vision)
        if text.contains("image") || text.contains("vision") || text.contains("does not support") {
            return Ok(serde_json::json!({
                "error": "Modell unterstuetzt keine Bildverarbeitung. Nutze ein Vision-Modell wie llava oder llama3.2-vision.",
                "model": model
            }).to_string());
        }
        return Err(format!("HTTP {} - {}", status.as_u16(), &text[..text.len().min(300)]));
    }

    // Response parsen
    let parsed: Result<OllamaVisionResponse, _> = serde_json::from_str(&text);
    let analysis = match parsed {
        Ok(p) => {
            if let Some(msg) = p.message {
                msg.content
            } else if let Some(resp) = p.response {
                resp
            } else {
                // Fallback: raw JSON durchsuchen
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                    v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str())
                        .or_else(|| v.get("response").and_then(|c| c.as_str()))
                        .unwrap_or("").to_string()
                } else {
                    String::new()
                }
            }
        }
        Err(_) => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str())
                    .or_else(|| v.get("response").and_then(|c| c.as_str()))
                    .unwrap_or("").to_string()
            } else {
                text.clone()
            }
        }
    };

    // Pruefen ob Fehler im Inhalt
    if analysis.contains("does not support") || analysis.contains("no image") {
        return Ok(serde_json::json!({
            "error": "Modell unterstuetzt keine Bildverarbeitung. Nutze ein Vision-Modell wie llava oder llama3.2-vision.",
            "model": model
        }).to_string());
    }

    Ok(serde_json::json!({
        "analysis": analysis,
        "model": model
    }).to_string())
}

/// Macht einen Screenshot und analysiert ihn.
pub async fn analyze_screenshot(
    question: String,
    api_url: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    let screenshot_path = "/tmp/titan_screenshot.png";

    // Screenshot machen
    let output = tokio::process::Command::new("screencapture")
        .arg(screenshot_path)
        .output()
        .await
        .map_err(|e| format!("Screenshot-Fehler: {}", e))?;

    if !output.status.success() {
        return Err("Screenshot konnte nicht erstellt werden".to_string());
    }

    analyze_image(screenshot_path.to_string(), question, api_url, api_key, model).await
}

/// Listet verfuegbare Vision-Modelle von der Ollama API.
pub async fn list_vision_models(api_url: String, api_key: String) -> Result<String, String> {
    let base = api_url.trim_end_matches('/');
    let client = http_client_short();

    // GET /api/tags
    let url = format!("{}/api/tags", base);
    let mut req = client.get(&url);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req.send().await.map_err(|e| format!("Verbindungsfehler: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    let text = resp.text().await.unwrap_or_default();
    let parsed: Result<OllamaTagsResponse, _> = serde_json::from_str(&text);

    let all_models: Vec<String> = match parsed {
        Ok(p) => p.models.into_iter().map(|m| m.name).collect(),
        Err(_) => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(arr) = v.get("models").and_then(|m| m.as_array()) {
                    arr.iter().filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())).collect()
                } else {
                    Vec::new()
                }
            } else {
                Vec::new()
            }
        }
    };

    let vision_models: Vec<String> = all_models.into_iter()
        .filter(|m| is_vision_model(m))
        .collect();

    Ok(serde_json::json!({
        "vision_models": vision_models,
        "total": vision_models.len()
    }).to_string())
}