#!/usr/bin/env bash
set -euo pipefail
ROOT="${DEPLOY_ROOT:-/opt/css-deploy-center}"
CURRENT="$(readlink -f "$ROOT/current")"
PREVIOUS="$(find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d ! -path "$CURRENT" -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
test -n "$PREVIOUS"
cd "$PREVIOUS"
test -s "$PREVIOUS/deploy.resources.env"
docker compose \
  --env-file "$ROOT/shared/.env" \
  --env-file "$PREVIOUS/deploy.resources.env" \
  up -d --no-build --pull never --force-recreate control-center
curl -fsS http://127.0.0.1:3000/ >/dev/null
ln -sfn "$PREVIOUS" "$ROOT/current"
echo "Rolled back to $PREVIOUS"
