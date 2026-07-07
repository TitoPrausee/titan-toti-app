# Titan Toti — macOS Desktop-App

Native macOS Desktop-App für Titan-Toti, gebaut mit Tauri 2 (Rust + Vanilla JS).

## Funktionen

- **Chat**: Vollständiger Chat mit Titan-Toti, Markdown-Rendering, Code-Blöcke, persistente Historie
- **Memory**: Memory-Einträge durchsuchen und anzeigen
- **Skills**: Verfügbare Skills im Grid durchsuchen
- **Einstellungen**: Server-URL, Invite-Code, Modell, Temperatur, Max Tokens, Theme
- **DSGVO**: Daten exportieren und löschen (Art. 20 & 17)
- **Status-Indicator**: Online/Offline-Status von Titan-Toti in Echtzeit

## Voraussetzungen

- macOS 12.0+ (Apple Silicon ARM64)
- Rust/Cargo
- Xcode Command Line Tools

## Build

```bash
cd ~/titan-toti-app
cargo tauri build
```

Output: `src-tauri/target/release/bundle/macos/Titan Toti.app`

## Konfiguration

- Default Server-URL: `http://localhost:8460`
- Invite-Codes werden in den Einstellungen eingegeben
- Chat-Historie wird in localStorage gespeichert (persistiert nach Neustart)

## Architektur

- **Backend**: Rust (Tauri 2 Commands, reqwest für HTTP-Calls)
- **Frontend**: Vanilla HTML/CSS/JS (keine Frameworks)
- **Bundle**: .app + .dmg für macOS ARM64

## Lizenz

TitoPrausee © 2026