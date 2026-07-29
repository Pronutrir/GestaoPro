#!/bin/bash
set -e
# Gestor do Projeto ganha o mesmo acesso que o Líder do Projeto: RLS
# is_project_leader_v2() passa a comparar owner OU manager (aditivo,
# idempotente). Rodar NA VM: PGPASSWORD=... ./scripts/apply-project-leader-includes-manager.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260729140000_project_leader_includes_manager.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260729140000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── Definição ANTES ──"
$PSQL -c "SELECT pg_get_functiondef('public.is_project_leader_v2(uuid, uuid)'::regprocedure);"

echo "── Aplicando ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/project_leader_includes_manager.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/project_leader_includes_manager.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── Definição DEPOIS (deve comparar owner OU manager) ──"
$PSQL -c "SELECT pg_get_functiondef('public.is_project_leader_v2(uuid, uuid)'::regprocedure);"
