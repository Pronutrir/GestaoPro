#!/bin/bash
set -e
# Adiciona 'visualizador' e 'convidado' ao enum app_role (aditivo, idempotente).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-app-role-viewer-guest.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260727140000_app_role_viewer_guest.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260727140000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── Valores do enum app_role ANTES ──"
$PSQL -c "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='app_role' ORDER BY e.enumsortorder;"

echo "── Aplicando ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/app_role_viewer_guest.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/app_role_viewer_guest.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (deve incluir visualizador e convidado) ──"
$PSQL -c "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='app_role' ORDER BY e.enumsortorder;"
