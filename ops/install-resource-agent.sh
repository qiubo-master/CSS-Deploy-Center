#!/usr/bin/env bash
set -euo pipefail

ROOT="${CONTROL_CENTER_ROOT:-/opt/css-deploy-center}"
AGENT_SOURCE="${AGENT_SOURCE:-/tmp/forgeops-resource-agent.py}"
AGENT_ENV="$ROOT/shared/monitor-agent.env"
CONTROL_ENV="$ROOT/shared/.env"

install -m 750 "$AGENT_SOURCE" /usr/local/bin/forgeops-resource-agent
install -d -m 700 "$ROOT/shared"
token="$(openssl rand -hex 32)"
monitor_bind="${FORGEOPS_MONITOR_BIND:-172.18.0.1}"
printf 'FORGEOPS_MONITOR_TOKEN=%s\nFORGEOPS_MONITOR_PORT=9108\nFORGEOPS_MONITOR_BIND=%s\n' "$token" "$monitor_bind" > "$AGENT_ENV"
chmod 600 "$AGENT_ENV"

sed -i '/^MONITOR_AGENT_TOKEN=/d;/^ALIYUN_MONITOR_URL=/d' "$CONTROL_ENV"
printf '\nMONITOR_AGENT_TOKEN=%s\nALIYUN_MONITOR_URL=http://host.docker.internal:9108/v1/resources\n' "$token" >> "$CONTROL_ENV"

cat > /etc/systemd/system/forgeops-resource-agent.service <<EOF
[Unit]
Description=ForgeOps read-only resource monitor
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=$AGENT_ENV
ExecStart=/usr/bin/python3 /usr/local/bin/forgeops-resource-agent
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now forgeops-resource-agent.service
sleep 1
curl -fsS -H "Authorization: Bearer $token" http://127.0.0.1:9108/v1/resources >/dev/null
echo "ForgeOps resource agent is running."
