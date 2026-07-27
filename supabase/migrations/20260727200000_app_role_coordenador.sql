-- Adiciona o papel de acesso 'coordenador' ao enum app_role.
-- Coordenador tem acesso equivalente ao de gestor (entra em canManage).
--
-- Aditivo e idempotente — não altera papéis existentes
-- (admin/gestor/user/visualizador/convidado).
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-app-role-coordenador.sh

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordenador';
