-- Adicionar campos de investimento na tabela projects
ALTER TABLE public.projects 
ADD COLUMN budget_planned DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN budget_used DECIMAL(12, 2) DEFAULT 0;

-- Criar tabela de atividades
CREATE TABLE public.activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed')),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para melhor performance
CREATE INDEX idx_activities_project_id ON public.activities(project_id);
CREATE INDEX idx_activities_status ON public.activities(status);

-- Habilitar RLS
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para atividades (público para testes)
CREATE POLICY "Permitir leitura pública de atividades" ON public.activities FOR SELECT TO anon USING (true);
CREATE POLICY "Permitir inserção pública de atividades" ON public.activities FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Permitir atualização pública de atividades" ON public.activities FOR UPDATE TO anon USING (true);
CREATE POLICY "Permitir exclusão pública de atividades" ON public.activities FOR DELETE TO anon USING (true);

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Criar tabela de histórico de investimentos
CREATE TABLE public.investment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice
CREATE INDEX idx_investment_history_project_id ON public.investment_history(project_id);

-- Habilitar RLS
ALTER TABLE public.investment_history ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Permitir leitura pública de investimentos" ON public.investment_history FOR SELECT TO anon USING (true);
CREATE POLICY "Permitir inserção pública de investimentos" ON public.investment_history FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Permitir atualização pública de investimentos" ON public.investment_history FOR UPDATE TO anon USING (true);
CREATE POLICY "Permitir exclusão pública de investimentos" ON public.investment_history FOR DELETE TO anon USING (true);