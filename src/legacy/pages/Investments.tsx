import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DollarSign, TrendingUp, Briefcase, Filter, X, PieChart as PieChartIcon,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";

interface Project {
  id: string;
  title: string;
  budget_planned: number | null;
  budget_used: number | null;
  status: string;
}

interface ActivityInvestment {
  id: string;
  activity_id: string;
  amount: number;
  description: string | null;
  project_id: string | null;
  responsible: string | null;
  category: string | null;
  recorded_at: string;
}

interface Activity {
  id: string;
  title: string;
  assigned_to: string | null;
  project_id: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  geral: "hsl(220, 90%, 56%)",
  equipamento: "hsl(38, 92%, 50%)",
  software: "hsl(270, 70%, 55%)",
  infraestrutura: "hsl(199, 89%, 48%)",
  consultoria: "hsl(142, 76%, 36%)",
  outros: "hsl(220, 15%, 50%)",
};

const Investments = () => {
  const navigate = useNavigate();
  const { filterProjects, loading: authLoading } = useProjectAccess();
  const [projects, setProjects] = useState<Project[]>([]);
  const [investments, setInvestments] = useState<ActivityInvestment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterProject, setFilterProject] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading]);

  const fetchData = async () => {
    const [projRes, invRes, actRes] = await Promise.all([
      supabase.from("projects").select("id, title, budget_planned, budget_used, status").eq("is_trashed", false),
      supabase.from("activity_investments").select("id, activity_id, amount, description, project_id, responsible, category, recorded_at"),
      supabase.from("activities").select("id, title, assigned_to, project_id"),
    ]);
    const filtered = await filterProjects(projRes.data || []);
    setProjects(filtered);
    const projectIds = new Set(filtered.map(p => p.id));
    if (actRes.data) setActivities(actRes.data.filter(a => projectIds.has(a.project_id)));
    if (invRes.data) {
      const activityIds = new Set((actRes.data || []).filter(a => projectIds.has(a.project_id)).map(a => a.id));
      setInvestments(invRes.data.filter(i => activityIds.has(i.activity_id)));
    }
    setIsLoading(false);
  };

  // Derived data
  const totalBudgetPlanned = useMemo(() => projects.reduce((s, p) => s + (Number(p.budget_planned) || 0), 0), [projects]);
  const totalBudgetUsed = useMemo(() => projects.reduce((s, p) => s + (Number(p.budget_used) || 0), 0), [projects]);
  const totalActivityInvestments = useMemo(() => investments.reduce((s, i) => s + (i.amount || 0), 0), [investments]);
  const budgetProgress = totalBudgetPlanned > 0 ? (totalBudgetUsed / totalBudgetPlanned) * 100 : 0;

  // Activity owner map
  const activityMap = useMemo(() => {
    const map = new Map<string, Activity>();
    activities.forEach(a => map.set(a.id, a));
    return map;
  }, [activities]);

  // Filtered investments
  const filteredInvestments = useMemo(() => {
    return investments.filter(inv => {
      const act = activityMap.get(inv.activity_id);
      if (filterProject !== "all" && act?.project_id !== filterProject) return false;
      if (filterCategory !== "all" && (inv.category || "geral") !== filterCategory) return false;
      return true;
    });
  }, [investments, filterProject, filterCategory, activityMap]);

  // Category breakdown
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    filteredInvestments.forEach(inv => {
      const cat = inv.category || "geral";
      map.set(cat, (map.get(cat) || 0) + (inv.amount || 0));
    });
    return Array.from(map.entries()).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: CATEGORY_COLORS[name] || CATEGORY_COLORS.outros,
    })).sort((a, b) => b.value - a.value);
  }, [filteredInvestments]);

  // Per-project data
  const projectFinancials = useMemo(() => {
    return projects.map(p => {
      const projInvestments = investments.filter(inv => {
        const act = activityMap.get(inv.activity_id);
        return act?.project_id === p.id;
      });
      const investmentTotal = projInvestments.reduce((s, i) => s + (i.amount || 0), 0);
      return {
        ...p,
        investmentTotal,
        totalCost: (Number(p.budget_used) || 0) + investmentTotal,
        planned: Number(p.budget_planned) || 0,
        used: Number(p.budget_used) || 0,
      };
    }).sort((a, b) => b.totalCost - a.totalCost);
  }, [projects, investments, activityMap]);

  // Bar chart data
  const barData = useMemo(() => {
    return projectFinancials
      .filter(p => p.planned > 0 || p.totalCost > 0)
      .slice(0, 10)
      .map(p => ({
        name: p.title.length > 15 ? p.title.substring(0, 15) + "…" : p.title,
        planejado: p.planned,
        utilizado: p.used,
        investimentos: p.investmentTotal,
      }));
  }, [projectFinancials]);

  // Selected project detail
  const selectedProjectData = useMemo(() => {
    if (!selectedProject) return null;
    const p = projectFinancials.find(pf => pf.id === selectedProject);
    if (!p) return null;
    const projInvestments = investments.filter(inv => {
      const act = activityMap.get(inv.activity_id);
      return act?.project_id === selectedProject;
    }).sort((a, b) => b.amount - a.amount);
    return { project: p, investments: projInvestments };
  }, [selectedProject, projectFinancials, investments, activityMap]);

  // Categories for filter
  const categories = useMemo(() => {
    const cats = new Set<string>();
    investments.forEach(i => cats.add(i.category || "geral"));
    return Array.from(cats).sort();
  }, [investments]);

  const formatCurrency = (val: number) =>
    `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <AppLayout title="Investimentos">
      <main className="px-4 py-6 space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-1">Gestão Financeira</h2>
          <p className="text-muted-foreground">Orçamento dos projetos e investimentos por atividade</p>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Carregando...</p>
        ) : (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Orçamento Planejado</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalBudgetPlanned)}</p>
                <p className="text-xs text-muted-foreground mt-1">{projects.length} projeto(s)</p>
              </Card>

              <Card className={`p-5 ${budgetProgress > 90 ? "border-destructive/50" : ""}`}>
                <div className="flex items-center gap-2 mb-2">
                  {budgetProgress > 100 ? (
                    <ArrowUpRight className="w-4 h-4 text-destructive" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-success" />
                  )}
                  <span className="text-sm text-muted-foreground">Orçamento Utilizado</span>
                </div>
                <p className={`text-2xl font-bold ${budgetProgress > 100 ? "text-destructive" : "text-foreground"}`}>
                  {formatCurrency(totalBudgetUsed)}
                </p>
                <Progress value={Math.min(budgetProgress, 100)} className="h-1.5 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">{budgetProgress.toFixed(0)}% do planejado</p>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-muted-foreground">Investimentos em Atividades</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalActivityInvestments)}</p>
                <p className="text-xs text-muted-foreground mt-1">{investments.length} registro(s)</p>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <PieChartIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Custo Total Consolidado</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalBudgetUsed + totalActivityInvestments)}</p>
                <p className="text-xs text-muted-foreground mt-1">orçamento + investimentos</p>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Budget per project */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-primary" /> Orçamento por Projeto
                </h3>
                {barData.length > 0 ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Bar dataKey="planejado" fill="hsl(var(--primary))" opacity={0.3} radius={[0, 4, 4, 0]} />
                        <Bar dataKey="utilizado" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="investimentos" fill="hsl(142, 76%, 36%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">Nenhum dado de orçamento registrado.</p>
                )}
              </Card>

              {/* Category Pie */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-primary" /> Investimentos por Categoria
                </h3>
                {categoryData.length > 0 ? (
                  <div className="h-[280px] flex items-center">
                    <div className="w-1/2 h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" nameKey="name">
                            {categoryData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-1/2 space-y-2">
                      {categoryData.map(c => (
                        <div key={c.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                            <span className="text-xs text-muted-foreground">{c.name}</span>
                          </div>
                          <span className="text-xs font-semibold text-foreground">{formatCurrency(c.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">Nenhum investimento categorizado.</p>
                )}
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue placeholder="Projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Projetos</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Categorias</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(filterProject !== "all" || filterCategory !== "all") && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterProject("all"); setFilterCategory("all"); }}>
                  <X className="w-3 h-3 mr-1" /> Limpar
                </Button>
              )}
            </div>

            {/* Project Financial Table */}
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Visão Financeira por Projeto</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-3 font-medium text-muted-foreground">Projeto</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Planejado</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Utilizado</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Investimentos</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Custo Total</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">% Orçamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectFinancials
                      .filter(p => filterProject === "all" || p.id === filterProject)
                      .map(p => {
                        const pct = p.planned > 0 ? ((p.used + p.investmentTotal) / p.planned) * 100 : 0;
                        return (
                          <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => navigate(`/project/${p.id}`)}>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{p.title}</span>
                                <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                              </div>
                            </td>
                            <td className="text-right p-3 text-muted-foreground">{formatCurrency(p.planned)}</td>
                            <td className="text-right p-3 text-muted-foreground">{formatCurrency(p.used)}</td>
                            <td className="text-right p-3 font-medium text-emerald-600">{formatCurrency(p.investmentTotal)}</td>
                            <td className="text-right p-3 font-semibold text-foreground">{formatCurrency(p.totalCost)}</td>
                            <td className="text-right p-3">
                              {p.planned > 0 ? (
                                <Badge variant={pct > 100 ? "destructive" : "outline"} className="text-xs">
                                  {pct.toFixed(0)}%
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    {/* Totals row */}
                    <tr className="bg-muted/40 font-semibold">
                      <td className="p-3 text-foreground">Total</td>
                      <td className="text-right p-3 text-foreground">{formatCurrency(totalBudgetPlanned)}</td>
                      <td className="text-right p-3 text-foreground">{formatCurrency(totalBudgetUsed)}</td>
                      <td className="text-right p-3 text-emerald-600">{formatCurrency(totalActivityInvestments)}</td>
                      <td className="text-right p-3 text-foreground">{formatCurrency(totalBudgetUsed + totalActivityInvestments)}</td>
                      <td className="text-right p-3">
                        {totalBudgetPlanned > 0 && (
                          <Badge variant={budgetProgress > 100 ? "destructive" : "outline"} className="text-xs">
                            {budgetProgress.toFixed(0)}%
                          </Badge>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Recent Investments */}
            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Últimos Investimentos Registrados</h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {filteredInvestments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum investimento encontrado.</p>
                ) : (
                  filteredInvestments
                    .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
                    .slice(0, 20)
                    .map(inv => {
                      const act = activityMap.get(inv.activity_id);
                      const proj = act ? projects.find(p => p.id === act.project_id) : null;
                      return (
                        <div key={inv.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-md">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate block text-foreground">{inv.description || "Sem descrição"}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {proj && <span className="text-[10px] text-muted-foreground">{proj.title}</span>}
                              {inv.responsible && <span className="text-[10px] text-muted-foreground">· 👤 {inv.responsible}</span>}
                              {inv.category && <Badge variant="outline" className="text-[9px] h-4">{inv.category}</Badge>}
                            </div>
                          </div>
                          <div className="text-right ml-3 shrink-0">
                            <span className="text-sm font-semibold text-foreground">{formatCurrency(inv.amount)}</span>
                            <p className="text-[10px] text-muted-foreground">{new Date(inv.recorded_at).toLocaleDateString("pt-BR")}</p>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </Card>
          </>
        )}

        {/* Project Detail Drawer */}
        <Sheet open={!!selectedProject} onOpenChange={(open) => { if (!open) setSelectedProject(null); }}>
          <SheetContent className="sm:max-w-lg overflow-y-auto">
            {selectedProjectData && (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-primary" />
                    {selectedProjectData.project.title}
                  </SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                  {/* KPIs */}
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Planejado</p>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(selectedProjectData.project.planned)}</p>
                    </Card>
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Utilizado</p>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(selectedProjectData.project.used)}</p>
                    </Card>
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Investimentos</p>
                      <p className="text-lg font-bold text-emerald-600">{formatCurrency(selectedProjectData.project.investmentTotal)}</p>
                    </Card>
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Custo Total</p>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(selectedProjectData.project.totalCost)}</p>
                    </Card>
                  </div>

                  {selectedProjectData.project.planned > 0 && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Consumo do orçamento</span>
                        <span className="font-medium">{((selectedProjectData.project.totalCost / selectedProjectData.project.planned) * 100).toFixed(0)}%</span>
                      </div>
                      <Progress value={Math.min((selectedProjectData.project.totalCost / selectedProjectData.project.planned) * 100, 100)} className="h-2" />
                    </div>
                  )}

                  {/* Investment list */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Investimentos ({selectedProjectData.investments.length})</h3>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {selectedProjectData.investments.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhum investimento neste projeto.</p>
                      ) : (
                        selectedProjectData.investments.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm truncate block">{inv.description || "Sem descrição"}</span>
                              <div className="flex gap-2 mt-0.5">
                                {inv.responsible && <span className="text-[10px] text-muted-foreground">👤 {inv.responsible}</span>}
                                {inv.category && <Badge variant="outline" className="text-[9px] h-4">{inv.category}</Badge>}
                              </div>
                            </div>
                            <div className="text-right ml-2 shrink-0">
                              <span className="text-sm font-semibold">{formatCurrency(inv.amount)}</span>
                              <p className="text-[10px] text-muted-foreground">{new Date(inv.recorded_at).toLocaleDateString("pt-BR")}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <Button variant="outline" className="w-full" onClick={() => { setSelectedProject(null); navigate(`/project/${selectedProjectData.project.id}`); }}>
                    Ir para o Projeto
                  </Button>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </main>
    </AppLayout>
  );
};

export default Investments;
