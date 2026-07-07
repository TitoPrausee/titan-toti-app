#!/bin/bash
# Titan Toti — GitHub Release Script
# Erstellt ein GitHub Release, laedt DMG, .app.zip und latest.json hoch.
# KEINE Backticks. Repo: TitoPrausee/titan-toti-app

set -e

# --- KONFIGURATION ---
REPO="TitoPrausee/titan-toti-app"
TOKEN="${GITHUB_TOKEN:-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}"
APP_NAME="Titan Toti"
DMG_NAME="TitanToti"

# --- REPO PFAD ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

# --- VERSION AUS tauri.conf.json LESEN ---
VERSION=$(python3 -c "
import json
with open('src-tauri/tauri.conf.json') as f:
    data = json.load(f)
print(data.get('version', ''))
" 2>/dev/null)

if [ -z "$VERSION" ]; then
  VERSION=$(grep '^version' src-tauri/Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
fi

if [ -z "$VERSION" ]; then
  echo "FEHLER: Version nicht gefunden in tauri.conf.json oder Cargo.toml"
  exit 1
fi

echo "=== Titan Toti Release v$VERSION ==="

# --- RELEASE NOTES ---
RELEASE_NOTES="Titan Toti v$VERSION

Neueste Version der Titan Toti Desktop-App fuer macOS.

Download:
- $DMG_NAME-v$VERSION.dmg  (macOS ARM64 Disk Image)
- $DMG_NAME-v$VERSION.app.zip  (App-Bundle als ZIP)

Installation:
1. DMG herunterladen
2. Titan Toti in den Programme-Ordner ziehen
3. App starten

System: macOS 12.0+ (Apple Silicon / ARM64)"

# --- BUILD OUTPUT PFADE ---
DMG_PATH="src-tauri/target/release/bundle/dmg/${DMG_NAME}_${VERSION}_aarch64.dmg"
# Tauri benennt die DMG evtl. anders — suche nach erstem .dmg
if [ ! -f "$DMG_PATH" ]; then
  DMG_PATH=$(ls src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1)
fi

APP_PATH="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
APP_ZIP="/tmp/${DMG_NAME}-v${VERSION}.app.zip"

# --- PRUEFE OB DMG EXISTIERT ---
if [ -z "$DMG_PATH" ] || [ ! -f "$DMG_PATH" ]; then
  echo "WARNUNG: DMG nicht gefunden unter $DMG_PATH"
  echo "Suche nach beliebiger DMG..."
  DMG_PATH=$(find src-tauri/target/release/bundle -name "*.dmg" 2>/dev/null | head -1)
  if [ -z "$DMG_PATH" ]; then
    echo "FEHLER: Keine DMG gefunden. Bitte erst 'cargo tauri build' ausfuehren."
    exit 1
  fi
fi

echo "DMG gefunden: $DMG_PATH"
echo "App gefunden: $APP_PATH"

# --- .APP ALS ZIP PACKEN ---
if [ -d "$APP_PATH" ]; then
  echo "Erstelle ZIP der App..."
  cd "$(dirname "$APP_PATH")"
  zip -r -q "$APP_ZIP" "$(basename "$APP_PATH")"
  cd "$REPO_DIR"
  echo "ZIP erstellt: $APP_ZIP"
else
  echo "WARNUNG: .app nicht gefunden, ueberspringe ZIP"
fi

# --- ALTES RELEASE LOESCHEN (falls vorhanden) ---
echo "Pruefe auf existierendes Release v$VERSION..."
OLD_RELEASE_ID=$(curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$REPO/releases/tags/v$VERSION" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

if [ -n "$OLD_RELEASE_ID" ] && [ "$OLD_RELEASE_ID" != "" ]; then
  echo "Loesche altes Release v$VERSION (ID: $OLD_RELEASE_ID)..."
  curl -s -X DELETE -H "Authorization: tag $TOKEN" \
    "https://api.github.com/repos/$REPO/releases/$OLD_RELEASE_ID" || true
  # Tag loeschen
  curl -s -X DELETE -H "Authorization: token $TOKEN" \
    "https://api.github.com/repos/$REPO/git/refs/tags/v$VERSION" || true
  sleep 2
fi

# --- GITHUB RELEASE ERSTELLEN ---
echo "Erstelle GitHub Release v$VERSION..."
RELEASE_RESPONSE=$(curl -s -X POST \
  "https://api.github.com/repos/$REPO/releases" \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"tag_name\": \"v$VERSION\",
    \"name\": \"Titan Toti v$VERSION\",
    \"body\": $(echo "$RELEASE_NOTES" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"),
    \"draft\": false,
    \"prerelease\": false
  }")

RELEASE_ID=$(echo "$RELEASE_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

if [ -z "$RELEASE_ID" ] || [ "$RELEASE_ID" = "" ]; then
  echo "FEHLER: Release konnte nicht erstellt werden."
  echo "Response: $RELEASE_RESPONSE"
  exit 1
fi

echo "Release erstellt. ID: $RELEASE_ID"

# --- DMG HOCHLADEN ---
DMG_UPLOAD_NAME="${DMG_NAME}-v${VERSION}.dmg"
echo "Lade DMG hoch: $DMG_UPLOAD_NAME..."
DMG_RESULT=$(curl -s -X POST \
  "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$DMG_UPLOAD_NAME" \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"$DMG_PATH")
echo "DMG hochgeladen: $(echo "$DMG_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('browser_download_url','FEHLER'))" 2>/dev/null)"

# --- .APP.ZIP HOCHLADEN ---
if [ -f "$APP_ZIP" ]; then
  ZIP_UPLOAD_NAME="${DMG_NAME}-v${VERSION}.app.zip"
  echo "Lade App-ZIP hoch: $ZIP_UPLOAD_NAME..."
  ZIP_RESULT=$(curl -s -X POST \
    "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$ZIP_UPLOAD_NAME" \
    -H "Authorization: token $TOKEN" \
    -H "Content-Type: application/zip" \
    --data-binary @"$APP_ZIP")
  echo "ZIP hochgeladen: $(echo "$ZIP_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('browser_download_url','FEHLER'))" 2>/dev/null)"
fi

# --- latest.json ERSTELLEN UND HOCHLADEN ---
DMG_URL="https://github.com/$REPO/releases/download/v$VERSION/$DMG_UPLOAD_NAME"
RELEASE_URL="https://github.com/$REPO/releases/tag/v$VERSION"
RELEASE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Erstelle latest.json..."
cat > /tmp/latest.json <<JSONEOF
{
  "version": "$VERSION",
  "release_url": "$RELEASE_URL",
  "dmg_url": "$DMG_URL",
  "release_notes": "Titan Toti v$VERSION — Neueste Version fuer macOS ARM64.",
  "release_date": "$RELEASE_DATE"
}
JSONEOF

echo "Lade latest.json hoch..."
JSON_RESULT=$(curl -s -X POST \
  "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=latest.json" \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/latest.json)
echo "latest.json hochgeladen: $(echo "$JSON_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('browser_download_url','FEHLER'))" 2>/dev/null)"

# --- VERIFIKATION ---
echo ""
echo "=== VERIFIKATION ==="
echo "Release URL: https://github.com/$REPO/releases/tag/v$VERSION"
echo "Direct DMG:   $DMG_URL"
echo "Latest JSON:  https://github.com/$REPO/releases/download/v$VERSION/latest.json"
echo ""
echo "Pruefe Release via API..."
curl -s "https://api.github.com/repos/$REPO/releases/latest" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Tag:', d.get('tag_name',''))
print('Name:', d.get('name',''))
print('Assets:')
for a in d.get('assets', []):
    print(' -', a.get('name',''), '->', a.get('browser_download_url',''))
"

echo ""
echo "=== Release v$VERSION erfolgreich erstellt ==="