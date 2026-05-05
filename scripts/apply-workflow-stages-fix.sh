#!/bin/bash
# Aplica a migração que alinha workflow_stages (adiciona title/color, sincroniza name).
# Executar no VPS Hostinger onde roda o container supabase-db-1.

set -euo pipefail

PW="${POSTGRES_PASSWORD:-***REMOVED***}"
CONT="${SUPABASE_DB_CONTAINER:-supabase-db-1}"
SQL_LOCAL="/root/workflow_stages_align.sql"
SQL_IN_CONTAINER="/tmp/workflow_stages_align.sql"
VERSION="20260505000000"

if [[ ! -f "$SQL_LOCAL" ]]; then
  echo "ERRO: $SQL_LOCAL não encontrado."
  echo "Copie supabase/migrations/${VERSION}_workflow_stages_align_title_color.sql para $SQL_LOCAL antes de rodar."
  exit 1
fi

# Marca a migração como aplicada na tabela schema_migrations.
echo "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;" >> "$SQL_LOCAL"

docker cp "$SQL_LOCAL" "${CONT}:${SQL_IN_CONTAINER}"
docker exec -e PGPASSWORD="$PW" "$CONT" \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f "$SQL_IN_CONTAINER"

echo "---- Verificando colunas resultantes ----"
docker exec -e PGPASSWORD="$PW" "$CONT" \
  psql -U supabase_admin -d postgres -c \
  "SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_schema='public' AND table_name='workflow_stages'
   ORDER BY ordinal_position;"

echo "---- Reiniciando PostgREST para forçar reload do schema cache ----"
docker restart supabase-rest 2>/dev/null || \
  docker restart $(docker ps --format '{{.Names}}' | grep -E 'rest|postgrest' | head -n1) || \
  echo "AVISO: container do PostgREST não encontrado automaticamente. Reinicie manualmente."

echo "OK."
