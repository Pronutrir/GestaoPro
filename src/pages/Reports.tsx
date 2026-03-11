import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Download, FileText, BarChart3, Users, TrendingUp,
  CheckCircle2, AlertTriangle, Clock, DollarSign, Briefcase,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS_ARRAY = [
  "hsl(220, 90%, 56%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)", "hsl(199, 89%, 48%)", "hsl(280, 70%, 50%)",
];

const Reports = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      const [p, a, t, l] = await Promise.all([
        supabase.from("projects").select("*"),
        supabase.from("activities").select("*"),
        supabase.from("time_entries").select("*"),
        supabase.from("lessons_learned").select("*"),
      ]);
      if (p.data) setProjects(p.data);
      if (a.data) setActivities(a.data);
      if (t.data) setTimeEntries(t.data);
      if (l.data) setLessons(l.data);
      setIsLoading(false);
    };
    fetchAll();
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Computed data
  const totalBudgetPlanned = projects.reduce((s, p) => s + (Number(p.budget_planned) || 0), 0);
  const totalBudgetUsed = projects.reduce((s, p) => s + (Number(p.budget_used) || 0), 0);
  const totalActivities = activities.length;
  const completedActivities = activities.filter(a => a.status === "completed").length;
  const overdueActivities = activities.filter(a => a.status !== "completed" && a.end_date && new Date(a.end_date) < today);
  const totalHoursTracked = timeEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60;
  const totalHoursEstimated = activities.reduce((s, a) => s + (a.hours || 0), 0);

  // Per-project summary
  const projectSummaries = useMemo(() => {
    return projects.map(p => {
      const acts = activities.filter(a => a.project_id === p.id);
      const completed = acts.filter(a => a.status === "completed").length;
      const overdue = acts.filter(a => a.status !== "completed" && a.end_date && new Date(a.end_date) < today).length;
      const hours = timeEntries.filter(t => t.project_id === p.id).reduce((s, t) => s + (t.duration_minutes || 0), 0) / 60;
      const estHours = acts.reduce((s, a) => s + (a.hours || 0), 0);
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        category: p.category || "general",
        program: p.program || "-",
        totalTasks: acts.length,
        completed,
        overdue,
        completion: acts.length > 0 ? ((completed / acts.length) * 100).toFixed(0) : "0",
        budgetPlanned: Number(p.budget_planned) || 0,
        budgetUsed: Number(p.budget_used) || 0,
        hoursTracked: hours.toFixed(1),
        hoursEstimated: estHours,
        owner: p.owner || "-",
        dueDate: p.due_date,
        priority: p.priority,
      };
    });
  }, [projects, activities, timeEntries]);

  // Category distribution
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    projects.forEach(p => {
      const cat = p.category || "general";
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [projects]);

  // Export CSV
  const exportCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map(row => headers.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const statusLabels: Record<string, string> = {
    ideacao: "Ideação", poc: "POC", mvp: "MVP", blocked: "Bloqueio",
    drawer: "Gaveta", "em-execucao": "Em Execução",
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="w-5 h-5" /></Button>
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Relatórios & Exportações</h1>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-6">
        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Carregando dados...</p>
        ) : (
          <>
            {/* Executive Summary */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-primary" /> Resumo Executivo
                </h2>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => exportCSV(projectSummaries, "resumo_executivo")}>
                  <Download className="w-4 h-4" /> Exportar CSV
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground">{projects.length}</p>
                  <p className="text-xs text-muted-foreground">Projetos</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground">{totalActivities}</p>
                  <p className="text-xs text-muted-foreground">Tarefas</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-success">{completedActivities}</p>
                  <p className="text-xs text-muted-foreground">Concluídas</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-destructive">{overdueActivities.length}</p>
                  <p className="text-xs text-muted-foreground">Atrasadas</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-info">{totalHoursTracked.toFixed(0)}h</p>
                  <p className="text-xs text-muted-foreground">Horas Registradas</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Investimento Total</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">R$ {totalBudgetPlanned.toLocaleString("pt-BR")}</p>
                  <p className="text-sm text-muted-foreground">Utilizado: R$ {totalBudgetUsed.toLocaleString("pt-BR")} ({totalBudgetPlanned > 0 ? ((totalBudgetUsed / totalBudgetPlanned) * 100).toFixed(0) : 0}%)</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-info" />
                    <span className="text-sm font-medium text-foreground">Horas</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{totalHoursEstimated}h estimadas</p>
                  <p className="text-sm text-muted-foreground">Registradas: {totalHoursTracked.toFixed(1)}h ({totalHoursEstimated > 0 ? ((totalHoursTracked / totalHoursEstimated) * 100).toFixed(0) : 0}%)</p>
                </div>
              </div>
            </Card>

            <Tabs defaultValue="projects" className="w-full">
              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                <TabsTrigger value="projects" className="gap-2"><Briefcase className="w-4 h-4" />Projetos</TabsTrigger>
                <TabsTrigger value="team" className="gap-2"><Users className="w-4 h-4" />Equipe</TabsTrigger>
                <TabsTrigger value="charts" className="gap-2"><BarChart3 className="w-4 h-4" />Gráficos</TabsTrigger>
                <TabsTrigger value="lessons" className="gap-2"><FileText className="w-4 h-4" />Lições</TabsTrigger>
              </TabsList>

              {/* Projects Table */}
              <TabsContent value="projects">
                <Card className="p-4 overflow-x-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">Tabela de Projetos</h3>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => exportCSV(projectSummaries, "projetos")}>
                      <Download className="w-4 h-4" /> CSV
                    </Button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="p-2 font-medium text-muted-foreground">Projeto</th>
                        <th className="p-2 font-medium text-muted-foreground">Status</th>
                        <th className="p-2 font-medium text-muted-foreground">Categoria</th>
                        <th className="p-2 font-medium text-muted-foreground">Responsável</th>
                        <th className="p-2 font-medium text-muted-foreground text-center">Tarefas</th>
                        <th className="p-2 font-medium text-muted-foreground text-center">%</th>
                        <th className="p-2 font-medium text-muted-foreground text-center">Atrasadas</th>
                        <th className="p-2 font-medium text-muted-foreground text-right">Orçamento</th>
                        <th className="p-2 font-medium text-muted-foreground text-right">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectSummaries.map(ps => (
                        <tr key={ps.id} className="border-b border-border/50 hover:bg-accent/20 cursor-pointer" onClick={() => navigate(`/project/${ps.id}`)}>
                          <td className="p-2 font-medium text-foreground">{ps.title}</td>
                          <td className="p-2"><Badge variant="outline" className="text-xs">{statusLabels[ps.status] || ps.status}</Badge></td>
                          <td className="p-2 text-muted-foreground">{ps.category}</td>
                          <td className="p-2 text-muted-foreground">{ps.owner}</td>
                          <td className="p-2 text-center text-foreground">{ps.completed}/{ps.totalTasks}</td>
                          <td className="p-2 text-center"><Badge className={`text-xs ${Number(ps.completion) >= 80 ? "bg-success/20 text-success" : Number(ps.completion) >= 50 ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"}`}>{ps.completion}%</Badge></td>
                          <td className="p-2 text-center">{ps.overdue > 0 ? <Badge className="bg-destructive/20 text-destructive text-xs">{ps.overdue}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                          <td className="p-2 text-right text-muted-foreground">R$ {ps.budgetUsed.toLocaleString("pt-BR")} / {ps.budgetPlanned.toLocaleString("pt-BR")}</td>
                          <td className="p-2 text-right text-muted-foreground">{ps.hoursTracked}h / {ps.hoursEstimated}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </TabsContent>

              {/* Team Tab */}
              <TabsContent value="team">
                <Card className="p-4 overflow-x-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">Carga por Membro</h3>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                      const memberMap = new Map<string, any>();
                      activities.forEach(a => {
                        const name = a.assigned_to?.trim();
                        if (!name) return;
                        if (!memberMap.has(name)) memberMap.set(name, { nome: name, tarefas: 0, concluidas: 0, atrasadas: 0, horas_estimadas: 0 });
                        const m = memberMap.get(name);
                        m.tarefas++;
                        if (a.status === "completed") m.concluidas++;
                        if (a.status !== "completed" && a.end_date && new Date(a.end_date) < today) m.atrasadas++;
                        m.horas_estimadas += a.hours || 0;
                      });
                      exportCSV(Array.from(memberMap.values()), "equipe");
                    }}>
                      <Download className="w-4 h-4" /> CSV
                    </Button>
                  </div>
                  {(() => {
                    const memberMap = new Map<string, { name: string; total: number; done: number; overdue: number; hours: number }>();
                    activities.forEach(a => {
                      const name = a.assigned_to?.trim();
                      if (!name) return;
                      if (!memberMap.has(name)) memberMap.set(name, { name, total: 0, done: 0, overdue: 0, hours: 0 });
                      const m = memberMap.get(name)!;
                      m.total++;
                      if (a.status === "completed") m.done++;
                      if (a.status !== "completed" && a.end_date && new Date(a.end_date) < today) m.overdue++;
                      m.hours += a.hours || 0;
                    });
                    const members = Array.from(memberMap.values()).sort((a, b) => b.total - a.total);
                    return (
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={members} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis type="number" />
                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                            <Bar dataKey="done" stackId="a" fill="hsl(var(--success))" name="Concluídas" />
                            <Bar dataKey="overdue" stackId="a" fill="hsl(var(--destructive))" name="Atrasadas" />
                            <Bar dataKey="total" fill="hsl(var(--muted))" name="Total" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                </Card>
              </TabsContent>

              {/* Charts Tab */}
              <TabsContent value="charts">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="p-6">
                    <h3 className="font-semibold text-foreground mb-4">Projetos por Categoria</h3>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                            {categoryData.map((_, idx) => <Cell key={idx} fill={COLORS_ARRAY[idx % COLORS_ARRAY.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="font-semibold text-foreground mb-4">Orçamento por Projeto</h3>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={projectSummaries.slice(0, 10)}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="title" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                          <Bar dataKey="budgetPlanned" fill="hsl(var(--primary))" name="Planejado" />
                          <Bar dataKey="budgetUsed" fill="hsl(var(--warning))" name="Utilizado" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              </TabsContent>

              {/* Lessons Tab */}
              <TabsContent value="lessons">
                <Card className="p-4 overflow-x-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">Lições Aprendidas</h3>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                      const data = lessons.map(l => ({
                        projeto: projects.find(p => p.id === l.project_id)?.title || "-",
                        categoria: l.category,
                        problema: l.problem,
                        solucao: l.solution || "-",
                        impacto: l.impact || "-",
                        sugestao: l.suggestion || "-",
                        reportado_por: l.reported_by || "-",
                        data: new Date(l.created_at).toLocaleDateString("pt-BR"),
                      }));
                      exportCSV(data, "licoes_aprendidas");
                    }}>
                      <Download className="w-4 h-4" /> CSV
                    </Button>
                  </div>
                  {lessons.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Nenhuma lição registrada</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="p-2 font-medium text-muted-foreground">Projeto</th>
                          <th className="p-2 font-medium text-muted-foreground">Categoria</th>
                          <th className="p-2 font-medium text-muted-foreground">Problema</th>
                          <th className="p-2 font-medium text-muted-foreground">Solução</th>
                          <th className="p-2 font-medium text-muted-foreground">Impacto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lessons.map(l => (
                          <tr key={l.id} className="border-b border-border/50 hover:bg-accent/20">
                            <td className="p-2 text-foreground">{projects.find(p => p.id === l.project_id)?.title || "-"}</td>
                            <td className="p-2"><Badge variant="outline" className="text-xs">{l.category}</Badge></td>
                            <td className="p-2 text-muted-foreground max-w-[200px] truncate">{l.problem}</td>
                            <td className="p-2 text-muted-foreground max-w-[200px] truncate">{l.solution || "-"}</td>
                            <td className="p-2"><Badge className={`text-xs ${l.impact === "high" ? "bg-destructive/20 text-destructive" : l.impact === "medium" ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"}`}>{l.impact || "-"}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
};

export default Reports;
