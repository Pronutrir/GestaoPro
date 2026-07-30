#!/bin/bash
set -e
# Limite de WIP rígido opcional por coluna: quando wip_strict=true, o quadro
# IMPEDE mover card para a coluna que atingiu o wip_limit (aditivo, idempotente,
# padrão false = comportamento atual, só avisa).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-workflow-stage-wip-strict.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260729180000_workflow_stage_wip_strict.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260729180000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='workflow_stages' AND column_name IN ('wip_limit','wip_strict') ORDER BY 1;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/workflow_stage_wip_strict.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/workflow_stage_wip_strict.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (deve listar wip_limit e wip_strict) ──"
$PSQL -c "SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='workflow_stages' AND column_name IN ('wip_limit','wip_strict') ORDER BY 1;"
