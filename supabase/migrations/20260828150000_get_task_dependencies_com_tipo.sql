-- ============================================================================
-- get_task_dependencies ganha dependency_type e lag_days
--
-- 28/08/2026. A primeira versão (20260828140000) devolvia só id/predecessor/
-- successor — bastava para o Kanban e o Backlog. Mas ProjectDependenciesView e
-- TimelineView precisam do TIPO da dependência (e o lag), e por isso ficaram no
-- chunking. Chunking é o MESMO padrão de URL que causou o 502, só dividido:
-- quando o projeto cresce, cada lote volta a ir por URL. Estender a RPC com as
-- duas colunas mata a categoria inteira — as quatro telas passam a usar a RPC.
--
-- Mudar o tipo de retorno exige DROP + CREATE (o Postgres não deixa CREATE OR
-- REPLACE trocar a assinatura de RETURNS TABLE).
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_task_dependencies(uuid);

CREATE FUNCTION public.get_task_dependencies(p_project_id uuid)
RETURNS TABLE (
  id uuid,
  predecessor_id uuid,
  successor_id uuid,
  dependency_type text,
  lag_days integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT d.id, d.predecessor_id, d.successor_id, d.dependency_type, d.lag_days
    FROM public.task_dependencies d
   WHERE EXISTS (
     SELECT 1 FROM public.activities a
      WHERE a.id IN (d.predecessor_id, d.successor_id)
        AND a.project_id = p_project_id
   );
$$;

REVOKE ALL ON FUNCTION public.get_task_dependencies(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_task_dependencies(uuid) TO authenticated;

DO $conf$
DECLARE v_cols int;
BEGIN
  SELECT count(*) INTO v_cols
    FROM information_schema.parameters
   WHERE specific_schema = 'public'
     AND specific_name LIKE 'get_task_dependencies%'
     AND parameter_mode = 'OUT';
  -- 5 colunas de saída: id, predecessor_id, successor_id, dependency_type, lag_days
  IF v_cols <> 5 THEN
    RAISE EXCEPTION 'get_task_dependencies devolve % colunas, esperava 5', v_cols;
  END IF;
  RAISE NOTICE 'get_task_dependencies agora devolve dependency_type e lag_days';
END $conf$;

NOTIFY pgrst, 'reload schema';
