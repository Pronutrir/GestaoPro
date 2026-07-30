#!/bin/bash
set -e
# Histórico de transições de coluna: tabela activity_stage_transitions + trigger.
# Pré-requisito de cycle time e CFD — o histórico conta A PARTIR daqui.
# Aditiva e idempotente; sem ela o painel de métricas mostra só o throughput.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-activity-stage-transitions.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260730130000_activity_stage_transitions.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260730130000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT to_regclass('public.activity_stage_transitions') AS tabela_existente;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/activity_stage_transitions.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/activity_stage_transitions.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (deve listar a tabela, 1 policy e o trigger) ──"
$PSQL -c "SELECT to_regclass('public.activity_stage_transitions') AS tabela;"
$PSQL -c "SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='activity_stage_transitions';"
$PSQL -c "SELECT tgname FROM pg_trigger WHERE tgrelid='public.activities'::regclass AND tgname='trg_log_activity_stage_transition';"
