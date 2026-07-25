#!/bin/bash
set -e
# Aplica a migration MÍNIMA que faz activities.item_type aceitar 'pacote'.
# So mexe no CHECK — nao normaliza dados nem cria trigger.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-item-type-allow-pacote.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260723000000_activities_item_type_allow_pacote.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260723000000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── CHECK de item_type ANTES ──"
$PSQL -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.activities'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%item_type%';"

echo "── Aplicando ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/allow_pacote.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/allow_pacote.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── CHECK DEPOIS (deve incluir 'pacote') ──"
$PSQL -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.activities'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%item_type%';"
