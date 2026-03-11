
-- Activity Log Entries (Diário de Bordo)
CREATE TABLE public.activity_log_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  promoted_to_lesson_id UUID REFERENCES public.lessons_learned(id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read activity_log_entries" ON public.activity_log_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert activity_log_entries" ON public.activity_log_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update activity_log_entries" ON public.activity_log_entries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete activity_log_entries" ON public.activity_log_entries FOR DELETE TO authenticated USING (true);

-- Meetings
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES public.phases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  meeting_date TIMESTAMP WITH TIME ZONE,
  location TEXT,
  agenda TEXT,
  minutes TEXT,
  participants TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read meetings" ON public.meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert meetings" ON public.meetings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update meetings" ON public.meetings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete meetings" ON public.meetings FOR DELETE TO authenticated USING (true);

-- Meeting Decisions
CREATE TABLE public.meeting_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read meeting_decisions" ON public.meeting_decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert meeting_decisions" ON public.meeting_decisions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update meeting_decisions" ON public.meeting_decisions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete meeting_decisions" ON public.meeting_decisions FOR DELETE TO authenticated USING (true);

-- Meeting Actions (can become activities)
CREATE TABLE public.meeting_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  assigned_to TEXT,
  due_date DATE,
  activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read meeting_actions" ON public.meeting_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert meeting_actions" ON public.meeting_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update meeting_actions" ON public.meeting_actions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete meeting_actions" ON public.meeting_actions FOR DELETE TO authenticated USING (true);
