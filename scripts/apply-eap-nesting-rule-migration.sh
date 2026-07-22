#!/bin/bash
set -e
# Aplica 20260722160000_eap_nesting_rule.sql
# (regra de aninhamento por papel: folha vs agrupador. Fase/Pacote agrupam,
#  inclusive outros agrupadores; Atividade/Marco são folhas).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-eap-nesting-rule-migration.sh
#
# IMPORTANTE: rode a normalização ANTES desta:
#   ./scripts/apply-eap-normalize-levels-migration.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260722160000_eap_nesting_rule.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260722160000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── Aplicando ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/eap_nesting.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/eap_nesting.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"
echo "── Verificação: função e trigger ──"
$PSQL -c "SELECT proname FROM pg_proc WHERE proname IN ('eap_is_group','validate_activity_hierarchy');"
$PSQL -c "SELECT tgname FROM pg_trigger WHERE tgname = 'trg_validate_activity_hierarchy';"

cat <<'FIM'

Rollback (reverte para a versão sem regra de nível — migration ...140000):
  reaplique 20260722140000_eap_integrity_triggers.sql
FIM
