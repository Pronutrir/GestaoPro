#!/bin/bash
set -e
# Bloqueio passa a ser flag na ATIVIDADE, não coluna do Kanban ("block in place").
# Preserva blocked_since/blocked_days_total já existentes.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-activity-blocked-flag.sh
#
# PRÉ-REQUISITO: aplicar antes scripts/apply-workflow-stage-category.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260729003000_activity_blocked_flag.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260729003000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── DIAGNÓSTICO (antes) ──"
$PSQL -c "SELECT count(*) AS colunas_de_bloqueio,
  string_agg(DISTINCT title, ' | ') AS titulos
FROM public.workflow_stages WHERE COALESCE(is_blocked,false);"

$PSQL -c "SELECT count(*) AS atividades_em_coluna_bloqueada
FROM public.activities a
JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
WHERE COALESCE(s.is_blocked,false);"

echo "── APLICANDO (ON_ERROR_STOP) ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/activity_blocked_flag.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/activity_blocked_flag.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── VERIFICAÇÃO (depois) ──"
$PSQL -c "SELECT count(*) AS atividades_bloqueadas,
  count(*) FILTER (WHERE blocked_since IS NOT NULL) AS com_inicio,
  round(avg(EXTRACT(EPOCH FROM (now()-blocked_since))/86400.0)::numeric, 1) AS media_dias
FROM public.activities WHERE is_blocked;"

$PSQL -c "SELECT count(*) AS colunas_ainda_marcadas_bloqueio
FROM public.workflow_stages WHERE COALESCE(is_blocked,false);"

echo
echo "OK. As colunas de bloqueio continuam existindo (com os cards no lugar),"
echo "mas deixaram de marcar bloqueio. Reversão: bloco no fim do .sql"
