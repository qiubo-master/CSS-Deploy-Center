#!/usr/bin/env bash
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/css-deploy-center}"
RELEASE="$ROOT/releases/$RELEASE_SHA"
mkdir -p "$RELEASE" "$ROOT/releases" "$ROOT/shared"
touch "$ROOT/shared/.env"
tar -xzf "$ARCHIVE" -C "$RELEASE"
cd "$RELEASE"
ln -sfn "$ROOT/shared/.env" .env
docker compose build control-center
docker compose up -d control-center
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3000/ >/dev/null && break
  sleep 2
done
curl -fsS http://127.0.0.1:3000/ >/dev/null
ln -sfn "$RELEASE" "$ROOT/current"
find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +6 | cut -d' ' -f2- | xargs -r rm -rf
rm -f "$ARCHIVE"
