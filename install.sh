#!/usr/bin/env bash
# Install QuickSnap into the current user's GNOME Shell extension directory.
set -euo pipefail

UUID="quicksnap@snowtimswiss.github.io"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/src/$UUID"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

if [[ ! -d "$SRC" ]]; then
    echo "error: extension source not found at $SRC" >&2
    exit 1
fi

for tool in glib-compile-schemas gnome-extensions python3; do
    if ! command -v "$tool" >/dev/null; then
        echo "error: '$tool' is required but not installed" >&2
        exit 1
    fi
done

echo "Installing to $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$SRC/." "$DEST/"

glib-compile-schemas "$DEST/schemas"

if gnome-extensions enable "$UUID" 2>/dev/null; then
    echo "Enabled $UUID"
    echo
    echo "Press Super+Shift+S, drag a rectangle, release. It is on your clipboard."
    exit 0
fi

# GNOME Shell only scans the extension directories when the session starts, so
# a fresh install is invisible to the running shell. Mark it as enabled anyway;
# it then comes up automatically after the next login. Unknown UUIDs in this
# list are simply ignored by the shell, so this is safe either way.
python3 - "$UUID" <<'PY'
import sys
import gi
from gi.repository import Gio

uuid = sys.argv[1]
settings = Gio.Settings.new('org.gnome.shell')
enabled = settings.get_strv('enabled-extensions')
if uuid not in enabled:
    settings.set_strv('enabled-extensions', enabled + [uuid])
    Gio.Settings.sync()
    print(f'Marked {uuid} as enabled for the next session.')
else:
    print(f'{uuid} is already marked as enabled.')
PY

cat <<EOF

The running GNOME Shell cannot pick up a newly installed extension on Wayland.
Log out and back in once; QuickSnap starts with the new session.

Afterwards:
    gnome-extensions info $UUID     # should say State: ACTIVE
    gnome-extensions prefs $UUID    # change the shortcut
EOF
