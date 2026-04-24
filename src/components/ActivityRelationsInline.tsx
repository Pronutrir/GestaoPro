import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link2, Ban, Clock3, ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { TaskRelations } from "@/components/TaskRelations";

/**
 * Versão MINIMAL e INLINE dos relacionamentos da atividade.
 * Mostra somente pills compactos com a contagem por tipo (estilo ClickUp):
 *   🔴 1 Bloqueio · 🟠 1 Em espera · 🔗 2 Vinculadas · ⬅ 1 Pred · ➡ 0 Suc
 *
 * Clicar em qualquer pill abre um Popover com o painel `TaskRelations` completo
 * (que cuida de listar/criar/remover vínculos). Isto evita ocupar espaço vertical
 * grande no diálogo de edição.
 */

interface Counts {
  predecessor: number;
  successor: number;
  blocking: number;
  waiting_on: number;
  related: number;
}

interface Props {
  activityId: string;
  projectId: string;
}

export const ActivityRelationsInline = ({ activityId, projectId }: Props) => {
  const [counts, setCounts] = useState<Counts>({
    predecessor: 0, successor: 0, blocking: 0, waiting_on: 0, related: 0,
  });
  const [open, setOpen] = useState(false);

  const fetchCounts = async () => {
    const [{ data: deps }, { data: rels }] = await Promise.all([
      supabase
        .from("task_dependencies")
        .select("predecessor_id, successor_id")
        .or(`predecessor_id.eq.${activityId},successor_id.eq.${activityId}`),
      supabase
        .from("task_relations" as any)
        .select("relation_type, source_activity_id, target_activity_id")
        .or(`source_activity_id.eq.${activityId},target_activity_id.eq.${activityId}`),
    ]);
    const next: Counts = { predecessor: 0, successor: 0, blocking: 0, waiting_on: 0, related: 0 };
    (deps || []).forEach((d: any) => {
      if (d.successor_id === activityId) next.predecessor += 1;
      if (d.predecessor_id === activityId) next.successor += 1;
    });
    ((rels as any[]) || []).forEach((r: any) => {
      if (r.relation_type in next) (next as any)[r.relation_type] += 1;
    });
    setCounts(next);
  };

  useEffect(() => {
    if (!activityId) return;
    fetchCounts();
    const channel = supabase
      .channel(`relations-inline-${activityId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_relations" }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_dependencies" }, () => fetchCounts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  const total = counts.predecessor + counts.successor + counts.blocking + counts.waiting_on + counts.related;

  const pills = useMemo(() => ([
    { key: "blocking", count: counts.blocking, label: "Bloqueio", Icon: Ban,
      cls: "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20" },
    { key: "waiting_on", count: counts.waiting_on, label: "Em espera", Icon: Clock3,
      cls: "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20" },
    { key: "predecessor", count: counts.predecessor, label: "Pred.", Icon: ArrowLeft,
      cls: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20" },
    { key: "successor", count: counts.successor, label: "Suc.", Icon: ArrowRight,
      cls: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20" },
    { key: "related", count: counts.related, label: "Vinculada", Icon: Link2,
      cls: "bg-muted text-foreground border-border hover:bg-muted/80" },
  ]), [counts]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 flex-wrap min-h-[28px] w-full text-left"
          title="Gerenciar relacionamentos"
        >
          {total === 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary px-2 py-0.5 rounded-md border border-dashed border-border hover:border-primary/50 transition-colors">
              <Plus className="w-3 h-3" /> Adicionar vínculo
            </span>
          ) : (
            pills
              .filter(p => p.count > 0)
              .map(({ key, count, label, Icon, cls }) => (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium transition-colors ${cls}`}
                >
                  <Icon className="w-3 h-3" />
                  {count} {label}
                </span>
              ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[92vw] p-3" align="start" side="bottom">
        <TaskRelations activityId={activityId} projectId={projectId} />
      </PopoverContent>
    </Popover>
  );
};