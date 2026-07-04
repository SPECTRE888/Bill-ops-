#!/bin/bash
# Bill Ops — Installation automatique macOS
# Usage: curl -sL https://raw.githubusercontent.com/SPECTRE888/Bill-ops-/main/install.sh | bash

set -e

APP_NAME="Bill Ops"
APP_DEST="/Applications/${APP_NAME}.app"
REPO="SPECTRE888/Bill-ops-"
TMP=$(mktemp -d)

clear
echo ""
echo "╔══════════════════════════════════════╗"
echo "║      Installation de BILL OPS         ║"
echo "╚══════════════════════════════════════╝"
echo ""

echo "🔍 Recherche de la dernière version..."
RELEASE_JSON=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest")
VERSION=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')
ZIP_URL=$(echo "$RELEASE_JSON" | grep '"browser_download_url"' | grep 'arm64-mac\.zip"' | grep -v blockmap | head -1 | sed 's/.*"browser_download_url": *"//;s/".*//')

if [ -z "$ZIP_URL" ]; then
  echo "❌ Impossible de trouver la dernière version."
  echo "   Vérifie ta connexion internet."
  rm -rf "$TMP"
  exit 1
fi

echo "📦 Téléchargement de Bill Ops ${VERSION}..."
curl -L --progress-bar -o "${TMP}/BillOps.zip" "$ZIP_URL"

echo "📂 Extraction..."
unzip -q "${TMP}/BillOps.zip" -d "${TMP}/extract"

NEW_APP=$(find "${TMP}/extract" -maxdepth 2 -name "*.app" -type d | head -1)
if [ -z "$NEW_APP" ]; then
  echo "❌ Fichier .app introuvable dans l'archive."
  rm -rf "$TMP"
  exit 1
fi

if pgrep -f "${APP_NAME}" >/dev/null 2>&1; then
  echo "⏳ Fermeture de l'ancienne version..."
  pkill -f "${APP_NAME}" 2>/dev/null || true
  sleep 2
fi

echo "🚀 Installation dans /Applications..."
rm -rf "${APP_DEST}"
cp -R "${NEW_APP}" "${APP_DEST}"

echo "🔓 Autorisation macOS..."
xattr -cr "${APP_DEST}"
codesign --force --deep --sign - --timestamp=none "${APP_DEST}" 2>/dev/null || true

rm -rf "$TMP"

echo ""
echo "✅ Bill Ops ${VERSION} est installé !"
echo ""
sleep 1
open "${APP_DEST}"
