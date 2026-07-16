-- Renomeia o status "ideacao" para "backlog" em roadmap_items, alinhando o
-- vocabulário ao fluxo de solicitações: Backlog → Em Análise → Aprovado.
--
-- Escopo: SOMENTE roadmap_items. A tabela `projects` também usa um status
-- "ideacao", que é independente deste e não deve ser alterado.

-- Novo default para as solicitações que chegam pelo formulário (/solicitacao),
-- que não enviam status no insert.
ALTER TABLE public.roadmap_items ALTER COLUMN status SET DEFAULT 'backlog';

-- Converte os itens existentes.
UPDATE public.roadmap_items SET status = 'backlog' WHERE status = 'ideacao';

-- Garante que apenas os estágios previstos sejam gravados.
-- backlog / em_analise / aprovado: fluxo de triagem das solicitações.
-- descartado: arquivadas. em_execucao: já viraram projeto (projetizadas).
ALTER TABLE public.roadmap_items
  ADD CONSTRAINT roadmap_items_status_check
  CHECK (status IN ('backlog', 'em_analise', 'aprovado', 'descartado', 'em_execucao'));
