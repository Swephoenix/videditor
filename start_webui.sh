#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! /usr/bin/python3 -c 'import gi; gi.require_version("Gtk", "4.0"); gi.require_version("WebKit", "6.0"); from gi.repository import Gtk, WebKit' ; then
  echo 'GTK4, WebKitGTK 6.0 eller Python GI saknas. Installera systempaketen och försök igen.' >&2
  exit 1
fi
exec /usr/bin/python3 "$ROOT/gtk_app.py" "$@"
