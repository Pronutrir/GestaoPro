import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Users, Clock, CheckCircle2, AlertTriangle, Briefcase, X } from "lucide-react";
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
}

interface TimeEntry {
  activity_id: string;
  duration_minutes: number | null;
  user_name: string | null;
  project_id: string;
}

type SummaryFilter = "members" | "assigned" | "unassigned" | "hours" | null;

const TeamView = () => {
  const navigate = useNavigate();
  const { filterProjects, isAdmin, loading: authLoading } = useProjectAccess();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>(null);

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
    const [actRes, projRes, timeRes] = await Promise.all([
      supabase.from("activities").select("id, title, status, assigned_to, project_id, hours, end_date, priority"),
      supabase.from("projects").select("id, title"),
      supabase.from("time_entries").select("activity_id, duration_minutes, user_name, project_id"),
    ]);
    const filteredProjects = await filterProjects(projRes.data || []);
    setProjects(filteredProjects);
    const projectIds = new Set(filteredProjects.map((p) => p.id));
    if (actRes.data) setActivities(actRes.data.filter((a) => projectIds.has(a.project_id)));
    if (timeRes.data) setTimeEntries(timeRes.data.filter((t) => projectIds.has(t.project_id)));
    setIsLoading(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const teamMembers = useMemo(() => {
    const members = new Map<string, {
      name: string; totalTasks: number; completedTasks: number;
      overdueTasks: number; highPriority: number;
      hoursEstimated: number; hoursTracked: number;
      projects: Set<string>;
    }>();

    activities.forEach(a => {
      const name = a.assigned_to?.trim();
      if (!name) return;
      if (!members.has(name)) {
        members.set(name, { name, totalTasks: 0, completedTasks: 0, overdueTasks: 0, highPriority: 0, hoursEstimated: 0, hoursTracked: 0, projects: new Set() });
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

    return Array.from(members.values()).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [activities, timeEntries]);

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
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Membros</p>
            <p className="text-3xl font-bold text-foreground">{teamMembers.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Tarefas Atribuídas</p>
            <p className="text-3xl font-bold text-foreground">{activities.filter(a => a.assigned_to?.trim()).length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Sem Responsável</p>
            <p className="text-3xl font-bold text-warning">{unassigned.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Horas Registradas</p>
            <p className="text-3xl font-bold text-info">{(timeEntries.reduce((s, t) => s + (t.duration_minutes || 0), 0) / 60).toFixed(0)}h</p>
          </Card>
        </div>

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
