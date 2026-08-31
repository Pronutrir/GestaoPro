-- ============================================================================
-- get_task_relations — o task_relations também sai da URL para o corpo (RPC)
--
-- Mesma causa e mesmo conserto do get_task_dependencies: o quadro montava
-- or=(source_activity_id.in.(<ids>),target_activity_id.in.(<ids>)) e, mesmo
-- fatiado (chunking), cada lote ainda vai por URL — "a mesma armadilha, só
-- fatiada". A RPC leva o filtro no corpo do POST.
--
-- SECURITY INVOKER: respeita a RLS de quem chama (mesma camada de acesso da
-- atividade). task_relations já tem índices de source_activity_id e
-- target_activity_id, então não crio nenhum.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_task_relations(p_project_id uuid)
RETURNS TABLE (
  id uuid,
  source_activity_id uuid,
  target_activity_id uuid,
  relation_type text,
  note text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT r.id, r.source_activity_id, r.target_activity_id, r.relation_type, r.note
    FROM public.task_relations r
   WHERE EXISTS (
     SELECT 1 FROM public.activities a
      WHERE a.id IN (r.source_activity_id, r.target_activity_id)
        AND a.project_id = p_project_id
   );
$$;

REVOKE ALL ON FUNCTION public.get_task_relations(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_task_relations(uuid) TO authenticated;

DO $conf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_task_relations') THEN
    RAISE EXCEPTION 'get_task_relations não foi criada';
  END IF;
  RAISE NOTICE 'get_task_relations no ar';
END $conf$;

NOTIFY pgrst, 'reload schema';
