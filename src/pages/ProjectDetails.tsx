import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { TimelineView } from "@/components/TimelineView";
import { TimeTracker } from "@/components/TimeTracker";
import { LessonsLearned } from "@/components/LessonsLearned";
import { DocumentManager } from "@/components/DocumentManager";
import { NotificationBell } from "@/components/NotificationBell";
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
  Clock,
  BookOpen,
  FileText,
  Flag,
  ChevronRight,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { SortableActivityCard } from "@/components/SortableActivityCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  priority?: string;
  tags?: string[];
  parent_id?: string | null;
}

const ProjectDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("phases");
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (id) fetchProjectData();
  }, [id]);

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
        .from("activities").select("*").eq("project_id", id).order("display_order", { ascending: true }).order("created_at", { ascending: false });
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
              {activity.tags?.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs bg-info/20 text-info">{tag}</Badge>
              ))}
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
            <Button size="icon" variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteActivity(activity.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">{project.title}</h1>
              <p className="text-sm text-muted-foreground">{project.description || "Sem descrição"}</p>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <Badge className={project.priority === "high" ? "bg-destructive" : project.priority === "medium" ? "bg-warning" : "bg-muted"}>
                {project.priority === "high" && "Alta"}{project.priority === "medium" && "Média"}{project.priority === "low" && "Baixa"}
              </Badge>
              <Button variant="outline" onClick={() => { setEditingProject(project); setEditDialogOpen(true); }}>
                Editar Projeto
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            {/* Project Info Card */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Informações do Projeto</h2>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Progresso:</span>
                  <span className="font-medium text-foreground">{completedActivities}/{activities.length} tarefas ({activityProgress.toFixed(0)}%)</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {project.owner && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Responsável:</span>
                    <span className="font-medium text-foreground">{project.owner}</span>
                  </div>
                )}
                {project.due_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Prazo:</span>
                    <span className="font-medium text-foreground">{new Date(project.due_date).toLocaleDateString("pt-BR")}</span>
                  </div>
                )}
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success transition-all" style={{ width: `${activityProgress}%` }} />
                </div>
              </div>
              {project.blockers && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-xs font-medium text-destructive mb-1">⚠️ Bloqueios</p>
                  <p className="text-sm text-foreground">{project.blockers}</p>
                </div>
              )}
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={showAddPhase ? "secondary" : "default"} onClick={() => { setShowAddPhase(!showAddPhase); setShowAddActivity(false); }} className="gap-2">
                <Layers className="w-4 h-4" /> Nova Fase
              </Button>
              <Button size="sm" variant={showAddActivity ? "secondary" : "outline"} onClick={() => { setShowAddActivity(!showAddActivity); setShowAddPhase(false); }} className="gap-2">
                <Plus className="w-4 h-4" /> Nova Atividade
              </Button>
            </div>

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

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                <TabsTrigger value="phases" className="gap-2"><Layers className="w-4 h-4" />Fases</TabsTrigger>
                <TabsTrigger value="activities" className="gap-2"><ListTodo className="w-4 h-4" />Atividades</TabsTrigger>
                <TabsTrigger value="timeline" className="gap-2"><GanttChart className="w-4 h-4" />Cronograma</TabsTrigger>
                <TabsTrigger value="timetracking" className="gap-2"><Clock className="w-4 h-4" />Tempo</TabsTrigger>
                <TabsTrigger value="documents" className="gap-2"><FileText className="w-4 h-4" />Documentos</TabsTrigger>
                <TabsTrigger value="lessons" className="gap-2"><BookOpen className="w-4 h-4" />Lições</TabsTrigger>
              </TabsList>

              <TabsContent value="phases" className="mt-0">
                <PhaseManager
                  projectId={id!} phases={phases} activities={activities}
                  onDataChanged={fetchProjectData}
                  onEditActivity={(activity) => { setEditingActivity(activity); setEditActivityDialogOpen(true); }}
                  onDeleteActivity={handleDeleteActivity}
                  onToggleActivity={handleToggleActivity}
                />
              </TabsContent>

              <TabsContent value="activities" className="mt-0">
                <Card className="p-6">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActivityDragEnd}>
                    <SortableContext items={parentActivities.map(a => a.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {activities.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma atividade cadastrada</p>
                        ) : (
                          parentActivities.map((activity) => (
                            <SortableActivityCard key={activity.id} id={activity.id}>
                              {renderActivityCard(activity)}
                            </SortableActivityCard>
                          ))
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                </Card>
              </TabsContent>

              <TabsContent value="timeline" className="mt-0">
                <TimelineView phases={phases} activities={activities} projectDueDate={project.due_date} onActivityClick={(activity) => { setEditingActivity(activity); setEditActivityDialogOpen(true); }} />
              </TabsContent>

              <TabsContent value="timetracking" className="mt-0">
                <TimeTracker projectId={id!} activities={activities.map(a => ({ id: a.id, title: a.title }))} />
              </TabsContent>

              <TabsContent value="documents" className="mt-0">
                <DocumentManager projectId={id!} phases={phases} activities={activities.map(a => ({ id: a.id, title: a.title }))} />
              </TabsContent>

              <TabsContent value="lessons" className="mt-0">
                <LessonsLearned projectId={id!} phases={phases} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-4">Resumo</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Total de Fases</span><Badge variant="outline">{phases.length}</Badge></div>
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Total de Tarefas</span><Badge variant="outline">{activities.length}</Badge></div>
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Concluídas</span><Badge className="bg-success/20 text-success">{completedActivities}</Badge></div>
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Pendentes</span><Badge variant="secondary">{activities.length - completedActivities}</Badge></div>
                {activities.some(a => a.priority === "high" && a.status !== "completed") && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Alta Prioridade</span>
                    <Badge className="bg-destructive/20 text-destructive">{activities.filter(a => a.priority === "high" && a.status !== "completed").length}</Badge>
                  </div>
                )}
              </div>
            </Card>

            {activities.some(a => a.hours > 0) && (
              <Card className="p-6">
                <h3 className="font-semibold text-foreground mb-4">Horas</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Estimadas</span>
                    <span className="font-medium text-foreground">{activities.reduce((sum, a) => sum + (a.hours || 0), 0)}h</span>
                  </div>
                </div>
              </Card>
            )}

            {project.due_date && (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center"><Calendar className="w-5 h-5 text-warning" /></div>
                  <h3 className="font-semibold text-foreground">Prazo</h3>
                </div>
                <p className="text-2xl font-bold text-foreground">{new Date(project.due_date).toLocaleDateString("pt-BR")}</p>
                {new Date(project.due_date) < new Date() && <Badge className="mt-2 bg-destructive">Atrasado</Badge>}
              </Card>
            )}
          </div>
        </div>

        <EditProjectDialog project={editingProject} open={editDialogOpen} onOpenChange={setEditDialogOpen} onProjectUpdated={fetchProjectData} />
        <EditActivityDialog
          activity={editingActivity} open={editActivityDialogOpen} onOpenChange={setEditActivityDialogOpen}
          onActivityUpdated={fetchProjectData} phases={phases} allActivities={activities}
        />
      </main>
    </div>
  );
};

export default ProjectDetails;
