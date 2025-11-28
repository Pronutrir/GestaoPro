-- Create activity_investments table to track budget for each activity
CREATE TABLE public.activity_investments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.activity_investments ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (for testing)
CREATE POLICY "Permitir leitura pública de investimentos de atividades" 
ON public.activity_investments 
FOR SELECT 
USING (true);

CREATE POLICY "Permitir inserção pública de investimentos de atividades" 
ON public.activity_investments 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Permitir atualização pública de investimentos de atividades" 
ON public.activity_investments 
FOR UPDATE 
USING (true);

CREATE POLICY "Permitir exclusão pública de investimentos de atividades" 
ON public.activity_investments 
FOR DELETE 
USING (true);

-- Create index for better performance
CREATE INDEX idx_activity_investments_activity_id ON public.activity_investments(activity_id);