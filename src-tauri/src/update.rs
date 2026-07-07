// Titan Toti — Auto-Updater Modul
// Prueft GitHub Releases auf neue Versionen und laedt die DMG herunter.
// Simpler HTTP-Checker — KEINE Backticks, KEINE Tauri-Updater-Signatur noetig.
// Repo: TitoPrausee/titan-toti-app

use serde::{Deserialize, Serialize};
use std::time::Duration;

const GITHUB_API: &str = "https://api.github.com/repos/TitoPrausee/titan-toti-app/releases/latest";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub update_available: bool,
    pub latest_version: String,
    pub current_version: String,
    pub release_notes: String,
    pub dmg_url: String,
    pub release_url: String,
    pub release_date: String,
}

#[derive(Deserialize)]
struct GitHubAsset {
    browser_download_url: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: Option<String>,
    body: Option<String>,
    html_url: Option<String>,
    published_at: Option<String>,
    assets: Option<Vec<GitHubAsset>>,
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("TitanToti-Updater/1.0")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Vergleicht zwei Semver-Strings (z.B. "1.0.0" vs "1.2.0").
/// Gibt true zurueck wenn remote > local.
pub fn is_newer_version(local: &str, remote: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.trim()
            .trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.split('-').next().unwrap_or("").parse::<u64>().ok())
            .collect()
    };
    let l = parse(local);
    let r = parse(remote);
    for i in 0..l.len().max(r.len()) {
        let li = l.get(i).unwrap_or(&0);
        let ri = r.get(i).unwrap_or(&0);
        if ri > li {
            return true;
        }
        if ri < li {
            return false;
        }
    }
    false
}

/// Prueft GitHub auf das neueste Release.
/// Gibt JSON-String mit Update-Info zurueck.
#[tauri::command]
pub async fn check_github_release() -> Result<String, String> {
    let resp = http_client()
        .get(GITHUB_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("GitHub API Fehler: {}", e))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Response Lesefehler: {}", e))?;

    if !status.is_success() {
        return Err(format!("GitHub API Status {}: {}", status.as_u16(), body));
    }

    let release: GitHubRelease =
        serde_json::from_str(&body).map_err(|e| format!("JSON Parse Fehler: {}", e))?;

    let tag = release.tag_name.unwrap_or_default();
    let remote_version = tag.trim_start_matches('v').to_string();
    let release_notes = release.body.unwrap_or_default();
    let release_url = release.html_url.unwrap_or_default();
    let release_date = release.published_at.unwrap_or_default();

    // DMG URL aus Assets suchen
    let mut dmg_url = String::new();
    if let Some(assets) = release.assets {
        for asset in assets {
            let url = asset.browser_download_url.unwrap_or_default();
            let name = asset.name.unwrap_or_default();
            if name.ends_with(".dmg") && !url.is_empty() {
                dmg_url = url;
            }
        }
    }
    // Fallback: konstruiere URL
    if dmg_url.is_empty() && !remote_version.is_empty() {
        dmg_url = format!(
            "https://github.com/TitoPrausee/titan-toti-app/releases/download/v{}/TitanToti-v{}.dmg",
            remote_version, remote_version
        );
    }

    let update_available = is_newer_version(APP_VERSION, &remote_version);

    let info = UpdateInfo {
        update_available,
        latest_version: remote_version,
        current_version: APP_VERSION.to_string(),
        release_notes,
        dmg_url,
        release_url,
        release_date,
    };

    serde_json::to_string(&info).map_err(|e| format!("Serialize Fehler: {}", e))
}

/// Laedt die DMG von der gegebenen URL nach /tmp/TitanToti-Update.dmg herunter.
/// Gibt den Pfad zurueck.
#[tauri::command]
pub async fn download_update(url: String) -> Result<String, String> {
    let dest = "/tmp/TitanToti-Update.dmg";
    let resp = http_client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download Fehler: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download Status {}", resp.status().as_u16()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Bytes Lesefehler: {}", e))?;

    tokio::fs::write(dest, &bytes)
        .await
        .map_err(|e| format!("Datei Schreibfehler: {}", e))?;

    Ok(dest.to_string())
}

/// Oeffnet die heruntergeladene DMG (Installer wird gestartet).
#[tauri::command]
pub async fn install_update() -> Result<bool, String> {
    let dest = "/tmp/TitanToti-Update.dmg";
    if !std::path::Path::new(dest).exists() {
        return Err("DMG nicht gefunden. Bitte zuerst herunterladen.".into());
    }
    tokio::process::Command::new("open")
        .arg(dest)
        .spawn()
        .map_err(|e| format!("Oeffnen fehlgeschlagen: {}", e))?;
    Ok(true)
}