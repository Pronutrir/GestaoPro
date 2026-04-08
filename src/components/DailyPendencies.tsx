import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Pencil, User, Flag, AlertTriangle, CheckCircle2, AlertCircle, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Activity {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority?: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  completed_at: string | null;
  created_at: string;
  cost: number;
  hours: number | null;
  deadline_flag?: string | null;
  last_update_date?: string | null;
  phase_id: string | null;
}

interface Props {
  activities: Activity[];
  onEditActivity: (activity: Activity) => void;
}

const FLAG_DISPLAY: Record<string, { label: string; class: string }> = {
  green: { label: "Em dia", class: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  orange: { label: "Atenção", class: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  red: { label: "Vencido", class: "bg-destructive/10 text-destructive border-destructive/30" },
};

const PRIORITY_LABELS: Record<string, { label: string; class: string }> = {
  low: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  medium: { label: "Média", class: "bg-warning/20 text-warning" },
  high: { label: "Alta", class: "bg-destructive/20 text-destructive" },
};

export const DailyPendencies = ({ activities, onEditActivity }: Props) => {
  const [filterType, setFilterType] = useState<"all" | "end_date" | "update_date">("all");

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const pendingActivities = useMemo(() => {
    return activities.filter((a) => {
      if (a.status === "completed") return false;
      const endMatch = a.end_date && a.end_date <= todayStr;
      const updateMatch = a.last_update_date && a.last_update_date <= todayStr;
      if (filterType === "end_date") return endMatch;
      if (filterType === "update_date") return updateMatch;
      return endMatch || updateMatch;
    });
  }, [activities, todayStr, filterType]);

  const overdueCount = useMemo(() =>
    pendingActivities.filter(a => a.end_date && a.end_date < todayStr).length
  , [pendingActivities, todayStr]);

  const dueTodayCount = useMemo(() =>
    pendingActivities.filter(a => a.end_date === todayStr).length
  , [pendingActivities, todayStr]);

  const updateTodayCount = useMemo(() =>
    pendingActivities.filter(a => a.last_update_date && a.last_update_date <= todayStr).length
  , [pendingActivities, todayStr]);

  const highPriorityCount = useMemo(() =>
    pendingActivities.filter(a => a.priority === "high").length
  , [pendingActivities]);

  const getDaysInfo = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (pendingActivities.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">0</p>
            <p className="text-xs text-muted-foreground">Pendências</p>
          </Card>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Nenhuma pendência encontrada</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Todas as atividades estão em dia! 🎉
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <AlertCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{pendingActivities.length}</p>
              <p className="text-xs text-muted-foreground">Total Pendências</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-destructive">{overdueCount}</p>
              <p className="text-xs text-muted-foreground">Vencidas</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Calendar className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-500">{dueTodayCount}</p>
              <p className="text-xs text-muted-foreground">Vencem Hoje</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <Flag className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-warning">{highPriorityCount}</p>
              <p className="text-xs text-muted-foreground">Alta Prioridade</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter + Count */}
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-xs gap-1">
          <Clock className="w-3 h-3" />
          {pendingActivities.length} pendência{pendingActivities.length !== 1 ? "s" : ""} — {new Date().toLocaleDateString("pt-BR")}
        </Badge>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <Filter className="w-3 h-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="end_date">Data Fim</SelectItem>
            <SelectItem value="update_date">Data Atualização</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Activity List */}
      <div className="space-y-2">
        {pendingActivities.map((activity) => {
          const flag = activity.deadline_flag ? FLAG_DISPLAY[activity.deadline_flag] : null;
          const priority = PRIORITY_LABELS[activity.priority || "medium"];
          const endDiff = activity.end_date ? getDaysInfo(activity.end_date) : null;
          const updateDiff = activity.last_update_date ? getDaysInfo(activity.last_update_date) : null;

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
                    {activity.end_date && endDiff !== null && (
                      <span className={`flex items-center gap-1 text-[10px] font-medium ${endDiff < 0 ? "text-destructive" : endDiff === 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                        <Calendar className="w-3 h-3" />
                        {endDiff < 0
                          ? `${Math.abs(endDiff)}d atrasado`
                          : endDiff === 0
                          ? "Vence hoje"
                          : `${endDiff}d restantes`}
                      </span>
                    )}
                    {activity.last_update_date && updateDiff !== null && (
                      <span className={`flex items-center gap-1 text-[10px] font-medium ${updateDiff < 0 ? "text-destructive" : updateDiff === 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                        <Clock className="w-3 h-3" />
                        {updateDiff < 0
                          ? `Atualização ${Math.abs(updateDiff)}d atrás`
                          : updateDiff === 0
                          ? "Atualização hoje"
                          : `Atualização em ${updateDiff}d`}
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
