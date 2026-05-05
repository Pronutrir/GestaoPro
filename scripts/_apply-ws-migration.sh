#!/bin/bash
set -e
PW='a7ab971f42663606a59b93e232884e833a71fa6277c7e14e'
DB=supabase-db-1
REST=supabase-rest-1

echo "==== Aplicando migracao em $DB ===="
docker cp /tmp/ws_align.sql ${DB}:/tmp/ws_align.sql
docker exec -e PGPASSWORD="$PW" "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/ws_align.sql

echo
echo "==== Colunas resultantes ===="
docker exec -e PGPASSWORD="$PW" "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='workflow_stages' ORDER BY ordinal_position;"

echo
echo "==== Stages por projeto ===="
docker exec -e PGPASSWORD="$PW" "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT project_id, count(*) AS stages FROM public.workflow_stages GROUP BY project_id ORDER BY 1;"

echo
echo "==== Reiniciando PostgREST ($REST) ===="
docker restart "$REST"
sleep 2
echo "OK"
