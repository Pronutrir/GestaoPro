#!/usr/bin/env bash
set -euo pipefail
cd /root/Supabase
COMPOSE=docker-compose.selfhost.yml
cp "$COMPOSE" "${COMPOSE}.bak.$(date +%Y%m%d%H%M%S)"
sed -i 's|microsoftonline.com/${AZURE_TENANT_ID}/v2.0|microsoftonline.com/${AZURE_TENANT_ID}|' "$COMPOSE"
echo "==> Linha apos sed:"
grep -n AZURE_URL "$COMPOSE"
echo "==> Recriando auth..."
docker compose --env-file .env.selfhost -f "$COMPOSE" up -d auth
sleep 4
echo "==> Container env:"
docker inspect supabase-auth-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep AZURE_URL
echo "OK."
