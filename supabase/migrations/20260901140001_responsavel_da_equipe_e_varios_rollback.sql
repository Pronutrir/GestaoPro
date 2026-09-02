-- ROLLBACK de 20260901140000_responsavel_da_equipe_e_varios.sql
--
-- Volta ao estado da 20260901120000: gatilho da equipe REMOVIDO (inclusão
-- escopada de fora permitida) e o teto de UM responsável por atividade de volta.
--
-- ATENÇÃO: recriar o índice único falha se já existir atividade com MAIS DE UM
-- responsável (criado enquanto "vários" esteve valendo). Nesse caso, resolver os
-- duplicados antes — a query abaixo os lista.

-- 1) o gatilho da equipe sai de novo (volta a permitir escopado de fora)
DROP TRIGGER IF EXISTS trg_assignee_exige_equipe ON public.activity_assignees;
DROP FUNCTION IF EXISTS public.tg_assignee_exige_equipe();

-- 2) diagnóstico: atividades com mais de um responsável (impedem o índice)
DO $dup$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT activity_id FROM public.activity_assignees WHERE papel='responsavel'
     GROUP BY activity_id HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'ha % atividade(s) com mais de um responsavel -- resolva antes de recriar o indice de um-so', n;
  END IF;
END $dup$;

-- 3) o teto de um-só volta
CREATE UNIQUE INDEX IF NOT EXISTS activity_assignees_um_responsavel
  ON public.activity_assignees (activity_id)
  WHERE papel = 'responsavel';

NOTIFY pgrst, 'reload schema';
