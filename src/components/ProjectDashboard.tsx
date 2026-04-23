import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2, AlertTriangle, Clock, Flag, ListTodo, Timer,
  Calendar, User, Pencil, Filter, AlertCircle,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, AreaChart, Area,
} from "recharts";

interface Activity {
  id: string;
  title: string;
  status: string;
  priority?: string;
  assigned_to?: string | null;
  start_date: string | null;
  end_date: string | null;
  hours: number | null;
  phase_id: string | null;
  completed_at: string | null;
  deadline_flag?: string | null;
  last_update_date?: string | null;
}

interface Phase {
  id: string;
  title: string;
  display_order: number;
}

interface Project {
  budget_planned: number | null;
  budget_used: number | null;
  category?: string | null;
}

interface Props {
  activities: Activity[];
  phases: Phase[];
  project: Project;
  onNavigateToActivity?: (activity: Activity) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluída",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(38, 92%, 50%)",
  in_progress: "hsl(220, 90%, 56%)",
  completed: "hsl(142, 76%, 36%)",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

const FLAG_DISPLAY: Record<string, { label: string; class: string }> = {
  green: { label: "Em dia", class: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  orange: { label: "Atenção", class: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  red: { label: "Vencido", class: "bg-destructive/10 text-destructive border-destructive/30" },
};

export const ProjectDashboard = ({ activities, phases, project, onNavigateToActivity }: Props) => {
  const [dialogData, setDialogData] = useState<{ title: string; items: Activity[] } | null>(null);
  const [pendencyFilter, setPendencyFilter] = useState<"all" | "end_date" | "update_date">("all");

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  const isQuality = project.category === "qualidade";

  const stats = useMemo(() => {
    const total = activities.length;
    const completed = activities.filter(a => a.status === "completed").length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    const overdue = activities.filter(a => {
      if (a.status === "completed" || !a.end_date) return false;
      return new Date(a.end_date) < today;
    });
    const nearDeadline = activities.filter(a => {
      if (a.status === "completed" || !a.end_date) return false;
      const d = new Date(a.end_date);
      return d >= today && d <= sevenDaysLater;
    });
    const highPriority = activities.filter(a => a.priority === "high" && a.status !== "completed");
    const totalHours = activities.reduce((sum, a) => sum + (a.hours || 0), 0);
    const flagGreen = activities.filter(a => a.deadline_flag === "green");
    const flagOrange = activities.filter(a => a.deadline_flag === "orange");
    const flagRed = activities.filter(a => a.deadline_flag === "red");

    return { total, completed, completionRate, overdue, nearDeadline, highPriority, totalHours, flagGreen, flagOrange, flagRed };
  }, [activities]);

  // Pendencies for quality projects
  const pendingActivities = useMemo(() => {
    if (!isQuality) return [];
    return activities.filter((a) => {
      if (a.status === "completed") return false;
      const endMatch = a.end_date && a.end_date <= todayStr;
      const updateMatch = a.last_update_date && a.last_update_date <= todayStr;
      if (pendencyFilter === "end_date") return endMatch;
      if (pendencyFilter === "update_date") return updateMatch;
      return endMatch || updateMatch;
    });
  }, [activities, todayStr, pendencyFilter, isQuality]);

  const dailyTasksCount = useMemo(() => {
    if (!isQuality) return 0;
    return activities.filter((a) => {
      if (a.status === "completed") return false;
      const endMatch = a.end_date && a.end_date <= todayStr;
      const updateMatch = a.last_update_date && a.last_update_date <= todayStr;
      return endMatch || updateMatch;
    }).length;
  }, [activities, todayStr, isQuality]);

  const pendencyStats = useMemo(() => {
    if (!isQuality) return { overdue: 0, dueToday: 0, updatePending: 0, highPriority: 0 };
    return {
      overdue: pendingActivities.filter(a => a.end_date && a.end_date < todayStr).length,
      dueToday: pendingActivities.filter(a => a.end_date === todayStr).length,
      updatePending: pendingActivities.filter(a => a.last_update_date && a.last_update_date <= todayStr).length,
      highPriority: pendingActivities.filter(a => a.priority === "high").length,
    };
  }, [pendingActivities, todayStr, isQuality]);

  const getDaysInfo = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return Math.ceil((date.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  };

  const statusChartData = useMemo(() => {
    const counts: Record<string, number> = { pending: 0, in_progress: 0, completed: 0 };
    activities.forEach(a => {
      if (counts[a.status] !== undefined) counts[a.status]++;
      else counts.pending++;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({
        name: STATUS_LABELS[key] || key,
        value,
        color: STATUS_COLORS[key] || "hsl(220, 15%, 50%)",
      }));
  }, [activities]);

  const phaseChartData = useMemo(() => {
    return phases
      .map(p => ({
        name: p.title.length > 18 ? p.title.slice(0, 16) + "…" : p.title,
        total: activities.filter(a => a.phase_id === p.id).length,
        concluídas: activities.filter(a => a.phase_id === p.id && a.status === "completed").length,
      }))
      .filter(p => p.total > 0);
  }, [activities, phases]);

  const weeklyData = useMemo(() => {
    const weeks: Record<string, number> = {};
    const completedActs = activities.filter(a => a.completed_at);
    completedActs.forEach(a => {
      const d = new Date(a.completed_at!);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split("T")[0];
      weeks[key] = (weeks[key] || 0) + 1;
    });
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([date, count]) => {
        const d = new Date(date);
        return {
          semana: `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`,
          concluídas: count,
        };
      });
  }, [activities]);

  const budgetPlanned = project.budget_planned || 0;
  const budgetUsed = project.budget_used || 0;
  const budgetPct = budgetPlanned > 0 ? (budgetUsed / budgetPlanned) * 100 : 0;

  const kpiCards = [
    {
      label: "Total de Atividades",
      value: stats.total,
      icon: ListTodo,
      color: "text-primary",
      bg: "bg-primary/10",
      items: activities,
    },
    {
      label: "Taxa de Conclusão",
      value: `${stats.completionRate.toFixed(0)}%`,
      icon: CheckCircle2,
      color: "text-success",
      bg: "bg-success/10",
      items: activities.filter(a => a.status === "completed"),
      subtitle: `${stats.completed} de ${stats.total}`,
    },
    {
      label: "Atrasadas",
      value: stats.overdue.length,
      icon: AlertTriangle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      items: stats.overdue,
    },
    {
      label: "Prazos Próximos",
      value: stats.nearDeadline.length,
      icon: Clock,
      color: "text-warning",
      bg: "bg-warning/10",
      items: stats.nearDeadline,
    },
    {
      label: "Alta Prioridade",
      value: stats.highPriority.length,
      icon: Flag,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      items: stats.highPriority,
    },
    {
      label: "Horas Registradas",
      value: stats.totalHours,
      icon: Timer,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
      items: [],
    },
  ];

  const flagCards = isQuality ? [
    {
      label: "🟢 Em dia",
      value: stats.flagGreen.length,
      color: "text-emerald-600",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      items: stats.flagGreen,
    },
    {
      label: "🟠 Atenção",
      value: stats.flagOrange.length,
      color: "text-orange-600",
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      items: stats.flagOrange,
    },
    {
      label: "🔴 Vencido",
      value: stats.flagRed.length,
      color: "text-destructive",
      bg: "bg-destructive/10",
      border: "border-destructive/30",
      items: stats.flagRed,
    },
  ] : [];

  return (
    <div className="space-y-6 pt-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((kpi) => (
          <Card
            key={kpi.label}
            className={`p-4 space-y-2 ${kpi.items.length > 0 ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
            onClick={() => kpi.items.length > 0 && setDialogData({ title: kpi.label, items: kpi.items })}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
              <div className={`p-1.5 rounded-md ${kpi.bg}`}>
                <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            {kpi.subtitle && <p className="text-[11px] text-muted-foreground">{kpi.subtitle}</p>}
          </Card>
        ))}
      </div>

      {/* Flag Cards - Quality Only */}
      {flagCards.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {flagCards.map((fc) => (
            <Card
              key={fc.label}
              className={`p-4 space-y-2 border ${fc.border} ${fc.items.length > 0 ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
              onClick={() => fc.items.length > 0 && setDialogData({ title: fc.label, items: fc.items })}
            >
              <span className="text-xs font-medium text-muted-foreground">{fc.label}</span>
              <p className={`text-2xl font-bold ${fc.color}`}>{fc.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Pendencies Section - Quality Only */}
      {isQuality && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              Pendências ({pendingActivities.length})
            </h3>
            <Select value={pendencyFilter} onValueChange={(v) => setPendencyFilter(v as any)}>
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

          {/* Pendency KPI row - clickable cards */}
          <div className={`grid grid-cols-2 ${pendingActivities.length === dailyTasksCount ? 'md:grid-cols-4' : 'md:grid-cols-5'} gap-3`}>
            {pendingActivities.length !== dailyTasksCount && (
              <Card
                className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => pendingActivities.length > 0 && setDialogData({ title: "Total Pendências", items: pendingActivities })}
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-primary/10">
                    <AlertCircle className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground">{pendingActivities.length}</p>
                    <p className="text-[10px] text-muted-foreground">Total Pendências</p>
                  </div>
                </div>
              </Card>
            )}
            <Card
              className="p-3 cursor-pointer hover:shadow-md transition-shadow border-orange-500/30"
              onClick={() => {
                const items = activities.filter(a => {
                  if (a.status === "completed") return false;
                  const endMatch = a.end_date && a.end_date <= todayStr;
                  const updateMatch = a.last_update_date && a.last_update_date <= todayStr;
                  return endMatch || updateMatch;
                });
                items.length > 0 && setDialogData({ title: "Tarefas do Dia", items });
              }}
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-orange-500/10">
                  <Clock className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-orange-500">{dailyTasksCount}</p>
                  <p className="text-[10px] text-muted-foreground">Tarefas do Dia</p>
                </div>
              </div>
            </Card>
            <Card
              className="p-3 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                const items = pendingActivities.filter(a => a.end_date && a.end_date < todayStr);
                items.length > 0 && setDialogData({ title: "Vencidas", items });
              }}
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-destructive/10">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <p className="text-xl font-bold text-destructive">{pendencyStats.overdue}</p>
                  <p className="text-[10px] text-muted-foreground">Vencidas</p>
                </div>
              </div>
            </Card>
            <Card
              className="p-3 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                const items = pendingActivities.filter(a => a.end_date === todayStr);
                items.length > 0 && setDialogData({ title: "Vencem Hoje", items });
              }}
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-orange-500/10">
                  <Calendar className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-orange-500">{pendencyStats.dueToday}</p>
                  <p className="text-[10px] text-muted-foreground">Vencem Hoje</p>
                </div>
              </div>
            </Card>
            <Card
              className="p-3 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                const items = pendingActivities.filter(a => a.priority === "high");
                items.length > 0 && setDialogData({ title: "Alta Prioridade", items });
              }}
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-warning/10">
                  <Flag className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <p className="text-xl font-bold text-warning">{pendencyStats.highPriority}</p>
                  <p className="text-[10px] text-muted-foreground">Alta Prioridade</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Budget Bar (conditionally shown) */}
      {budgetPlanned > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Orçamento</h3>
            <span className="text-xs text-muted-foreground">
              {budgetPct.toFixed(0)}% utilizado
            </span>
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${budgetPct > 100 ? "bg-destructive" : budgetPct > 80 ? "bg-warning" : "bg-success"}`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Utilizado: R$ {budgetUsed.toLocaleString("pt-BR")}</span>
              <span>Planejado: R$ {budgetPlanned.toLocaleString("pt-BR")}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!dialogData} onOpenChange={() => setDialogData(null)}>
        <DialogContent className="sm:max-w-xl max-h-[60vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogData?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {dialogData?.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/30 cursor-pointer transition-colors"
                onClick={() => { setDialogData(null); onNavigateToActivity?.(item); }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {STATUS_LABELS[item.status] || item.status}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {PRIORITY_LABELS[item.priority] || item.priority}
                    </Badge>
                    {item.end_date && (
                      <span className="text-[10px] text-muted-foreground">
                        📅 {new Date(item.end_date).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {dialogData?.items.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum item</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
