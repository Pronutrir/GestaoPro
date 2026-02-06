import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays, startOfDay, addDays, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface Phase {
  id: string;
  title: string;
  description: string | null;
  display_order: number;
  project_id: string;
}

interface Activity {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  cost: number;
  hours: number;
  phase_id: string | null;
}

interface TimelineViewProps {
  phases: Phase[];
  activities: Activity[];
  projectDueDate: string | null;
  onActivityClick?: (activity: Activity) => void;
}

export const TimelineView = ({
  phases,
  activities,
  projectDueDate,
  onActivityClick,
}: TimelineViewProps) => {
  // Filter activities that have dates
  const scheduledActivities = activities.filter(a => a.start_date || a.end_date);
  
  // Calculate timeline bounds
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const dates: Date[] = [];
    
    scheduledActivities.forEach(a => {
      if (a.start_date) dates.push(parseISO(a.start_date));
      if (a.end_date) dates.push(parseISO(a.end_date));
    });
    
    if (projectDueDate) {
      dates.push(parseISO(projectDueDate));
    }
    
    // Add today
    dates.push(startOfDay(new Date()));
    
    if (dates.length === 0) {
      const today = startOfDay(new Date());
      return { 
        minDate: today, 
        maxDate: addDays(today, 30), 
        totalDays: 30 
      };
    }
    
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Add padding
    const paddedMin = addDays(min, -3);
    const paddedMax = addDays(max, 7);
    
    return {
      minDate: paddedMin,
      maxDate: paddedMax,
      totalDays: Math.max(differenceInDays(paddedMax, paddedMin), 14),
    };
  }, [scheduledActivities, projectDueDate]);

  // Generate week markers
  const weekMarkers = useMemo(() => {
    const markers: { date: Date; position: number }[] = [];
    let current = startOfDay(minDate);
    
    while (current <= maxDate) {
      const position = (differenceInDays(current, minDate) / totalDays) * 100;
      markers.push({ date: current, position });
      current = addDays(current, 7);
    }
    
    return markers;
  }, [minDate, maxDate, totalDays]);

  // Today's position
  const todayPosition = useMemo(() => {
    const today = startOfDay(new Date());
    if (today < minDate || today > maxDate) return null;
    return (differenceInDays(today, minDate) / totalDays) * 100;
  }, [minDate, maxDate, totalDays]);

  // Due date position
  const dueDatePosition = useMemo(() => {
    if (!projectDueDate) return null;
    const dueDate = parseISO(projectDueDate);
    return (differenceInDays(dueDate, minDate) / totalDays) * 100;
  }, [projectDueDate, minDate, totalDays]);

  // Group activities by phase
  const groupedActivities = useMemo(() => {
    const groups: { phase: Phase | null; activities: Activity[] }[] = [];
    
    // Add phases with their activities
    phases.sort((a, b) => a.display_order - b.display_order).forEach(phase => {
      const phaseActivities = scheduledActivities.filter(a => a.phase_id === phase.id);
      if (phaseActivities.length > 0) {
        groups.push({ phase, activities: phaseActivities });
      }
    });
    
    // Add unassigned activities
    const unassigned = scheduledActivities.filter(a => !a.phase_id);
    if (unassigned.length > 0) {
      groups.push({ phase: null, activities: unassigned });
    }
    
    return groups;
  }, [phases, scheduledActivities]);

  const getActivityPosition = (activity: Activity) => {
    const start = activity.start_date ? parseISO(activity.start_date) : parseISO(activity.end_date!);
    const end = activity.end_date ? parseISO(activity.end_date) : start;
    
    const startPos = (differenceInDays(start, minDate) / totalDays) * 100;
    const duration = Math.max(differenceInDays(end, start), 1);
    const width = (duration / totalDays) * 100;
    
    return { left: `${Math.max(startPos, 0)}%`, width: `${Math.max(width, 2)}%` };
  };

  const getActivityStatus = (activity: Activity) => {
    if (activity.status === "completed") return "completed";
    
    const today = startOfDay(new Date());
    if (activity.end_date && parseISO(activity.end_date) < today) {
      return "overdue";
    }
    
    if (activity.start_date && parseISO(activity.start_date) <= today) {
      return "in_progress";
    }
    
    return "pending";
  };

  if (scheduledActivities.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Nenhuma atividade agendada</h3>
        <p className="text-sm text-muted-foreground">
          Adicione datas de início e fim às atividades para visualizar o cronograma.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 overflow-hidden">
      <div className="mb-6">
        <h3 className="font-semibold text-foreground mb-2">Cronograma do Projeto</h3>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-success" />
            <span>Concluída</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-primary" />
            <span>Em andamento</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-muted-foreground" />
            <span>Pendente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-destructive" />
            <span>Atrasada</span>
          </div>
        </div>
      </div>

      {/* Timeline Header */}
      <div className="relative h-8 border-b border-border mb-4 overflow-x-auto">
        {weekMarkers.map((marker, idx) => (
          <div
            key={idx}
            className="absolute text-xs text-muted-foreground whitespace-nowrap"
            style={{ left: `${marker.position}%`, transform: "translateX(-50%)" }}
          >
            {format(marker.date, "dd/MM", { locale: ptBR })}
          </div>
        ))}
        
        {/* Today marker */}
        {todayPosition !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
            style={{ left: `${todayPosition}%` }}
            title="Hoje"
          />
        )}
        
        {/* Due date marker */}
        {dueDatePosition !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-destructive z-10"
            style={{ left: `${dueDatePosition}%` }}
            title="Prazo de entrega"
          />
        )}
      </div>

      {/* Timeline Content */}
      <div className="space-y-4 overflow-x-auto">
        {groupedActivities.map((group, groupIdx) => (
          <div key={group.phase?.id || "unassigned"} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {group.phase?.title || "Sem fase"}
              </Badge>
            </div>
            
            {group.activities.map(activity => {
              const position = getActivityPosition(activity);
              const status = getActivityStatus(activity);
              
              return (
                <div
                  key={activity.id}
                  className="relative h-10 group"
                  onClick={() => onActivityClick?.(activity)}
                >
                  {/* Row background with grid */}
                  <div className="absolute inset-0 bg-accent/20 rounded">
                    {weekMarkers.map((marker, idx) => (
                      <div
                        key={idx}
                        className="absolute top-0 bottom-0 w-px bg-border/50"
                        style={{ left: `${marker.position}%` }}
                      />
                    ))}
                  </div>
                  
                  {/* Activity bar */}
                  <div
                    className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all hover:opacity-90 flex items-center px-2 gap-1.5 ${
                      status === "completed"
                        ? "bg-success text-success-foreground"
                        : status === "overdue"
                        ? "bg-destructive text-destructive-foreground"
                        : status === "in_progress"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted-foreground text-background"
                    }`}
                    style={position}
                    title={`${activity.title}${activity.assigned_to ? ` - ${activity.assigned_to}` : ""}`}
                  >
                    {status === "completed" && <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
                    {status === "overdue" && <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                    <span className="text-xs font-medium truncate">
                      {activity.title}
                    </span>
                  </div>
                  
                  {/* Activity label (on hover) */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden group-hover:block z-20 bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
                    <p className="font-medium text-sm text-foreground">{activity.title}</p>
                    {activity.assigned_to && (
                      <p className="text-xs text-muted-foreground mt-1">👤 {activity.assigned_to}</p>
                    )}
                    <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                      {activity.start_date && (
                        <span>Início: {format(parseISO(activity.start_date), "dd/MM/yyyy")}</span>
                      )}
                      {activity.end_date && (
                        <span>Fim: {format(parseISO(activity.end_date), "dd/MM/yyyy")}</span>
                      )}
                    </div>
                    {activity.hours > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">⏱️ {activity.hours}h</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-border flex items-center gap-4 text-xs">
        {todayPosition !== null && (
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-4 bg-primary" />
            <span className="text-muted-foreground">Hoje ({format(new Date(), "dd/MM")})</span>
          </div>
        )}
        {projectDueDate && (
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-4 bg-destructive" />
            <span className="text-muted-foreground">
              Prazo ({format(parseISO(projectDueDate), "dd/MM/yyyy")})
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};
