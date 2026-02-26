
-- Create activity_comments table
CREATE TABLE public.activity_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_comments ENABLE ROW LEVEL SECURITY;

-- Public access policies (matching existing pattern)
CREATE POLICY "Permitir leitura pública de comentários"
  ON public.activity_comments FOR SELECT USING (true);

CREATE POLICY "Permitir inserção pública de comentários"
  ON public.activity_comments FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização pública de comentários"
  ON public.activity_comments FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão pública de comentários"
  ON public.activity_comments FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_activity_comments_updated_at
  BEFORE UPDATE ON public.activity_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
