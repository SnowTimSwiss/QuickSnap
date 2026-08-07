#!/usr/bin/env bash
# Build the zip that extensions.gnome.org expects, into dist/.
set -euo pipefail

UUID="quicksnap@snowtimswiss.github.io"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/src/$UUID"
OUT="$ROOT/dist"

mkdir -p "$OUT"
gnome-extensions pack --force --out-dir="$OUT" "$SRC"

echo
echo "Built $OUT/$UUID.shell-extension.zip"
unzip -l "$OUT/$UUID.shell-extension.zip"
