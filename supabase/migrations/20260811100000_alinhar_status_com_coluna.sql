-- ============================================================================
-- ALINHA `activities.status` COM A COLUNA DO KANBAN
--
-- Medido em 11/08/2026: 11 atividades tinham os dois campos DISCORDANDO —
-- cinco com status='pending' sentadas na coluna "Concluída", e duas com
-- status='completed' fora dela. Na tela isso aparecia como título riscado
-- ao lado de um badge dizendo "Em Execução".
--
-- Decisão do usuário: A COLUNA MANDA. É onde a pessoa move a tarefa — o gesto
-- real do dia a dia. O `status` passa a ser consequência dela.
--
-- ============================================================================
-- ANTES DE ALINHAR: consertar a CAUSA
--
-- Investigando, a divergência não era aleatória. Existe UMA coluna chamada
-- "Concluída" (entre 34) que ficou SEM a flag `is_final`. Tarefas movidas
-- para lá nunca eram marcadas como concluídas, porque o código pergunta pela
-- flag, não pelo nome.
--
-- Alinhar o status sem corrigir a flag reabriria essas tarefas — o oposto do
-- que o usuário quis ao movê-las.
-- ============================================================================

-- 1) A coluna que se chama "Concluída" mas não está marcada como final.
--    Só as que TÊM esse nome: marcar por heurística mais larga arriscaria
--    transformar uma coluna de trabalho em final.
UPDATE public.workflow_stages
SET is_final = true
WHERE lower(trim(title)) IN ('concluída', 'concluida', 'concluído', 'concluido')
  AND is_final IS DISTINCT FROM true;

-- Desliga os triggers de negocio antes dos UPDATE em activities: 9 das 11
-- divergentes estao em projetos concluidos, e o trigger
-- trg_prevent_activity_mutation_on_concluded_project (20260526150000)
-- abortaria a migration. Reativado logo apos o passo 3.
SET session_replication_role = replica;

-- 2) Na coluna final e não marcada como concluída → conclui.
--    COALESCE preserva `completed_at` quando já existe: a data em que a tarefa
--    de fato terminou vale mais que a do alinhamento. Só quem está sem data
--    recebe now() — que é honesta (é quando o sistema reconheceu), ao contrário
--    de inventar uma data de conclusão que ninguém registrou.
UPDATE public.activities a
SET status = 'completed',
    completed_at = COALESCE(a.completed_at, now())
FROM public.workflow_stages s
WHERE a.workflow_stage_id = s.id
  AND s.is_final = true
  AND a.status IS DISTINCT FROM 'completed'
  AND a.is_trashed = false;

-- 3) Marcada como concluída mas FORA da coluna final → reabre.
--    Limpa `completed_at` junto: manter a data de conclusão numa tarefa que
--    voltou ao fluxo deixaria o relatório contando entrega que não houve.
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

-- ============================================================================
-- VERIFICAÇÃO — deve devolver ZERO linhas depois de aplicar.
-- ============================================================================
DO $$
DECLARE
  divergentes int;
BEGIN
  SELECT count(*) INTO divergentes
  FROM public.activities a
  JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
  WHERE a.is_trashed = false
    AND ((a.status = 'completed') IS DISTINCT FROM (s.is_final = true));

  RAISE NOTICE 'Atividades com status divergente da coluna: %', divergentes;
END $$;
