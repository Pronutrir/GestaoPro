#!/usr/bin/env bash
set -euo pipefail
# Senha do Postgres lida do ambiente (nunca hardcodar). Ex.: PGPASSWORD=... ./scripts/check-user.sh
: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
docker exec -e PGPASSWORD="$PGPASSWORD" supabase-db-1 \
  psql -U supabase_admin -d postgres -c \
  "SELECT u.id, u.email, u.banned_until, u.last_sign_in_at, p.is_active, p.provider, p.last_login_at, ur.role
   FROM auth.users u
   LEFT JOIN public.profiles p ON p.id = u.id
   LEFT JOIN public.user_roles ur ON ur.user_id = u.id
   WHERE u.email = 'willliame_lima@hotmail.com';"
