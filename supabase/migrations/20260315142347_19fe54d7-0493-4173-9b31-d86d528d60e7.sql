CREATE TABLE public.sticky_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  position_x INTEGER NOT NULL DEFAULT 0,
  position_y INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sticky_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sticky_notes" ON public.sticky_notes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own sticky_notes" ON public.sticky_notes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own sticky_notes" ON public.sticky_notes FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own sticky_notes" ON public.sticky_notes FOR DELETE TO authenticated USING (user_id = auth.uid());