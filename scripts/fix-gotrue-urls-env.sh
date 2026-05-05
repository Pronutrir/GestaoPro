#!/usr/bin/env bash
set -euo pipefail
cd /root/Supabase

cp -a .env.selfhost ".env.selfhost.bak.$(date +%s)"

APP_URL="https://gestaopro.pronutrir.com.br"
NEW_ALLOW="${APP_URL}/**,https://srv1496079.hstgr.cloud/**,http://localhost:8080/**,http://localhost:3000/**"

python3 - <<PY
import re
p=".env.selfhost"
s=open(p).read()
s=re.sub(r'^SITE_URL=.*$', f'SITE_URL=$APP_URL', s, flags=re.M)
s=re.sub(r'^URI_ALLOW_LIST=.*$', f'URI_ALLOW_LIST=$NEW_ALLOW', s, flags=re.M)
open(p,"w").write(s)
PY

echo "==> .env.selfhost atualizado:"
grep -nE "^SITE_URL=|^URI_ALLOW_LIST=" .env.selfhost

echo "==> Recriando auth..."
docker compose -f docker-compose.selfhost.yml up -d --force-recreate auth
sleep 3
echo "==> Env do container:"
docker exec supabase-auth-1 sh -c 'env | grep -E "GOTRUE_SITE_URL|GOTRUE_URI_ALLOW_LIST"'
echo OK.
