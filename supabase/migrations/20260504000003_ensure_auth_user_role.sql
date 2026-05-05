-- Migration: ensure_auth_user_role
-- Garante que auth.users.role nunca fique vazio.
-- PostgREST usa esse campo ao validar o JWT; se estiver vazio gera
-- "role '' does not exist" e rejeita TODAS as chamadas REST com 401.

-- 1. Função do trigger
CREATE OR REPLACE FUNCTION auth.ensure_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth
AS $$
BEGIN
  IF NEW.role IS NULL OR btrim(NEW.role) = '' THEN
    NEW.role := 'authenticated';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Trigger BEFORE INSERT OR UPDATE em auth.users
DROP TRIGGER IF EXISTS trg_ensure_user_role ON auth.users;
CREATE TRIGGER trg_ensure_user_role
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.ensure_user_role();

-- 3. Corrige registros existentes com role vazio (idempotente)
UPDATE auth.users
SET role = 'authenticated'
WHERE role IS NULL OR btrim(role) = '';
