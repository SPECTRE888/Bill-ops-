#!/bin/bash

clear
echo "╔══════════════════════════════════════╗"
echo "║      Installation de BILL OPS         ║"
echo "╚══════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC="$SCRIPT_DIR/Bill Ops.app"
APP_DEST="/Applications/Bill Ops.app"

if [ ! -d "$APP_SRC" ]; then
  echo "❌ Bill Ops.app introuvable."
  echo "   Assure-toi que Bill Ops.app est dans le même dossier que ce fichier."
  echo ""
  read -p "Appuie sur Entrée pour quitter..."
  exit 1
fi

echo "📦 Installation en cours..."
cp -r "$APP_SRC" "$APP_DEST"

echo "🔓 Autorisation macOS..."
xattr -cr "$APP_DEST"
codesign --force --deep --sign - --timestamp=none "$APP_DEST" 2>/dev/null || true

echo ""
echo "✅ Bill Ops est installé !"
echo "   Lancement en cours..."
echo ""
sleep 1
open "$APP_DEST"
