import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Pencil, User, Flag } from "lucide-react";

interface Activity {
  id: string;
  title: string;
  status: string;
  priority?: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  completed_at: string | null;
  deadline_flag?: string | null;
  last_update_date?: string | null;
  phase_id: string | null;
  hours: number | null;
}

interface Props {
  activities: Activity[];
  onEditActivity: (activity: Activity) => void;
}

const FLAG_DISPLAY: Record<string, { label: string; class: string }> = {
  green: { label: "🟢 Em dia", class: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  orange: { label: "🟠 Atenção", class: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  red: { label: "🔴 Vencido", class: "bg-destructive/10 text-destructive border-destructive/30" },
};

const PRIORITY_LABELS: Record<string, { label: string; class: string }> = {
  low: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  medium: { label: "Média", class: "bg-warning/20 text-warning" },
  high: { label: "Alta", class: "bg-destructive/20 text-destructive" },
};

export const DailyPendencies = ({ activities, onEditActivity }: Props) => {
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const dailyActivities = useMemo(() => {
    return activities.filter((a) => {
      if (a.status === "completed") return false;
      const endMatch = a.end_date === todayStr;
      const updateMatch = a.last_update_date === todayStr;
      return endMatch || updateMatch;
    });
  }, [activities, todayStr]);

  if (dailyActivities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="w-12 h-12 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Nenhuma pendência para hoje</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Atividades com data fim ou data de atualização em {new Date().toLocaleDateString("pt-BR")} aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-4">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="secondary" className="text-xs gap-1">
          <Clock className="w-3 h-3" />
          {dailyActivities.length} pendência{dailyActivities.length !== 1 ? "s" : ""} para hoje — {new Date().toLocaleDateString("pt-BR")}
        </Badge>
      </div>

      <div className="space-y-2">
        {dailyActivities.map((activity) => {
          const flag = activity.deadline_flag ? FLAG_DISPLAY[activity.deadline_flag] : null;
          const priority = PRIORITY_LABELS[activity.priority || "medium"];

          return (
            <Card
              key={activity.id}
              className="p-3 hover:shadow-md transition-shadow cursor-pointer border-border"
              onClick={() => onEditActivity(activity)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {flag && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${flag.class}`}>
                        {flag.label}
                      </Badge>
                    )}
                    <p className="text-sm font-semibold text-foreground truncate">{activity.title}</p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {activity.assigned_to && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="w-3 h-3" /> {activity.assigned_to}
                      </span>
                    )}
                    {priority && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priority.class}`}>
                        {priority.label}
                      </Badge>
                    )}
                    {activity.end_date === todayStr && (
                      <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
                        <Calendar className="w-3 h-3" /> Fim hoje
                      </span>
                    )}
                    {activity.last_update_date === todayStr && (
                      <span className="flex items-center gap-1 text-[10px] text-orange-600 font-medium">
                        <Clock className="w-3 h-3" /> Atualização hoje
                      </span>
                    )}
                  </div>
                </div>

                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); onEditActivity(activity); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
