#!/bin/bash
set -e
# TAP COMO ATO FORMAL — fases 1 a 3.
#
# Liga o TAP ao motor de assinatura que já existe (document_flows), dá ao termo
# versões imutáveis e faz o fluxo NOTIFICAR de verdade — hoje o participante
# nasce com status 'notificado' mas nenhuma linha em notifications é criada,
# então quem precisa assinar só descobre se abrir a aba do projeto.
#
# Aditiva e idempotente.
# DEPENDE de: apply-document-flows.sh e apply-pages-rls.sh (rodar antes).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-tap-flow.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260801140000_tap_flow_and_versions.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260801140000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── PRÉ-REQUISITO (document_flows precisa existir) ──"
$PSQL -c "SELECT to_regclass('public.document_flows') AS document_flows,
                 to_regclass('public.document_participants') AS participants;"

echo "── ANTES ──"
$PSQL -c "SELECT conname FROM pg_constraint WHERE conname LIKE 'document_flows_one_target%';"
$PSQL -c "SELECT count(*) AS projetos, count(*) FILTER (WHERE charter_data IS NOT NULL) AS com_tap
          FROM public.projects WHERE is_trashed = false;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/tap_flow.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/tap_flow.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS ──"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='document_flows'
            AND column_name IN ('document_id','page_id','charter_project_id') ORDER BY 1;"
$PSQL -c "SELECT to_regclass('public.project_charter_versions') AS versoes;"
$PSQL -c "SELECT charter_status, count(*) FROM public.projects
          WHERE is_trashed = false GROUP BY 1 ORDER BY 2 DESC;"
$PSQL -c "SELECT proname FROM pg_proc WHERE proname IN
          ('notify_flow_participants','on_participant_resolved') ORDER BY 1;"
