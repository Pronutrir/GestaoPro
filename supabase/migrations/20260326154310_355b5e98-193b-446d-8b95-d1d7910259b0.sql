
CREATE TABLE public.user_story_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'hsl(220, 15%, 50%)',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_final BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_story_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read user_story_stages" ON public.user_story_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert user_story_stages" ON public.user_story_stages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update user_story_stages" ON public.user_story_stages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete user_story_stages" ON public.user_story_stages FOR DELETE TO authenticated USING (true);

-- Trigger to create default stages when a new project is created
CREATE OR REPLACE FUNCTION public.create_default_user_story_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_story_stages (project_id, title, color, display_order, is_final) VALUES
    (NEW.id, 'Rascunho', 'hsl(220, 15%, 50%)', 0, false),
    (NEW.id, 'Em Análise', 'hsl(38, 92%, 50%)', 1, false),
    (NEW.id, 'Validada', 'hsl(270, 70%, 55%)', 2, false),
    (NEW.id, 'Implementando', 'hsl(220, 90%, 56%)', 3, false),
    (NEW.id, 'Concluída', 'hsl(142, 76%, 36%)', 4, true);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_project_created_user_story_stages
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_user_story_stages();

-- Update user_stories to reference stages by ID instead of text status
ALTER TABLE public.user_stories ADD COLUMN stage_id UUID REFERENCES public.user_story_stages(id) ON DELETE SET NULL;
