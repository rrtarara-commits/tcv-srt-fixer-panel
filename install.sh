#!/usr/bin/env bash
# =========================================================================
# TCV SRT Fixer - macOS / Linux CEP Extension Installer
# =========================================================================

set -e

echo "--------------------------------------------------------"
echo "Installing TCV SRT Fixer Panel for Adobe Premiere Pro..."
echo "--------------------------------------------------------"

EXTENSION_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.tcv.srtfixer"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure target CEP directory exists
mkdir -p "$EXTENSION_DIR"

# Copy panel files
echo "Copying files to: $EXTENSION_DIR"
cp -R "$SRC_DIR/CSXS" "$EXTENSION_DIR/"
cp -R "$SRC_DIR/css" "$EXTENSION_DIR/"
cp -R "$SRC_DIR/js" "$EXTENSION_DIR/"
cp -R "$SRC_DIR/jsx" "$EXTENSION_DIR/"
cp "$SRC_DIR/index.html" "$EXTENSION_DIR/"
cp "$SRC_DIR/.debug" "$EXTENSION_DIR/"

# Enable PlayerDebugMode for unsigned extensions across CEP versions (Premiere Pro 2020 through 2027+)
echo "Enabling CEP PlayerDebugMode for CSXS 9 through 20..."
for v in {9..20}; do
    defaults write com.adobe.CSXS.$v PlayerDebugMode 1 2>/dev/null || true
done

echo "--------------------------------------------------------"
echo "Installation Complete!"
echo "Compatible with Adobe Premiere Pro 2024, 2025, 2026, 2027+"
echo "Restart Premiere Pro, then open:"
echo "Window > Extensions > TCV SRT Fixer"
echo "--------------------------------------------------------"

