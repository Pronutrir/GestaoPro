import { supabase } from "@/integrations/supabase/client";

export type TaskDependency = {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
  lag_days: number | null;
};

/**
 * AS DEPENDÊNCIAS DO PROJETO EM UMA CHAMADA POST (rpc get_task_dependencies).
 *
 * ============================================================================
 * POR QUE ISTO EXISTE
 *
 * O caminho antigo montava `or=(predecessor_id.in.(<centenas de ids>),
 * successor_id.in.(<...>))` — uma URL de 16–18 KB que o proxy corta e devolve
 * **502** antes de chegar ao banco. O chunking (lib/chunkedIn) era paliativo;
 * esta RPC é o conserto: o filtro vai no CORPO do POST, não na URL.
 *
 * A função no banco é `security invoker` e filtra pelo `project_id` da
 * activity, então respeita a RLS de quem chama — mesma camada de acesso da
 * atividade. `get_task_dependencies` não está nos tipos gerados do Supabase, daí
 * o cast.
 * ============================================================================
 */
export async function fetchTaskDependencias(projectId: string): Promise<TaskDependency[]> {
  if (!projectId) return [];
  const { data, error } = await supabase.rpc("get_task_dependencies" as never, {
    p_project_id: projectId,
  } as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskDependency[];
}

export type TaskRelation = {
  id: string;
  source_activity_id: string;
  target_activity_id: string;
  relation_type: string;
  note: string | null;
};

/**
 * As RELAÇÕES do projeto (bloqueio, em espera, vinculada) por RPC — mesmo
 * conserto do task_dependencies. O chunking era "a mesma armadilha, só fatiada":
 * cada lote ainda ia por URL. `get_task_relations` leva o filtro no corpo do POST.
 */
export async function fetchTaskRelations(projectId: string): Promise<TaskRelation[]> {
  if (!projectId) return [];
  const { data, error } = await supabase.rpc("get_task_relations" as never, {
    p_project_id: projectId,
  } as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskRelation[];
}
