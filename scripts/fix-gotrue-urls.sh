#!/usr/bin/env bash
set -euo pipefail
cd /root/Supabase

COMPOSE=docker-compose.selfhost.yml
cp -a "$COMPOSE" "${COMPOSE}.bak.$(date +%s)"

APP_URL="https://gestaopro.pronutrir.com.br"

python3 - <<PY
import re
p="$COMPOSE"
s=open(p).read()

# SITE_URL
s2=re.sub(r'(GOTRUE_SITE_URL:\s*).*', f'\\1{"$APP_URL"}', s)

# URI_ALLOW_LIST
new_allow="$APP_URL/**,https://srv1496079.hstgr.cloud/**,http://localhost:8080/**,http://localhost:3000/**"
s2=re.sub(r'(GOTRUE_URI_ALLOW_LIST:\s*).*', f'\\1{new_allow}', s2)

if s==s2:
    print("WARN: nenhuma substituição feita")
open(p,"w").write(s2)
PY

echo "==> Linhas alteradas:"
grep -nE "GOTRUE_SITE_URL|GOTRUE_URI_ALLOW_LIST" "$COMPOSE"

echo "==> Recriando auth..."
docker compose -f "$COMPOSE" up -d --force-recreate auth

sleep 3
echo "==> Env do container:"
docker exec supabase-auth-1 sh -c 'env | grep -E "GOTRUE_SITE_URL|GOTRUE_URI_ALLOW_LIST"'
echo OK.
