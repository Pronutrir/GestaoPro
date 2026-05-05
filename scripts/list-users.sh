#!/usr/bin/env bash
docker exec -e PGPASSWORD=***REMOVED*** supabase-db-1 \
  psql -U supabase_admin -d postgres -c \
  "SELECT u.id, u.email, u.created_at, u.banned_until, u.last_sign_in_at, p.is_active, p.provider, ur.role
   FROM auth.users u
   LEFT JOIN public.profiles p ON p.id = u.id
   LEFT JOIN public.user_roles ur ON ur.user_id = u.id
   ORDER BY u.created_at DESC LIMIT 10;"
