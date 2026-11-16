#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null || ! command -v pkg-config >/dev/null; then
  echo 'Node.js och pkg-config behövs. Installera dem med distributionens pakethanterare.' >&2
  exit 1
fi
if ! pkg-config --exists gtk4 webkitgtk-6.0 || ! /usr/bin/python3 -c 'import gi; gi.require_version("Gtk", "4.0"); gi.require_version("WebKit", "6.0"); from gi.repository import Gtk, WebKit'; then
  echo 'Installera GTK4, WebKitGTK 6.0, Python GI och deras utvecklingspaket med distributionens pakethanterare.' >&2
  exit 1
fi
if [[ ! -d "$ROOT/node_modules/express" || ! -d "$ROOT/node_modules/multer" ]]; then
  echo 'Node-beroenden saknas. Installera projektets beroenden med npm ci och kör install.sh igen.' >&2
  exit 1
fi
exec "$ROOT/start_webui.sh"
