import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Kanban,
  ListTodo,
  GanttChart,
  Calendar as CalendarIcon,
  FileText,
  NotebookPen,
  BookOpen,
  ClipboardList,
  Users,
  ShieldCheck,
  AlertTriangle,
  GitPullRequest,
  Layers,
  DollarSign,
  Flag,
  Plus,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ----- Componentes reais do projeto -----
import { ActivityKanban } from "@/components/ActivityKanban";
import { BacklogSection } from "@/components/BacklogSection";
import { TimelineView } from "@/components/TimelineView";
import { ProjectListView } from "@/components/project-views/ProjectListView";
import { ProjectCalendarView } from "@/components/project-views/ProjectCalendarView";
import { DocumentManager } from "@/components/DocumentManager";
import { ProjectDocuments } from "@/components/documents/ProjectDocuments";
import { UserStoriesBoard } from "@/components/UserStoriesBoard";
import { ProjectCharter } from "@/components/ProjectCharter";
import { MeetingsManager } from "@/components/MeetingsManager";
import { LessonsLearned } from "@/components/LessonsLearned";
import { AssumptionsManager } from "@/components/AssumptionsManager";
import { RisksManager } from "@/components/RisksManager";
import { ChangeRequestsManager } from "@/components/ChangeRequestsManager";
import { ProjectDependenciesView } from "@/components/ProjectDependenciesView";
import { ProjectFinancials } from "@/components/ProjectFinancials";
import { EditActivityDialog } from "@/components/EditActivityDialog";

type ViewId =
  | "kanban"
  | "list"
  | "backlog"
  | "timeline"
  | "calendar"
  | "documents"
  | "docpages"
  | "stories"
  | "tap"
  | "meetings"
  | "assumptions"
  | "risks"
  | "changes"
  | "dependencies"
  | "financials"
  | "lessons";

const VIEWS: { id: ViewId; label: string; icon: any }[] = [
  { id: "kanban", label: "Kanban", icon: Kanban },
  { id: "list", label: "Pendências", icon: ListTodo },
  { id: "backlog", label: "Lista", icon: Inbox },
  { id: "timeline", label: "Cronograma", icon: GanttChart },
  { id: "calendar", label: "Calendário", icon: CalendarIcon },
  { id: "documents", label: "Documentos", icon: FileText },
  { id: "docpages", label: "Páginas", icon: NotebookPen },
  { id: "stories", label: "Histórias", icon: BookOpen },
  { id: "tap", label: "TAP", icon: ClipboardList },
  { id: "meetings", label: "Reuniões", icon: Users },
  { id: "assumptions", label: "Premissas", icon: ShieldCheck },
  { id: "risks", label: "Riscos", icon: AlertTriangle },
  { id: "changes", label: "Mudanças", icon: GitPullRequest },
  { id: "dependencies", label: "Dependências", icon: Layers },
  { id: "financials", label: "Financeiro", icon: DollarSign },
  { id: "lessons", label: "Lições", icon: Flag },
];

export default function TarefasTest() {
  const { toast } = useToast();

  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [project, setProject] = useState<any | null>(null);

  const [activities, setActivities] = useState<any[]>([]);
  const [phases, setPhases] = useState<any[]>([]);
  const [members, setMembers] = useState<{ full_name: string; sector: string | null }[]>([]);

  const [view, setView] = useState<ViewId>("kanban");

  // Edit/Create dialog (mesma mecânica do ProjectDetails)
  const [editingActivity, setEditingActivity] = useState<any | null>(null);
  const [editActivityDialogOpen, setEditActivityDialogOpen] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [createTaskStageId, setCreateTaskStageId] = useState<string | null>(null);
  const [createTaskPhaseId, setCreateTaskPhaseId] = useState<string | null>(null);
  const [createTaskParentId, setCreateTaskParentId] = useState<string | null>(null);

  const isQualityProject = project?.category === "qualidade";

  // ----- Fetchers -----
  const fetchProjectData = useCallback(async () => {
    if (!projectId) return;
    const [{ data: proj }, { data: acts }, { data: phs }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase
        .from("activities")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .order("display_order", { ascending: true }),
      supabase
        .from("phases")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .order("display_order", { ascending: true }),
    ]);
    setProject(proj || null);
    setActivities(acts || []);
    setPhases(phs || []);
  }, [projectId]);

  const fetchMembers = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);
    const ids = (data || []).map((m: any) => m.user_id);
    if (ids.length === 0) {
      setMembers([]);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("full_name, sector")
      .in("id", ids);
    setMembers((profs as any[]) || []);
  }, [projectId]);

  // Lista de projetos (pré-seleciona Onboard)
  useEffect(() => {
    supabase
      .from("projects")
      .select("id, title, category")
      .eq("is_trashed", false)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        const list = data || [];
        setProjects(list);
        if (!projectId && list.length > 0) {
          const onboard = list.find((p: any) =>
            p.title?.toLowerCase().includes("onboard")
          );
          setProjectId(onboard?.id || list[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchProjectData();
    fetchMembers();
  }, [fetchProjectData, fetchMembers]);

  // Realtime: refetch ao mudar atividades/fases
  useEffect(() => {
    if (!projectId) return;
    const ch = supabase
      .channel(`tarefas-test-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities", filter: `project_id=eq.${projectId}` },
        () => fetchProjectData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "phases", filter: `project_id=eq.${projectId}` },
        () => fetchProjectData()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [projectId, fetchProjectData]);

  // ----- Handlers compartilhados (mesma assinatura do ProjectDetails) -----
  const openEditActivity = useCallback((activity: any) => {
    setEditingActivity(activity);
    setEditActivityDialogOpen(true);
  }, []);

  const handleToggleActivity = useCallback(async (activityId: string, currentStatus: string) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    await supabase
      .from("activities")
      .update({
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", activityId);
    fetchProjectData();
  }, [fetchProjectData]);

  const handleDeleteActivity = useCallback(async (activityId: string) => {
    if (!confirm("Mover esta atividade para o arquivo?")) return;
    await supabase
      .from("activities")
      .update({ is_trashed: true, trashed_at: new Date().toISOString() })
      .eq("id", activityId);
    toast({ title: "Atividade arquivada" });
    fetchProjectData();
  }, [fetchProjectData, toast]);

  const openCreateActivity = useCallback(
    (opts?: { stageId?: string | null; phaseId?: string | null; parentId?: string | null }) => {
      setCreateTaskStageId(opts?.stageId ?? null);
      setCreateTaskPhaseId(opts?.phaseId ?? null);
      setCreateTaskParentId(opts?.parentId ?? null);
      setShowAddActivity(true);
    },
    []
  );

  // ----- Renderização condicional por visão -----
  const renderView = () => {
    if (!project || !projectId) {
      return (
        <div className="p-12 text-center text-muted-foreground">
          {projectId ? "Carregando..." : "Selecione um projeto acima."}
        </div>
      );
    }

    switch (view) {
      case "kanban":
        return (
          <ActivityKanban
            projectId={projectId}
            activities={activities}
            phases={phases}
            onDataChanged={fetchProjectData}
            onEditActivity={openEditActivity}
            onDeleteActivity={handleDeleteActivity}
            onToggleActivity={handleToggleActivity}
            isAdmin={true}
            canCreate={true}
            isQualityProject={isQualityProject}
            onOpenCreateTask={(stageId: string) => openCreateActivity({ stageId })}
          />
        );
      case "list":
        return (
          <ProjectListView
            activities={activities as any}
            phases={phases}
            onEditActivity={(a: any) => openEditActivity(a)}
            onToggleActivity={handleToggleActivity}
            canCreate={true}
            onAddActivity={() => openCreateActivity()}
          />
        );
      case "backlog":
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openCreateActivity()} className="gap-2">
                <Plus className="w-4 h-4" /> Nova Atividade
              </Button>
            </div>
            <BacklogSection
              projectId={projectId}
              activities={activities}
              phases={phases}
              onEditActivity={openEditActivity}
              onDeleteActivity={handleDeleteActivity}
              onToggleActivity={handleToggleActivity}
              onDataChanged={fetchProjectData}
              isAdmin={true}
              onCreateActivityInPhase={(phaseId: string | null, parentId?: string | null) =>
                openCreateActivity({ phaseId, parentId: parentId ?? null })
              }
            />
          </div>
        );
      case "timeline":
        return (
          <TimelineView
            phases={phases}
            activities={activities}
            projectDueDate={project.due_date}
            onActivityClick={openEditActivity}
          />
        );
      case "calendar":
        return (
          <ProjectCalendarView
            projectId={projectId}
            activities={activities as any}
            onEditActivity={(actId: string) => {
              const act = activities.find((a) => a.id === actId);
              if (act) openEditActivity(act);
            }}
            onDataChanged={fetchProjectData}
          />
        );
      case "documents":
        return (
          <DocumentManager
            projectId={projectId}
            phases={phases}
            activities={activities.map((a) => ({ id: a.id, title: a.title }))}
          />
        );
      case "docpages":
        return <ProjectDocuments projectId={projectId} onActivityCreated={fetchProjectData} />;
      case "stories":
        return <UserStoriesBoard projectId={projectId} />;
      case "tap":
        return (
          <ProjectCharter
            projectId={projectId}
            project={project}
            phases={phases}
            members={members}
            onMembersChanged={fetchMembers}
          />
        );
      case "meetings":
        return (
          <MeetingsManager
            projectId={projectId}
            phases={phases}
            onCreateActivity={async (title: string, assignedTo?: string) => {
              await supabase.from("activities").insert({
                project_id: projectId,
                title,
                assigned_to: assignedTo || null,
                status: "pending",
                priority: "medium",
              });
              fetchProjectData();
            }}
            onCreateBlocker={async (description: string) => {
              await supabase.from("risks").insert({
                project_id: projectId,
                description,
                probability: "high",
                impact: "high",
                status: "identified",
                category: "impediment",
              });
            }}
            onCreateLesson={async (problem: string, suggestion?: string) => {
              await supabase.from("lessons_learned").insert({
                project_id: projectId,
                problem,
                suggestion: suggestion || null,
                category: "process",
              });
            }}
          />
        );
      case "assumptions":
        return <AssumptionsManager projectId={projectId} />;
      case "risks":
        return <RisksManager projectId={projectId} />;
      case "changes":
        return (
          <ChangeRequestsManager
            projectId={projectId}
            projectOwner={project.owner}
            onChanged={fetchProjectData}
          />
        );
      case "dependencies":
        return (
          <ProjectDependenciesView
            projectId={projectId}
            onEditActivity={(actId: string) => {
              const act = activities.find((a) => a.id === actId);
              if (act) openEditActivity(act);
            }}
          />
        );
      case "financials":
        return (
          <ProjectFinancials
            projectId={projectId}
            budgetPlanned={project.budget_planned}
            budgetUsed={project.budget_used}
            onProjectUpdated={fetchProjectData}
          />
        );
      case "lessons":
        return <LessonsLearned projectId={projectId} phases={phases} />;
      default:
        return null;
    }
  };

  return (
    <AppLayout>
      <main className="p-4 md:p-6 space-y-4">
        {/* Cabeçalho de teste */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-amber-500/60 text-amber-600">
                Página de teste
              </Badge>
              <h1 className="text-2xl font-semibold">Tarefas — Tudo em um só lugar</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Modelo "uma coleção, várias visões". Todas as abas e configurações do projeto reunidas
              com o seletor <span className="font-medium">+Visualização</span> abaixo.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Projeto:</span>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => openCreateActivity()}
              disabled={!projectId}
              className="gap-2"
            >
              <Plus className="w-4 h-4" /> Nova Atividade
            </Button>
          </div>
        </div>

        {/* Barra de chips horizontais (estilo ClickUp) */}
        <div className="border-b border-border">
          <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors border",
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {v.label}
                </button>
              );
            })}
            <div className="ml-2 pl-2 border-l border-border">
              <button
                disabled
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground/60 border border-dashed border-border cursor-not-allowed"
                title="Em breve"
              >
                <Plus className="w-3.5 h-3.5" /> Visualização
              </button>
            </div>
          </div>
        </div>

        {/* Conteúdo da visão atual */}
        <div className="min-h-[400px]">{renderView()}</div>

        {/* Diálogos reais do projeto (mesma paridade do ProjectDetails) */}
        {project && (
          <>
            <EditActivityDialog
              activity={editingActivity}
              open={editActivityDialogOpen}
              onOpenChange={setEditActivityDialogOpen}
              onActivityUpdated={fetchProjectData}
              phases={phases}
              allActivities={activities}
              projectId={projectId}
              isQualityProject={isQualityProject}
            />
            <EditActivityDialog
              activity={null}
              open={showAddActivity}
              onOpenChange={(o: boolean) => {
                setShowAddActivity(o);
                if (!o) {
                  setCreateTaskStageId(null);
                  setCreateTaskPhaseId(null);
                  setCreateTaskParentId(null);
                }
              }}
              onActivityUpdated={fetchProjectData}
              phases={phases}
              allActivities={activities}
              projectId={projectId}
              isQualityProject={isQualityProject}
              createMode
              defaultStageId={createTaskStageId}
              defaultPhaseId={createTaskPhaseId}
              defaultParentId={createTaskParentId}
            />
          </>
        )}
      </main>
    </AppLayout>
  );
}
