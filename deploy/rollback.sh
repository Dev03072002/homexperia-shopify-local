#!/usr/bin/env bash
#
# Restores the previous Homexperia Shopify backend container, kept by
# deploy.sh as homexperia-shopify-app-previous.
#
# Does NOT roll back database migrations. Prisma migrations are forward-only, so
# if a release contained a destructive schema change, restoring the previous
# image may not be sufficient — check the migration before relying on this.
#
# Touches only this application's containers.

set -euo pipefail

CONTAINER_NAME="homexperia-shopify-app"
PREVIOUS_BACKUP="${CONTAINER_NAME}-previous"

log() { printf '[rollback] %s\n' "$*"; }
fail() { printf '[rollback] ERROR: %s\n' "$*" >&2; exit 1; }

docker inspect "$PREVIOUS_BACKUP" >/dev/null 2>&1 \
  || fail "No previous container ($PREVIOUS_BACKUP) to restore."

log "Removing current container"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

log "Restoring $PREVIOUS_BACKUP"
docker rename "$PREVIOUS_BACKUP" "$CONTAINER_NAME"
docker start "$CONTAINER_NAME" >/dev/null

log "Restored. Verify: curl -fsS http://127.0.0.1:3000/healthz"
