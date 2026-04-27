import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BlockerInfo {
  relationId: string;
  blockerActivityId: string;
  title: string;
  status: string;
}

/**
 * Retorna a lista de atividades que BLOQUEIAM a atividade informada e que ainda
 * não foram concluídas. Usado para impedir conclusão enquanto há bloqueios pendentes.
 */
export const useTaskBlockers = (activityId: string | undefined) => {
  const [blockers, setBlockers] = useState<BlockerInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!activityId) {
      setBlockers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Quem bloqueia esta tarefa: relations onde target = activityId e tipo = 'blocking'
    const { data: rels } = await supabase
      .from("task_relations" as any)
      .select("id, source_activity_id")
      .eq("target_activity_id", activityId)
      .eq("relation_type", "blocking");
    const list = (rels as any[]) || [];
    if (list.length === 0) {
      setBlockers([]);
      setLoading(false);
      return;
    }
    const sourceIds = list.map((r) => r.source_activity_id);
    const { data: acts } = await supabase
      .from("activities")
      .select("id, title, status")
      .in("id", sourceIds);
    const actMap = new Map((acts || []).map((a: any) => [a.id, a]));
    const pending: BlockerInfo[] = [];
    list.forEach((r) => {
      const a = actMap.get(r.source_activity_id);
      if (a && a.status !== "completed") {
        pending.push({ relationId: r.id, blockerActivityId: a.id, title: a.title, status: a.status });
      }
    });
    setBlockers(pending);
    setLoading(false);
  }, [activityId]);

  useEffect(() => {
    refresh();
    if (!activityId) return;
    const channel = supabase
      .channel(`task-blockers-${activityId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_relations" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "activities" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activityId, refresh]);

  return { blockers, loading, isBlocked: blockers.length > 0, refresh };
};