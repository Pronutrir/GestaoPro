#!/bin/bash
set -e
# CENTRAL DE DOCUMENTOS — fase 1 (corretiva) + base das fases 2 e 5.
#
# O ponto crítico: project_pages estava com as QUATRO policies em USING(true),
# ou seja, qualquer usuário autenticado lia, editava e apagava páginas de
# QUALQUER projeto. Esta migration troca por can_view_project_v2 /
# can_manage_project_v2, e falha em voz alta se sobrar alguma permissiva.
#
# Também: FK que faltava, colunas de fase/atividade/revisão nas páginas,
# tabela page_versions (histórico append-only) e document_flows aceitando
# página escrita como alvo.
#
# Aditiva e idempotente. Rodar NA VM: PGPASSWORD=... ./scripts/apply-pages-rls.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260801100000_pages_rls_and_versions.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260801100000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES (policies de project_pages — repare nas USING(true)) ──"
$PSQL -c "SELECT policyname, cmd, qual FROM pg_policies
          WHERE schemaname='public' AND tablename='project_pages' ORDER BY policyname;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/pages_rls.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/pages_rls.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (4 policies, nenhuma permissiva) ──"
$PSQL -c "SELECT policyname, cmd FROM pg_policies
          WHERE schemaname='public' AND tablename='project_pages' ORDER BY policyname;"

echo "── page_versions + colunas novas ──"
$PSQL -c "SELECT to_regclass('public.page_versions') AS page_versions;"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='project_pages'
            AND column_name IN ('phase_id','activity_id','revision','updated_by_id','updated_by_name')
          ORDER BY 1;"
$PSQL -c "SELECT column_name, is_nullable FROM information_schema.columns
          WHERE table_schema='public' AND table_name='document_flows'
            AND column_name IN ('document_id','page_id') ORDER BY 1;"
