#!/bin/bash
# Roda no VPS via ssh root@72.60.49.200 'bash -s' < this_file
set -e
PW='a7ab971f42663606a59b93e232884e833a71fa6277c7e14e'

echo "==== Identificando stack ativo (verifica qual container tem projetos) ===="
for db in supabase-db-1 supabase_db_Supabase; do
  echo "--- $db ---"
  docker exec -e PGPASSWORD="$PW" "$db" psql -U supabase_admin -d postgres -tAc \
    "SELECT 'projects=' || count(*) FROM public.projects;" 2>&1 || echo "FAIL"
  docker exec -e PGPASSWORD="$PW" "$db" psql -U supabase_admin -d postgres -tAc \
    "SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='workflow_stages';" 2>&1 || echo "FAIL"
done

echo
echo "==== Containers PostgREST e suas variaveis PGRST_DB_URI ===="
for c in supabase-rest-1 supabase_rest_Supabase; do
  echo "--- $c ---"
  docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -E 'PGRST_DB_URI|PGRST_JWT' || echo "(nao encontrado)"
done
