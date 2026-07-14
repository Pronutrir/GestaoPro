#!/bin/bash
set -e

PGPASS="${PGPASSWORD:?defina PGPASSWORD no ambiente}"

# Detecta o usuário dono das tabelas
OWNER=$(docker exec -e PGPASSWORD="$PGPASS" supabase-db-1 psql -U supabase_admin -d postgres -tAc "SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='project_members' LIMIT 1;" 2>/dev/null || echo "supabase_admin")
echo "Dono das tabelas: $OWNER"

# Copia os arquivos SQL para dentro do container
docker cp /tmp/20260512002520_b2685341-9ff6-47d5-a400-bd7e684a1f8a.sql supabase-db-1:/tmp/
docker cp /tmp/20260512202958_3b4bcd92-6f34-45d8-8bf2-66a7f2718857.sql supabase-db-1:/tmp/
docker cp /tmp/20260506122000_backfill_project_members_from_project_identities.sql supabase-db-1:/tmp/

echo "=== Aplicando migration 1: RACI + invitation flow ==="
docker exec -e PGPASSWORD="$PGPASS" supabase-db-1 psql -U "$OWNER" -d postgres -f /tmp/20260512002520_b2685341-9ff6-47d5-a400-bd7e684a1f8a.sql

echo "=== Aplicando migration 2: RLS leaders ==="
docker exec -e PGPASSWORD="$PGPASS" supabase-db-1 psql -U "$OWNER" -d postgres -f /tmp/20260512202958_3b4bcd92-6f34-45d8-8bf2-66a7f2718857.sql

echo "=== Aplicando migration 3: backfill project_members ==="
docker exec -e PGPASSWORD="$PGPASS" supabase-db-1 psql -U "$OWNER" -d postgres -f /tmp/20260506122000_backfill_project_members_from_project_identities.sql

echo ""
echo "=== Colunas atuais de project_members ==="
docker exec -e PGPASSWORD="$PGPASS" supabase-db-1 psql -U "$OWNER" -d postgres -tAc "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='project_members' ORDER BY ordinal_position;"

echo "=== Pronto! ==="
