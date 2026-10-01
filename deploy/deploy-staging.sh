#!/usr/bin/env bash
# Staging deploy, run on the server by .github/workflows/deploy-staging.yml.
#
#   ./deploy-staging.sh <slot> <image-tag> <image-prefix> <reset_db: yes|no>
#
# Each slot is its own compose project (mycelium-staging-<slot>) with its own database, Redis and
# secrets, generated here on first use (nothing is copied from production). The prod Caddy routes
# <slot>.<STAGING_BASE_DOMAIN> to it when STAGING_BASE_DOMAIN is set in the production .env.

cd "$(dirname "$0")"
source ./common.sh

SLOT="${1:?usage: deploy-staging.sh <slot> <tag> <prefix> <reset_db>}"
TAG="${2:?}"
PREFIX="${3:?}"
RESET_DB="${4:-no}"

[[ "$SLOT" =~ ^[a-z0-9]{1,12}$ ]] || fail "invalid slot '$SLOT'"

PROJECT="mycelium-staging-$SLOT"
ENV_FILE=".env.staging-$SLOT"
COMPOSE_FILES=(docker-compose.yml)
[[ "$PROJECT" != "mycelium" ]] || fail "refusing to touch the production project"

if [[ ! -f "$ENV_FILE" ]]; then
  log "Generating secrets for staging slot $SLOT"
  (
    umask 077
    printf 'POSTGRES_PASSWORD=%s\nJWT_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > "$ENV_FILE"
  )
fi

export IMAGE_PREFIX="$PREFIX" IMAGE_TAG="$TAG" SITE_ADDRESS=":80" EDGE_ALIAS="mycelium-staging-$SLOT-web"
# M9: staging gets the hidden admin page (test forests, for the accounts of ADMIN_NAMES).
export DEPLOY_ENV=staging

take_lock ".deploy-staging-$SLOT.lock"
mkdir -p sites
ensure_edge_network

if [[ "$RESET_DB" == "yes" ]]; then
  log "Resetting staging slot $SLOT (database and Redis volumes of $PROJECT only)"
  dc down -v --remove-orphans
fi

log "Deploying $TAG to staging slot $SLOT"
dc pull --quiet
dc up -d --wait postgres redis
run_migrations
if ! start_stack 120; then
  show_logs
  fail "staging deploy of $TAG failed healthchecks"
fi

# Route <slot>.<STAGING_BASE_DOMAIN> through the production Caddy.
BASE_DOMAIN="$(grep -E '^STAGING_BASE_DOMAIN=' .env 2>/dev/null | cut -d= -f2- || true)"
if [[ -n "$BASE_DOMAIN" ]]; then
  printf '%s.%s {\n\treverse_proxy %s:80\n}\n' "$SLOT" "$BASE_DOMAIN" "$EDGE_ALIAS" > "sites/staging-$SLOT.caddy"
  prod_web="$(docker ps -q -f label=com.docker.compose.project=mycelium -f label=com.docker.compose.service=web)"
  if [[ -n "$prod_web" ]]; then
    docker exec "$prod_web" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
    log "Staging slot $SLOT live on https://$SLOT.$BASE_DOMAIN"
  else
    log "Production is not running yet: the route will be active after the first prod deploy"
  fi
else
  log "STAGING_BASE_DOMAIN not set in .env: slot $SLOT runs but has no public URL"
fi
