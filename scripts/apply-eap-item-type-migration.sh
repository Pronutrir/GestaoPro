#!/bin/bash
set -e
# Aplica a migration 20260722130000_eap_item_type_normalize.sql
# (normaliza item_type em papéis EAP + CHECK constraint + habilita 'pacote').
#
# Rodar NA VM (20.65.208.119), onde o container do Postgres é alcançável:
#   PGPASSWORD=... ./scripts/apply-eap-item-type-migration.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"

MIGRATION="supabase/migrations/20260722130000_eap_item_type_normalize.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260722130000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── item_type ANTES ──"
$PSQL -c "SELECT item_type, count(*) FROM public.activities GROUP BY item_type ORDER BY count(*) DESC;"

echo
echo "── Aplicando migration ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/eap_item_type.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/eap_item_type.sql

# Marca a migration como aplicada.
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo
echo "── item_type DEPOIS (só: fase, pacote, atividade, historia_usuario) ──"
$PSQL -c "SELECT item_type, count(*) FROM public.activities GROUP BY item_type ORDER BY count(*) DESC;"

echo
echo "── Verificação: CHECK constraint criada ──"
$PSQL -c "SELECT conname FROM pg_constraint WHERE conname = 'activities_item_type_check';"

cat <<'FIM'

────────────────────────────────────────────────────────────────────────
DEPOIS de aplicar, a UI (etapa 2) passará a oferecer 4 papéis:
  Atividade · Pacote · Fase · Marco
Rollback (se necessário):
  ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_item_type_check;
────────────────────────────────────────────────────────────────────────
FIM
