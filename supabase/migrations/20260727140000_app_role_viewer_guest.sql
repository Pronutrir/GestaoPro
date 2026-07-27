-- Adiciona os papéis de acesso 'visualizador' (só leitura) e 'convidado'
-- (externo, restrito a projetos) ao enum app_role.
--
-- Aditivo e idempotente — não altera papéis existentes (admin/gestor/user).
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-app-role-viewer-guest.sh

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'visualizador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'convidado';
