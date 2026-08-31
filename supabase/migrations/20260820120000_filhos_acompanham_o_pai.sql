-- Pai e filhos ficaram em colunas diferentes.
--
-- Relatado, e com razão: "backlog não deve ser uma coluna do kanban. backlog é
-- backlog, onde ficam as atividades para depois trazer para o kanban".
--
-- Era exatamente o que NÃO estava acontecendo. Medido em 20/08/2026:
--
--   * as 43 colunas "Backlog" da base estão com `is_entry_point = true`;
--   * todas elas têm `is_visible = false`.
--
-- Ou seja: toda tarefa nova nascia na única coluna que o quadro não mostra. Na
-- Revitalização Tasy isso deixou 116 das 149 atividades invisíveis no Kanban,
-- enquanto a lista exibia "Backlog" em cada linha.
--
-- ESTA MIGRATION NÃO MEXE MAIS NA ENTRADA -- ver a parte 1. O Backlog é a fila
-- e é onde a EAP importada deve mesmo nascer; quem decide o que entra no quadro
-- é o usuário.
--
-- ── 1) A ENTRADA FICA ONDE ESTÁ ───────────────────────────────────────────
--
-- Eu tinha escrito aqui um UPDATE que tirava `is_entry_point` do Backlog e o
-- passava para a primeira coluna visível. Estava ERRADO, e o relato corrigiu:
-- "a entrada seria determinada pelo usuário quando trouxer do backlog para o
-- kanban".
--
-- O Backlog SER a entrada é coerente: item novo nasce na fila, e quem decide o
-- que entra no fluxo é quem toca o projeto -- pelo próprio Kanban, que já tem
-- o controle de marcar a coluna de entrada (ver ActivityKanban). Reescrever
-- isso por migration seria trocar a decisão do usuário pela minha.
--
-- O que sobra desta migration é a parte 2, que não é sobre onde o trabalho
-- nasce, e sim sobre pai e filhos ficarem SEPARADOS.

-- ── 2) OS FILHOS ACOMPANHAM O PAI ──────────────────────────────────────────
--
-- A 20260819110000 tirou os agrupadores do Backlog, mas mexeu só neles: os
-- FILHOS ficaram para trás. O resultado é o segundo sintoma do relato -- "o
-- pacote se perde com os seus filhos e deixa somente os filhos inflando as
-- colunas": 29 agrupadores em "Não iniciado" com todos os filhos no Backlog.
--
-- Aqui o sentido é o inverso do trigger: normalmente o pai segue os filhos,
-- mas quem foi movido por migration foi o pai — e deixar o filho numa coluna
-- que o quadro não desenha é o defeito original, não a correção dele.
--
-- Só sobe filho que está numa coluna INVISÍVEL. Quem já está em coluna do
-- quadro fica onde está: pode ter sido movido de propósito, e sobrescrever
-- isso apagaria decisão de alguém.
--
-- ── A FILA NÃO CONTA COMO "PERDIDO" (20/08/2026) ──────────────────────────
--
-- Escrito quando o Backlog era uma coluna do quadro escondida por
-- `is_visible`: ali, filho no Backlog com o pai no quadro era mesmo um item
-- perdido numa gaveta.
--
-- O Backlog deixou de ser preferência de projeto e virou regra de produto no
-- código (`colunasDoQuadro`): ele está SEMPRE invisível. Sem a guarda abaixo,
-- `is_visible = false` passaria a significar "está na fila", e este UPDATE
-- arrastaria para o quadro toda EAP importada cujo pai já estivesse lá —
-- exatamente o que se está corrigindo.
--
-- Estar na fila é estado legítimo, não extravio. O que continua sendo defeito
-- é o filho numa coluna do QUADRO que alguém ocultou: essa sim é gaveta.
--
-- Guard: desliga os triggers de negócio durante o UPDATE. (1) o trigger de
-- projeto concluído abortaria se um filho caísse em projeto fechado; (2) o
-- rollup trg_filho_recalcula_pai (leva 8) dispararia no sentido INVERSO ao
-- movimento explícito desta migration. Religado logo após.
SET session_replication_role = replica;

UPDATE public.activities f
   SET workflow_stage_id = p.workflow_stage_id
  FROM public.activities p
  JOIN public.workflow_stages sp ON sp.id = p.workflow_stage_id
 WHERE f.parent_id = p.id
   AND f.is_trashed = false
   AND p.is_trashed = false
   -- pai DENTRO do quadro
   AND sp.is_visible IS DISTINCT FROM false
   -- filho FORA dele, E NÃO por estar na fila
   AND EXISTS (
     SELECT 1 FROM public.workflow_stages sf
      WHERE sf.id = f.workflow_stage_id
        AND sf.is_visible = false
        AND lower(coalesce(sf.categoria::text, '')) IS DISTINCT FROM 'backlog'
   )
   AND f.workflow_stage_id IS DISTINCT FROM p.workflow_stage_id;

-- Religa os triggers de negócio.
SET session_replication_role = origin;

NOTIFY pgrst, 'reload schema';

-- Verificação: só a parte 2 tem o que verificar.
DO $$
DECLARE
  filhos_perdidos int;
BEGIN
  SELECT count(*) INTO filhos_perdidos
    FROM public.activities f
    JOIN public.activities p ON p.id = f.parent_id
    JOIN public.workflow_stages sp ON sp.id = p.workflow_stage_id
    JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
   WHERE f.is_trashed = false AND p.is_trashed = false
     AND sp.is_visible IS DISTINCT FROM false
     AND sf.is_visible = false
     -- Mesma guarda do UPDATE: filho na FILA não é filho perdido. Sem isto a
     -- verificação acusaria como defeito o estado normal da EAP importada e
     -- abortaria a migration inteira.
     AND lower(coalesce(sf.categoria::text, '')) IS DISTINCT FROM 'backlog';

  IF filhos_perdidos > 0 THEN
    RAISE EXCEPTION 'ainda ha % filho(s) fora do quadro com o pai dentro', filhos_perdidos;
  END IF;

  RAISE NOTICE 'Pai e filhos na mesma coluna. Entrada NAO foi alterada.';
END $$;

-- Reversão: os filhos voltariam para a coluna anterior, que não é registrada.
-- A saída de segurança é o backup antes de aplicar; a alteração é de UMA
-- coluna (`workflow_stage_id`) e nenhuma linha é apagada.
