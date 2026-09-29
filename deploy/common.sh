#!/usr/bin/env bash
# Helpers shared by deploy.sh and deploy-staging.sh. Sourced, not executed.
# Callers set: PROJECT (compose project), ENV_FILE, COMPOSE_FILES (array), and export
# IMAGE_PREFIX, IMAGE_TAG, SITE_ADDRESS, EDGE_ALIAS.

set -euo pipefail

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

dc() {
  local args=(-p "$PROJECT" --env-file "$ENV_FILE")
  local f
  for f in "${COMPOSE_FILES[@]}"; do args+=(-f "$f"); done
  docker compose "${args[@]}" "$@"
}

ensure_edge_network() {
  docker network inspect mycelium-edge >/dev/null 2>&1 || docker network create mycelium-edge >/dev/null
}

# Holds a lock for the rest of the script so two deploys of the same stack never overlap.
take_lock() {
  exec 9>"$1"
  flock -n 9 || fail "another deploy of $PROJECT is already running"
}

run_migrations() {
  log "Applying pending migrations"
  dc run --rm --no-deps -T server node dist/migrate.js
}

show_logs() {
  echo "----- last logs -----" >&2
  dc ps >&2 || true
  dc logs --no-color --tail 150 server web >&2 || true
}

# Starts the whole stack and waits for every healthcheck (server /api/health, postgres, redis).
start_stack() {
  dc up -d --remove-orphans --wait --wait-timeout "${1:-120}"
}
