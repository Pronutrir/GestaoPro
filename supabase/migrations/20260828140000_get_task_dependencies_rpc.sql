-- ============================================================================
-- O 502 DO task_dependencies — a URL sai, entra uma RPC (POST)
--
-- 28/08/2026. O quadro/backlog/cronograma buscavam dependências com
--   or=(predecessor_id.in.(<centenas de ids>),successor_id.in.(<...>))
-- montando uma URL de 16–18 KB. O proxy corta antes de chegar ao banco e volta
-- 502. O chunking (lib/chunkedIn) era o paliativo; esta RPC é o conserto: o
-- filtro vai no CORPO do POST, não na URL, e volta a lista inteira do projeto de
-- uma vez.
--
-- ADAPTADA AO SCHEMA REAL: a sugestão assumia public.tasks(id, project_id), mas
-- aqui as tarefas são `activities` — os FKs de task_dependencies apontam para
-- activities(id). O filtro é pelo project_id da activity.
--
-- SECURITY INVOKER de propósito: roda com a RLS de quem chama, então só devolve
-- dependência cujas pontas o usuário enxerga (mesma camada de acesso da
-- atividade, a regra do CLAUDE.md). Nunca SECURITY DEFINER aqui — abriria porta
-- lateral para ver dependência de atividade fora do escopo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_task_dependencies(p_project_id uuid)
RETURNS TABLE (id uuid, predecessor_id uuid, successor_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT d.id, d.predecessor_id, d.successor_id
    FROM public.task_dependencies d
   WHERE EXISTS (
     SELECT 1 FROM public.activities a
      WHERE a.id IN (d.predecessor_id, d.successor_id)
        AND a.project_id = p_project_id
   );
$$;

REVOKE ALL ON FUNCTION public.get_task_dependencies(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_task_dependencies(uuid) TO authenticated;

-- Índice de successor_id: o EXISTS acima busca por AMBAS as pontas. predecessor_id
-- já é a coluna-líder do índice único (predecessor_id, successor_id), então buscas
-- por ele estão cobertas; successor_id sozinho, não — sem este índice o EXISTS
-- varre a tabela a cada carga. (Não crio um segundo índice de predecessor_id: seria
-- redundante com o único composto.)
CREATE INDEX IF NOT EXISTS task_dependencies_successor_id_idx
  ON public.task_dependencies (successor_id);

DO $conf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_task_dependencies') THEN
    RAISE EXCEPTION 'a função get_task_dependencies não foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'task_dependencies_successor_id_idx') THEN
    RAISE EXCEPTION 'o índice de successor_id não foi criado';
  END IF;
  RAISE NOTICE 'get_task_dependencies criada; índice de successor_id no ar';
END $conf$;

NOTIFY pgrst, 'reload schema';
