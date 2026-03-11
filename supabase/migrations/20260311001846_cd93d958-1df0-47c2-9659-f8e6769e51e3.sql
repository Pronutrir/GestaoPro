
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  sector TEXT,
  role_title TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS for user_roles
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Add authenticated role policies to existing tables
-- Projects
CREATE POLICY "Auth users can read projects" ON public.projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert projects" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update projects" ON public.projects
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete projects" ON public.projects
  FOR DELETE TO authenticated USING (true);

-- Activities
CREATE POLICY "Auth users can read activities" ON public.activities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert activities" ON public.activities
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update activities" ON public.activities
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete activities" ON public.activities
  FOR DELETE TO authenticated USING (true);

-- Phases
CREATE POLICY "Auth users can read phases" ON public.phases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert phases" ON public.phases
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update phases" ON public.phases
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete phases" ON public.phases
  FOR DELETE TO authenticated USING (true);

-- Sectors
CREATE POLICY "Auth users can read sectors" ON public.sectors
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert sectors" ON public.sectors
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update sectors" ON public.sectors
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete sectors" ON public.sectors
  FOR DELETE TO authenticated USING (true);

-- Investment history
CREATE POLICY "Auth users can read investment_history" ON public.investment_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert investment_history" ON public.investment_history
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update investment_history" ON public.investment_history
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete investment_history" ON public.investment_history
  FOR DELETE TO authenticated USING (true);

-- Activity investments
CREATE POLICY "Auth users can read activity_investments" ON public.activity_investments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert activity_investments" ON public.activity_investments
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update activity_investments" ON public.activity_investments
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete activity_investments" ON public.activity_investments
  FOR DELETE TO authenticated USING (true);

-- Activity comments
CREATE POLICY "Auth users can read activity_comments" ON public.activity_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert activity_comments" ON public.activity_comments
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update activity_comments" ON public.activity_comments
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete activity_comments" ON public.activity_comments
  FOR DELETE TO authenticated USING (true);

-- Notifications
CREATE POLICY "Auth users can read notifications" ON public.notifications
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete notifications" ON public.notifications
  FOR DELETE TO authenticated USING (true);

-- Project documents
CREATE POLICY "Auth users can read project_documents" ON public.project_documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert project_documents" ON public.project_documents
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update project_documents" ON public.project_documents
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete project_documents" ON public.project_documents
  FOR DELETE TO authenticated USING (true);

-- Task dependencies
CREATE POLICY "Auth users can read task_dependencies" ON public.task_dependencies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert task_dependencies" ON public.task_dependencies
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update task_dependencies" ON public.task_dependencies
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete task_dependencies" ON public.task_dependencies
  FOR DELETE TO authenticated USING (true);

-- Time entries
CREATE POLICY "Auth users can read time_entries" ON public.time_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert time_entries" ON public.time_entries
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update time_entries" ON public.time_entries
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete time_entries" ON public.time_entries
  FOR DELETE TO authenticated USING (true);

-- Lessons learned
CREATE POLICY "Auth users can read lessons_learned" ON public.lessons_learned
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert lessons_learned" ON public.lessons_learned
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update lessons_learned" ON public.lessons_learned
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete lessons_learned" ON public.lessons_learned
  FOR DELETE TO authenticated USING (true);
