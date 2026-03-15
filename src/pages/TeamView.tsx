import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Users, Clock, CheckCircle2, AlertTriangle, Briefcase, X, Filter, DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";

interface Activity {
  id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  project_id: string;
  hours: number;
  end_date: string | null;
  priority: string;
}

interface Project {
  id: string;
  title: string;
  budget_planned: number | null;
  budget_used: number | null;
}

interface TimeEntry {
  activity_id: string;
  duration_minutes: number | null;
  user_name: string | null;
  project_id: string;
}

interface ActivityInvestment {
  activity_id: string;
  amount: number;
  description: string | null;
  project_id: string | null;
  responsible: string | null;
  category: string | null;
}

type SummaryFilter = "members" | "assigned" | "unassigned" | "hours" | "investments" | null;

const TeamView = () => {
  const navigate = useNavigate();
  const { filterProjects, isAdmin, loading: authLoading } = useProjectAccess();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [activityInvestments, setActivityInvestments] = useState<ActivityInvestment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>(null);
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterMember, setFilterMember] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, isAdmin]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('team-activities')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    const [actRes, projRes, timeRes, invRes] = await Promise.all([
      supabase.from("activities").select("id, title, status, assigned_to, project_id, hours, end_date, priority"),
      supabase.from("projects").select("id, title, budget_planned, budget_used"),
      supabase.from("time_entries").select("activity_id, duration_minutes, user_name, project_id"),
      supabase.from("activity_investments").select("activity_id, amount, description, project_id, responsible, category"),
    ]);
    const filteredProjects = await filterProjects(projRes.data || []);
    setProjects(filteredProjects);
    const projectIds = new Set(filteredProjects.map((p) => p.id));
    if (actRes.data) setActivities(actRes.data.filter((a) => projectIds.has(a.project_id)));
    if (timeRes.data) setTimeEntries(timeRes.data.filter((t) => projectIds.has(t.project_id)));
    if (invRes.data) {
      const activityIds = new Set((actRes.data || []).filter(a => projectIds.has(a.project_id)).map(a => a.id));
      setActivityInvestments(invRes.data.filter(i => activityIds.has(i.activity_id)));
    }
    setIsLoading(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const teamMembers = useMemo(() => {
    const members = new Map<string, {
      name: string; totalTasks: number; completedTasks: number;
      overdueTasks: number; highPriority: number;
      hoursEstimated: number; hoursTracked: number;
      investmentTotal: number;
      projects: Set<string>;
    }>();

    // Map activity_id -> assigned_to for investment attribution
    const activityOwner = new Map<string, string>();

    activities.forEach(a => {
      const name = a.assigned_to?.trim();
      if (!name) return;
      activityOwner.set(a.id, name);
      if (!members.has(name)) {
        members.set(name, { name, totalTasks: 0, completedTasks: 0, overdueTasks: 0, highPriority: 0, hoursEstimated: 0, hoursTracked: 0, investmentTotal: 0, projects: new Set() });
      }
      const m = members.get(name)!;
      m.totalTasks++;
      if (a.status === "completed") m.completedTasks++;
      if (a.status !== "completed" && a.end_date && new Date(a.end_date) < today) m.overdueTasks++;
      if (a.priority === "high" && a.status !== "completed") m.highPriority++;
      m.hoursEstimated += a.hours || 0;
      m.projects.add(a.project_id);
    });

    timeEntries.forEach(te => {
      const name = te.user_name?.trim();
      if (!name || !members.has(name)) return;
      members.get(name)!.hoursTracked += (te.duration_minutes || 0) / 60;
    });

    activityInvestments.forEach(inv => {
      const owner = activityOwner.get(inv.activity_id);
      if (owner && members.has(owner)) {
        members.get(owner)!.investmentTotal += inv.amount || 0;
      }
    });

    return Array.from(members.values()).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [activities, timeEntries, activityInvestments]);

  const totalInvestments = useMemo(() => {
    const fromActivities = activityInvestments.reduce((s, i) => s + (i.amount || 0), 0);
    const fromBudget = projects.reduce((s, p) => s + (p.budget_used || 0), 0);
    return fromActivities + fromBudget;
  }, [activityInvestments, projects]);

  const totalBudgetPlanned = useMemo(() => {
    return projects.reduce((s, p) => s + (p.budget_planned || 0), 0);
  }, [projects]);

  const unassigned = activities.filter(a => !a.assigned_to?.trim());

  // Member detail data
  const selectedMemberData = useMemo(() => {
    if (!selectedMember) return null;
    const member = teamMembers.find(m => m.name === selectedMember);
    if (!member) return null;

    const memberActivities = activities.filter(a => a.assigned_to?.trim() === selectedMember);
    const memberProjects = projects.filter(p => member.projects.has(p.id));
    const overdue = memberActivities.filter(a => a.status !== "completed" && a.end_date && new Date(a.end_date) < today);
    const inProgress = memberActivities.filter(a => a.status !== "completed" && !(a.end_date && new Date(a.end_date) < today));

    return { member, memberActivities, memberProjects, overdue, inProgress };
  }, [selectedMember, teamMembers, activities, projects]);

  return (
    <AppLayout title="Visão por Equipe">
      <main className="px-4 py-6 space-y-6">
        {/* Summary - clickable cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { key: "members" as SummaryFilter, label: "Membros", value: teamMembers.length, color: "text-foreground" },
            { key: "assigned" as SummaryFilter, label: "Tarefas Atribuídas", value: activities.filter(a => a.assigned_to?.trim()).length, color: "text-foreground" },
            { key: "unassigned" as SummaryFilter, label: "Sem Responsável", value: unassigned.length, color: "text-warning" },
            { key: "hours" as SummaryFilter, label: "Horas Registradas", value: `${(timeEntries.reduce((s, t) => s + (t.duration_minutes || 0), 0) / 60).toFixed(0)}h`, color: "text-info" },
            { key: "investments" as SummaryFilter, label: "Investimentos", value: `R$ ${totalInvestments.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, color: "text-emerald-600" },
          ].map(card => (
            <Card
              key={card.key}
              className={`p-5 cursor-pointer hover:shadow-md transition-shadow ${summaryFilter === card.key ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSummaryFilter(summaryFilter === card.key ? null : card.key)}
            >
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            </Card>
          ))}
        </div>

        {/* Summary detail panel */}
        {summaryFilter && (
          <Card className="p-5 space-y-3 border-primary/30">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {summaryFilter === "members" && `👥 Membros da Equipe (${teamMembers.length})`}
                {summaryFilter === "assigned" && `📋 Tarefas Atribuídas`}
                {summaryFilter === "unassigned" && `⚠️ Tarefas Sem Responsável`}
                {summaryFilter === "hours" && `⏱️ Horas Registradas por Membro`}
                {summaryFilter === "investments" && `💰 Investimentos por Membro`}
              </h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSummaryFilter(null); setFilterProject("all"); setFilterMember("all"); setFilterStatus("all"); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Filters row */}
            {summaryFilter !== "members" && (
              <div className="flex flex-wrap gap-2 items-center">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select value={filterProject} onValueChange={setFilterProject}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue placeholder="Projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const allCount = summaryFilter === "unassigned"
                        ? unassigned.length
                        : summaryFilter === "assigned"
                        ? activities.filter(a => a.assigned_to?.trim()).length
                        : summaryFilter === "hours"
                        ? timeEntries.length
                        : summaryFilter === "investments"
                        ? teamMembers.filter(m => m.investmentTotal > 0).length
                        : 0;
                      return <SelectItem value="all">Todos os Projetos ({allCount})</SelectItem>;
                    })()}
                    {projects.map(p => {
                      const count = summaryFilter === "unassigned"
                        ? unassigned.filter(a => a.project_id === p.id).length
                        : summaryFilter === "assigned"
                        ? activities.filter(a => a.assigned_to?.trim() && a.project_id === p.id).length
                        : summaryFilter === "hours"
                        ? timeEntries.filter(t => t.project_id === p.id).length
                        : summaryFilter === "investments"
                        ? teamMembers.filter(m => m.investmentTotal > 0 && m.projects.has(p.id)).length
                        : 0;
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title} ({count})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {summaryFilter === "assigned" && (
                  <>
                    <Select value={filterMember} onValueChange={setFilterMember}>
                      <SelectTrigger className="h-8 w-[160px] text-xs">
                        <SelectValue placeholder="Membro" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Membros</SelectItem>
                        {teamMembers.map(m => (
                          <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos Status</SelectItem>
                        <SelectItem value="completed">Concluída</SelectItem>
                        <SelectItem value="in_progress">Em andamento</SelectItem>
                        <SelectItem value="pending">Pendente</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            )}

            {(() => {
              const byProject = (a: Activity) => filterProject === "all" || a.project_id === filterProject;
              const byMember = (a: Activity) => filterMember === "all" || a.assigned_to?.trim() === filterMember;
              const byStatus = (a: Activity) => filterStatus === "all" || a.status === filterStatus;

              const filteredAssigned = activities.filter(a => a.assigned_to?.trim()).filter(byProject).filter(byMember).filter(byStatus);
              const filteredUnassigned = unassigned.filter(byProject);
              const filteredHoursMembers = teamMembers.filter(m => m.hoursTracked > 0).filter(m => {
                if (filterProject === "all") return true;
                return m.projects.has(filterProject);
              }).sort((a, b) => b.hoursTracked - a.hoursTracked);

              return (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {summaryFilter === "members" && teamMembers.map(m => (
                    <div key={m.name} className="flex items-center justify-between p-2 bg-muted/30 rounded-md cursor-pointer hover:bg-muted/50"
                      onClick={() => { setSummaryFilter(null); setSelectedMember(m.name); }}>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-[10px] font-bold text-primary">{m.name.substring(0, 2).toUpperCase()}</span>
                        </div>
                        <span className="text-sm font-medium">{m.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{m.totalTasks} tarefa(s) · {m.projects.size} projeto(s)</span>
                    </div>
                  ))}

                  {summaryFilter === "assigned" && (
                    <>
                      <p className="text-xs text-muted-foreground">{filteredAssigned.length} resultado(s)</p>
                      {filteredAssigned.map(a => {
                        const proj = projects.find(p => p.id === a.project_id);
                        return (
                          <div key={a.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">{a.title}</span>
                              <span className="text-[10px] text-muted-foreground">👤 {a.assigned_to} · {proj?.title || ""}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] ml-2 shrink-0">
                              {a.status === "completed" ? "Concluída" : a.status === "in_progress" ? "Em andamento" : "Pendente"}
                            </Badge>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {summaryFilter === "unassigned" && (
                    <>
                      <p className="text-xs text-muted-foreground">{filteredUnassigned.length} resultado(s)</p>
                      {filteredUnassigned.map(a => {
                        const proj = projects.find(p => p.id === a.project_id);
                        return (
                          <div key={a.id} className="flex items-center justify-between p-2 bg-warning/5 rounded-md border border-warning/10">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">{a.title}</span>
                              <span className="text-[10px] text-muted-foreground">{proj?.title || ""}</span>
                            </div>
                            {a.end_date && <span className="text-xs text-muted-foreground ml-2">{new Date(a.end_date).toLocaleDateString("pt-BR")}</span>}
                          </div>
                        );
                      })}
                    </>
                  )}

                  {summaryFilter === "hours" && (
                    <>
                      <p className="text-xs text-muted-foreground">{filteredHoursMembers.length} membro(s)</p>
                      {filteredHoursMembers.map(m => (
                        <div key={m.name} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                          <span className="text-sm font-medium">{m.name}</span>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>Estimado: {m.hoursEstimated.toFixed(0)}h</span>
                            <span className="font-semibold text-info">Registrado: {m.hoursTracked.toFixed(1)}h</span>
                          </div>
                        </div>
                      ))}
                      {filteredHoursMembers.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma hora registrada ainda.</p>
                      )}
                    </>
                  )}

                  {summaryFilter === "investments" && (() => {
                    const filteredInvMembers = teamMembers.filter(m => m.investmentTotal > 0).filter(m => {
                      if (filterProject === "all") return true;
                      return m.projects.has(filterProject);
                    }).sort((a, b) => b.investmentTotal - a.investmentTotal);

                    const totalFiltered = filteredInvMembers.reduce((s, m) => s + m.investmentTotal, 0);
                    const budgetFiltered = filterProject === "all"
                      ? totalBudgetPlanned
                      : projects.find(p => p.id === filterProject)?.budget_planned || 0;

                    return (
                      <>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>{filteredInvMembers.length} membro(s)</span>
                          {budgetFiltered > 0 && (
                            <span>Orçamento planejado: R$ {budgetFiltered.toLocaleString("pt-BR")}</span>
                          )}
                        </div>
                        {filteredInvMembers.map(m => (
                          <div key={m.name} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                            <span className="text-sm font-medium">{m.name}</span>
                            <span className="text-sm font-semibold text-emerald-600">
                              R$ {m.investmentTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                        {filteredInvMembers.length > 0 && (
                          <div className="flex items-center justify-between p-2 bg-primary/5 rounded-md border border-primary/10 mt-1">
                            <span className="text-sm font-semibold">Total</span>
                            <span className="text-sm font-bold text-emerald-600">
                              R$ {totalFiltered.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {filteredInvMembers.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">Nenhum investimento registrado.</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              );
            })()}
          </Card>
        )}

        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Carregando...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamMembers.map(member => {
              const completionRate = member.totalTasks > 0 ? (member.completedTasks / member.totalTasks) * 100 : 0;
              return (
                <Card
                  key={member.name}
                  className="p-5 space-y-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedMember(member.name)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">{member.name.substring(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{member.name}</h3>
                      <p className="text-xs text-muted-foreground">{member.projects.size} projeto(s)</p>
                    </div>
                    {member.overdueTasks > 0 && (
                      <Badge className="bg-destructive/20 text-destructive text-xs">{member.overdueTasks} atrasada(s)</Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-medium text-foreground">{completionRate.toFixed(0)}%</span>
                    </div>
                    <Progress value={completionRate} className="h-2" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <span className="text-muted-foreground">{member.completedTasks}/{member.totalTasks}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-info" />
                      <span className="text-muted-foreground">{member.hoursTracked.toFixed(0)}h / {member.hoursEstimated}h</span>
                    </div>
                    {member.highPriority > 0 && (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <span className="text-muted-foreground">{member.highPriority} alta</span>
                      </div>
                    )}
                    {member.investmentTotal > 0 && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        <span className="text-muted-foreground">R$ {member.investmentTotal.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Member Detail Drawer */}
        <Sheet open={!!selectedMember} onOpenChange={(open) => { if (!open) setSelectedMember(null); }}>
          <SheetContent className="sm:max-w-lg overflow-y-auto">
            {selectedMemberData && (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">{selectedMemberData.member.name.substring(0, 2).toUpperCase()}</span>
                    </div>
                    {selectedMemberData.member.name}
                  </SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                  {/* KPIs */}
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Concluídas</p>
                      <p className="text-2xl font-bold text-success">{selectedMemberData.member.completedTasks}</p>
                    </Card>
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Atrasadas</p>
                      <p className="text-2xl font-bold text-destructive">{selectedMemberData.member.overdueTasks}</p>
                    </Card>
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Horas Est.</p>
                      <p className="text-2xl font-bold text-foreground">{selectedMemberData.member.hoursEstimated}h</p>
                    </Card>
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Horas Reg.</p>
                      <p className="text-2xl font-bold text-info">{selectedMemberData.member.hoursTracked.toFixed(1)}h</p>
                    </Card>
                    {selectedMemberData.member.investmentTotal > 0 && (
                      <Card className="p-3 text-center col-span-2">
                        <p className="text-xs text-muted-foreground">Investimentos</p>
                        <p className="text-2xl font-bold text-emerald-600">R$ {selectedMemberData.member.investmentTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                      </Card>
                    )}
                  </div>

                  {/* Projects */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Projetos ({selectedMemberData.memberProjects.length})</h3>
                    <div className="space-y-1.5">
                      {selectedMemberData.memberProjects.map(p => (
                        <div key={p.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md cursor-pointer hover:bg-muted/50"
                          onClick={() => { setSelectedMember(null); navigate(`/project/${p.id}`); }}>
                          <Briefcase className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{p.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Overdue Tasks */}
                  {selectedMemberData.overdue.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-destructive mb-2">⚠️ Atrasadas ({selectedMemberData.overdue.length})</h3>
                      <div className="space-y-1.5">
                        {selectedMemberData.overdue.map(a => (
                          <div key={a.id} className="flex items-center justify-between p-2 bg-destructive/5 rounded-md border border-destructive/10">
                            <span className="text-sm truncate flex-1">{a.title}</span>
                            {a.end_date && <span className="text-xs text-destructive ml-2">{new Date(a.end_date).toLocaleDateString("pt-BR")}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* In Progress Tasks */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Em andamento ({selectedMemberData.inProgress.length})</h3>
                    <div className="space-y-1.5">
                      {selectedMemberData.inProgress.map(a => (
                        <div key={a.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                          <span className="text-sm truncate flex-1">{a.title}</span>
                          <Badge variant="outline" className="text-[10px] ml-2">
                            {a.priority === "high" ? "Alta" : a.priority === "medium" ? "Média" : "Baixa"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </main>
    </AppLayout>
  );
};

export default TeamView;
