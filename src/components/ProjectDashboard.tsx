import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CheckCircle2, AlertTriangle, Clock, Flag, ListTodo, Timer,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, AreaChart, Area,
} from "recharts";

interface Activity {
  id: string;
  title: string;
  status: string;
  priority: string;
  start_date: string | null;
  end_date: string | null;
  hours: number | null;
  phase_id: string | null;
  completed_at: string | null;
}

interface Phase {
  id: string;
  title: string;
  display_order: number;
}

interface Project {
  budget_planned: number | null;
  budget_used: number | null;
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

export const ProjectDashboard = ({ activities, phases, project, onNavigateToActivity }: Props) => {
  const [dialogData, setDialogData] = useState<{ title: string; items: Activity[] } | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);

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
      return d >= today && d <= threeDaysLater;
    });
    const highPriority = activities.filter(a => a.priority === "high" && a.status !== "completed");
    const totalHours = activities.reduce((sum, a) => sum + (a.hours || 0), 0);

    return { total, completed, completionRate, overdue, nearDeadline, highPriority, totalHours };
  }, [activities]);

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

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Status Donut */}
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Distribuição por Status</h3>
          {statusChartData.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    stroke="none"
                  >
                    {statusChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value, "Atividades"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 -mt-2">
                {statusChartData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-[10px] text-muted-foreground">{entry.name} ({entry.value})</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem atividades</p>
          )}
        </Card>

        {/* Phase Bars */}
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Atividades por Fase</h3>
          {phaseChartData.length > 0 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phaseChartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="total" fill="hsl(220, 90%, 56%)" radius={[0, 4, 4, 0]} name="Total" />
                  <Bar dataKey="concluídas" fill="hsl(142, 76%, 36%)" radius={[0, 4, 4, 0]} name="Concluídas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem fases com atividades</p>
          )}
        </Card>

        {/* Weekly Evolution */}
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Evolução Semanal</h3>
          {weeklyData.length > 0 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData} margin={{ left: 0, right: 16, bottom: 0, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="concluídas"
                    stroke="hsl(142, 76%, 36%)"
                    fill="hsl(142, 76%, 36%)"
                    fillOpacity={0.15}
                    name="Concluídas"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem conclusões registradas</p>
          )}
        </Card>
      </div>

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
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
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
