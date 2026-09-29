#!/usr/bin/env bash
# Production deploy, run on the server by .github/workflows/deploy.yml (or by hand for a rollback).
#
#   ./deploy.sh <image-tag> <image-prefix>
#   rollback:  ./deploy.sh "$(cat .previous_tag)" "$(cat .image_prefix)"
#
# Steps: pull images -> back up Postgres (keeps 14) -> apply migrations -> restart -> wait for
# healthchecks. If the new version is unhealthy, the previous images are started again and the
# script fails, so production is never left broken.

cd "$(dirname "$0")"
source ./common.sh

TAG="${1:?usage: deploy.sh <image-tag> <image-prefix>}"
PREFIX="${2:?usage: deploy.sh <image-tag> <image-prefix>}"

[[ -f .env ]] || fail ".env is missing in $(pwd) (see docs/deploy.md)"
set -a
# shellcheck disable=SC1091
source ./.env
set +a
[[ -n "${DOMAIN:-}" && -n "${POSTGRES_PASSWORD:-}" ]] || fail ".env must define DOMAIN and POSTGRES_PASSWORD"

PROJECT=mycelium
ENV_FILE=.env
COMPOSE_FILES=(docker-compose.yml docker-compose.prod.yml)
export IMAGE_PREFIX="$PREFIX" IMAGE_TAG="$TAG" SITE_ADDRESS="$DOMAIN" EDGE_ALIAS=mycelium-prod-web

take_lock .deploy.lock
mkdir -p sites backups
ensure_edge_network
PREVIOUS_TAG="$(cat .current_tag 2>/dev/null || true)"

log "Deploying $TAG (previous: ${PREVIOUS_TAG:-none})"
dc pull --quiet

if [[ -n "$(dc ps -q postgres 2>/dev/null)" ]]; then
  backup="backups/mycelium-$(date -u +%Y%m%dT%H%M%SZ)-${PREVIOUS_TAG:0:12}.sql.gz"
  log "Backing up Postgres to $backup"
  dc exec -T postgres pg_dump -U mycelium -d mycelium | gzip > "$backup.tmp"
  mv "$backup.tmp" "$backup"
  # Keep the 14 most recent backups.
  # shellcheck disable=SC2012 # backup names are generated above, ls is safe here
  ls -1t backups/*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
fi

dc up -d --wait postgres redis
run_migrations

log "Starting the new version"
if ! start_stack 120; then
  show_logs
  if [[ -n "$PREVIOUS_TAG" ]]; then
    log "New version unhealthy: restarting previous version $PREVIOUS_TAG"
    export IMAGE_TAG="$PREVIOUS_TAG"
    start_stack 120 || show_logs
  fi
  fail "deploy of $TAG failed healthchecks"
fi

if [[ -n "$PREVIOUS_TAG" && "$PREVIOUS_TAG" != "$TAG" ]]; then
  echo "$PREVIOUS_TAG" > .previous_tag
fi
echo "$TAG" > .current_tag
echo "$PREFIX" > .image_prefix
docker image prune -f >/dev/null || true

log "Deploy OK: $TAG is live on https://$DOMAIN"
