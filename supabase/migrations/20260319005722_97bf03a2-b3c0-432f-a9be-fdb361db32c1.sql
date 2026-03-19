
CREATE TABLE public.user_stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  persona TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  benefit TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT[] NOT NULL DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read user_stories" ON public.user_stories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert user_stories" ON public.user_stories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update user_stories" ON public.user_stories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete user_stories" ON public.user_stories FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon can read user_stories" ON public.user_stories FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert user_stories" ON public.user_stories FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update user_stories" ON public.user_stories FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete user_stories" ON public.user_stories FOR DELETE TO anon USING (true);
