#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
PIDFILE="$ROOT/.server.pid"
LOGFILE="$ROOT/.server.log"

start() {
  # Stoppa en äldre instans innan den nya servern körs i förgrunden.
  local old_pid=""
  if [[ -f "$PIDFILE" ]]; then
    old_pid="$(cat "$PIDFILE")"
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "Stoppar gammal server (PID $old_pid)..."
      kill "$old_pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$PIDFILE"
  fi
  # Kill any stale node server on the same port (avoid killing Firefox etc.)
  local pids
  pids="$(lsof -ti ":$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  for pid in $pids; do
    if ps -p "$pid" -o comm= 2>/dev/null | grep -qxF node; then
      echo "Stoppar gammal nodprocess (PID $pid) på port $PORT"
      kill "$pid" 2>/dev/null || true
    fi
  done
  sleep 1

  local server_pid=""
  cleanup() {
    if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
      kill "$server_pid" 2>/dev/null || true
      wait "$server_pid" 2>/dev/null || true
    fi
    if [[ -f "$PIDFILE" ]] && [[ "$(cat "$PIDFILE")" == "$server_pid" ]]; then
      rm -f "$PIDFILE"
    fi
  }
  forward_signal() {
    local signal="$1"
    if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
      kill "-$signal" "$server_pid" 2>/dev/null || true
    fi
  }

  trap cleanup EXIT
  trap 'forward_signal INT' INT
  trap 'forward_signal TERM' TERM
  trap 'forward_signal HUP' HUP

  PORT="$PORT" node "$ROOT/server.js" > >(tee "$LOGFILE") 2>&1 &
  server_pid=$!
  echo "$server_pid" > "$PIDFILE"
  echo "Videoeditorn kör på http://localhost:$PORT (PID $server_pid)."
  echo "Låt terminalen vara öppen. Tryck Ctrl+C för att stoppa servern."

  local exit_code=0
  wait "$server_pid" || exit_code=$?
  trap - EXIT INT TERM HUP
  cleanup
  return "$exit_code"
}

stop() {
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    kill "$(cat "$PIDFILE")"
    rm -f "$PIDFILE"
    echo "Servern stoppad."
  else
    echo "Ingen servern körs."
  fi
}

status() {
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Servern kör (PID $(cat "$PIDFILE"))."
  else
    echo "Servern körs inte."
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; sleep 1; start ;;
  status) status ;;
  *) echo "Användning: $0 [start|stop|restart|status]"; exit 1 ;;
esac
