#!/bin/bash
set -e
# Cria a tabela job_titles (cargos/níveis) com seed dos 5 níveis padrão + import
# dos cargos livres já existentes em profiles.role_title.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-job-titles.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260727180000_job_titles.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260727180000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── Aplicando ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/job_titles.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/job_titles.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── Cargos cadastrados ──"
$PSQL -c "SELECT name, rank FROM public.job_titles ORDER BY rank NULLS LAST, name;"
