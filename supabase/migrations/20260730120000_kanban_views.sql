-- Visões salvas do Kanban (Item 3 da rodada final): combinação nomeada de
-- filtros + raia + ordenação + campos do card, POR PROJETO e compartilhada
-- com o time (é por isso que mora no banco, não no localStorage — "a
-- diretoria vê o mesmo quadro" exige que a visão viaje).
-- NÃO é a migração geral de preferências (essa segue adiada por decisão).
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-kanban-views.sh

CREATE TABLE IF NOT EXISTS public.kanban_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Snapshot da exibição: { filters: {...}, groupBy, boardSort, cardFields }.
  config jsonb NOT NULL DEFAULT '{}',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kanban_views_project_id_idx ON public.kanban_views(project_id);

ALTER TABLE public.kanban_views ENABLE ROW LEVEL SECURITY;

-- Membros do projeto veem e criam; só o AUTOR altera/exclui a própria visão
-- (evita alguém apagar a visão salva de outra pessoa).
DROP POLICY IF EXISTS "Project members can read kanban_views" ON public.kanban_views;
CREATE POLICY "Project members can read kanban_views" ON public.kanban_views
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project members can insert kanban_views" ON public.kanban_views;
CREATE POLICY "Project members can insert kanban_views" ON public.kanban_views
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS "Creators can update kanban_views" ON public.kanban_views;
CREATE POLICY "Creators can update kanban_views" ON public.kanban_views
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Creators can delete kanban_views" ON public.kanban_views;
CREATE POLICY "Creators can delete kanban_views" ON public.kanban_views
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

NOTIFY pgrst, 'reload schema';
