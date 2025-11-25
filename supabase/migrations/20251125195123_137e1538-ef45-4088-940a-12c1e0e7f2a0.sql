-- Criar tabela de projetos
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  assignees TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar índices para melhor performance
CREATE INDEX idx_projects_status ON public.projects(status);
CREATE INDEX idx_projects_priority ON public.projects(priority);
CREATE INDEX idx_projects_created_at ON public.projects(created_at DESC);

-- Habilitar RLS (mas deixar acesso público para testes)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Permitir todas as operações para qualquer um (temporário para testes)
CREATE POLICY "Permitir leitura pública" ON public.projects FOR SELECT TO anon USING (true);
CREATE POLICY "Permitir inserção pública" ON public.projects FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Permitir atualização pública" ON public.projects FOR UPDATE TO anon USING (true);
CREATE POLICY "Permitir exclusão pública" ON public.projects FOR DELETE TO anon USING (true);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();