#!/usr/bin/env bash
set -euo pipefail
cd /root/Supabase
ENV_FILE=.env.selfhost
COMPOSE=docker-compose.selfhost.yml

# Backup
cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"

# Remove o sufixo /v2.0 do AZURE_URL (GoTrue ja anexa /oauth2/v2.0/authorize)
sed -i -E 's|^(AZURE_URL=https://login\.microsoftonline\.com/[a-f0-9-]+)/v2\.0$|\1|' "$ENV_FILE"

echo "==> AZURE_URL agora:"
grep '^AZURE_URL=' "$ENV_FILE"

echo "==> Recriando auth..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" up -d auth

sleep 4
echo "==> Verificacao no container:"
docker inspect supabase-auth-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep GOTRUE_EXTERNAL_AZURE_URL
echo "OK."
