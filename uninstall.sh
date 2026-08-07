#!/usr/bin/env bash
# Remove QuickSnap from the current user's GNOME Shell extension directory.
set -euo pipefail

UUID="quicksnap@snowtimswiss.github.io"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

gnome-extensions disable "$UUID" 2>/dev/null || true
rm -rf "$DEST"

echo "Removed $UUID"
