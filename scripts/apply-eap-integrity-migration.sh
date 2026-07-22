#!/bin/bash
set -e
# Aplica a migration 20260722140000_eap_integrity_triggers.sql
# (trigger de integridade da árvore EAP: marco sem filhos, sem ciclos, mesmo projeto).
#
# Rodar NA VM (20.65.208.119), container supabase-db-1:
#   PGPASSWORD=... ./scripts/apply-eap-integrity-migration.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"

MIGRATION="supabase/migrations/20260722140000_eap_integrity_triggers.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260722140000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── Aplicando migration ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/eap_integrity.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/eap_integrity.sql

$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo
echo "── Verificação: trigger criado ──"
$PSQL -c "SELECT tgname FROM pg_trigger WHERE tgname = 'trg_validate_activity_hierarchy';"

cat <<'FIM'

────────────────────────────────────────────────────────────────────────
Rollback (se necessário):
  DROP TRIGGER IF EXISTS trg_validate_activity_hierarchy ON public.activities;
  DROP FUNCTION IF EXISTS public.validate_activity_hierarchy();
────────────────────────────────────────────────────────────────────────
FIM
