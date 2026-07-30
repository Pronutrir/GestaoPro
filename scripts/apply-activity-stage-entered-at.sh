#!/bin/bash
set -e
# Envelhecimento de card / cycle time: coluna stage_entered_at em activities,
# mantida por trigger quando o card troca de coluna (aditivo, idempotente).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-activity-stage-entered-at.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260729170000_activity_stage_entered_at.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260729170000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES: a coluna existe? ──"
$PSQL -c "SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='activities' AND column_name='stage_entered_at';"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/activity_stage_entered_at.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/activity_stage_entered_at.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS: coluna + trigger + amostra ──"
$PSQL -c "SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='activities' AND column_name='stage_entered_at';"
$PSQL -c "SELECT tgname FROM pg_trigger WHERE tgname='activities_stage_entered_at';"
$PSQL -c "SELECT count(*) AS total, count(stage_entered_at) AS com_data FROM public.activities WHERE is_trashed = false;"
