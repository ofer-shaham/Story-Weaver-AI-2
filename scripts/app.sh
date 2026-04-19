#!/usr/bin/env bash
# Usage: scripts/app.sh {status|start|stop|restart}
#
# Manages the Story Together app (backend on :8080, frontend on :26135).
# Works whether the app was started by Replit workflows or by this script.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/.pids"
BACKEND_LOG="$ROOT/artifacts/api-server/logs/server.log"
CLIENT_LOG="$ROOT/artifacts/story-app/logs/client.log"
BACKEND_PORT=8080
FRONTEND_PORT=26135

# ── helpers ──────────────────────────────────────────────────────────────────

# Returns 0 if a TCP port is accepting connections
port_up() {
  (echo >/dev/tcp/localhost/"$1") 2>/dev/null
}

# Find PID(s) listening on a port via /proc/net/tcp + /proc/*/fd symlinks
pids_on_port() {
  local port_hex
  port_hex=$(printf '%04X' "$1")

  # Collect socket inodes for the port (state 0A = LISTEN)
  local inodes
  inodes=$(awk -v p="${port_hex^^}" '
    NR>1 && $4=="0A" {
      n=split($2,a,":"); if (toupper(a[n])==p) print $10
    }
  ' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u)

  [[ -z "$inodes" ]] && return 0

  # Build a grep pattern from the inodes: socket:[123|456|...]
  local pattern
  pattern="socket:\[($(printf '%s' "$inodes" | tr '\n' '|' | sed 's/|$//') )\]"
  pattern="socket:\[$(printf '%s' "$inodes" | tr '\n' '|' | sed 's/|$//')\]"

  # Scan each process's open fds for a matching socket inode
  local pid
  for pid in $(ls /proc | grep -E '^[0-9]+$'); do
    local fddir="/proc/$pid/fd"
    [[ -d "$fddir" ]] || continue
    # Read symlinks in the fd directory
    if ls -la "$fddir" 2>/dev/null | grep -qE "$pattern"; then
      echo "$pid"
    fi
  done
}

pid_alive() {
  [[ -f "$1" ]] && kill -0 "$(cat "$1")" 2>/dev/null
}

# ── status ───────────────────────────────────────────────────────────────────

cmd_status() {
  local all_up=true

  echo ""
  echo "  Story Together — service status"
  echo "  ─────────────────────────────────"

  for entry in "Backend:$BACKEND_PORT" "Frontend:$FRONTEND_PORT"; do
    local label="${entry%%:*}"
    local port="${entry##*:}"

    if port_up "$port"; then
      local pid
      pid=$(pids_on_port "$port" | head -1)
      printf "  %-12s \033[32mRUNNING\033[0m  port %-6s" "$label" "$port"
      [[ -n "${pid:-}" ]] && printf " pid %s" "$pid"
      printf "\n"
    else
      printf "  %-12s \033[31mSTOPPED\033[0m\n" "$label"
      all_up=false
    fi
  done

  echo ""

  if $all_up; then
    echo "  Backend log:   $BACKEND_LOG"
    echo "  Frontend log:  $CLIENT_LOG"
    echo ""
    return 0
  else
    return 1
  fi
}

# ── start ────────────────────────────────────────────────────────────────────

cmd_start() {
  if port_up $BACKEND_PORT && port_up $FRONTEND_PORT; then
    echo "App is already running."
    cmd_status
    return 0
  fi

  mkdir -p "$PID_DIR" \
           "$ROOT/artifacts/api-server/logs" \
           "$ROOT/artifacts/story-app/logs"

  if ! port_up $BACKEND_PORT; then
    echo "Starting backend on port $BACKEND_PORT…"
    (
      cd "$ROOT"
      PORT=$BACKEND_PORT pnpm --filter @workspace/api-server run dev \
        >> "$BACKEND_LOG" 2>&1
    ) &
    echo $! > "$PID_DIR/backend.pid"
  else
    echo "Backend already running, skipping."
  fi

  if ! port_up $FRONTEND_PORT; then
    echo "Starting frontend on port $FRONTEND_PORT…"
    (
      cd "$ROOT"
      PORT=$FRONTEND_PORT BASE_PATH=/ \
        pnpm --filter @workspace/story-app run dev \
        >> "$CLIENT_LOG" 2>&1
    ) &
    echo $! > "$PID_DIR/frontend.pid"
  else
    echo "Frontend already running, skipping."
  fi

  echo "Waiting for services to come up…"
  for i in $(seq 1 60); do
    sleep 1
    if port_up $BACKEND_PORT && port_up $FRONTEND_PORT; then
      echo "Done."
      cmd_status
      return 0
    fi
    [[ $((i % 10)) -eq 0 ]] && echo "  still waiting… (${i}s)"
  done

  echo "ERROR: timed out waiting for services." >&2
  cmd_status || true
  return 1
}

# ── stop ─────────────────────────────────────────────────────────────────────

cmd_stop() {
  local killed=false

  # Kill by saved PID files first
  for label in backend frontend; do
    local pidfile="$PID_DIR/${label}.pid"
    if pid_alive "$pidfile"; then
      local pid
      pid=$(cat "$pidfile")
      kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      echo "  Stopped $label (pid $pid)"
      killed=true
    fi
    rm -f "$pidfile" 2>/dev/null || true
  done

  # Also kill anything still holding the ports (covers Replit-started workflows)
  for port in $BACKEND_PORT $FRONTEND_PORT; do
    for pid in $(pids_on_port "$port"); do
      if kill "$pid" 2>/dev/null; then
        echo "  Killed pid $pid (was on port $port)"
        killed=true
      fi
    done
  done

  $killed || echo "  Nothing was running."

  sleep 1

  echo ""
  cmd_status || true
}

# ── dispatch ─────────────────────────────────────────────────────────────────

case "${1:-help}" in
  status)
    cmd_status
    ;;
  start)
    cmd_start
    ;;
  stop)
    cmd_stop
    ;;
  restart)
    cmd_stop
    echo ""
    cmd_start
    ;;
  help|--help|-h)
    echo ""
    echo "  Usage: scripts/app.sh {status|start|stop|restart}"
    echo ""
    echo "  status   — show whether backend and frontend are running"
    echo "  start    — start both services in the background"
    echo "  stop     — stop both services (by PID file or by port)"
    echo "  restart  — stop then start"
    echo ""
    echo "  Log files:"
    echo "    Backend   $BACKEND_LOG"
    echo "    Frontend  $CLIENT_LOG"
    echo ""
    ;;
  *)
    echo "Unknown command: $1  (try: status | start | stop | restart)" >&2
    exit 1
    ;;
esac
