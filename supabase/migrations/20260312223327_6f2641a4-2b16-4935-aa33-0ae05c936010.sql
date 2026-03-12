
-- 1. Tabela de Sprints
CREATE TABLE public.sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  goal text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'planning',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read sprints" ON public.sprints FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert sprints" ON public.sprints FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update sprints" ON public.sprints FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete sprints" ON public.sprints FOR DELETE TO authenticated USING (true);

-- 2. Adicionar story_points e sprint_id em activities
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS story_points integer DEFAULT 0;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS sprint_id uuid REFERENCES public.sprints(id) ON DELETE SET NULL;

-- 3. Adicionar meeting_type em meetings
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_type text NOT NULL DEFAULT 'general';

-- 4. Adicionar sprint_id em meetings para vincular reunião a sprint
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS sprint_id uuid REFERENCES public.sprints(id) ON DELETE SET NULL;

-- 5. Trigger para updated_at em sprints
CREATE TRIGGER update_sprints_updated_at
  BEFORE UPDATE ON public.sprints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
