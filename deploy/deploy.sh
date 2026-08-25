#!/usr/bin/env bash
#
# Deploys the Homexperia Shopify backend on the EC2 host.
#
# Order matters: the database migration runs as a one-off container BEFORE the
# serving container is replaced. If the migration fails the script exits and the
# currently running revision is left untouched.
#
# Touches only resources named for this application. It never prunes, never
# stops unrelated containers, and never modifies the existing Homexperia CMS
# application, its database, Nginx, or PostgreSQL.
#
# Usage (from the application directory, normally /home/sopify/app):
#   ./deploy/deploy.sh <full-ecr-image-ref>
#
# The image is pulled from ECR, not built here — Jenkins builds and pushes it
# once in the "Docker build & push" stage, so what was validated in CI is
# exactly what gets deployed. For a manual/local run, build and push the image
# yourself first, or pass a locally-built tag if you don't need ECR.
#
# Environment:
#   APP_ENV_FILE  runtime env file (default /home/sopify/.config/homexperia-shopify/app.env)
#   HEALTH_URL    health probe (default http://127.0.0.1:3000/healthz)

set -euo pipefail

CONTAINER_NAME="homexperia-shopify-app"
IMAGE="${1:?Usage: deploy.sh <full-ecr-image-ref>}"

APP_ENV_FILE="${APP_ENV_FILE:-/home/sopify/.config/homexperia-shopify/app.env}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/healthz}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_DELAY="${HEALTH_DELAY:-2}"

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$APP_ENV_FILE" ] || fail "Runtime env file not found: $APP_ENV_FILE"

# The env file holds production secrets; refuse to run if it is world/group
# readable rather than silently accepting a weak permission.
PERMS="$(stat -c '%a' "$APP_ENV_FILE")"
case "$PERMS" in
  600|400) ;;
  *) fail "$APP_ENV_FILE has permissions $PERMS; expected 600." ;;
esac

# ---------------------------------------------------------------- pull
# If IMAGE is an ECR reference, log in using this host's own IAM instance
# role (pull-only — it cannot push). aws/docker pick up instance credentials
# automatically; nothing is stored on disk for this.
case "$IMAGE" in
  *.dkr.ecr.*.amazonaws.com/*)
    REGISTRY="${IMAGE%%/*}"
    REGION="$(printf '%s' "$REGISTRY" | cut -d. -f4)"
    log "Authenticating to ECR (${REGISTRY})"
    aws ecr get-login-password --region "$REGION" \
      | docker login --username AWS --password-stdin "$REGISTRY" \
      || fail "ECR login failed."
    ;;
esac

log "Pulling ${IMAGE}"
docker pull "$IMAGE"
docker tag "$IMAGE" "${CONTAINER_NAME}:current"

# ------------------------------------------------------------ migrate
# Host networking so the container can reach PostgreSQL on 127.0.0.1:5432,
# which is the only address it listens on. --rm so nothing is left behind.
log "Running database migrations"
docker run --rm \
  --name "${CONTAINER_NAME}-migrate" \
  --network host \
  --env-file "$APP_ENV_FILE" \
  "$IMAGE" \
  npm run migrate:deploy \
  || fail "Migration failed. The running revision was not replaced."

# ------------------------------------------------------- swap container
# Keep the previous container until the new one is healthy, so a failed rollout
# can be reversed. Renaming rather than removing preserves it for rollback.
PREVIOUS_BACKUP="${CONTAINER_NAME}-previous"
docker rm -f "$PREVIOUS_BACKUP" >/dev/null 2>&1 || true

if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  log "Stopping current container"
  docker stop "$CONTAINER_NAME" >/dev/null
  docker rename "$CONTAINER_NAME" "$PREVIOUS_BACKUP"
fi

log "Starting ${CONTAINER_NAME}"
docker run -d \
  --name "$CONTAINER_NAME" \
  --network host \
  --env-file "$APP_ENV_FILE" \
  --restart unless-stopped \
  "$IMAGE" >/dev/null

# --------------------------------------------------------------- health
log "Waiting for ${HEALTH_URL}"
for attempt in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    log "Healthy after ${attempt} attempt(s)"
    log "Deployed ${IMAGE}"
    log "Roll back with: ./deploy/rollback.sh"
    exit 0
  fi
  sleep "$HEALTH_DELAY"
done

# ------------------------------------------------------------ rollback
log "Health check failed. Recent logs:"
docker logs --tail 50 "$CONTAINER_NAME" 2>&1 || true

log "Restoring previous revision"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
if docker inspect "$PREVIOUS_BACKUP" >/dev/null 2>&1; then
  docker rename "$PREVIOUS_BACKUP" "$CONTAINER_NAME"
  docker start "$CONTAINER_NAME" >/dev/null
  log "Previous revision restored."
else
  log "No previous container to restore."
fi

fail "Deployment failed health check."
