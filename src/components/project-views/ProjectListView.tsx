import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronDown, Flag, Plus, User, Calendar, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Phase { id: string; title: string; }
interface Activity {
  id: string; title: string; status: string; assigned_to: string | null;
  end_date: string | null; start_date: string | null; priority?: string;
  phase_id: string | null; description: string | null; parent_id?: string | null;
}
interface Props {
  activities: Activity[];
  phases: Phase[];
  onEditActivity: (activity: Activity) => void;
  onToggleActivity: (activityId: string, currentStatus: string) => void;
  onAddActivity?: () => void;
  canCreate?: boolean;
}

type GroupBy = "status" | "phase" | "priority" | "assignee";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "PENDENTE", color: "bg-muted-foreground/15 text-muted-foreground" },
  in_progress: { label: "EM ANDAMENTO", color: "bg-primary/15 text-primary" },
  completed: { label: "CONCLUÍDA", color: "bg-success/15 text-success" },
};

const PRIORITY_FLAG: Record<string, { label: string; cls: string; dot: string }> = {
  high: { label: "Urgente", cls: "text-destructive", dot: "bg-destructive" },
  medium: { label: "Média", cls: "text-warning", dot: "bg-warning" },
  low: { label: "Baixa", cls: "text-success", dot: "bg-success" },
};

export const ProjectListView = ({ activities, phases, onEditActivity, onToggleActivity, onAddActivity, canCreate }: Props) => {
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(groups.map(g => g.key)));

  const visibleActivities = useMemo(() => activities.filter(a => !a.parent_id), [activities]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color?: string; items: Activity[] }>();
    visibleActivities.forEach(a => {
      let key = "";
      let label = "";
      let color = "bg-muted-foreground/15 text-muted-foreground";
      if (groupBy === "status") {
        key = a.status || "pending";
        const s = STATUS_LABELS[key] ?? STATUS_LABELS.pending;
        label = s.label;
        color = s.color;
      } else if (groupBy === "phase") {
        key = a.phase_id ?? "no-phase";
        label = phases.find(p => p.id === a.phase_id)?.title ?? "Sem fase";
      } else if (groupBy === "priority") {
        key = a.priority || "medium";
        label = (PRIORITY_FLAG[key]?.label ?? "Média").toUpperCase();
      } else {
        key = a.assigned_to ?? "no-owner";
        label = a.assigned_to ?? "Sem responsável";
      }
      if (!map.has(key)) map.set(key, { key, label, color, items: [] });
      map.get(key)!.items.push(a);
    });
    return Array.from(map.values());
  }, [visibleActivities, groupBy, phases]);

  const toggleGroup = (k: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const today = startOfDay(new Date());

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 text-xs flex-wrap mt-[10px]">
        <span className="text-muted-foreground">Agrupar por:</span>
        {(["status", "phase", "priority", "assignee"] as GroupBy[]).map(g => (
          <Button
            key={g}
            size="sm"
            variant={groupBy === g ? "default" : "outline"}
            className="h-7 px-3 text-xs"
            onClick={() => setGroupBy(g)}
          >
            {g === "status" ? "Status" : g === "phase" ? "Fase" : g === "priority" ? "Prioridade" : "Responsável"}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={expandAll} title="Expandir tudo">
            <ChevronsUpDown className="w-3.5 h-3.5" /> Expandir
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={collapseAll} title="Recolher tudo">
            <ChevronsDownUp className="w-3.5 h-3.5" /> Recolher
          </Button>
          {canCreate && onAddActivity && (
            <Button size="sm" className="h-7 px-3 text-xs gap-1" onClick={onAddActivity}>
              <Plus className="w-3.5 h-3.5" /> Nova atividade
            </Button>
          )}
        </div>
      </div>

      {/* Groups */}
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_180px_140px_120px] items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
          <span>Nome</span>
          <span>Responsável</span>
          <span>Vencimento</span>
          <span>Prioridade</span>
        </div>

        {groups.map(g => {
          const isCollapsed = collapsed.has(g.key);
          return (
            <div key={g.key} className="border-b border-border last:border-b-0">
              {/* Group header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-muted/20 cursor-pointer" onClick={() => toggleGroup(g.key)}>
                {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                <Badge variant="outline" className={`text-[10px] font-bold tracking-wide ${g.color ?? ""}`}>{g.label}</Badge>
                <span className="text-xs text-muted-foreground">{g.items.length}</span>
                {canCreate && onAddActivity && (
                  <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto" onClick={(e) => { e.stopPropagation(); onAddActivity(); }}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              {/* Rows */}
              {!isCollapsed && g.items.map(a => {
                const overdue = a.end_date && a.status !== "completed" && isBefore(parseISO(a.end_date), today);
                const flag = PRIORITY_FLAG[a.priority || "medium"];
                return (
                  <div
                    key={a.id}
                    className="grid grid-cols-[1fr_180px_140px_120px] items-center gap-3 px-4 py-2 border-t border-border/50 hover:bg-muted/30 cursor-pointer group"
                    onClick={() => onEditActivity(a)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${flag.dot}`}
                        title={`Prioridade: ${flag.label}`}
                        aria-hidden
                      />
                      <Checkbox
                        checked={a.status === "completed"}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => onToggleActivity(a.id, a.status)}
                      />
                      <span className={`text-sm truncate ${a.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>{a.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                      {a.assigned_to ? (
                        <>
                          <User className="w-3 h-3 flex-none" />
                          <span className="truncate">{a.assigned_to}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {a.end_date ? (
                        <>
                          <Calendar className="w-3 h-3 flex-none" />
                          {format(parseISO(a.end_date), "dd/MM/yy", { locale: ptBR })}
                        </>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Flag className={`w-3.5 h-3.5 ${flag.cls}`} />
                      <span className={flag.cls}>{flag.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {visibleActivities.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">Nenhuma atividade neste projeto.</div>
        )}
      </Card>
    </div>
  );
};