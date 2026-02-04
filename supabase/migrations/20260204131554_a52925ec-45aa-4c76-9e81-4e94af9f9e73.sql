-- Create phases table for organizing activities into phases
CREATE TABLE public.phases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add phase_id to activities table
ALTER TABLE public.activities 
ADD COLUMN phase_id UUID REFERENCES public.phases(id) ON DELETE SET NULL;

-- Enable RLS for phases
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for phases (public access for testing)
CREATE POLICY "Permitir leitura pública de fases" 
ON public.phases 
FOR SELECT 
USING (true);

CREATE POLICY "Permitir inserção pública de fases" 
ON public.phases 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Permitir atualização pública de fases" 
ON public.phases 
FOR UPDATE 
USING (true);

CREATE POLICY "Permitir exclusão pública de fases" 
ON public.phases 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_phases_updated_at
BEFORE UPDATE ON public.phases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();