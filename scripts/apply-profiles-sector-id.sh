#!/bin/bash
set -e
# Vincula profiles ao setor por ID (sector_id FK), com backfill por nome e
# trigger de sincronização. Mantém a coluna texto `sector` na transição.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-profiles-sector-id.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260727160000_profiles_sector_id.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260727160000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── Perfis com setor (texto) ANTES ──"
$PSQL -c "SELECT COUNT(*) FILTER (WHERE sector IS NOT NULL AND btrim(sector)<>'') AS com_setor_texto FROM public.profiles;"

echo "── Aplicando ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/profiles_sector_id.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/profiles_sector_id.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS: perfis já vinculados por sector_id ──"
$PSQL -c "SELECT COUNT(*) FILTER (WHERE sector_id IS NOT NULL) AS com_setor_id, COUNT(*) AS total FROM public.profiles;"
echo "── Perfis com texto mas SEM id (não casaram — revisar) ──"
$PSQL -c "SELECT id, sector FROM public.profiles WHERE sector IS NOT NULL AND btrim(sector)<>'' AND sector_id IS NULL;"
