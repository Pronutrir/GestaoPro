import { useMemo, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays, startOfDay, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Phase {
  id: string; title: string; description: string | null; display_order: number; project_id: string;
}
interface Activity {
  id: string; title: string; description: string | null; status: string; completed_at: string | null;
  created_at: string; assigned_to: string | null; start_date: string | null; end_date: string | null;
  cost: number; hours: number; phase_id: string | null;
}
interface Dependency {
  id: string; predecessor_id: string; successor_id: string; dependency_type: string; lag_days: number | null;
}
interface TimelineViewProps {
  phases: Phase[]; activities: Activity[]; projectDueDate: string | null;
  onActivityClick?: (activity: Activity) => void;
}

export const TimelineView = ({ phases, activities, projectDueDate, onActivityClick }: TimelineViewProps) => {
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const scheduledActivities = activities.filter(a => a.start_date || a.end_date);

  useEffect(() => {
    const actIds = activities.map(a => a.id);
    if (actIds.length === 0) return;
    supabase.from("task_dependencies").select("*")
      .or(`predecessor_id.in.(${actIds.join(",")}),successor_id.in.(${actIds.join(",")})`)
      .then(({ data }) => setDependencies(data || []));
  }, [activities]);

  const { minDate, maxDate, totalDays } = useMemo(() => {
    const dates: Date[] = [startOfDay(new Date())];
    scheduledActivities.forEach(a => {
      if (a.start_date) dates.push(parseISO(a.start_date));
      if (a.end_date) dates.push(parseISO(a.end_date));
    });
    if (projectDueDate) dates.push(parseISO(projectDueDate));
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    const paddedMin = addDays(min, -3);
    const paddedMax = addDays(max, 7);
    return { minDate: paddedMin, maxDate: paddedMax, totalDays: Math.max(differenceInDays(paddedMax, paddedMin), 14) };
  }, [scheduledActivities, projectDueDate]);

  const weekMarkers = useMemo(() => {
    const markers: { date: Date; position: number }[] = [];
    let current = startOfDay(minDate);
    while (current <= maxDate) {
      markers.push({ date: current, position: (differenceInDays(current, minDate) / totalDays) * 100 });
      current = addDays(current, 7);
    }
    return markers;
  }, [minDate, maxDate, totalDays]);

  const todayPosition = useMemo(() => {
    const t = startOfDay(new Date());
    if (t < minDate || t > maxDate) return null;
    return (differenceInDays(t, minDate) / totalDays) * 100;
  }, [minDate, maxDate, totalDays]);

  const dueDatePosition = useMemo(() => {
    if (!projectDueDate) return null;
    return (differenceInDays(parseISO(projectDueDate), minDate) / totalDays) * 100;
  }, [projectDueDate, minDate, totalDays]);

  const groupedActivities = useMemo(() => {
    const groups: { phase: Phase | null; activities: Activity[] }[] = [];
    [...phases].sort((a, b) => a.display_order - b.display_order).forEach(phase => {
      const pa = scheduledActivities.filter(a => a.phase_id === phase.id);
      if (pa.length > 0) groups.push({ phase, activities: pa });
    });
    const unassigned = scheduledActivities.filter(a => !a.phase_id);
    if (unassigned.length > 0) groups.push({ phase: null, activities: unassigned });
    return groups;
  }, [phases, scheduledActivities]);

  // Flat list of activity IDs for dependency line rendering
  const allScheduledIds = useMemo(() => {
    const ids: string[] = [];
    groupedActivities.forEach(g => g.activities.forEach(a => ids.push(a.id)));
    return ids;
  }, [groupedActivities]);

  const getActivityPosition = (activity: Activity) => {
    const start = activity.start_date ? parseISO(activity.start_date) : parseISO(activity.end_date!);
    const end = activity.end_date ? parseISO(activity.end_date) : start;
    const startPos = (differenceInDays(start, minDate) / totalDays) * 100;
    const duration = Math.max(differenceInDays(end, start), 1);
    const width = (duration / totalDays) * 100;
    return { left: Math.max(startPos, 0), width: Math.max(width, 2) };
  };

  const getActivityStatus = (activity: Activity) => {
    if (activity.status === "completed") return "completed";
    const t = startOfDay(new Date());
    if (activity.end_date && parseISO(activity.end_date) < t) return "overdue";
    if (activity.start_date && parseISO(activity.start_date) <= t) return "in_progress";
    return "pending";
  };

  const statusColors: Record<string, string> = {
    completed: "bg-success text-success-foreground",
    overdue: "bg-destructive text-destructive-foreground",
    in_progress: "bg-primary text-primary-foreground",
    pending: "bg-muted-foreground text-background",
  };

  if (scheduledActivities.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Nenhuma atividade agendada</h3>
        <p className="text-sm text-muted-foreground">Adicione datas de início e fim às atividades para visualizar o cronograma.</p>
      </Card>
    );
  }

  // Build dependency lines as SVG paths
  const renderDependencyLines = () => {
    const rowHeight = 44; // h-10 + gap
    const relevantDeps = dependencies.filter(d => allScheduledIds.includes(d.predecessor_id) && allScheduledIds.includes(d.successor_id));
    if (relevantDeps.length === 0) return null;

    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ overflow: "visible" }}>
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="hsl(220,90%,56%)" />
          </marker>
        </defs>
        {relevantDeps.map(dep => {
          const predIdx = allScheduledIds.indexOf(dep.predecessor_id);
          const succIdx = allScheduledIds.indexOf(dep.successor_id);
          const predActivity = activities.find(a => a.id === dep.predecessor_id);
          const succActivity = activities.find(a => a.id === dep.successor_id);
          if (!predActivity || !succActivity) return null;

          const predPos = getActivityPosition(predActivity);
          const succPos = getActivityPosition(succActivity);

          const x1 = predPos.left + predPos.width; // end of predecessor (%)
          const x2 = succPos.left; // start of successor (%)
          const y1 = predIdx * rowHeight + rowHeight / 2;
          const y2 = succIdx * rowHeight + rowHeight / 2;

          // Draw an L-shaped connector
          const midX = `${(x1 + x2) / 2}%`;

          return (
            <path
              key={dep.id}
              d={`M ${x1}% ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2}% ${y2}`}
              fill="none"
              stroke="hsl(220,90%,56%)"
              strokeWidth="1.5"
              strokeDasharray="4 2"
              markerEnd="url(#arrowhead)"
              opacity={0.6}
            />
          );
        })}
      </svg>
    );
  };

  return (
    <Card className="p-6 overflow-hidden">
      <div className="mb-6">
        <h3 className="font-semibold text-foreground mb-2">Cronograma do Projeto</h3>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-success" /><span>Concluída</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary" /><span>Em andamento</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-muted-foreground" /><span>Pendente</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-destructive" /><span>Atrasada</span></div>
          {dependencies.length > 0 && (
            <div className="flex items-center gap-1.5">
              <svg width="16" height="10"><line x1="0" y1="5" x2="16" y2="5" stroke="hsl(220,90%,56%)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
              <span>Dependência</span>
            </div>
          )}
        </div>
      </div>

      {/* Timeline Header */}
      <div className="relative h-8 border-b border-border mb-4">
        {weekMarkers.map((marker, idx) => (
          <div key={idx} className="absolute text-xs text-muted-foreground whitespace-nowrap" style={{ left: `${marker.position}%`, transform: "translateX(-50%)" }}>
            {format(marker.date, "dd/MM", { locale: ptBR })}
          </div>
        ))}
        {todayPosition !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-primary z-10" style={{ left: `${todayPosition}%` }} title="Hoje" />}
        {dueDatePosition !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-destructive z-10" style={{ left: `${dueDatePosition}%` }} title="Prazo" />}
      </div>

      {/* Timeline Content */}
      <div className="space-y-4">
        {groupedActivities.map(group => (
          <div key={group.phase?.id || "unassigned"} className="space-y-2">
            <Badge variant="outline" className="text-xs">{group.phase?.title || "Sem fase"}</Badge>
            <div className="relative">
              {renderDependencyLines()}
              {group.activities.map(activity => {
                const position = getActivityPosition(activity);
                const status = getActivityStatus(activity);
                return (
                  <div key={activity.id} className="relative h-10 group mb-1" onClick={() => onActivityClick?.(activity)}>
                     <div className="absolute inset-0 bg-accent/10 rounded">
                       {weekMarkers.map((marker, idx) => <div key={idx} className="absolute top-0 bottom-0 w-px bg-border/15" style={{ left: `${marker.position}%` }} />)}
                     </div>
                    <div
                      className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all hover:opacity-90 flex items-center px-2 gap-1.5 ${statusColors[status]}`}
                      style={{ left: `${position.left}%`, width: `${position.width}%` }}
                      title={`${activity.title}${activity.assigned_to ? ` - ${activity.assigned_to}` : ""}`}
                    >
                      {status === "completed" && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                      {status === "overdue" && <AlertCircle className="w-3 h-3 shrink-0" />}
                      <span className="text-xs font-medium truncate">{activity.title}</span>
                    </div>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden group-hover:block z-20 bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
                      <p className="font-medium text-sm text-foreground">{activity.title}</p>
                      {activity.assigned_to && <p className="text-xs text-muted-foreground mt-1">👤 {activity.assigned_to}</p>}
                      <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                        {activity.start_date && <span>Início: {format(parseISO(activity.start_date), "dd/MM/yyyy")}</span>}
                        {activity.end_date && <span>Fim: {format(parseISO(activity.end_date), "dd/MM/yyyy")}</span>}
                      </div>
                      {activity.hours > 0 && <p className="text-xs text-muted-foreground mt-1">⏱️ {activity.hours}h</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-border flex items-center gap-4 text-xs">
        {todayPosition !== null && <div className="flex items-center gap-1.5"><div className="w-0.5 h-4 bg-primary" /><span className="text-muted-foreground">Hoje ({format(new Date(), "dd/MM")})</span></div>}
        {projectDueDate && <div className="flex items-center gap-1.5"><div className="w-0.5 h-4 bg-destructive" /><span className="text-muted-foreground">Prazo ({format(parseISO(projectDueDate), "dd/MM/yyyy")})</span></div>}
      </div>
    </Card>
  );
};
