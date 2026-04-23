import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Carrega o conjunto de atividades/fases bloqueadas por RFCs PENDENTES do projeto.
 *
 * Regras:
 * - Se uma RFC pendente NÃO tiver itens de escopo, ela é considerada "bloqueio amplo"
 *   (`hasGlobalBlock = true`) e bloqueia todo o projeto (compatibilidade com RFCs antigas).
 * - Caso contrário, apenas os IDs listados ficam bloqueados.
 */
export const useChangeRequestBlocks = (projectId: string | undefined) => {
  const [blockedActivityIds, setBlockedActivityIds] = useState<Set<string>>(new Set());
  const [blockedPhaseIds, setBlockedPhaseIds] = useState<Set<string>>(new Set());
  const [hasGlobalBlock, setHasGlobalBlock] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);

    const { data: pendingRFCs } = await supabase
      .from("change_requests" as any)
      .select("id")
      .eq("project_id", projectId)
      .eq("is_trashed", false)
      .eq("status", "pending");

    const rfcs = (pendingRFCs as any[]) || [];
    setPendingCount(rfcs.length);

    if (rfcs.length === 0) {
      setBlockedActivityIds(new Set());
      setBlockedPhaseIds(new Set());
      setHasGlobalBlock(false);
      setLoading(false);
      return;
    }

    const rfcIds = rfcs.map(r => r.id);
    const { data: scope } = await supabase
      .from("change_request_scope_items" as any)
      .select("change_request_id, item_type, activity_id, phase_id")
      .in("change_request_id", rfcIds);

    const scopeRows = (scope as any[]) || [];
    const grouped = new Map<string, any[]>();
    scopeRows.forEach(row => {
      const list = grouped.get(row.change_request_id) || [];
      list.push(row);
      grouped.set(row.change_request_id, list);
    });

    let global = false;
    const acts = new Set<string>();
    const phs = new Set<string>();
    rfcIds.forEach(rid => {
      const items = grouped.get(rid) || [];
      if (items.length === 0) {
        global = true;
      } else {
        items.forEach(it => {
          if (it.item_type === "activity" && it.activity_id) acts.add(it.activity_id);
          if (it.item_type === "phase" && it.phase_id) phs.add(it.phase_id);
        });
      }
    });

    setBlockedActivityIds(acts);
    setBlockedPhaseIds(phs);
    setHasGlobalBlock(global);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    refresh();
    if (!projectId) return;
    const channel = supabase
      .channel(`change-blocks-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "change_requests", filter: `project_id=eq.${projectId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "change_request_scope_items" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, refresh]);

  const isActivityBlocked = useCallback(
    (activityId: string, phaseId?: string | null) =>
      hasGlobalBlock ||
      blockedActivityIds.has(activityId) ||
      (!!phaseId && blockedPhaseIds.has(phaseId)),
    [hasGlobalBlock, blockedActivityIds, blockedPhaseIds]
  );

  const isPhaseBlocked = useCallback(
    (phaseId: string) => hasGlobalBlock || blockedPhaseIds.has(phaseId),
    [hasGlobalBlock, blockedPhaseIds]
  );

  return {
    loading,
    pendingCount,
    hasGlobalBlock,
    blockedActivityIds,
    blockedPhaseIds,
    isActivityBlocked,
    isPhaseBlocked,
    refresh,
  };
};