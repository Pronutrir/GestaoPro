-- REALINHA `activities.status` COM A COLUNA -- de novo.
--
-- A 20260811100000 ja fez este alinhamento e a base ficou consistente. Mas ela
-- corrigiu o DADO sem corrigir todas as FONTES do dado, e tres caminhos
-- continuaram gravando a coluna sem o status. Cada uso deles reintroduzia a
-- divergencia:
--
--   1. Cronograma → celula "Coluna". Gravava so `workflow_stage_id`. Mover uma
--      tarefa para "Concluida" por ali deixava o `status` em "pending": o
--      Backlog (que le a coluna) mostrava a mudanca, o Kanban (que le tambem o
--      status) nao. A mesma tarefa aparecia concluida numa tela e aberta na
--      outra -- que e exatamente o sintoma relatado.
--
--   2. Kanban → "mover para o Backlog". Uma tarefa concluida mandada para o
--      backlog ficava `completed` fora da coluna final: aberta no quadro e
--      entregue no relatorio.
--
--   3. Kanban → botao "Desfazer" do toast de mover. A IDA gravava os tres
--      campos; a VOLTA gravava so a coluna. Mover para "Concluida" e desfazer
--      devolvia o cartao a coluna de origem ainda `completed`.
--
-- Os tres foram corrigidos no mesmo commit desta migration. Aqui limpa-se o
-- que eles ja gravaram desde 11/08.
--
-- A regra e a mesma da migration anterior, e continua valendo: a COLUNA e o
-- fato do dia a dia -- e para onde a pessoa arrasta o cartao --, e o `status` e
-- consequencia dela. Onde os dois discordam, a coluna manda.

-- Guard defensivo: os UPDATE abaixo em activities disparariam
-- trg_prevent_activity_mutation_on_concluded_project (20260526150000) se uma
-- divergente cair em projeto concluido. Hoje nenhuma cai (3 divergentes, 0 em
-- concluido), mas o dado muda. Religado apos o passo 2. Mesma tecnica da
-- 20260811100000 e das levas seguintes.
SET session_replication_role = replica;

-- 1) Na coluna final e nao marcada como concluida → conclui.
--    COALESCE preserva `completed_at` quando ja existe: a data em que a tarefa
--    de fato terminou vale mais que a do alinhamento. Quem esta sem data recebe
--    now(), que e honesta (e quando o sistema reconheceu) em vez de inventar
--    uma data de conclusao que ninguem registrou.
UPDATE public.activities a
SET status = 'completed',
    completed_at = COALESCE(a.completed_at, now())
FROM public.workflow_stages s
WHERE a.workflow_stage_id = s.id
  AND s.is_final = true
  AND a.status IS DISTINCT FROM 'completed'
  AND a.is_trashed = false;

-- 2) Marcada como concluida mas FORA da coluna final → reabre.
--    Limpa `completed_at` junto: manter a data numa tarefa que voltou ao fluxo
--    deixaria o relatorio contando entrega que nao houve.
UPDATE public.activities a
SET status = 'pending',
    completed_at = NULL
FROM public.workflow_stages s
WHERE a.workflow_stage_id = s.id
  AND s.is_final IS DISTINCT FROM true
  AND a.status = 'completed'
  AND a.is_trashed = false;

-- Religa os triggers de negocio.
SET session_replication_role = origin;

-- Atividade SEM coluna nao e tocada: nao ha coluna para o status seguir, e
-- adivinhar seria pior que a divergencia. Mesma decisao da 20260811100000.

NOTIFY pgrst, 'reload schema';

-- Verificacao: deve devolver zero.
DO $$
DECLARE
  divergentes int;
BEGIN
  SELECT count(*) INTO divergentes
    FROM public.activities a
    JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
   WHERE a.is_trashed = false
     AND ((a.status = 'completed') IS DISTINCT FROM (s.is_final = true));

  IF divergentes > 0 THEN
    RAISE EXCEPTION 'ainda ha % atividade(s) com status divergente da coluna', divergentes;
  END IF;

  RAISE NOTICE 'Status alinhado com a coluna em todas as atividades vivas.';
END $$;

-- Sem reversao: o estado anterior era a propria divergencia.
