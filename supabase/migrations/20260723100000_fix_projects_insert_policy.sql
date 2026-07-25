-- Corrige a criacao de projetos: a migration 20260512202958 dropou a policy de
-- INSERT de projects e recriou apenas SELECT/UPDATE/DELETE ("Members can ...").
-- Sem policy de INSERT, o RLS bloqueia toda criacao com erro 42501
-- ("new row violates row-level security policy for table projects").
--
-- Regra: qualquer usuario autenticado pode criar um projeto. O created_by e
-- preenchido automaticamente (DEFAULT auth.uid() + trigger), tornando-o membro/
-- criador, o que habilita as demais policies (read/update via is_project_member).
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-projects-insert-policy.sh

DROP POLICY IF EXISTS "Members can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Auth users can insert projects" ON public.projects;

CREATE POLICY "Auth users can insert projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (true);
