import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { ActivityComments } from "@/components/ActivityComments";
import { EditActivityDialog } from "@/components/EditActivityDialog";
import { ImportWBSDialog } from "@/components/ImportWBSDialog";
import { TimelineView } from "@/components/TimelineView";
import { LessonsLearned } from "@/components/LessonsLearned";
import { DocumentManager } from "@/components/DocumentManager";
import { ProjectCharter } from "@/components/ProjectCharter";
import { NotificationBell } from "@/components/NotificationBell";
import { ActivityKanban } from "@/components/ActivityKanban";
import { WorkflowStageManager } from "@/components/WorkflowStageManager";
import { MeetingsManager } from "@/components/MeetingsManager";
import { AssumptionsManager } from "@/components/AssumptionsManager";
import { RisksManager } from "@/components/RisksManager";
import { BacklogSection } from "@/components/BacklogSection";
import { DeliveryPackagesManager } from "@/components/DeliveryPackagesManager";
import { ProjectFinancials } from "@/components/ProjectFinancials";
import { UserStoriesBoard } from "@/components/UserStoriesBoard";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { DailyPendencies } from "@/components/DailyPendencies";
import { DraggableTabBar } from "@/components/DraggableTabBar";
import {
  ArrowLeft, Plus, Calendar, CheckCircle2, Circle, Pencil, Trash2,
  Layers, ListTodo, GanttChart, BookOpen, FileText, Flag,
  ChevronRight, Settings2, Kanban, Users, ShieldCheck, AlertTriangle,
  Package, Inbox, DollarSign, ClipboardList, LayoutDashboard,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { SortableActivityCard } from "@/components/SortableActivityCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getProjectDeadlineInfo, formatProjectDueDate } from "@/lib/projectDeadline";
import { normalizeProjectTabs } from "@/lib/projectTabs";

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assignees: string[];
  budget_planned: number;
  budget_used: number;
  owner: string | null;
  blockers: string | null;
  category?: string | null;
}

interface Phase {
  id: string;
  title: string;
  description: string | null;
  display_order: number;
  project_id: string;
}

interface Activity {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  cost: number;
  hours: number;
  phase_id: string | null;
  display_order?: number | null;
  priority?: string;
  tags?: string[];
  parent_id?: string | null;
}

const ProjectDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canManage: isAdmin, user: currentUser, loading: authLoading } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("kanban");
  const [showDashboard, setShowDashboard] = useState(false);
  const [allowedTabs, setAllowedTabs] = useState<string[] | null>(null);
  const [newActivity, setNewActivity] = useState("");
  const [newActivityAssigned, setNewActivityAssigned] = useState("");
  const [newActivityStartDate, setNewActivityStartDate] = useState("");
  const [newActivityEndDate, setNewActivityEndDate] = useState("");
  const [newActivityCost, setNewActivityCost] = useState("");
  const [newActivityHours, setNewActivityHours] = useState("");
  const [newActivityPhaseId, setNewActivityPhaseId] = useState("");
  const [newActivityPriority, setNewActivityPriority] = useState("medium");
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [newPhaseTitle, setNewPhaseTitle] = useState("");
  const [newPhaseDescription, setNewPhaseDescription] = useState("");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editActivityDialogOpen, setEditActivityDialogOpen] = useState(false);
  const [sprintGoal, setSprintGoal] = useState("");
  const [activeSprintId, setActiveSprintId] = useState<string | null>(null);
  const [members, setMembers] = useState<{ full_name: string; sector: string | null }[]>([]);
  const [userPerms, setUserPerms] = useState<{ can_create: boolean; can_edit: boolean; can_delete: boolean; can_move: boolean } | null>(null);

  const canCreate = !permissionsLoading && (isAdmin || (userPerms?.can_create ?? false));
  const canEdit = !permissionsLoading && (isAdmin || (userPerms?.can_edit ?? false));
  const canDelete = !permissionsLoading && (isAdmin || (userPerms?.can_delete ?? false));
  const canMove = !permissionsLoading && (isAdmin || (userPerms?.can_move ?? false));
  const isQualityProject = project?.category === "qualidade";
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (authLoading) return;
    if (id) {
      fetchProjectData();
      fetchActiveSprint();
      fetchMembers();
      supabase.rpc("generate_overdue_notifications", { p_project_id: id }).then();
    }
  }, [id, authLoading]);

  const loadAccess = useCallback(async (silent = false) => {
    if (!id) return;

    if (isAdmin) {
      setUserPerms({ can_create: true, can_edit: true, can_delete: true, can_move: true });
      setAllowedTabs(null);
      setPermissionsLoading(false);
      return;
    }

    if (!currentUser?.id) {
      setUserPerms(null);
      setAllowedTabs(normalizeProjectTabs());
      setPermissionsLoading(false);
      return;
    }

    if (!silent) {
      setPermissionsLoading(true);
    }

    try {
      const [{ data: perms }, { data: tabPerms, error: tabError }] = await Promise.all([
        supabase
          .from("project_members")
          .select("can_create, can_edit, can_delete, can_move")
          .eq("project_id", id)
          .eq("user_id", currentUser.id)
          .maybeSingle(),
        supabase
          .from("user_tab_permissions")
          .select("allowed_tabs")
          .eq("user_id", currentUser.id)
          .maybeSingle(),
      ]);

      setUserPerms(perms ?? { can_create: false, can_edit: false, can_delete: false, can_move: false });

      if (tabError) {
        console.error("Tab permissions fetch error:", tabError);
      }

      const normalizedTabs = normalizeProjectTabs(tabPerms?.allowed_tabs);
      setAllowedTabs(normalizedTabs);
      setActiveTab((currentTab) => (normalizedTabs.includes(currentTab) ? currentTab : normalizedTabs[0]));
    } finally {
      setPermissionsLoading(false);
    }
  }, [id, currentUser?.id, isAdmin]);

  useEffect(() => {
    if (authLoading || !id) return;
    void loadAccess();
  }, [authLoading, id, loadAccess]);

  useEffect(() => {
    if (authLoading || !id) return;

    const handleFocus = () => {
      void loadAccess(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadAccess(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authLoading, id, loadAccess]);

  useEffect(() => {
    if (authLoading || !id || !currentUser?.id || isAdmin) return;

    const accessChannel = supabase
      .channel(`project-access-${id}-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_members",
          filter: `project_id=eq.${id}`,
        },
        () => {
          void loadAccess(true);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_tab_permissions",
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          void loadAccess(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(accessChannel);
    };
  }, [authLoading, id, currentUser?.id, isAdmin, loadAccess]);

  const fetchMembers = async () => {
    const { data: memberData } = await supabase
      .from("project_members").select("user_id").eq("project_id", id!);
    if (memberData && memberData.length > 0) {
      const userIds = memberData.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles").select("full_name, sector").in("id", userIds);
      if (profiles) setMembers(profiles.filter(p => p.full_name));
    }
  };

  const fetchActiveSprint = async () => {
    const { data } = await supabase
      .from("sprints").select("*").eq("project_id", id!)
      .in("status", ["active", "planning"])
      .order("created_at", { ascending: false }).limit(1);
    if (data && data.length > 0) {
      setActiveSprintId(data[0].id);
      setSprintGoal(data[0].goal || "");
    }
  };

  const handleSprintGoalChange = async (goal: string) => {
    setSprintGoal(goal);
    if (activeSprintId) {
      await supabase.from("sprints").update({ goal }).eq("id", activeSprintId);
    } else {
      const { data } = await supabase.from("sprints").insert({
        project_id: id!, title: "Sprint 1", goal,
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
        status: "active",
      }).select().single();
      if (data) setActiveSprintId(data.id);
    }
  };

  const fetchProjectData = async () => {
    try {
      const { data: projectData, error: projectError } = await supabase
        .from("projects").select("*").eq("id", id).single();
      if (projectError) throw projectError;
      setProject(projectData);

      const { data: phasesData } = await supabase
        .from("phases").select("*").eq("project_id", id).order("display_order", { ascending: true });
      setPhases(phasesData || []);

      const { data: activitiesData } = await (supabase
        .from("activities").select("*").eq("project_id", id) as any).eq("is_trashed", false)
        .order("display_order", { ascending: true }).order("created_at", { ascending: true });
      setActivities(activitiesData || []);
    } catch (error) {
      console.error("Erro ao buscar dados do projeto:", error);
      toast({ title: "Erro ao carregar projeto", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPhase = async () => {
    if (!newPhaseTitle.trim() || !id) return;
    try {
      const maxOrder = phases.reduce((max, p) => Math.max(max, p.display_order), 0);
      await supabase.from("phases").insert({ project_id: id, title: newPhaseTitle, description: newPhaseDescription || null, display_order: maxOrder + 1 });
      toast({ title: "Fase criada!" });
      setNewPhaseTitle(""); setNewPhaseDescription(""); setShowAddPhase(false);
      fetchProjectData();
    } catch { toast({ title: "Erro ao criar fase", variant: "destructive" }); }
  };

  const handleAddActivity = async () => {
    if (!newActivity.trim() || !id) return;
    try {
      await supabase.from("activities").insert({
        project_id: id, title: newActivity, status: "pending",
        assigned_to: newActivityAssigned || null, start_date: newActivityStartDate || null,
        end_date: newActivityEndDate || null, cost: parseFloat(newActivityCost) || 0,
        hours: parseFloat(newActivityHours) || 0, phase_id: newActivityPhaseId || null,
        priority: newActivityPriority,
      });
      toast({ title: "Atividade adicionada!" });
      setNewActivity(""); setNewActivityAssigned(""); setNewActivityStartDate(""); setNewActivityEndDate("");
      setNewActivityCost(""); setNewActivityHours(""); setNewActivityPhaseId(""); setNewActivityPriority("medium");
      setShowAddActivity(false);
      fetchProjectData();
    } catch { toast({ title: "Erro ao adicionar atividade", variant: "destructive" }); }
  };

  const handleToggleActivity = async (activityId: string, currentStatus: string) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    const completedAt = newStatus === "completed" ? new Date().toISOString() : null;
    const updatePayload: any = { status: newStatus, completed_at: completedAt };

    if (id) {
      if (newStatus === "completed") {
        const { data: finalStage } = await supabase
          .from("workflow_stages")
          .select("id")
          .eq("project_id", id)
          .eq("is_final", true)
          .limit(1)
          .maybeSingle();
        if (finalStage) {
          updatePayload.workflow_stage_id = finalStage.id;
        }
      } else {
        // When un-completing, move back to backlog stage
        const { data: backlogStage } = await supabase
          .from("workflow_stages")
          .select("id")
          .eq("project_id", id)
          .eq("display_order", 0)
          .limit(1)
          .maybeSingle();
        if (backlogStage) {
          updatePayload.workflow_stage_id = backlogStage.id;
        }
      }
    }

    await supabase.from("activities").update(updatePayload).eq("id", activityId);
    fetchProjectData();
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!confirm("Tem certeza que deseja mover esta atividade para a lixeira?")) return;
    await (supabase.from("activities").update({ is_trashed: true, trashed_at: new Date().toISOString() } as any) as any).eq("id", activityId);
    toast({ title: "Atividade movida para a lixeira!" });
    fetchProjectData();
  };

  const handleActivityDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const parentActs = activities.filter((a) => !a.parent_id);
    const oldIndex = parentActs.findIndex((a) => a.id === active.id);
    const newIndex = parentActs.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(parentActs, oldIndex, newIndex);
    const otherActivities = activities.filter((a) => a.parent_id);
    setActivities([...reordered.map((a, i) => ({ ...a, display_order: i })), ...otherActivities]);
    for (let i = 0; i < reordered.length; i++) {
      await supabase.from("activities").update({ display_order: i }).eq("id", reordered[i].id);
    }
  };

  if (isLoading || authLoading || permissionsLoading) {
    return (<div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Carregando projeto...</p></div>);
  }
  if (!project) {
    return (<div className="min-h-screen bg-background flex items-center justify-center"><div className="text-center"><p className="text-muted-foreground mb-4">Projeto não encontrado</p><Button onClick={() => navigate("/projects")}>Voltar</Button></div></div>);
  }

  const completedActivities = activities.filter((a) => a.status === "completed").length;
  const activityProgress = activities.length > 0 ? (completedActivities / activities.length) * 100 : 0;


  return (
    <AppLayout title={project.title}>
      <main className="px-4 py-4">
        <div className="space-y-6">
          {/* Project Info Card */}
          <Card className="px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <Button
                  variant={showDashboard ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={() => setShowDashboard(!showDashboard)}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Dashboard
                </Button>
                <h2 className="text-sm font-semibold text-foreground">Informações do Projeto</h2>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingProject(project); setEditDialogOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
                {project.owner && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Líder:</span>
                    <span className="font-medium text-foreground">{project.owner}</span>
                  </div>
                )}
                {project.due_date && (() => {
                  const { dueDate, diffDays, isOverdue, isUrgent } = getProjectDeadlineInfo(project.due_date);
                  return (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-foreground">Entrega em:</span>
                      <span className="font-semibold text-foreground">{formatProjectDueDate(project.due_date)}</span>
                      <span className={`font-bold text-xs px-2 py-0.5 rounded-full animate-pulse ${isOverdue ? "bg-destructive/90 text-destructive-foreground" : isUrgent ? "bg-warning/90 text-warning-foreground" : "bg-success/90 text-success-foreground"}`}>
                        {isOverdue ? `${Math.abs(diffDays)}d atrasado` : diffDays === 0 ? "Hoje!" : `${diffDays} D Restantes`}
                      </span>
                    </div>
                  );
                })()}
                {project.blockers && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <span>⚠️</span>
                    <span className="font-medium text-xs">{project.blockers}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">Progresso:</span>
                <span className="font-medium text-foreground">{completedActivities}/{activities.length} tarefas ({activityProgress.toFixed(0)}%)</span>
                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success transition-all" style={{ width: `${activityProgress}%` }} />
                </div>
              </div>
            </div>
          </Card>

          {showDashboard && (
            <ProjectDashboard
              activities={activities}
              phases={phases}
              project={project}
              onNavigateToActivity={(activity) => { setEditingActivity(activity as any); setEditActivityDialogOpen(true); }}
            />
          )}

          {/* Tabs — Phases tab REMOVED */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <DraggableTabBar
              storageKey={`project-tabs-order-${id}`}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              tabs={[
                { value: "kanban", label: "Kanban", icon: <Kanban className="w-4 h-4" /> },
                ...(isQualityProject ? [{ value: "daily", label: "Pendências do Dia", icon: <Calendar className="w-4 h-4" /> }] : []),
                { value: "backlog", label: "Backlog", icon: <Inbox className="w-4 h-4" /> },
                { value: "timeline", label: "Cronograma", icon: <GanttChart className="w-4 h-4" /> },
                { value: "deliveries", label: "Pacote de Entregas", icon: <Package className="w-4 h-4" /> },
                { value: "documents", label: "Documentos", icon: <FileText className="w-4 h-4" /> },
                { value: "stories", label: "Histórias", icon: <BookOpen className="w-4 h-4" /> },
                { value: "tap", label: "TAP", icon: <ClipboardList className="w-4 h-4" /> },
                { value: "meetings", label: "Reuniões", icon: <Users className="w-4 h-4" /> },
                { value: "assumptions", label: "Premissas", icon: <ShieldCheck className="w-4 h-4" /> },
                { value: "risks", label: "Riscos", icon: <AlertTriangle className="w-4 h-4" /> },
                { value: "financials", label: "Financeiro", icon: <DollarSign className="w-4 h-4" /> },
                { value: "lessons", label: "Lições", icon: <BookOpen className="w-4 h-4" /> },
                { value: "workflow", label: "Workflow", icon: <Settings2 className="w-4 h-4" /> },
              ].filter(tab => !allowedTabs || allowedTabs.includes(tab.value))}
            />

            <TabsContent value="kanban" className="mt-0">
              <ActivityKanban
                projectId={id!} activities={activities} phases={phases}
                onDataChanged={fetchProjectData}
                onEditActivity={(activity) => { setEditingActivity(activity); setEditActivityDialogOpen(true); }}
                onDeleteActivity={handleDeleteActivity}
                onToggleActivity={handleToggleActivity}
                isAdmin={canDelete}
                canCreate={canCreate}
                isQualityProject={isQualityProject}
              />
            </TabsContent>

            {isQualityProject && (
              <TabsContent value="daily" className="mt-0">
                <DailyPendencies
                  activities={activities}
                  onEditActivity={(activity) => { setEditingActivity(activity); setEditActivityDialogOpen(true); }}
                />
              </TabsContent>
            )}

            <TabsContent value="timeline" className="mt-0">
              <TimelineView phases={phases} activities={activities} projectDueDate={project.due_date} onActivityClick={(activity) => { setEditingActivity(activity); setEditActivityDialogOpen(true); }} />
            </TabsContent>

            <TabsContent value="documents" className="mt-0">
              <DocumentManager projectId={id!} phases={phases} activities={activities.map(a => ({ id: a.id, title: a.title }))} />
            </TabsContent>

            <TabsContent value="stories" className="mt-0">
              <UserStoriesBoard projectId={id!} />
            </TabsContent>

            <TabsContent value="tap" className="mt-0">
              <ProjectCharter projectId={id!} project={project} phases={phases} members={members} />
            </TabsContent>

            <TabsContent value="meetings" className="mt-0">
              <MeetingsManager
                projectId={id!} phases={phases}
                onCreateActivity={async (title, assignedTo) => {
                  await supabase.from("activities").insert({ project_id: id!, title, assigned_to: assignedTo || null, status: "pending", priority: "medium" });
                  fetchProjectData();
                }}
                onCreateBlocker={async (description) => {
                  await supabase.from("risks").insert({ project_id: id!, description, probability: "high", impact: "high", status: "identified", category: "impediment" });
                }}
                onCreateLesson={async (problem, suggestion) => {
                  await supabase.from("lessons_learned").insert({ project_id: id!, problem, suggestion: suggestion || null, category: "process" });
                }}
              />
            </TabsContent>

            <TabsContent value="lessons" className="mt-0">
              <LessonsLearned projectId={id!} phases={phases} />
            </TabsContent>

            <TabsContent value="deliveries" className="mt-0">
              <DeliveryPackagesManager projectId={id!} activities={activities.map(a => ({ id: a.id, title: a.title, status: a.status, created_at: a.created_at, completed_at: a.completed_at, phase_id: a.phase_id }))} phases={phases} />
            </TabsContent>

            <TabsContent value="assumptions" className="mt-0">
              <AssumptionsManager projectId={id!} />
            </TabsContent>

            <TabsContent value="risks" className="mt-0">
              <RisksManager projectId={id!} />
            </TabsContent>

            <TabsContent value="backlog" className="mt-3 space-y-4">
              {canCreate && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={showAddPhase ? "secondary" : "default"} onClick={() => { setShowAddPhase(!showAddPhase); setShowAddActivity(false); }} className="gap-2">
                    <Layers className="w-4 h-4" /> Nova Fase
                  </Button>
                  <Button size="sm" variant={showAddActivity ? "secondary" : "outline"} onClick={() => { setShowAddActivity(!showAddActivity); setShowAddPhase(false); }} className="gap-2">
                    <Plus className="w-4 h-4" /> Nova Atividade
                  </Button>
                  <ImportWBSDialog projectId={id!} onDataChanged={fetchProjectData} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-2">
                        <Settings2 className="w-4 h-4" /> Opções
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {phases.length > 0 && (
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async () => {
                          if (!confirm(`Excluir TODAS as ${phases.length} fases? Esta ação é irreversível.`)) return;
                          await supabase.from("phases").delete().eq("project_id", id);
                          toast({ title: `${phases.length} fases excluídas!` }); fetchProjectData();
                        }}>
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir todas as fases
                        </DropdownMenuItem>
                      )}
                      {activities.length > 0 && (
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async () => {
                          if (!confirm(`Excluir TODAS as ${activities.length} atividades? Elas serão movidas para a lixeira.`)) return;
                          await (supabase.from("activities").update({ is_trashed: true, trashed_at: new Date().toISOString() } as any).eq("project_id", id) as any).eq("is_trashed", false);
                          toast({ title: `${activities.length} atividades movidas para a lixeira!` }); fetchProjectData();
                        }}>
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir todas as atividades
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              {showAddPhase && (
                <Card className="p-4 border-primary/20 bg-primary/5 space-y-3">
                  <Input placeholder="Nome da fase *" value={newPhaseTitle} onChange={(e) => setNewPhaseTitle(e.target.value)} />
                  <Input placeholder="Descrição (opcional)" value={newPhaseDescription} onChange={(e) => setNewPhaseDescription(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddPhase}>Criar Fase</Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowAddPhase(false); setNewPhaseTitle(""); setNewPhaseDescription(""); }}>Cancelar</Button>
                  </div>
                </Card>
              )}

              {showAddActivity && (
                <Card className="p-4 border-primary/20 bg-primary/5 space-y-3">
                  <Input placeholder="Nome da atividade *" value={newActivity} onChange={(e) => setNewActivity(e.target.value)} />
                  <div className="grid grid-cols-3 gap-3">
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newActivityAssigned} onChange={(e) => setNewActivityAssigned(e.target.value)}>
                      <option value="">Sem responsável</option>
                      {members.map((m) => (
                        <option key={m.full_name} value={m.full_name!}>{m.full_name}</option>
                      ))}
                    </select>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newActivityPhaseId} onChange={(e) => setNewActivityPhaseId(e.target.value)}>
                      <option value="">Sem fase</option>
                      {phases.map((phase) => (<option key={phase.id} value={phase.id}>{phase.title}</option>))}
                    </select>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newActivityPriority} onChange={(e) => setNewActivityPriority(e.target.value)}>
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input type="number" placeholder="Horas estimadas" value={newActivityHours} onChange={(e) => setNewActivityHours(e.target.value)} step="0.5" min="0" />
                    <CurrencyInput placeholder="0,00" value={newActivityCost} onChange={(e) => setNewActivityCost(e.target.value)} step="0.01" min="0" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs text-muted-foreground">Início</Label><Input type="date" value={newActivityStartDate} onChange={(e) => setNewActivityStartDate(e.target.value)} /></div>
                    <div><Label className="text-xs text-muted-foreground">Fim</Label><Input type="date" value={newActivityEndDate} onChange={(e) => setNewActivityEndDate(e.target.value)} /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleAddActivity}>Salvar</Button>
                    <Button variant="outline" onClick={() => { setShowAddActivity(false); setNewActivity(""); setNewActivityAssigned(""); setNewActivityStartDate(""); setNewActivityEndDate(""); setNewActivityCost(""); setNewActivityHours(""); setNewActivityPhaseId(""); setNewActivityPriority("medium"); }}>Cancelar</Button>
                  </div>
                </Card>
              )}

              <BacklogSection
                projectId={id!} activities={activities} phases={phases}
                onEditActivity={(activity) => { setEditingActivity(activity); setEditActivityDialogOpen(true); }}
                onDeleteActivity={handleDeleteActivity}
                onToggleActivity={handleToggleActivity}
                onDataChanged={fetchProjectData}
                isAdmin={canDelete}
              />
            </TabsContent>

            <TabsContent value="financials" className="mt-0">
              <ProjectFinancials
                projectId={id!}
                budgetPlanned={project.budget_planned}
                budgetUsed={project.budget_used}
                onProjectUpdated={fetchProjectData}
              />
            </TabsContent>

            <TabsContent value="workflow" className="mt-0">
              <WorkflowStageManager projectId={id!} />
            </TabsContent>
          </Tabs>
        </div>

        <EditProjectDialog project={editingProject} open={editDialogOpen} onOpenChange={setEditDialogOpen} onProjectUpdated={fetchProjectData} />
        <EditActivityDialog
          activity={editingActivity} open={editActivityDialogOpen} onOpenChange={setEditActivityDialogOpen}
          onActivityUpdated={fetchProjectData} phases={phases} allActivities={activities}
          projectId={id!} isQualityProject={isQualityProject}
        />
      </main>
    </AppLayout>
  );
};

export default ProjectDetails;
