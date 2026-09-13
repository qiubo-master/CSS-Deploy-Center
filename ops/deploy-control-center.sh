#!/usr/bin/env bash
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/css-deploy-center}"
RELEASE="$ROOT/releases/$RELEASE_SHA"
mkdir -p "$RELEASE" "$ROOT/releases" "$ROOT/shared"
mkdir -p "$ROOT/shared/data"
chmod 700 "$ROOT/shared/data"
touch "$ROOT/shared/.env"
tar -xzf "$ARCHIVE" -C "$RELEASE"
cd "$RELEASE"
ln -sfn "$ROOT/shared/.env" .env

BASE_IMAGE="${DEPLOY_BASE_IMAGE:-css-deploy-center:1.0.0}"
if ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  CURRENT_IMAGE_ID=$(docker inspect css-deploy-center-control-center-1 --format '{{.Image}}')
  docker tag "$CURRENT_IMAGE_ID" css-deploy-center:deployment-base
  BASE_IMAGE=css-deploy-center:deployment-base
fi

IMAGE_REF="css-deploy-center:$RELEASE_SHA"
docker build \
  --build-arg "BASE_IMAGE=$BASE_IMAGE" \
  --tag "$IMAGE_REF" \
  --file Dockerfile.server \
  .
printf 'CONTROL_CENTER_IMAGE=%s\n' "$IMAGE_REF" > "$RELEASE/deploy.resources.env"
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
rm -f "$ARCHIVE"
