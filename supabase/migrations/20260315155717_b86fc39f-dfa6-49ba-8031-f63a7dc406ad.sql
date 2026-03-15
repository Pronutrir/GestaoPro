
-- Remove tabela investment_history (não utilizada no código)
DROP TABLE IF EXISTS public.investment_history;

-- Reestruturar activity_investments: adicionar project_id, responsible e category
ALTER TABLE public.activity_investments
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS responsible text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'geral';
