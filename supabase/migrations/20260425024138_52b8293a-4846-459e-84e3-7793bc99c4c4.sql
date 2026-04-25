-- Tabela de documentos (estilo Notion/Word) por projeto
CREATE TABLE public.project_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Documento sem título',
  content JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  created_by UUID,
  created_by_email TEXT,
  is_trashed BOOLEAN NOT NULL DEFAULT false,
  trashed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_pages_project ON public.project_pages(project_id);

ALTER TABLE public.project_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read project_pages" ON public.project_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert project_pages" ON public.project_pages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update project_pages" ON public.project_pages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete project_pages" ON public.project_pages FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_project_pages_updated_at
BEFORE UPDATE ON public.project_pages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();