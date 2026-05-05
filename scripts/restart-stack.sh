#!/usr/bin/env bash
set -euo pipefail
cd /root/Supabase

# IMPORTANTE: o compose precisa de --env-file .env.selfhost
COMPOSE="docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost"

echo "==> Status atual:"
docker ps -a --format 'table {{.Names}}\t{{.Status}}' | grep -E "supabase-" || true

echo "==> Recriando TODOS os serviços com env correto..."
$COMPOSE up -d --force-recreate

sleep 5
echo "==> Status final:"
docker ps -a --format 'table {{.Names}}\t{{.Status}}' | grep -E "supabase-"

echo "==> Env do auth:"
docker exec supabase-auth-1 sh -c 'env | grep -E "GOTRUE_SITE_URL|GOTRUE_URI_ALLOW_LIST|GOTRUE_EXTERNAL_AZURE_URL"' || true
echo OK.
