#!/bin/bash
set -e
echo "INSERT INTO public.schema_migrations(version, inserted_at) VALUES (20260505000001, NOW()) ON CONFLICT DO NOTHING;" >> /root/azure_provisioning.sql
docker cp /root/azure_provisioning.sql supabase-db-1:/tmp/azure_provisioning.sql
docker exec -e PGPASSWORD=a7ab971f42663606a59b93e232884e833a71fa6277c7e14e supabase-db-1 psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/azure_provisioning.sql
docker exec -e PGPASSWORD=a7ab971f42663606a59b93e232884e833a71fa6277c7e14e supabase-db-1 psql -U supabase_admin -d postgres -c "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('provider','provider_id','last_login_at') ORDER BY column_name;"
