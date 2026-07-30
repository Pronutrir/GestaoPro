#!/bin/bash
set -e
# Visões salvas do Kanban: tabela kanban_views (combinação nomeada de filtros +
# raia + ordenação + campos do card, por projeto, compartilhada com o time).
# Aditiva e idempotente; sem ela o dropdown "Visões" não aparece no quadro.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-kanban-views.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260730120000_kanban_views.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260730120000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT to_regclass('public.kanban_views') AS tabela_existente;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/kanban_views.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/kanban_views.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (deve listar a tabela e 4 policies) ──"
$PSQL -c "SELECT to_regclass('public.kanban_views') AS tabela;"
$PSQL -c "SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='kanban_views' ORDER BY 1;"
