-- ROLLBACK DO PROGRESSO -- devolve a regua binaria ao servidor
--
-- Volta `derivar_do_pai()` a versao da fase 09: progresso ponderado por horas,
-- com a filha valendo 100 se `completed` e 0 caso contrario.
--
-- ATENCAO -- A TELA PRECISA VOLTAR JUNTO. Depois desta migration,
-- `derived_progress` deixa de bater com `computeActivityProgress`, e as telas
-- que consomem `progressoDoPai` passam a mostrar a regua binaria: 74 barras
-- caem, ate 66 pontos (medido em 26/08). Reverta o commit do front no mesmo
-- deploy, ou nao reverta.
--
-- `percentual_da_coluna` e `avanco_da_filha` FICAM: sao funcoes de leitura,
-- sem efeito colateral, e derruba-las quebraria qualquer coisa que ja as use.

CREATE OR REPLACE FUNCTION public.derivar_do_pai(p_pai uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_horas   numeric;
  v_custo   numeric;
  v_inicio  date;
  v_fim     date;
  v_prog    numeric;
  v_filhas  int;
BEGIN
  IF p_pai IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN f.is_milestone THEN 0
                      ELSE COALESCE(f.derived_hours, f.hours, 0) END), 0),
    COALESCE(SUM(CASE WHEN f.is_milestone THEN 0
                      ELSE COALESCE(f.derived_cost, f.cost, 0) END), 0),
    MIN(COALESCE(f.derived_start, f.start_date)),
    MAX(COALESCE(f.derived_end, f.end_date)),
    CASE
      WHEN COALESCE(SUM(CASE WHEN f.is_milestone THEN 0
                             ELSE COALESCE(f.derived_hours, f.hours, 0) END), 0) > 0
      THEN ROUND(
        SUM(CASE WHEN f.is_milestone THEN 0
                 ELSE COALESCE(f.derived_hours, f.hours, 0)
                      * (CASE WHEN f.status = 'completed' THEN 100
                              ELSE COALESCE(f.derived_progress, 0) END) END)
        / NULLIF(SUM(CASE WHEN f.is_milestone THEN 0
                          ELSE COALESCE(f.derived_hours, f.hours, 0) END), 0), 2)
      ELSE ROUND(
        COALESCE(AVG(CASE WHEN f.is_milestone THEN NULL
                          WHEN f.status = 'completed' THEN 100
                          ELSE COALESCE(f.derived_progress, 0) END), 0), 2)
    END,
    COUNT(*)
  INTO v_horas, v_custo, v_inicio, v_fim, v_prog, v_filhas
  FROM public.activities f
  WHERE f.parent_id = p_pai
    AND f.is_trashed = false;

  IF v_filhas = 0 THEN
    UPDATE public.activities
       SET derived_hours = NULL, derived_cost = NULL, derived_start = NULL,
           derived_end = NULL, derived_progress = NULL, derived_children = NULL
     WHERE id = p_pai
       AND (derived_children IS NOT NULL OR derived_hours IS NOT NULL);
    RETURN;
  END IF;

  UPDATE public.activities
     SET derived_hours    = v_horas,
         derived_cost     = v_custo,
         derived_start    = v_inicio,
         derived_end      = v_fim,
         derived_progress = v_prog,
         derived_children = v_filhas
   WHERE id = p_pai
     AND (derived_hours    IS DISTINCT FROM v_horas
       OR derived_cost     IS DISTINCT FROM v_custo
       OR derived_start    IS DISTINCT FROM v_inicio
       OR derived_end      IS DISTINCT FROM v_fim
       OR derived_progress IS DISTINCT FROM v_prog
       OR derived_children IS DISTINCT FROM v_filhas);
END;
$$;

-- Recalcula de baixo para cima, senao os valores da regua nova ficam parados.
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    WITH RECURSIVE prof AS (
      SELECT a.id, a.parent_id, 0 AS nivel
        FROM public.activities a
       WHERE a.parent_id IS NULL AND a.is_trashed = false
      UNION ALL
      SELECT f.id, f.parent_id, p.nivel + 1
        FROM public.activities f JOIN prof p ON f.parent_id = p.id
       WHERE f.is_trashed = false AND p.nivel < 10
    )
    SELECT pr.id FROM prof pr
     WHERE EXISTS (SELECT 1 FROM public.activities c
                    WHERE c.parent_id = pr.id AND c.is_trashed = false)
     ORDER BY pr.nivel DESC
  LOOP
    PERFORM public.derivar_do_pai(v_id);
  END LOOP;

  RAISE NOTICE 'regua binaria restaurada. A TELA precisa voltar junto.';
END $$;
