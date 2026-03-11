import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/NotificationBell";
import {
  LayoutDashboard, TrendingUp, DollarSign, CheckCircle2, Lightbulb,
  Beaker, Rocket, AlertTriangle, Archive, Clock, Flag, CalendarClock, ListTodo,
  Users, BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

interface Project {
  id: string;
  title: string;
  status: string;
  budget_planned: number;
  budget_used: number;
  due_date: string | null;
  owner: string | null;
  blockers: string | null;
}

interface Activity {
  id: string;
  title: string;
  status: string;
  project_id: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  completed_at: string | null;
  created_at: string;
  hours: number;
  cost: number;
  priority: string;
}

interface TimeEntry {
  duration_minutes: number | null;
  project_id: string;
  created_at: string;
}

const COLORS = {
  ideacao: "hsl(38, 92%, 50%)",
  poc: "hsl(199, 89%, 48%)",
  mvp: "hsl(220, 90%, 56%)",
  blocked: "hsl(0, 84%, 60%)",
  drawer: "hsl(220, 15%, 50%)",
  "em-execucao": "hsl(142, 76%, 36%)",
};

const Overview = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [projectsRes, activitiesRes, timeRes] = await Promise.all([
        supabase.from("projects").select("*"),
        supabase.from("activities").select("*"),
        supabase.from("time_entries").select("duration_minutes, project_id, created_at"),
      ]);

      if (projectsRes.data) setProjects(projectsRes.data);
      if (activitiesRes.data) setActivities(activitiesRes.data);
      if (timeRes.data) setTimeEntries(timeRes.data);
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ---- KPI Calculations ----
  const totalProjects = projects.length;
  const statusCounts = {
    ideacao: projects.filter(p => p.status === "ideacao").length,
    poc: projects.filter(p => p.status === "poc").length,
    mvp: projects.filter(p => p.status === "mvp").length,
    blocked: projects.filter(p => p.status === "blocked").length,
    drawer: projects.filter(p => p.status === "drawer").length,
    "em-execucao": projects.filter(p => p.status === "em-execucao").length,
  };

  const totalBudgetPlanned = projects.reduce((s, p) => s + (Number(p.budget_planned) || 0), 0);
  const totalBudgetUsed = projects.reduce((s, p) => s + (Number(p.budget_used) || 0), 0);
  const budgetProgress = totalBudgetPlanned > 0 ? (totalBudgetUsed / totalBudgetPlanned) * 100 : 0;

  const totalActivities = activities.length;
  const completedActivities = activities.filter(a => a.status === "completed").length;
  const taskCompletionRate = totalActivities > 0 ? (completedActivities / totalActivities) * 100 : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueActivities = activities.filter(a => a.status !== "completed" && a.end_date && new Date(a.end_date) < today);
  const upcomingDeadlines = activities.filter(a => {
    if (a.status === "completed" || !a.end_date) return false;
    const end = new Date(a.end_date);
    const diff = (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  });

  const highPriorityPending = activities.filter(a => a.priority === "high" && a.status !== "completed");
  const totalHoursEstimated = activities.reduce((s, a) => s + (a.hours || 0), 0);
  const totalHoursTracked = timeEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60;

  // ---- Chart Data ----
  const statusPieData = [
    { name: "Ideação", value: statusCounts.ideacao, color: COLORS.ideacao },
    { name: "POC", value: statusCounts.poc, color: COLORS.poc },
    { name: "MVP", value: statusCounts.mvp, color: COLORS.mvp },
    { name: "Bloqueio", value: statusCounts.blocked, color: COLORS.blocked },
    { name: "Gaveta", value: statusCounts.drawer, color: COLORS.drawer },
    { name: "Em Execução", value: statusCounts["em-execucao"], color: COLORS["em-execucao"] },
  ].filter(d => d.value > 0);

  // Burn-down: show completed tasks over the last 30 days
  const burndownData = (() => {
    const days: { date: string; remaining: number; completed: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dateStr = d.toISOString().split("T")[0];
      const label = `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;

      const completedByDate = activities.filter(a => a.completed_at && new Date(a.completed_at) <= d).length;
      const remaining = totalActivities - completedByDate;

      days.push({ date: label, remaining, completed: completedByDate });
    }
    return days;
  })();

  // Activities per project (top 10)
  const activitiesPerProject = (() => {
    const map = new Map<string, { name: string; total: number; done: number }>();
    activities.forEach(a => {
      const proj = projects.find(p => p.id === a.project_id);
      if (!proj) return;
      const existing = map.get(a.project_id) || { name: proj.title.substring(0, 20), total: 0, done: 0 };
      existing.total++;
      if (a.status === "completed") existing.done++;
      map.set(a.project_id, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  })();

  const statusCards = [
    { key: "ideacao", label: "Ideação", icon: Lightbulb, color: "warning", count: statusCounts.ideacao },
    { key: "poc", label: "POC", icon: Beaker, color: "info", count: statusCounts.poc },
    { key: "mvp", label: "MVP", icon: Rocket, color: "primary", count: statusCounts.mvp },
    { key: "blocked", label: "Bloqueio", icon: AlertTriangle, color: "destructive", count: statusCounts.blocked },
    { key: "drawer", label: "Gaveta", icon: Archive, color: "secondary", count: statusCounts.drawer },
    { key: "em-execucao", label: "Em Execução", icon: CheckCircle2, color: "success", count: statusCounts["em-execucao"] },
  ];

  return (
    <AppLayout title="Pipeline de Gestão de Projetos">
      <main className="container mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">Dashboard Geral</h2>
          <p className="text-muted-foreground">KPIs, indicadores de atraso e evolução do portfólio</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Carregando dados...</p></div>
        ) : (
          <>
            {/* KPI Row 1 - Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
              <Card className="p-5 cursor-pointer transition-all hover:shadow-md hover:border-primary" onClick={() => navigate("/projects")}>
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                  <LayoutDashboard className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-3xl font-bold text-foreground">{totalProjects}</p>
              </Card>
              {statusCards.map(sc => (
                <Card key={sc.key} className={`p-5 cursor-pointer transition-all hover:shadow-md hover:border-${sc.color}`} onClick={() => navigate(`/projects?status=${sc.key}`)}>
                  <div className={`w-10 h-10 bg-${sc.color}/10 rounded-lg flex items-center justify-center mb-3`}>
                    <sc.icon className={`w-5 h-5 text-${sc.color}`} />
                  </div>
                  <p className="text-sm text-muted-foreground">{sc.label}</p>
                  <p className="text-3xl font-bold text-foreground">{sc.count}</p>
                </Card>
              ))}
            </div>

            {/* KPI Row 2 - Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <ListTodo className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Conclusão de Tarefas</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{taskCompletionRate.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground mt-1">{completedActivities}/{totalActivities} concluídas</p>
              </Card>

              <Card className={`p-5 ${overdueActivities.length > 0 ? "border-destructive/50" : ""}`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={`w-4 h-4 ${overdueActivities.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                  <span className="text-sm text-muted-foreground">Atrasadas</span>
                </div>
                <p className={`text-3xl font-bold ${overdueActivities.length > 0 ? "text-destructive" : "text-foreground"}`}>{overdueActivities.length}</p>
                <p className="text-xs text-muted-foreground mt-1">tarefas vencidas</p>
              </Card>

              <Card className={`p-5 ${upcomingDeadlines.length > 0 ? "border-warning/50" : ""}`}>
                <div className="flex items-center gap-2 mb-2">
                  <CalendarClock className={`w-4 h-4 ${upcomingDeadlines.length > 0 ? "text-warning" : "text-muted-foreground"}`} />
                  <span className="text-sm text-muted-foreground">Prazos Próximos</span>
                </div>
                <p className={`text-3xl font-bold ${upcomingDeadlines.length > 0 ? "text-warning" : "text-foreground"}`}>{upcomingDeadlines.length}</p>
                <p className="text-xs text-muted-foreground mt-1">nos próximos 7 dias</p>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Flag className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-muted-foreground">Alta Prioridade</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{highPriorityPending.length}</p>
                <p className="text-xs text-muted-foreground mt-1">pendentes</p>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Burn-down Chart */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" /> Burn-down (30 dias)
                </h3>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={burndownData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Area type="monotone" dataKey="remaining" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.1} name="Restantes" />
                      <Area type="monotone" dataKey="completed" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.1} name="Concluídas" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Status Pie Chart */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Distribuição de Projetos</h3>
                <div className="h-[280px] flex items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {statusPieData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* Budget + Hours + Activities per Project */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Budget Card */}
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Investimento</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Planejado</span><span className="text-sm font-medium text-foreground">R$ {totalBudgetPlanned.toLocaleString("pt-BR")}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Utilizado</span><span className="text-sm font-medium text-foreground">R$ {totalBudgetUsed.toLocaleString("pt-BR")}</span></div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Utilização</span><span className="font-medium">{budgetProgress.toFixed(1)}%</span></div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${budgetProgress > 90 ? "bg-destructive" : budgetProgress > 70 ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.min(budgetProgress, 100)}%` }} />
                    </div>
                  </div>
                  <div className="pt-4 border-t border-border flex justify-between">
                    <span className="text-sm text-muted-foreground">Saldo</span>
                    <span className={`text-lg font-bold ${totalBudgetPlanned - totalBudgetUsed >= 0 ? "text-success" : "text-destructive"}`}>
                      R$ {(totalBudgetPlanned - totalBudgetUsed).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Hours Card */}
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-info/10 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-info" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Horas</h3>
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Estimadas</p>
                    <p className="text-3xl font-bold text-foreground">{totalHoursEstimated.toFixed(0)}h</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Registradas</p>
                    <p className="text-3xl font-bold text-info">{totalHoursTracked.toFixed(1)}h</p>
                  </div>
                  {totalHoursEstimated > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium">{((totalHoursTracked / totalHoursEstimated) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-info transition-all" style={{ width: `${Math.min((totalHoursTracked / totalHoursEstimated) * 100, 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Activities per Project Bar Chart */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Atividades por Projeto</h3>
                {activitiesPerProject.length > 0 ? (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={activitiesPerProject} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                        <Bar dataKey="done" stackId="a" fill="hsl(var(--success))" name="Concluídas" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="total" stackId="b" fill="hsl(var(--muted))" name="Total" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
                )}
              </Card>
            </div>

            {/* Overdue & Upcoming Deadlines Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Overdue */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Tarefas Atrasadas ({overdueActivities.length})
                </h3>
                {overdueActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">🎉 Nenhuma tarefa atrasada!</p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {overdueActivities.slice(0, 15).map(a => {
                      const proj = projects.find(p => p.id === a.project_id);
                      const daysOverdue = Math.floor((today.getTime() - new Date(a.end_date!).getTime()) / (1000 * 60 * 60 * 24));
                      return (
                        <div key={a.id} className="flex items-center justify-between p-3 bg-destructive/5 border border-destructive/20 rounded-lg cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => navigate(`/project/${a.project_id}`)}>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                            <p className="text-xs text-muted-foreground">{proj?.title}</p>
                          </div>
                          <Badge className="bg-destructive/20 text-destructive text-xs flex-shrink-0">
                            {daysOverdue}d atraso
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Upcoming Deadlines */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-warning" />
                  Prazos Próximos ({upcomingDeadlines.length})
                </h3>
                {upcomingDeadlines.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum prazo nos próximos 7 dias</p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {upcomingDeadlines.slice(0, 15).map(a => {
                      const proj = projects.find(p => p.id === a.project_id);
                      const daysLeft = Math.floor((new Date(a.end_date!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                      return (
                        <div key={a.id} className="flex items-center justify-between p-3 bg-warning/5 border border-warning/20 rounded-lg cursor-pointer hover:bg-warning/10 transition-colors" onClick={() => navigate(`/project/${a.project_id}`)}>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                            <p className="text-xs text-muted-foreground">{proj?.title} {a.assigned_to ? `· 👤 ${a.assigned_to}` : ""}</p>
                          </div>
                          <Badge className={`text-xs flex-shrink-0 ${daysLeft <= 1 ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning"}`}>
                            {daysLeft === 0 ? "Hoje" : `${daysLeft}d`}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* Completion Rate Donut */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-success" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Taxa de Execução</h3>
                </div>
                <div className="flex items-center justify-center py-4">
                  <div className="relative w-48 h-48">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="none" className="text-muted" />
                      <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="none"
                        strokeDasharray={`${(statusCounts["em-execucao"] / Math.max(totalProjects, 1)) * 553} 553`}
                        className="text-success transition-all"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-bold text-foreground">{totalProjects > 0 ? ((statusCounts["em-execucao"] / totalProjects) * 100).toFixed(0) : 0}%</span>
                      <span className="text-sm text-muted-foreground mt-1">Em Execução</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-2 pt-4 border-t border-border">
                  {statusCards.map(sc => (
                    <div key={sc.key} className="text-center">
                      <p className={`text-xl font-bold text-${sc.color}`}>{sc.count}</p>
                      <p className="text-xs text-muted-foreground mt-1">{sc.label}</p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Task Completion Donut */}
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Conclusão de Tarefas</h3>
                </div>
                <div className="flex items-center justify-center py-4">
                  <div className="relative w-48 h-48">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="none" className="text-muted" />
                      <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="none"
                        strokeDasharray={`${(taskCompletionRate / 100) * 553} 553`}
                        className="text-primary transition-all"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-bold text-foreground">{taskCompletionRate.toFixed(0)}%</span>
                      <span className="text-sm text-muted-foreground mt-1">Concluídas</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                  <div className="text-center">
                    <p className="text-xl font-bold text-foreground">{totalActivities}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-success">{completedActivities}</p>
                    <p className="text-xs text-muted-foreground">Feitas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-warning">{totalActivities - completedActivities}</p>
                    <p className="text-xs text-muted-foreground">Pendentes</p>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </main>
    </AppLayout>
};

export default Overview;
