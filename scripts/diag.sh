#!/bin/bash
PW="a7ab971f42663606a59b93e232884e833a71fa6277c7e14e"
CONT="supabase-db-1"
psql() { docker exec -e PGPASSWORD="$PW" "$CONT" psql -U supabase_admin -d postgres -tAq -c "$1"; }

echo "=== schema_migrations table location ==="
psql "SELECT schemaname||'.'||tablename FROM pg_tables WHERE tablename='schema_migrations';"

echo "=== has_role signature ==="
psql "SELECT n.nspname||'.'||p.proname||'('||pg_get_function_arguments(p.oid)||')' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='has_role';"

echo "=== profiles columns ==="
psql "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position;"

echo "=== app_role enum values ==="
psql "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='app_role' ORDER BY e.enumsortorder;"

echo "=== public.schema_migrations columns ==="
psql "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='schema_migrations' ORDER BY ordinal_position;"

echo "=== user_roles table columns ==="
psql "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='user_roles' ORDER BY ordinal_position;"
