#!/bin/bash
set -e
# Aplica a migration que unifica os papéis EAP no modelo de 3 tipos
# (Fase/Entrega, Atividade, Marco): reclassifica agrupadores para 'fase',
# folhas para 'atividade' (marco preservado pela flag), com backup reversível.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-eap-three-roles-unify.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260727120000_eap_three_roles_unify.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260727120000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── Distribuição de item_type ANTES ──"
$PSQL -c "SELECT item_type, COUNT(*) FROM public.activities GROUP BY item_type ORDER BY 2 DESC;"

echo "── Aplicando ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/eap_three_roles_unify.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/eap_three_roles_unify.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── Distribuição de item_type DEPOIS (agrupadores viram 'fase') ──"
$PSQL -c "SELECT item_type, COUNT(*) FROM public.activities GROUP BY item_type ORDER BY 2 DESC;"

echo "── Backup preservado em item_type_prev_eap_unify (para rollback) ──"
$PSQL -c "SELECT COUNT(*) AS com_backup FROM public.activities WHERE item_type_prev_eap_unify IS NOT NULL;"
