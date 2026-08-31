-- Restaura a ENTRADA do quadro ao Backlog.
--
-- A migration 20260820120000, na sua primeira versao (backlog_nao_e_entrada_do_
-- quadro), tirava is_entry_point do Backlog e o passava para a primeira coluna
-- visivel. O autor reverteu essa regra no mesmo dia (commit 2ea553a): a EAP
-- importada e PLANEJAMENTO e deve nascer no Backlog; quem decide o que entra no
-- quadro e o usuario, pelo proprio Kanban. A versao vigente de 20260820120000
-- (filhos_acompanham_o_pai) ja NAO mexe na entrada.
--
-- Mas a versao errada CHEGOU a ser aplicada nesta base antes da reversao: os
-- projetos ficaram com a entrada numa coluna visivel. Esta migration desfaz
-- isso, devolvendo a entrada a coluna Backlog invisivel de cada projeto que
-- tenha uma.
--
-- Generica e idempotente: numa base onde a entrada nunca foi movida (instalacao
-- limpa, onde a versao errada nunca existiu), o Backlog ja e a entrada e os dois
-- UPDATE casam zero linhas. So mexe em workflow_stages (sem trigger de projeto
-- concluido); nenhuma atividade e tocada.

-- 1) Desmarca a entrada atual nos projetos que tem um Backlog para receber.
--    O indice unico parcial (workflow_stages_one_entry_per_project) exige
--    desmarcar antes de marcar.
UPDATE public.workflow_stages s
   SET is_entry_point = false
 WHERE s.is_entry_point = true
   AND EXISTS (
     SELECT 1 FROM public.workflow_stages b
      WHERE b.project_id = s.project_id
        AND b.is_visible = false
        AND lower(coalesce(b.categoria::text, '')) = 'backlog'
   );

-- 2) Marca o Backlog como entrada nos projetos que ficaram sem.
WITH bl AS (
  SELECT DISTINCT ON (project_id) id, project_id
    FROM public.workflow_stages
   WHERE is_visible = false
     AND lower(coalesce(categoria::text, '')) = 'backlog'
     AND NOT EXISTS (
       SELECT 1 FROM public.workflow_stages e
        WHERE e.project_id = workflow_stages.project_id
          AND e.is_entry_point = true
     )
   ORDER BY project_id, display_order
)
UPDATE public.workflow_stages s
   SET is_entry_point = true
  FROM bl
 WHERE s.id = bl.id;

NOTIFY pgrst, 'reload schema';

-- Verificacao: nenhuma entrada em coluna visivel onde ha um Backlog invisivel
-- para recebe-la; e no maximo uma entrada por projeto.
DO $$
DECLARE
  visivel_com_backlog int;
  viola               int;
BEGIN
  SELECT count(*) INTO visivel_com_backlog
    FROM public.workflow_stages s
   WHERE s.is_entry_point = true
     AND s.is_visible = true
     AND EXISTS (
       SELECT 1 FROM public.workflow_stages b
        WHERE b.project_id = s.project_id
          AND b.is_visible = false
          AND lower(coalesce(b.categoria::text, '')) = 'backlog'
     );

  SELECT count(*) INTO viola
    FROM (SELECT project_id FROM public.workflow_stages
           WHERE is_entry_point = true
           GROUP BY project_id HAVING count(*) > 1) x;

  IF visivel_com_backlog > 0 THEN
    RAISE EXCEPTION 'ainda ha % projeto(s) com entrada visivel tendo Backlog disponivel', visivel_com_backlog;
  END IF;
  IF viola > 0 THEN
    RAISE EXCEPTION 'ha % projeto(s) com mais de uma entrada', viola;
  END IF;

  RAISE NOTICE 'Entrada restaurada ao Backlog onde ha um.';
END $$;
