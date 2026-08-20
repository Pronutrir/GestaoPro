-- O Backlog era a ENTRADA do quadro — e o quadro não o desenha.
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
-- A entrada tem de ser uma coluna VISÍVEL. O Backlog continua existindo, e
-- continua fora do quadro — é a fila de onde se traz o trabalho. O que muda é
-- que ele deixa de ser o destino automático de tudo.
--
-- ── 1) A ENTRADA VAI PARA A PRIMEIRA COLUNA VISÍVEL ────────────────────────
--
-- `is_entry_point` tem índice único parcial por projeto (20260812140000), então
-- a ordem importa: primeiro desmarca, depois marca. Fazer o contrário violaria
-- a restrição no meio do caminho.
UPDATE public.workflow_stages s
   SET is_entry_point = false
 WHERE s.is_entry_point = true
   AND s.is_visible = false;

-- Marca a coluna de início de cada projeto que ficou sem entrada. Prefere a
-- categoria `a_iniciar` ("Não iniciado" no padrão); se não houver, a primeira
-- visível que não seja a de conclusão.
WITH alvo AS (
  SELECT DISTINCT ON (s.project_id)
         s.id, s.project_id
    FROM public.workflow_stages s
   WHERE s.is_visible IS DISTINCT FROM false
     AND coalesce(s.categoria::text, '') <> 'concluida'
     AND NOT EXISTS (
       SELECT 1 FROM public.workflow_stages e
        WHERE e.project_id = s.project_id AND e.is_entry_point = true
     )
   ORDER BY s.project_id,
            (coalesce(s.categoria::text, '') = 'a_iniciar') DESC,
            s.display_order
)
UPDATE public.workflow_stages s
   SET is_entry_point = true
  FROM alvo
 WHERE s.id = alvo.id;

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
UPDATE public.activities f
   SET workflow_stage_id = p.workflow_stage_id
  FROM public.activities p
  JOIN public.workflow_stages sp ON sp.id = p.workflow_stage_id
 WHERE f.parent_id = p.id
   AND f.is_trashed = false
   AND p.is_trashed = false
   -- pai DENTRO do quadro
   AND sp.is_visible IS DISTINCT FROM false
   -- filho FORA dele
   AND EXISTS (
     SELECT 1 FROM public.workflow_stages sf
      WHERE sf.id = f.workflow_stage_id AND sf.is_visible = false
   )
   AND f.workflow_stage_id IS DISTINCT FROM p.workflow_stage_id;

NOTIFY pgrst, 'reload schema';

-- Verificação.
DO $$
DECLARE
  entrada_invisivel int;
  sem_entrada       int;
  filhos_perdidos   int;
BEGIN
  SELECT count(*) INTO entrada_invisivel
    FROM public.workflow_stages
   WHERE is_entry_point = true AND is_visible = false;

  SELECT count(*) INTO sem_entrada
    FROM (SELECT DISTINCT project_id FROM public.workflow_stages) p
   WHERE NOT EXISTS (
     SELECT 1 FROM public.workflow_stages e
      WHERE e.project_id = p.project_id AND e.is_entry_point = true
   );

  SELECT count(*) INTO filhos_perdidos
    FROM public.activities f
    JOIN public.activities p ON p.id = f.parent_id
    JOIN public.workflow_stages sp ON sp.id = p.workflow_stage_id
    JOIN public.workflow_stages sf2 ON sf2.id = f.workflow_stage_id
   WHERE f.is_trashed = false AND p.is_trashed = false
     AND sp.is_visible IS DISTINCT FROM false
     AND sf2.is_visible = false;

  IF entrada_invisivel > 0 THEN
    RAISE EXCEPTION 'ainda ha % coluna(s) de entrada invisivel(is)', entrada_invisivel;
  END IF;
  IF filhos_perdidos > 0 THEN
    RAISE EXCEPTION 'ainda ha % filho(s) fora do quadro com pai dentro', filhos_perdidos;
  END IF;

  RAISE NOTICE 'Entrada em coluna visivel. Projetos sem entrada: % (sem coluna visivel).', sem_entrada;
END $$;

-- Reversão: não há volta automática — o estado anterior era o defeito. Para
-- devolver a entrada ao Backlog de um projeto:
--   UPDATE workflow_stages SET is_entry_point = false WHERE project_id = '...';
--   UPDATE workflow_stages SET is_entry_point = true
--    WHERE project_id = '...' AND display_order = 0;
