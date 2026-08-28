#!/usr/bin/env bash
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/css-deploy-center}"
RELEASE="$ROOT/releases/$RELEASE_SHA"
test -s "$IMAGE_ARCHIVE"
mkdir -p "$RELEASE" "$ROOT/releases" "$ROOT/shared"
mkdir -p "$ROOT/shared/data"
chmod 700 "$ROOT/shared/data"
touch "$ROOT/shared/.env"
tar -xzf "$ARCHIVE" -C "$RELEASE"
docker load -i "$IMAGE_ARCHIVE"
printf 'CONTROL_CENTER_IMAGE=css-deploy-center:%s\n' "$RELEASE_SHA" > "$RELEASE/deploy.resources.env"
cd "$RELEASE"
ln -sfn "$ROOT/shared/.env" .env
docker compose \
  --env-file "$ROOT/shared/.env" \
  --env-file "$RELEASE/deploy.resources.env" \
  up -d --no-build --pull never --force-recreate control-center
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3000/ >/dev/null && break
  sleep 2
done
curl -fsS http://127.0.0.1:3000/ >/dev/null
ln -sfn "$RELEASE" "$ROOT/current"
find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +6 | cut -d' ' -f2- | xargs -r rm -rf
rm -f "$ARCHIVE" "$IMAGE_ARCHIVE"
