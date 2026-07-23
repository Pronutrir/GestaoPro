#!/bin/bash
set -e
# Aplica 20260723100000_fix_projects_insert_policy.sql
# (recria a policy de INSERT de projects, faltante -> corrige erro 42501 ao criar projeto).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-projects-insert-policy.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260723100000_fix_projects_insert_policy.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260723100000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── Policies de projects ANTES ──"
$PSQL -c "SELECT policyname, cmd FROM pg_policies WHERE tablename='projects' ORDER BY cmd, policyname;"

echo "── Aplicando ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/projects_insert.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/projects_insert.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── Policies DEPOIS (deve haver uma INSERT) ──"
$PSQL -c "SELECT policyname, cmd FROM pg_policies WHERE tablename='projects' ORDER BY cmd, policyname;"
