'use client';
import { useState, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Users, Clock, CheckCircle2, AlertTriangle, Briefcase, X, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { useAuth } from "@/contexts/AuthContext";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { useAssigneeAvatarLookup } from "@/hooks/useAssigneeAvatarLookup";

interface Activity {
  id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  participants: string[] | null;
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
  owner: string | null;
}

interface TimeEntry {
  activity_id: string;
  duration_minutes: number | null;
  user_name: string | null;
  project_id: string;
}

interface ProjectMemberProfile {
  full_name: string;
  project_ids: Set<string>;
}

type SummaryFilter = "members" | "assigned" | "unassigned" | "hours" | "planned" | null;

const normalizeIdentity = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const TeamView = () => {
  const router = useRouter();
  const { filterProjects, loading: authLoading } = useProjectAccess();
  const { isAdmin } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [allMemberNames, setAllMemberNames] = useState<ProjectMemberProfile[]>([]);
  const [memberNameLookup, setMemberNameLookup] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>(null);
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterMember, setFilterMember] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const assigneeAvatarMap = useAssigneeAvatarLookup([
    ...activities.map((activity) => activity.assigned_to),
    ...allMemberNames.map((member) => member.full_name),
  ]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, isAdmin]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('team-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    const [actRes, projRes, timeRes, membersRes] = await Promise.all([
      supabase
        .from("activities")
        .select("id, title, status, assigned_to, participants, project_id, hours, end_date, priority, is_trashed")
        .eq("is_trashed", false),
      supabase.from("projects").select("id, title, budget_planned, budget_used, owner").eq("is_trashed", false),
      supabase.from("time_entries").select("activity_id, duration_minutes, user_name, project_id"),
      supabase.from("project_members").select("project_id, user_id"),
    ]);
    const filteredProjects = await filterProjects(projRes.data || []);
    setProjects(filteredProjects);
    const projectIds = new Set(filteredProjects.map((p) => p.id));
    let activeActivities: Activity[] = [];
    if (actRes.data) {
      activeActivities = actRes.data.filter((a: any) => projectIds.has(a.project_id) && a.is_trashed !== true);
      setActivities(activeActivities);
    }
    if (timeRes.data) {
      const activeActivityIds = new Set(activeActivities.map((activity) => activity.id));
      setTimeEntries(
        timeRes.data.filter(
          (t) => projectIds.has(t.project_id) && activeActivityIds.has(t.activity_id),
        ),
      );
    }

    // Build all member names from project_members profiles + project owners
    const filteredMembers = (membersRes.data || []).filter(m => projectIds.has(m.project_id));
    const userIds = [...new Set(filteredMembers.map(m => m.user_id))];
    const nextMemberLookup: Record<string, string> = {};

    const memberProfiles: ProjectMemberProfile[] = [];
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      if (profiles) {
        const profileMap = new Map(profiles.map(p => [p.id, p.full_name]));
        profiles.forEach((profile) => {
          const fullName = profile.full_name?.trim();
          if (!fullName) return;
          if (profile.id) nextMemberLookup[profile.id] = fullName;
          if (profile.email) nextMemberLookup[profile.email] = fullName;
          nextMemberLookup[normalizeIdentity(fullName)] = fullName;
        });
        const nameToProjects = new Map<string, Set<string>>();
        
        filteredMembers.forEach(m => {
          const name = profileMap.get(m.user_id)?.trim();
          if (!name) return;
          if (!nameToProjects.has(name)) nameToProjects.set(name, new Set());
          nameToProjects.get(name)!.add(m.project_id);
        });
        
        nameToProjects.forEach((pIds, name) => {
          memberProfiles.push({ full_name: name, project_ids: pIds });
        });

      }
    }

    // Also include project owners
    filteredProjects.forEach(p => {
      const owner = p.owner?.trim();
      if (owner) {
        nextMemberLookup[normalizeIdentity(owner)] = owner;
        const existing = memberProfiles.find(mp => mp.full_name === owner);
        if (existing) {
          existing.project_ids.add(p.id);
        } else {
          memberProfiles.push({ full_name: owner, project_ids: new Set([p.id]) });
        }
      }
    });

    setAllMemberNames(memberProfiles);
    setMemberNameLookup(nextMemberLookup);
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

    // Seed with all project members/owners first
    allMemberNames.forEach(mp => {
      if (!members.has(mp.full_name)) {
        members.set(mp.full_name, { name: mp.full_name, totalTasks: 0, completedTasks: 0, overdueTasks: 0, highPriority: 0, hoursEstimated: 0, hoursTracked: 0, projects: new Set(mp.project_ids) });
      } else {
        mp.project_ids.forEach(pid => members.get(mp.full_name)!.projects.add(pid));
      }
    });

    // Add activity data (responsible + participants)
    const activityById = new Map(activities.map((activity) => [activity.id, activity]));

    const resolveMemberName = (raw: string | null | undefined) => {
      const trimmed = raw?.trim();
      if (!trimmed) return null;
      if (members.has(trimmed)) return trimmed;
      const direct = memberNameLookup[trimmed];
      if (direct && members.has(direct)) return direct;
      const normalized = memberNameLookup[normalizeIdentity(trimmed)];
      if (normalized && members.has(normalized)) return normalized;
      return null;
    };

    activities.forEach(a => {
      const addActivityToMember = (name: string | undefined | null, isParticipant = false) => {
        const trimmed = name?.trim();
        if (!trimmed) return;
        if (!members.has(trimmed)) {
          members.set(trimmed, { name: trimmed, totalTasks: 0, completedTasks: 0, overdueTasks: 0, highPriority: 0, hoursEstimated: 0, hoursTracked: 0, projects: new Set() });
        }
        const m = members.get(trimmed)!;
        m.totalTasks++;
        if (a.status === "completed") m.completedTasks++;
        if (a.status !== "completed" && a.end_date && new Date(a.end_date) < today) m.overdueTasks++;
        if (a.priority === "high" && a.status !== "completed") m.highPriority++;
        if (!isParticipant) m.hoursEstimated += a.hours || 0;
        m.projects.add(a.project_id);
      };

      addActivityToMember(a.assigned_to);
      // Also add participants
      if (a.participants && a.participants.length > 0) {
        a.participants.forEach(p => addActivityToMember(p, true));
      }
    });

    const trackedMinutesByActivity = new Map<string, number>();
    const trackedMinutesByActivityAndUser = new Map<string, Map<string, number>>();
    timeEntries.forEach((entry) => {
      if (!entry.activity_id) return;
      const current = trackedMinutesByActivity.get(entry.activity_id) || 0;
      trackedMinutesByActivity.set(entry.activity_id, current + (entry.duration_minutes || 0));

      const userName = entry.user_name?.trim();
      if (!userName) return;
      const byUser = trackedMinutesByActivityAndUser.get(entry.activity_id) || new Map<string, number>();
      byUser.set(userName, (byUser.get(userName) || 0) + (entry.duration_minutes || 0));
      trackedMinutesByActivityAndUser.set(entry.activity_id, byUser);
    });

    // Horas por membro devem refletir o consumo das atividades atribuídas ao membro,
    // inclusive quando o user_name do apontamento está vazio ou diferente.
    activities.forEach((activity) => {
      const trackedMinutes = trackedMinutesByActivity.get(activity.id) || 0;
      const plannedMinutes = Math.max(0, Math.round((Number(activity.hours) || 0) * 60));
      const minutes = trackedMinutes > 0
        ? trackedMinutes
        : activity.status === "completed"
          ? plannedMinutes
          : 0;
      if (minutes <= 0) return;

      let memberName = resolveMemberName(activity.assigned_to);
      if (!memberName) {
        const fallbackAssignee = activity.assigned_to?.trim();
        if (fallbackAssignee) {
          memberName = fallbackAssignee;
          if (!members.has(memberName)) {
            members.set(memberName, {
              name: memberName,
              totalTasks: 0,
              completedTasks: 0,
              overdueTasks: 0,
              highPriority: 0,
              hoursEstimated: 0,
              hoursTracked: 0,
              projects: new Set(activity.project_id ? [activity.project_id] : []),
            });
          }
        }
      }

      if (memberName && members.has(memberName)) {
        members.get(memberName)!.hoursTracked += minutes / 60;
        return;
      }

      // Quando não há responsável mapeado (comum em itens antigos/concluídos),
      // distribui as horas pelos nomes dos apontamentos já registrados.
      const minutesByUser = trackedMinutesByActivityAndUser.get(activity.id);
      if (!minutesByUser) return;

      minutesByUser.forEach((userMinutes, rawUserName) => {
        let resolvedUser = resolveMemberName(rawUserName) || rawUserName;
        const normalized = memberNameLookup[normalizeIdentity(resolvedUser)];
        if (normalized) resolvedUser = normalized;

        if (!members.has(resolvedUser)) {
          members.set(resolvedUser, {
            name: resolvedUser,
            totalTasks: 0,
            completedTasks: 0,
            overdueTasks: 0,
            highPriority: 0,
            hoursEstimated: 0,
            hoursTracked: 0,
            projects: new Set(activity.project_id ? [activity.project_id] : []),
          });
        }

        members.get(resolvedUser)!.hoursTracked += userMinutes / 60;
      });
    });

    // Fallback para apontamentos sem atividade vinculada encontrada.
    timeEntries.forEach((entry) => {
      if (entry.activity_id && activityById.has(entry.activity_id)) return;

      const fallbackName = entry.user_name?.trim();
      if (!fallbackName) return;

      if (!members.has(fallbackName)) {
        members.set(fallbackName, {
          name: fallbackName,
          totalTasks: 0,
          completedTasks: 0,
          overdueTasks: 0,
          highPriority: 0,
          hoursEstimated: 0,
          hoursTracked: 0,
          projects: new Set(entry.project_id ? [entry.project_id] : []),
        });
      }

      members.get(fallbackName)!.hoursTracked += (entry.duration_minutes || 0) / 60;
    });

    return Array.from(members.values()).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [activities, timeEntries, allMemberNames, memberNameLookup]);


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

  const totalTrackedHours = teamMembers.reduce((sum, member) => sum + member.hoursTracked, 0);
  const totalPlannedHours = teamMembers.reduce((sum, member) => sum + member.hoursEstimated, 0);

  return (
          <main className="px-4 py-6 space-y-6">
        {/* Summary - clickable cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {[
            { key: "members" as SummaryFilter, label: "Membros", value: teamMembers.length, color: "text-foreground" },
            { key: "assigned" as SummaryFilter, label: "Tarefas Atribuídas", value: activities.filter(a => a.assigned_to?.trim()).length, color: "text-foreground" },
            { key: "unassigned" as SummaryFilter, label: "Sem Responsável", value: unassigned.length, color: "text-warning" },
            { key: "planned" as SummaryFilter, label: "Horas Planejadas", value: `${totalPlannedHours.toFixed(0)}h`, color: "text-foreground" },
            { key: "hours" as SummaryFilter, label: "Horas Registradas", value: `${totalTrackedHours.toFixed(0)}h`, color: "text-info" },
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
                {summaryFilter === "planned" && `🗓️ Horas Planejadas por Membro`}
                {summaryFilter === "hours" && `⏱️ Horas Registradas por Membro`}
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
                        : summaryFilter === "planned"
                        ? teamMembers.filter(m => m.hoursEstimated > 0).length
                        : summaryFilter === "hours"
                        ? teamMembers.filter(m => m.hoursTracked > 0).length
                        : 0;
                      return <SelectItem value="all">Todos os Projetos ({allCount})</SelectItem>;
                    })()}
                    {projects.map(p => {
                      const count = summaryFilter === "unassigned"
                        ? unassigned.filter(a => a.project_id === p.id).length
                        : summaryFilter === "assigned"
                        ? activities.filter(a => a.assigned_to?.trim() && a.project_id === p.id).length
                        : summaryFilter === "planned"
                        ? teamMembers.filter(m => m.hoursEstimated > 0 && m.projects.has(p.id)).length
                        : summaryFilter === "hours"
                        ? teamMembers.filter(m => m.hoursTracked > 0 && m.projects.has(p.id)).length
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
              const filteredPlannedMembers = teamMembers.filter(m => m.hoursEstimated > 0).filter(m => {
                if (filterProject === "all") return true;
                return m.projects.has(filterProject);
              }).sort((a, b) => b.hoursEstimated - a.hoursEstimated);
              const filteredHoursMembers = teamMembers.filter(m => m.hoursTracked > 0).filter(m => {
                if (filterProject === "all") return true;
                return m.projects.has(filterProject);
              }).sort((a, b) => b.hoursTracked - a.hoursTracked);

              return (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {summaryFilter === "members" && teamMembers.map(m => (
                    <div key={m.name} className="flex items-center justify-between p-2 bg-card border rounded-md cursor-pointer hover:bg-muted/50"
                      onClick={() => { setSummaryFilter(null); setSelectedMember(m.name); }}>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7">
                          {(() => {
                            const avatar = resolveAvatarFromLookup(m.name, m.name, assigneeAvatarMap);
                            return avatar ? <AvatarImage src={avatar} alt={m.name} /> : null;
                          })()}
                          <AvatarFallback className="text-[10px] font-bold text-primary bg-primary/10">{getAvatarInitials(m.name)}</AvatarFallback>
                        </Avatar>
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
                          <div key={a.id} className="flex items-center justify-between p-2 bg-card border rounded-md">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">{a.title}</span>
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground max-w-[260px]">
                                <Avatar className="h-4 w-4 shrink-0">
                                  {(() => {
                                    const avatar = resolveAvatarFromLookup(a.assigned_to, a.assigned_to, assigneeAvatarMap);
                                    return avatar ? <AvatarImage src={avatar} alt={a.assigned_to || "Responsável"} /> : null;
                                  })()}
                                  <AvatarFallback className="text-[8px]">{getAvatarInitials(a.assigned_to)}</AvatarFallback>
                                </Avatar>
                                <span className="truncate">{a.assigned_to} · {proj?.title || ""}</span>
                              </span>
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
                        <div key={m.name} className="flex items-center justify-between p-2 bg-card border rounded-md">
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

                  {summaryFilter === "planned" && (
                    <>
                      <p className="text-xs text-muted-foreground">{filteredPlannedMembers.length} membro(s)</p>
                      {filteredPlannedMembers.map(m => (
                        <div key={m.name} className="flex items-center justify-between p-2 bg-card border rounded-md">
                          <span className="text-sm font-medium">{m.name}</span>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">Planejado: {m.hoursEstimated.toFixed(1)}h</span>
                            <span className="text-info">Registrado: {m.hoursTracked.toFixed(1)}h</span>
                          </div>
                        </div>
                      ))}
                      {filteredPlannedMembers.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma hora planejada ainda.</p>
                      )}
                    </>
                  )}

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
              const memberAvatar = resolveAvatarFromLookup(member.name, member.name, assigneeAvatarMap);
              return (
                <Card
                  key={member.name}
                  className="p-5 space-y-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedMember(member.name)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      {memberAvatar ? <AvatarImage src={memberAvatar} alt={member.name} /> : null}
                      <AvatarFallback className="text-sm font-bold text-primary bg-primary/10">{getAvatarInitials(member.name)}</AvatarFallback>
                    </Avatar>
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
                {(() => {
                  const selectedAvatar = resolveAvatarFromLookup(selectedMemberData.member.name, selectedMemberData.member.name, assigneeAvatarMap);
                  return (
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      {selectedAvatar ? <AvatarImage src={selectedAvatar} alt={selectedMemberData.member.name} /> : null}
                      <AvatarFallback className="text-sm font-bold text-primary bg-primary/10">{getAvatarInitials(selectedMemberData.member.name)}</AvatarFallback>
                    </Avatar>
                    {selectedMemberData.member.name}
                  </SheetTitle>
                </SheetHeader>
                  );
                })()}

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
                        <div key={p.id} className="flex items-center gap-2 p-2 bg-card border rounded-md cursor-pointer hover:bg-muted/50"
                          onClick={() => { setSelectedMember(null); router.push(`/project/${p.id}`); }}>
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
                        <div key={a.id} className="flex items-center justify-between p-2 bg-card border rounded-md">
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
    
  );
};

export default TeamView;
