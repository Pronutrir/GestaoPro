
-- Tabela roadmap_items
CREATE TABLE public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  theme text NOT NULL DEFAULT 'produto',
  status text NOT NULL DEFAULT 'ideacao',
  reach integer NOT NULL DEFAULT 5,
  impact numeric NOT NULL DEFAULT 1,
  confidence numeric NOT NULL DEFAULT 0.8,
  effort integer NOT NULL DEFAULT 5,
  score numeric GENERATED ALWAYS AS (
    (reach * impact * confidence) / NULLIF(effort, 0)
  ) STORED,
  target_quarter text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read roadmap_items" ON public.roadmap_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users can insert roadmap_items" ON public.roadmap_items
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users can update roadmap_items" ON public.roadmap_items
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Auth users can delete roadmap_items" ON public.roadmap_items
  FOR DELETE TO authenticated USING (true);
