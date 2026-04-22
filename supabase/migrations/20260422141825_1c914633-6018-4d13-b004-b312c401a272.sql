
-- Bloco 4: Estratégia (OKRs)
CREATE TABLE IF NOT EXISTS public.okr_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  owner TEXT,
  cycle TEXT NOT NULL DEFAULT 'Q1',
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  status TEXT NOT NULL DEFAULT 'on_track',
  progress NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.okr_key_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id UUID NOT NULL REFERENCES public.okr_objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  metric_type TEXT NOT NULL DEFAULT 'numeric',
  start_value NUMERIC NOT NULL DEFAULT 0,
  target_value NUMERIC NOT NULL DEFAULT 100,
  current_value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.okr_project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_result_id UUID NOT NULL REFERENCES public.okr_key_results(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contribution_weight NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key_result_id, project_id)
);

ALTER TABLE public.okr_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_project_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read okr_objectives" ON public.okr_objectives FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert okr_objectives" ON public.okr_objectives FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update okr_objectives" ON public.okr_objectives FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete okr_objectives" ON public.okr_objectives FOR DELETE TO authenticated USING (true);

CREATE POLICY "Auth users can read okr_key_results" ON public.okr_key_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert okr_key_results" ON public.okr_key_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update okr_key_results" ON public.okr_key_results FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete okr_key_results" ON public.okr_key_results FOR DELETE TO authenticated USING (true);

CREATE POLICY "Auth users can read okr_project_links" ON public.okr_project_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert okr_project_links" ON public.okr_project_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update okr_project_links" ON public.okr_project_links FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete okr_project_links" ON public.okr_project_links FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_update_okr_objectives_updated BEFORE UPDATE ON public.okr_objectives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_update_okr_key_results_updated BEFORE UPDATE ON public.okr_key_results FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
