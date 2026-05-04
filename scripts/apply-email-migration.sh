#!/bin/bash
PW="***REMOVED***"
CONTAINER="supabase-db-1"

echo "=== Aplicando migration: add email to profiles ==="
docker exec -i -e PGPASSWORD="$PW" "$CONTAINER" \
  psql -U supabase_admin -d postgres < /root/add_email_profiles.sql

echo ""
echo "=== Registrando em schema_migrations ==="
docker exec -i -e PGPASSWORD="$PW" "$CONTAINER" \
  psql -U supabase_admin -d postgres -tAq << 'EOSQL'
INSERT INTO public.schema_migrations(version, inserted_at)
VALUES(20260504000001, now())
ON CONFLICT (version) DO NOTHING;
EOSQL

echo ""
echo "=== Verificando coluna email em profiles ==="
docker exec -i -e PGPASSWORD="$PW" "$CONTAINER" \
  psql -U supabase_admin -d postgres -tAq << 'EOSQL'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
EOSQL

echo ""
echo "=== Amostra: emails populados ==="
docker exec -i -e PGPASSWORD="$PW" "$CONTAINER" \
  psql -U supabase_admin -d postgres -tAq << 'EOSQL'
SELECT full_name, email FROM public.profiles ORDER BY full_name LIMIT 10;
EOSQL

echo "=== Concluído ==="
