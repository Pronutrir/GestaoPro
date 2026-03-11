
-- Table to link users to projects with their role
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'collaborator', -- 'manager' or 'collaborator'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read project_members
CREATE POLICY "Auth users can read project_members" ON public.project_members
  FOR SELECT TO authenticated USING (true);

-- Admins can manage project_members
CREATE POLICY "Admins can insert project_members" ON public.project_members
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update project_members" ON public.project_members
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete project_members" ON public.project_members
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Anon policies for backward compat
CREATE POLICY "Anon can read project_members" ON public.project_members
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert project_members" ON public.project_members
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update project_members" ON public.project_members
  FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete project_members" ON public.project_members
  FOR DELETE TO anon USING (true);
