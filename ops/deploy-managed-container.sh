#!/usr/bin/env bash
set -euo pipefail

ACTION="${ACTION:-deploy}"

validate() {
  [[ "$PROJECT_ID" =~ ^[a-z0-9][a-z0-9-]{1,39}$ ]]
  [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]
  [[ "$APP_CPU" =~ ^(1\.0|2\.0|4\.0)$ ]]
  [[ "$APP_MEMORY" =~ ^(1g|2g|4g)$ ]]
  [[ "$HOST_PORT" =~ ^[0-9]{4,5}$ ]] && (( HOST_PORT >= 1024 && HOST_PORT <= 65535 ))
  [[ "$BIND_ADDRESS" == "0.0.0.0" || "$BIND_ADDRESS" == "127.0.0.1" ]]
  case "$PROJECT_ID" in
    ontology)
      [[ "$IMAGE_REPOSITORY" == "crpi-73ce4hnji7xum4zi.cn-heyuan.personal.cr.aliyuncs.com/qiubo-master/ontology" ]]
      [[ "$CONTAINER_PORT" == "8000" ]]
      [[ "$HEALTH_PATH" == "/api/health" ]]
      [[ "$DEPLOY_ROOT" == "/opt/css-deploy-center/managed/ontology" ]]
      ;;
    ai-wms)
      [[ "$IMAGE_REPOSITORY" == "crpi-73ce4hnji7xum4zi.cn-heyuan.personal.cr.aliyuncs.com/qiubo-master/ai-wms" ]]
      [[ "$CONTAINER_PORT" == "3000" ]]
      [[ "$HEALTH_PATH" == "/api/health" ]]
      [[ "$DEPLOY_ROOT" == "/opt/css-deploy-center/managed/ai-wms" ]]
      ;;
    *) echo "Unsupported managed project: $PROJECT_ID" >&2; exit 1 ;;
  esac
}

load_release() {
  set -a
  source "$1/deploy.env"
  set +a
}

start_release() {
  local target="$1"
  load_release "$target"
  local env_args=()
  [[ ! -s "$DEPLOY_ROOT/shared/.env" ]] || env_args+=(--env-file "$DEPLOY_ROOT/shared/.env")
  docker rm -f "forgeops-$PROJECT_ID" >/dev/null 2>&1 || true
  docker run -d \
    --name "forgeops-$PROJECT_ID" \
    --restart unless-stopped \
    --label "com.docker.compose.project=$PROJECT_ID" \
    --cpus "$APP_CPU" \
    --memory "$APP_MEMORY" \
    -p "$BIND_ADDRESS:$HOST_PORT:$CONTAINER_PORT" \
    "${env_args[@]}" \
    "$IMAGE_REPOSITORY:$IMAGE_TAG" >/dev/null
}

healthy() {
  for _ in $(seq 1 45); do
    curl -fsS "http://127.0.0.1:$HOST_PORT$HEALTH_PATH" >/dev/null && return 0
    sleep 2
  done
  return 1
}

validate
mkdir -p "$DEPLOY_ROOT/releases" "$DEPLOY_ROOT/shared"
PREVIOUS="$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || true)"

if [[ "$ACTION" == "rollback" ]]; then
  TARGET="$(find "$DEPLOY_ROOT/releases" -mindepth 1 -maxdepth 1 -type d ! -path "$PREVIOUS" -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
  test -n "$TARGET"
else
  docker image inspect "$IMAGE_REPOSITORY:$RELEASE_SHA" >/dev/null
  TARGET="$DEPLOY_ROOT/releases/$RELEASE_SHA"
  mkdir -p "$TARGET"
  cat > "$TARGET/deploy.env" <<EOF
PROJECT_ID=$PROJECT_ID
IMAGE_REPOSITORY=$IMAGE_REPOSITORY
IMAGE_TAG=$RELEASE_SHA
CONTAINER_PORT=$CONTAINER_PORT
HEALTH_PATH=$HEALTH_PATH
DEPLOY_ROOT=$DEPLOY_ROOT
APP_CPU=$APP_CPU
APP_MEMORY=$APP_MEMORY
HOST_PORT=$HOST_PORT
BIND_ADDRESS=$BIND_ADDRESS
RELEASE_SHA=$RELEASE_SHA
EOF
fi

start_release "$TARGET"
if healthy; then
  ln -sfn "$TARGET" "$DEPLOY_ROOT/current"
  find "$DEPLOY_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +6 | cut -d' ' -f2- | xargs -r rm -rf
  echo "$PROJECT_ID active at $BIND_ADDRESS:$HOST_PORT from $TARGET"
  exit 0
fi

docker logs --tail=100 "forgeops-$PROJECT_ID" || true
if [[ -n "$PREVIOUS" && -s "$PREVIOUS/deploy.env" ]]; then
  echo "Health check failed; restoring $PREVIOUS" >&2
  start_release "$PREVIOUS"
  healthy || true
  ln -sfn "$PREVIOUS" "$DEPLOY_ROOT/current"
fi
echo "$PROJECT_ID health check failed" >&2
exit 1
