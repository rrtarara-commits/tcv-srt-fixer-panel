#!/usr/bin/env bash
# =========================================================================
# TCV SRT Fixer - 1-Click macOS Installer
# Double-click this file in macOS Finder to install the extension.
# No Terminal commands or technical setup required!
# =========================================================================

set -e

# Navigate to the folder containing this script
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "========================================================"
echo "   Installing TCV SRT Fixer for Adobe Premiere Pro      "
echo "========================================================"
echo ""

EXTENSION_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.tcv.srtfixer"

# Ensure target CEP directory exists
mkdir -p "$EXTENSION_DIR"

# Copy extension files
echo "[1/2] Copying extension files to Adobe CEP folder..."
cp -R "$DIR/CSXS" "$EXTENSION_DIR/"
cp -R "$DIR/css" "$EXTENSION_DIR/"
cp -R "$DIR/js" "$EXTENSION_DIR/"
cp -R "$DIR/jsx" "$EXTENSION_DIR/"
cp "$DIR/index.html" "$EXTENSION_DIR/"
cp "$DIR/.debug" "$EXTENSION_DIR/"

# Enable PlayerDebugMode for CSXS versions 9 through 20 (Premiere Pro 2020 through 2027+)
echo "[2/2] Enabling Premiere Pro compatibility (CSXS 9-20)..."
for v in {9..20}; do
    defaults write com.adobe.CSXS.$v PlayerDebugMode 1 2>/dev/null || true
done

echo ""
echo "========================================================"
echo " [SUCCESS] TCV SRT Fixer installed successfully!"
echo " Compatible with Adobe Premiere Pro 2024, 2025, 2026, 2027+"
echo "========================================================"
echo ""
echo "Next steps:"
echo " 1. Restart Adobe Premiere Pro (quit and reopen)."
echo " 2. In Premiere Pro, open:"
echo "    Window > Extensions > TCV SRT Fixer"
echo " 3. Dock the panel next to your Text panel for easy access!"
echo ""
read -p "Press [Enter] to exit..."
