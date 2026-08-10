#!/usr/bin/env bash
set -euo pipefail
ROOT="${DEPLOY_ROOT:-/root/autodl-tmp/css-releases}"
ACTIVE_FILE="$ROOT/active-slot"
mkdir -p "$ROOT/releases" "$ROOT/shared"

if [[ "${ACTION:-deploy}" == "rollback" ]]; then
  test -L "$ROOT/previous"
  ln -sfn "$(readlink -f "$ROOT/previous")" "$ROOT/current"
  bash "$ROOT/current/local-demo/cloud/start-cloud.sh"
  exit 0
fi

RELEASE="$ROOT/releases/$RELEASE_SHA"
mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
if [[ -L "$ROOT/current" ]]; then ln -sfn "$(readlink -f "$ROOT/current")" "$ROOT/previous"; fi
ln -sfn /root/autodl-tmp/models "$RELEASE/models"
cd "$RELEASE/local-demo"
python3 -m venv .venv
.venv/bin/pip install -e .
LLM_MODE=mock .venv/bin/python -m pytest -q tests
APP_PORT=6008 APP_ROOT="$RELEASE/local-demo" bash cloud/start-cloud.sh
curl -fsS http://127.0.0.1:6008/api/v1/health
ln -sfn "$RELEASE" "$ROOT/current"
printf '%s' green > "$ACTIVE_FILE"
echo "Release $RELEASE_SHA is healthy on green slot"
