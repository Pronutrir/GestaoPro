
-- Create sectors table
CREATE TABLE public.sectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

-- Public access policies (matching existing pattern)
CREATE POLICY "Permitir leitura pública de setores" ON public.sectors FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública de setores" ON public.sectors FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública de setores" ON public.sectors FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão pública de setores" ON public.sectors FOR DELETE USING (true);
