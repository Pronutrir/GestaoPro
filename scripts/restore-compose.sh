#!/usr/bin/env bash
set -euo pipefail
cd /root/Supabase

echo "==> Backups disponíveis do compose:"
ls -lt docker-compose.selfhost.yml.bak.* | head -5

LATEST=$(ls -t docker-compose.selfhost.yml.bak.* | head -1)
echo "==> Restaurando $LATEST"
cp -a "$LATEST" docker-compose.selfhost.yml

# Sanitizar CR caso existam
dos2unix docker-compose.selfhost.yml 2>/dev/null || sed -i 's/\r$//' docker-compose.selfhost.yml

echo "==> Validando YAML"
docker compose -f docker-compose.selfhost.yml config >/dev/null && echo "YAML OK"

echo "==> Recriando auth..."
docker compose -f docker-compose.selfhost.yml up -d --force-recreate auth
sleep 3
docker exec supabase-auth-1 sh -c 'env | grep -E "GOTRUE_SITE_URL|GOTRUE_URI_ALLOW_LIST|GOTRUE_EXTERNAL_AZURE_URL"'
echo OK.
