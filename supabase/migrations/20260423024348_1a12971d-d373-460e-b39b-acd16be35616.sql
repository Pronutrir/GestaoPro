-- Add TAP fields to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type text,
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS problem_statement text,
  ADD COLUMN IF NOT EXISTS root_cause text,
  ADD COLUMN IF NOT EXISTS expected_benefits text,
  ADD COLUMN IF NOT EXISTS solved_problem text,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS out_of_scope text,
  ADD COLUMN IF NOT EXISTS restrictions text,
  ADD COLUMN IF NOT EXISTS regulatory_requirements text;

-- Create project_dependencies table
CREATE TABLE IF NOT EXISTS public.project_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  depends_on text,
  linked_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  responsible text,
  status text NOT NULL DEFAULT 'pendente',
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_dependencies_project ON public.project_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_project_dependencies_linked ON public.project_dependencies(linked_project_id);

ALTER TABLE public.project_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read project_dependencies"
  ON public.project_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert project_dependencies"
  ON public.project_dependencies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update project_dependencies"
  ON public.project_dependencies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete project_dependencies"
  ON public.project_dependencies FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_project_dependencies_updated_at
  BEFORE UPDATE ON public.project_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();