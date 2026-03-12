import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { ActivityComments } from "@/components/ActivityComments";
import { EditActivityDialog } from "@/components/EditActivityDialog";
import { PhaseManager } from "@/components/PhaseManager";
import { ImportWBSDialog } from "@/components/ImportWBSDialog";
import { TimelineView } from "@/components/TimelineView";

import { LessonsLearned } from "@/components/LessonsLearned";
import { DocumentManager } from "@/components/DocumentManager";
import { NotificationBell } from "@/components/NotificationBell";
import { ActivityKanban } from "@/components/ActivityKanban";
import { WorkflowStageManager } from "@/components/WorkflowStageManager";
import { MeetingsManager } from "@/components/MeetingsManager";
import { AssumptionsManager } from "@/components/AssumptionsManager";
import { RisksManager } from "@/components/RisksManager";
import { BacklogSection } from "@/components/BacklogSection";
import { DeliveryPackagesManager } from "@/components/DeliveryPackagesManager";
import { DraggableTabBar } from "@/components/DraggableTabBar";
import {
  ArrowLeft,
  Plus,
  Calendar,
  CheckCircle2,
  Circle,
  Pencil,
  Trash2,
  Layers,
  ListTodo,
  GanttChart,
  
  BookOpen,
  FileText,
  Flag,
  ChevronRight,
  Settings2,
  Kanban,
  Users,
  ShieldCheck,
  AlertTriangle,
  Package,
  Inbox,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { SortableActivityCard } from "@/components/SortableActivityCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

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
  const { isAdmin } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("kanban");
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (id) {
      fetchProjectData();
      fetchActiveSprint();
      supabase.rpc("generate_overdue_notifications", { p_project_id: id }).then();
    }
  }, [id]);

  const fetchActiveSprint = async () => {
    const { data } = await supabase
      .from("sprints")
      .select("*")
      .eq("project_id", id!)
      .in("status", ["active", "planning"])
      .order("created_at", { ascending: false })
      .limit(1);
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
      // Create a new sprint automatically
      const { data } = await supabase.from("sprints").insert({
        project_id: id!,
        title: "Sprint 1",
        goal,
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

      const { data: phasesData, error: phasesError } = await supabase
        .from("phases").select("*").eq("project_id", id).order("display_order", { ascending: true });
      if (phasesError) throw phasesError;
      setPhases(phasesData || []);

      const { data: activitiesData, error: activitiesError } = await supabase
        .from("activities").select("*").eq("project_id", id).order("display_order", { ascending: true }).order("created_at", { ascending: true });
      if (activitiesError) throw activitiesError;
      setActivities(activitiesData || []);
    } catch (error) {
      console.error("Erro ao buscar dados do projeto:", error);
      toast({ title: "Erro ao carregar projeto", description: "Não foi possível carregar os dados.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPhase = async () => {
    if (!newPhaseTitle.trim() || !id) return;
    try {
      const maxOrder = phases.reduce((max, p) => Math.max(max, p.display_order), 0);
      const { error } = await supabase.from("phases").insert({ project_id: id, title: newPhaseTitle, description: newPhaseDescription || null, display_order: maxOrder + 1 });
      if (error) throw error;
      toast({ title: "Fase criada!" });
      setNewPhaseTitle(""); setNewPhaseDescription(""); setShowAddPhase(false);
      fetchProjectData();
    } catch (error) {
      toast({ title: "Erro ao criar fase", variant: "destructive" });
    }
  };

  const handleAddActivity = async () => {
    if (!newActivity.trim() || !id) return;
    try {
      const { error } = await supabase.from("activities").insert({
        project_id: id, title: newActivity, status: "pending",
        assigned_to: newActivityAssigned || null, start_date: newActivityStartDate || null,
        end_date: newActivityEndDate || null, cost: parseFloat(newActivityCost) || 0,
        hours: parseFloat(newActivityHours) || 0, phase_id: newActivityPhaseId || null,
        priority: newActivityPriority,
      });
      if (error) throw error;
      toast({ title: "Atividade adicionada!" });
      setNewActivity(""); setNewActivityAssigned(""); setNewActivityStartDate(""); setNewActivityEndDate("");
      setNewActivityCost(""); setNewActivityHours(""); setNewActivityPhaseId(""); setNewActivityPriority("medium");
      setShowAddActivity(false);
      fetchProjectData();
    } catch (error) {
      toast({ title: "Erro ao adicionar atividade", variant: "destructive" });
    }
  };

  const handleToggleActivity = async (activityId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "completed" ? "pending" : "completed";
      const completedAt = newStatus === "completed" ? new Date().toISOString() : null;
      const { error } = await supabase.from("activities").update({ status: newStatus, completed_at: completedAt }).eq("id", activityId);
      if (error) throw error;
      fetchProjectData();
    } catch (error) {
      toast({ title: "Erro ao atualizar atividade", variant: "destructive" });
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta atividade?")) return;
    try {
      const { error } = await supabase.from("activities").delete().eq("id", activityId);
      if (error) throw error;
      toast({ title: "Atividade excluída!" });
      fetchProjectData();
    } catch (error) {
      toast({ title: "Erro ao excluir atividade", variant: "destructive" });
    }
  };

  const handleActivityDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const parentActs = activities.filter((a) => !a.parent_id);
    const oldIndex = parentActs.findIndex((a) => a.id === active.id);
    const newIndex = parentActs.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(parentActs, oldIndex, newIndex);
    // Optimistic update
    const otherActivities = activities.filter((a) => a.parent_id);
    setActivities([
      ...reordered.map((a, i) => ({ ...a, display_order: i })),
      ...otherActivities,
    ]);
    try {
      for (let i = 0; i < reordered.length; i++) {
        await supabase.from("activities").update({ display_order: i }).eq("id", reordered[i].id);
      }
    } catch {
      toast({ title: "Erro ao reordenar atividades", variant: "destructive" });
      fetchProjectData();
    }
  };

  if (isLoading) {
    return (<div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Carregando projeto...</p></div>);
  }

  if (!project) {
    return (<div className="min-h-screen bg-background flex items-center justify-center"><div className="text-center"><p className="text-muted-foreground mb-4">Projeto não encontrado</p><Button onClick={() => navigate("/projects")}>Voltar</Button></div></div>);
  }

  const completedActivities = activities.filter((a) => a.status === "completed").length;
  const activityProgress = activities.length > 0 ? (completedActivities / activities.length) * 100 : 0;

  // Group activities: parent tasks and their sub-tasks
  const parentActivities = activities.filter((a) => !a.parent_id);
  const getSubTasks = (parentId: string) => activities.filter((a) => a.parent_id === parentId);

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case "high": return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-xs"><Flag className="w-3 h-3 mr-1" />Alta</Badge>;
      case "medium": return <Badge className="bg-warning/20 text-warning border-warning/30 text-xs"><Flag className="w-3 h-3 mr-1" />Média</Badge>;
      case "low": return <Badge className="bg-muted text-muted-foreground text-xs"><Flag className="w-3 h-3 mr-1" />Baixa</Badge>;
      default: return null;
    }
  };

  const renderActivityCard = (activity: Activity, isSubTask = false) => {
    const subTasks = getSubTasks(activity.id);
    return (
      <div key={activity.id} className={`border border-border rounded-lg p-4 space-y-3 bg-card hover:shadow-md transition-shadow ${isSubTask ? "ml-8 border-l-2 border-l-primary/30" : ""}`}>
        <div className="flex items-start gap-4">
          <Checkbox
            checked={activity.status === "completed"}
            onCheckedChange={() => handleToggleActivity(activity.id, activity.status)}
            className="mt-1 h-5 w-5"
          />
          <div className="flex-1">
            <p className={`text-base font-semibold ${activity.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {activity.title}
            </p>
            {activity.description && <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>}

            <div className="flex flex-wrap gap-2 mt-2">
              {getPriorityBadge(activity.priority)}
              {activity.phase_id && (
                <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                  📁 {phases.find(p => p.id === activity.phase_id)?.title || "Fase"}
                </Badge>
              )}
              {activity.assigned_to && <Badge variant="outline" className="text-xs">👤 {activity.assigned_to}</Badge>}
              {activity.hours > 0 && <Badge variant="secondary" className="text-xs">⏱️ {activity.hours}h</Badge>}
              {activity.cost > 0 && <Badge className="bg-success/20 text-success border-success/30 text-xs">💰 R$ {activity.cost.toFixed(2)}</Badge>}
            </div>

            {(activity.start_date || activity.end_date) && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                📅 {activity.start_date && new Date(activity.start_date).toLocaleDateString("pt-BR")}
                {activity.start_date && activity.end_date && " → "}
                {activity.end_date && new Date(activity.end_date).toLocaleDateString("pt-BR")}
              </p>
            )}
            {activity.completed_at && (
              <p className="text-xs text-success mt-1">✓ Concluída em {new Date(activity.completed_at).toLocaleDateString("pt-BR")}</p>
            )}

            {/* Sub-tasks indicator */}
            {subTasks.length > 0 && !isSubTask && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                {subTasks.filter(s => s.status === "completed").length}/{subTasks.length} sub-tarefas concluídas
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="icon" variant="outline" onClick={() => { setEditingActivity(activity); setEditActivityDialogOpen(true); }}>
              <Pencil className="w-4 h-4" />
            </Button>
            {isAdmin && (
              <Button size="icon" variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteActivity(activity.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            {activity.status === "completed" ? <CheckCircle2 className="w-5 h-5 text-success" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <ActivityComments activityId={activity.id} />
        </div>

        {/* Render sub-tasks */}
        {subTasks.length > 0 && !isSubTask && (
          <div className="space-y-2 mt-2">
            {subTasks.map((sub) => renderActivityCard(sub, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout title={project.title}>
      <main className="px-4 py-4">
        <div className="space-y-6">
            {/* Project Info Card */}
            <Card className="px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6 text-sm">
                  <h2 className="text-sm font-semibold text-foreground">Informações do Projeto</h2>
                  {project.owner && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Responsável:</span>
                      <span className="font-medium text-foreground">{project.owner}</span>
                    </div>
                  )}
                  {project.due_date && (() => {
                    const dueDateStr = project.due_date.includes('T') ? project.due_date : project.due_date + 'T00:00:00';
                    const dueDate = new Date(dueDateStr);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    dueDate.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const isOverdue = diffDays < 0;
                    const isUrgent = diffDays >= 0 && diffDays <= 30;
                    return (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-foreground">Entrega em:</span>
                        <span className="font-semibold text-foreground">{dueDate.toLocaleDateString("pt-BR")}</span>
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

            {/* Sprint Goal Card */}
            {sprintGoal && (
              <Card className="px-5 py-3 border-primary/20 bg-primary/5">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-primary shrink-0">🎯 Sprint Goal:</span>
                  <span className="text-sm text-foreground flex-1">{sprintGoal}</span>
                  {(() => {
                    const totalSP = activities.reduce((sum, a) => sum + ((a as any).story_points || 0), 0);
                    const completedSP = activities.filter(a => a.status === "completed").reduce((sum, a) => sum + ((a as any).story_points || 0), 0);
                    const pct = totalSP > 0 ? Math.round((completedSP / totalSP) * 100) : 0;
                    return (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground font-medium">{completedSP}/{totalSP} SP ({pct}%)</span>
                        <div className="w-20 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </Card>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <DraggableTabBar
                storageKey={`project-tabs-order-${id}`}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                tabs={[
                  { value: "phases", label: "Fases", icon: <Layers className="w-4 h-4" /> },
                  { value: "kanban", label: "Kanban", icon: <Kanban className="w-4 h-4" /> },
                  { value: "timeline", label: "Cronograma", icon: <GanttChart className="w-4 h-4" /> },
                  { value: "documents", label: "Documentos", icon: <FileText className="w-4 h-4" /> },
                  { value: "meetings", label: "Reuniões", icon: <Users className="w-4 h-4" /> },
                  { value: "deliveries", label: "Entregas", icon: <Package className="w-4 h-4" /> },
                  { value: "assumptions", label: "Premissas", icon: <ShieldCheck className="w-4 h-4" /> },
                  { value: "risks", label: "Riscos", icon: <AlertTriangle className="w-4 h-4" /> },
                  { value: "lessons", label: "Lições", icon: <BookOpen className="w-4 h-4" /> },
                  { value: "backlog", label: "Backlog", icon: <Inbox className="w-4 h-4" /> },
                  { value: "workflow", label: "Workflow", icon: <Settings2 className="w-4 h-4" /> },
                ]}
              />

              <TabsContent value="phases" className="mt-3 space-y-4">
                {/* Action Buttons - Admin only, inside Phases tab */}
                {isAdmin && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={showAddPhase ? "secondary" : "default"} onClick={() => { setShowAddPhase(!showAddPhase); setShowAddActivity(false); }} className="gap-2">
                      <Layers className="w-4 h-4" /> Nova Fase
                    </Button>
                    <Button size="sm" variant={showAddActivity ? "secondary" : "outline"} onClick={() => { setShowAddActivity(!showAddActivity); setShowAddPhase(false); }} className="gap-2">
                      <Plus className="w-4 h-4" /> Nova Atividade
                    </Button>
                    <ImportWBSDialog projectId={id!} onDataChanged={fetchProjectData} />
                    {phases.length > 0 && (
                      <Button size="sm" variant="outline" className="gap-2 text-destructive hover:bg-destructive/10" onClick={async () => {
                        if (!confirm(`Excluir TODAS as ${phases.length} fases?`)) return;
                        await supabase.from("phases").delete().eq("project_id", id);
                        toast({ title: `${phases.length} fases excluídas!` }); fetchProjectData();
                      }}>
                        <Trash2 className="w-4 h-4" /> Excluir Fases
                      </Button>
                    )}
                    {activities.length > 0 && (
                      <Button size="sm" variant="outline" className="gap-2 text-destructive hover:bg-destructive/10" onClick={async () => {
                        if (!confirm(`Excluir TODAS as ${activities.length} atividades?`)) return;
                        await supabase.from("activities").delete().eq("project_id", id);
                        toast({ title: `${activities.length} atividades excluídas!` }); fetchProjectData();
                      }}>
                        <Trash2 className="w-4 h-4" /> Excluir Atividades
                      </Button>
                    )}
                  </div>
                )}

                {/* Add Phase Form */}
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

                {/* Add Activity Form */}
                {showAddActivity && (
                  <Card className="p-4 border-primary/20 bg-primary/5 space-y-3">
                    <Input placeholder="Nome da atividade *" value={newActivity} onChange={(e) => setNewActivity(e.target.value)} />
                    <div className="grid grid-cols-3 gap-3">
                      <Input placeholder="Responsável" value={newActivityAssigned} onChange={(e) => setNewActivityAssigned(e.target.value)} />
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
                      <Input type="number" placeholder="Custo (R$)" value={newActivityCost} onChange={(e) => setNewActivityCost(e.target.value)} step="0.01" min="0" />
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

                <PhaseManager
                  projectId={id!} phases={phases} activities={activities}
                  onDataChanged={fetchProjectData}
                  onEditActivity={(activity) => { setEditingActivity(activity); setEditActivityDialogOpen(true); }}
                  onDeleteActivity={handleDeleteActivity}
                  onToggleActivity={handleToggleActivity}
                  isAdmin={isAdmin}
                />
              </TabsContent>

              <TabsContent value="kanban" className="mt-0">
                <ActivityKanban
                  projectId={id!}
                  activities={activities}
                  phases={phases}
                  onDataChanged={fetchProjectData}
                  onEditActivity={(activity) => { setEditingActivity(activity); setEditActivityDialogOpen(true); }}
                  onDeleteActivity={handleDeleteActivity}
                  onToggleActivity={handleToggleActivity}
                  isAdmin={isAdmin}
                  sprintGoal={sprintGoal}
                  onSprintGoalChange={handleSprintGoalChange}
                />
              </TabsContent>

              <TabsContent value="timeline" className="mt-0">
                <TimelineView phases={phases} activities={activities} projectDueDate={project.due_date} onActivityClick={(activity) => { setEditingActivity(activity); setEditActivityDialogOpen(true); }} />
              </TabsContent>


              <TabsContent value="documents" className="mt-0">
                <DocumentManager projectId={id!} phases={phases} activities={activities.map(a => ({ id: a.id, title: a.title }))} />
              </TabsContent>

              <TabsContent value="meetings" className="mt-0">
                <MeetingsManager
                  projectId={id!}
                  phases={phases}
                  onCreateActivity={async (title, assignedTo) => {
                    await supabase.from("activities").insert({
                      project_id: id!,
                      title,
                      assigned_to: assignedTo || null,
                      status: "pending",
                      priority: "medium",
                    });
                    fetchProjectData();
                  }}
                  onCreateBlocker={async (description) => {
                    await supabase.from("risks").insert({
                      project_id: id!,
                      description,
                      probability: "high",
                      impact: "high",
                      status: "identified",
                      category: "impediment",
                    });
                  }}
                  onCreateLesson={async (problem, suggestion) => {
                    await supabase.from("lessons_learned").insert({
                      project_id: id!,
                      problem,
                      suggestion: suggestion || null,
                      category: "process",
                    });
                  }}
                />
              </TabsContent>

              <TabsContent value="lessons" className="mt-0">
                <LessonsLearned projectId={id!} phases={phases} />
              </TabsContent>

              <TabsContent value="deliveries" className="mt-0">
                <DeliveryPackagesManager projectId={id!} activities={activities.map(a => ({ id: a.id, title: a.title }))} />
              </TabsContent>

              <TabsContent value="assumptions" className="mt-0">
                <AssumptionsManager projectId={id!} />
              </TabsContent>

              <TabsContent value="risks" className="mt-0">
                <RisksManager projectId={id!} />
              </TabsContent>

              <TabsContent value="backlog" className="mt-0">
                <BacklogSection
                  projectId={id!}
                  activities={activities}
                  phases={phases}
                  onEditActivity={(activity) => { setEditingActivity(activity); setEditActivityDialogOpen(true); }}
                  onDeleteActivity={handleDeleteActivity}
                  onToggleActivity={handleToggleActivity}
                  onDataChanged={fetchProjectData}
                  isAdmin={isAdmin}
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
          projectId={id!}
        />
      </main>
    </AppLayout>
  );
};

export default ProjectDetails;
