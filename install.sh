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

# Enable PlayerDebugMode for unsigned extensions across CEP versions
echo "Enabling CEP PlayerDebugMode..."
defaults write com.adobe.CSXS.9 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.10 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.11 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.12 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.13 PlayerDebugMode 1 2>/dev/null || true

echo "--------------------------------------------------------"
echo "Installation Complete!"
echo "Restart Premiere Pro, then open:"
echo "Window > Extensions > TCV SRT Fixer"
echo "--------------------------------------------------------"
