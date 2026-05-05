#!/usr/bin/env bash
cd /root/Supabase
echo "==> compose: linhas com SITE/ALLOW/URL"
grep -nE "SITE_URL|ALLOW_LIST|API_EXTERNAL_URL" docker-compose.selfhost.yml || true
echo
echo "==> .env.selfhost: linhas com SITE/ALLOW/URL"
grep -nE "SITE_URL|ALLOW_LIST|API_EXTERNAL" .env.selfhost || true
echo
echo "==> Env do container auth"
docker exec supabase-auth-1 sh -c 'env | grep -E "SITE_URL|ALLOW_LIST|API_EXTERNAL_URL"' || true
