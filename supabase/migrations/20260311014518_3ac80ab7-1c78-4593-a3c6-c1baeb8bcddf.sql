
-- Create workflow_stages table
CREATE TABLE public.workflow_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  color text NOT NULL DEFAULT 'hsl(220, 15%, 50%)',
  display_order integer NOT NULL DEFAULT 0,
  is_final boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add workflow_stage_id to activities
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS workflow_stage_id uuid REFERENCES public.workflow_stages(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.workflow_stages ENABLE ROW LEVEL SECURITY;

-- RLS policies for workflow_stages
CREATE POLICY "Auth users can read workflow_stages"
  ON public.workflow_stages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users can insert workflow_stages"
  ON public.workflow_stages FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users can update workflow_stages"
  ON public.workflow_stages FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Auth users can delete workflow_stages"
  ON public.workflow_stages FOR DELETE TO authenticated USING (true);

-- Function to create default stages when a project is created
CREATE OR REPLACE FUNCTION public.create_default_workflow_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.workflow_stages (project_id, title, color, display_order, is_final) VALUES
    (NEW.id, 'Backlog', 'hsl(220, 15%, 50%)', 0, false),
    (NEW.id, 'A Fazer', 'hsl(38, 92%, 50%)', 1, false),
    (NEW.id, 'Em Andamento', 'hsl(220, 90%, 56%)', 2, false),
    (NEW.id, 'Em Teste', 'hsl(199, 89%, 48%)', 3, false),
    (NEW.id, 'Aprovada', 'hsl(270, 70%, 55%)', 4, false),
    (NEW.id, 'Concluída', 'hsl(142, 76%, 36%)', 5, true);
  RETURN NEW;
END;
$$;

-- Trigger to auto-create stages on project insert
CREATE TRIGGER trigger_create_default_workflow_stages
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_workflow_stages();
