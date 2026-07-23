-- Times de raia do Kanban (nível B): grupos nomeados de pessoas, por projeto,
-- compartilhados entre os membros. Usados como "Raias por time" no board.
-- Comportamento padrão do Kanban não muda — os times só alimentam a raia
-- quando o usuário escolhe agrupar por time.
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1.

CREATE TABLE IF NOT EXISTS public.kanban_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  -- Membros gravados pelo mesmo valor usado em activities.assigned_to (nome/id).
  members text[] NOT NULL DEFAULT '{}',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kanban_teams_project_id_idx ON public.kanban_teams(project_id);

ALTER TABLE public.kanban_teams ENABLE ROW LEVEL SECURITY;

-- Qualquer membro do projeto pode ver e gerenciar os times daquele projeto.
DROP POLICY IF EXISTS "Project members can read kanban_teams" ON public.kanban_teams;
CREATE POLICY "Project members can read kanban_teams" ON public.kanban_teams
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project members can insert kanban_teams" ON public.kanban_teams;
CREATE POLICY "Project members can insert kanban_teams" ON public.kanban_teams
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project members can update kanban_teams" ON public.kanban_teams;
CREATE POLICY "Project members can update kanban_teams" ON public.kanban_teams
  FOR UPDATE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project members can delete kanban_teams" ON public.kanban_teams;
CREATE POLICY "Project members can delete kanban_teams" ON public.kanban_teams
  FOR DELETE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

NOTIFY pgrst, 'reload schema';
