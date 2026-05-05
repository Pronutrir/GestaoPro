-- Garante que a coluna role_title exista em profiles (alguns ambientes
-- self-hosted criaram a tabela sem ela). Idempotente.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_title TEXT;

-- Recarrega o schema cache do PostgREST para refletir a nova coluna imediatamente.
NOTIFY pgrst, 'reload schema';
