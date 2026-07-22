#!/bin/bash
set -e
# Aplica 20260722150000_eap_normalize_levels.sql
# (reclassifica item_type por nível: fase/pacote/atividade).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-eap-normalize-levels-migration.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260722150000_eap_normalize_levels.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260722150000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── item_type ANTES ──"
$PSQL -c "SELECT item_type, count(*) FROM public.activities GROUP BY item_type ORDER BY count(*) DESC;"
echo "── Aplicando ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/eap_levels.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/eap_levels.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"
echo "── item_type DEPOIS (deve ter fase/pacote/atividade) ──"
$PSQL -c "SELECT item_type, count(*) FROM public.activities GROUP BY item_type ORDER BY count(*) DESC;"
