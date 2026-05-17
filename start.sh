#!/usr/bin/env bash
# Start backend (uvicorn) and frontend (vite) dev servers, each in firejail.
# Logs are written to ./logs/. Ctrl+C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

if ! command -v firejail >/dev/null 2>&1; then
  echo "firejail not found. Install: sudo apt install firejail" >&2
  exit 1
fi

UV_BIN="$(command -v uv || true)"
NPX_BIN="$(command -v npx || true)"
NODE_BIN="$(command -v node || true)"
if [[ -z "$UV_BIN" ]]; then echo "uv not found on PATH" >&2; exit 1; fi
if [[ -z "$NPX_BIN" ]]; then echo "npx not found on PATH" >&2; exit 1; fi

# Minimal sandbox: drop privileges, no new privs, blank /tmp & /dev, restrict
# home view to the project dir. We don't isolate the network because the dev
# servers must be reachable on the host.
FJ_OPTS=(
  --quiet
  --noprofile
  --caps.drop=all
  --nonewprivs
  --nogroups
  --private-tmp
  --private-dev
  --whitelist="$ROOT"
  --whitelist="$HOME/.local"
  --whitelist="$HOME/.cache"
  --whitelist="$HOME/.npm"
)

PIDS=()

cleanup() {
  echo
  echo "Stopping…"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

SANDBOX_PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

echo "Backend  → http://0.0.0.0:8000  (log: $LOGS/backend.log)"
firejail "${FJ_OPTS[@]}" -- \
  env PATH="$SANDBOX_PATH" \
  bash -c "cd '$ROOT/backend' && '$UV_BIN' run uvicorn kicker.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir src" \
  >"$LOGS/backend.log" 2>&1 &
PIDS+=($!)

echo "Frontend → http://0.0.0.0:5173  (log: $LOGS/frontend.log)"
firejail "${FJ_OPTS[@]}" -- \
  env PATH="$SANDBOX_PATH" \
  bash -c "cd '$ROOT/frontend' && '$NPX_BIN' vite --port 5173 --host 0.0.0.0" \
  >"$LOGS/frontend.log" 2>&1 &
PIDS+=($!)

echo
echo "Ctrl+C to stop both."
wait
