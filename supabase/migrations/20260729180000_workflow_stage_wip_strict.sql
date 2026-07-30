-- Limite de WIP rígido, opcional por coluna.
--
-- O limite de WIP já existia e sinalizava o estouro no cabeçalho, mas nada
-- impedia o drop que ultrapassava — e um limite que nunca impede é decorativo.
-- A literatura Kanban trata o limite como restrição real (é ele que força a
-- conversa "o que a gente termina antes de puxar mais?"); Jira oferece o
-- bloqueio como opção.
--
-- Opt-in de propósito: transformar todo limite existente em rígido mudaria o
-- comportamento de quadros em uso sem ninguém pedir. Padrão false = exatamente
-- o comportamento de hoje (só avisa).

ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS wip_strict boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workflow_stages.wip_strict IS
  'Quando true, o quadro IMPEDE mover card para esta coluna se wip_limit for atingido. Quando false (padrão), apenas sinaliza o estouro.';

-- Reversão (manual):
--   ALTER TABLE public.workflow_stages DROP COLUMN IF EXISTS wip_strict;
