#!/bin/bash
set -e
# Senha do Postgres lida do ambiente (nunca hardcodar). Ex.: PGPASSWORD=... ./scripts/apply-azure-migration.sh
: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
echo "INSERT INTO public.schema_migrations(version, inserted_at) VALUES (20260505000001, NOW()) ON CONFLICT DO NOTHING;" >> /root/azure_provisioning.sql
docker cp /root/azure_provisioning.sql supabase-db-1:/tmp/azure_provisioning.sql
docker exec -e PGPASSWORD="$PGPASSWORD" supabase-db-1 psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/azure_provisioning.sql
docker exec -e PGPASSWORD="$PGPASSWORD" supabase-db-1 psql -U supabase_admin -d postgres -c "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('provider','provider_id','last_login_at') ORDER BY column_name;"
