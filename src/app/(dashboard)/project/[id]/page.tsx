'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { EditActivityDialog } from "@/components/EditActivityDialog";
import { ImportWBSDialog } from "@/components/ImportWBSDialog";
import { ProjectCronogramaPanel } from "@/components/cronograma/ProjectCronogramaPanel";
import { LessonsLearned } from "@/components/LessonsLearned";
import { DocumentCenter } from "@/components/documentos/DocumentCenter";
import { ProjectCharter } from "@/components/ProjectCharter";
import { NotificationBell } from "@/components/NotificationBell";
import { ActivityKanban } from "@/components/ActivityKanban";
import { BacklogSection } from "@/components/BacklogSection";
import { QuickCreateActivity } from "@/components/QuickCreateActivity";
import { ProjectCalendarView } from "@/components/project-views/ProjectCalendarView";
import { MeetingsManager } from "@/components/MeetingsManager";
import { ProjectRegistrosTimeline } from "@/components/ProjectRegistrosTimeline";

import { RisksManager } from "@/components/RisksManager";
import { ChangeRequestsManager } from "@/components/ChangeRequestsManager";
import { ProjectDependenciesView } from "@/components/ProjectDependenciesView";
import { ProjectFinancials } from "@/components/ProjectFinancials";
import { UserStoriesBoard } from "@/components/UserStoriesBoard";
import { SHOW_USER_STORIES, SHOW_CALENDAR } from "@/lib/featureFlags";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { DraggableTabBar } from "@/components/DraggableTabBar";
import {
  ArrowLeft, Plus, Calendar, CheckCircle2, Circle, Pencil, Trash2,
  Layers, GanttChart, BookOpen, FileText, Flag, History,
  ChevronRight, MoreHorizontal, Kanban, Users, AlertTriangle,
  Package, Inbox, DollarSign, ClipboardList, LayoutDashboard, GitPullRequest, Lock,
  NotebookPen, Search, X,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { SortableActivityCard } from "@/components/SortableActivityCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getProjectDeadlineInfo, formatProjectDueDate } from "@/lib/projectDeadline";
import { normalizeProjectTabs } from "@/lib/projectTabs";
import { selectInChunks, mutateInChunks } from "@/lib/chunkedIn";
import { useChangeRequestBlocks } from "@/hooks/useChangeRequestBlocks";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { anyMatchesIdentity, buildUserCandidates, matchesIdentity } from "@/lib/identityMatch";
import { buildAvatarLookupMap } from "@/lib/avatarLookup";
import { eapShouldDemote } from "@/lib/eapModel";

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  actual_start_date?: string | null;
  due_date: string | null;
  assignees: string[];
  budget_planned: number;
  budget_used: number;
  owner: string | null;
  manager?: string | null;
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
  actual_start_date?: string | null;
  actual_end_date?: string | null;
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
  participants?: string[] | null;
  item_type?: string | null;
  is_milestone?: boolean | null;
  created_by?: string | null;
  /** Código da EAP — decide se um agrupador vazio é Fase declarada. */
  wbs_code?: string | null;
  /** Arquivada (soft-delete). */
  is_trashed?: boolean | null;
}

const SUPPORTED_PROJECT_TABS = [
  "kanban",
  "backlog",
  "timeline",
  "calendar",
  "documents",
  "registros",
  "stories",
  "tap",
  "meetings",
  "assumptions",
  "risks",
  "changes",
  "dependencies",
  "financials",
  "lessons",
] as const;

const LEGACY_PROJECT_TAB_ALIASES: Record<string, typeof SUPPORTED_PROJECT_TABS[number]> = {
  list: "backlog",
  // "Páginas" virou uma visão dentro de Documentos (Central de Documentos).
  // Links salvos, preferências gravadas por usuário e permissões de aba já
  // existentes continuam válidos — passam a apontar para a aba única.
  docpages: "documents",
};

const sanitizeVisibleProjectTabs = (tabs: string[] | null | undefined) => {
  const normalized = (tabs || [])
    .map((tab) => LEGACY_PROJECT_TAB_ALIASES[tab] || tab)
    .filter((tab): tab is typeof SUPPORTED_PROJECT_TABS[number] =>
      (SUPPORTED_PROJECT_TABS as readonly string[]).includes(tab),
    );

  return Array.from(new Set(normalized.length > 0 ? normalized : ["kanban"]));
};

const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const looksLikeUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

export default function ProjectDetailsPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const router = useRouter();
  const searchParams = useSearchParams();
  const appConfirm = useAppConfirm();
  const { isAdmin: isRealAdmin, canManage: isAdmin, canWrite, user: currentUser, profile, loading: authLoading } = useAuth();
  const [accessDenied, setAccessDenied] = useState(false);
  const [activityScopedAccess, setActivityScopedAccess] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [consumedMinutesByActivity, setConsumedMinutesByActivity] = useState<Record<string, number>>({});
  const [phases, setPhases] = useState<Phase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("kanban");
  const [showDashboard, setShowDashboard] = useState(false);
  const [allowedTabs, setAllowedTabs] = useState<string[] | null>(null);
  const [visibleTabs, setVisibleTabs] = useState<string[]>(["kanban"]);
  const [tabPickerOpen, setTabPickerOpen] = useState(false);
  const [newActivity, setNewActivity] = useState("");
  const [newActivityAssigned, setNewActivityAssigned] = useState("");
  const [newActivityStartDate, setNewActivityStartDate] = useState("");
  const [newActivityEndDate, setNewActivityEndDate] = useState("");
  const [newActivityCost, setNewActivityCost] = useState("");
  const [newActivityHours, setNewActivityHours] = useState("");
  const [newActivityPhaseId, setNewActivityPhaseId] = useState("");
  const [newActivityPriority, setNewActivityPriority] = useState("medium");
  const [listSearch, setListSearch] = useState("");
  const [listStatusFilter, setListStatusFilter] = useState("all");
  const [listPriorityFilter, setListPriorityFilter] = useState("all");
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [createTaskStageId, setCreateTaskStageId] = useState<string | null>(null);
  const [createTaskPhaseId, setCreateTaskPhaseId] = useState<string | null>(null);
  const [createTaskParentId, setCreateTaskParentId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editActivityDialogOpen, setEditActivityDialogOpen] = useState(false);
  const [editActivityInitialTab, setEditActivityInitialTab] = useState<"details" | "subtasks" | "attachments" | "comments" | "stories" | "history">("details");
  const [sprintGoal, setSprintGoal] = useState("");
  const [activeSprintId, setActiveSprintId] = useState<string | null>(null);
  const [members, setMembers] = useState<{ full_name: string; sector: string | null }[]>([]);
  const [risks, setRisks] = useState<{ id: string; probability: string; impact: string; status: string }[]>([]);

  /** Resumo dos riscos para o cabeçalho. "Crítico" segue a mesma regra da
   *  matriz do RisksManager: alto impacto com alta probabilidade, ou já
   *  ocorrido. Risco eliminado/aceito sai da conta — não exige ação. */
  const riscosResumo = useMemo(() => {
    const abertos = risks.filter((r) => !["eliminar", "aceitar"].includes((r.status || "").toLowerCase()));
    const criticos = abertos.filter((r) => {
      if ((r.status || "").toLowerCase() === "ocorreu") return true;
      return r.impact === "high" && r.probability === "high";
    });
    return { abertos: abertos.length, criticos: criticos.length };
  }, [risks]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [profileAvatarMap, setProfileAvatarMap] = useState<Record<string, string>>({});
  // Mapa nome/id da pessoa -> setor, para a raia "por setor" do Kanban.
  const [profileSectorMap, setProfileSectorMap] = useState<Record<string, string>>({});
  const [userPerms, setUserPerms] = useState<{ can_create: boolean; can_edit: boolean; can_delete: boolean; can_move: boolean } | null>(null);
  const [pendingChangeRequests, setPendingChangeRequests] = useState(0);

  // Bloqueio escopado: o hook lê RFCs pendentes E suas RFCs rejeitadas (não arquivadas)
  // que tenham itens de escopo cadastrados.
  const {
    hasGlobalBlock,
    blockedActivityIds,
    blockedPhaseIds,
    isActivityBlocked,
    isPhaseBlocked,
    refresh: refreshBlocks,
  } = useChangeRequestBlocks(id);

  const hasScopedBlocks = blockedActivityIds.size > 0 || blockedPhaseIds.size > 0;
  const isChangeBlocked = hasGlobalBlock; // bloqueio amplo = sem escopo selecionado
  const baseCanCreate = !permissionsLoading && (isAdmin || (userPerms?.can_create ?? false));
  const baseCanEdit = !permissionsLoading && (isAdmin || (userPerms?.can_edit ?? false));
  const baseCanDelete = !permissionsLoading && (isAdmin || (userPerms?.can_delete ?? false));
  const baseCanMove = !permissionsLoading && (isAdmin || (userPerms?.can_move ?? false));
  const isProjectConcluded = project?.status === "concluido";
  // Visualizador (canWrite=false) é só leitura: bloqueia toda escrita no projeto.
  const canCreate = canWrite && baseCanCreate && !isChangeBlocked && !isProjectConcluded;
  const canEdit = canWrite && baseCanEdit && !isChangeBlocked && !isProjectConcluded;
  const canDelete = canWrite && baseCanDelete && !isChangeBlocked && !isProjectConcluded;
  const canMove = canWrite && baseCanMove && !isChangeBlocked && !isProjectConcluded;
  const isQualityProject = project?.category === "qualidade";
  const showProjectLockedToast = useCallback((action: string) => {
    toast.error("Projeto concluído", { description: `Reabra o projeto para ${action}.` });
  }, [toast]);
  const canMutateActivity = useCallback((activity?: Activity | null) => {
    if (!activity) return false;
    if (isRealAdmin) return true;
    if (!currentUser?.id) return false;
    if (!!activity.created_by && activity.created_by === currentUser.id) return true;

    const identityCandidates = buildUserCandidates([
      profile?.full_name,
      profile?.email,
      currentUser.email,
      profile?.id,
      currentUser.id,
    ]);

    // Líder/Gestor DESTE projeto específico tem o mesmo acesso que o RLS já
    // concede (is_project_leader_v2) — nível de acesso GLOBAL (Gestor/
    // Coordenador) sozinho não basta mais: o banco nunca reconheceu isso para
    // mutar atividade de outra pessoa, e a tela não deve prometer o que o
    // banco recusa.
    if (matchesIdentity(project?.owner, identityCandidates) || matchesIdentity(project?.manager, identityCandidates)) {
      return true;
    }

    return matchesIdentity(activity.assigned_to, identityCandidates);
  }, [currentUser?.email, currentUser?.id, isRealAdmin, profile?.email, profile?.full_name, project?.owner, project?.manager]);

  // Helper que abre o EditActivityDialog respeitando bloqueios escopados
  const openEditActivity = useCallback((
    activity: any,
    initialTab: "details" | "subtasks" | "attachments" | "comments" | "stories" | "history" = "details",
  ) => {
    if (isProjectConcluded) {
      showProjectLockedToast("editar atividades");
      return;
    }
    if (activity && isActivityBlocked(activity.id, activity.phase_id)) {
      toast.error("Atividade bloqueada: só pode ser editada após aprovação da solicitação de mudança.");
      return;
    }
    if (activity && !canMutateActivity(activity as Activity)) {
      toast.error("Somente o criador ou responsável da atividade pode editar.");
      return;
    }
    setEditActivityInitialTab(initialTab);
    setEditingActivity(activity);
    setEditActivityDialogOpen(true);
  }, [canMutateActivity, isActivityBlocked, isProjectConcluded, showProjectLockedToast, toast]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Deep-link vindo de uma notificação: /project/{id}?activity={activityId}
  // abre o EditActivityDialog da atividade assim que ela estiver carregada.
  // Abre direto (sem passar por openEditActivity) para não esbarrar na guarda
  // de permissão de edição — a notificação pode ser de uma atividade de outra
  // pessoa, e o usuário precisa ao menos visualizá-la. O próprio dialog cuida
  // Deep-link de ABA (?tab=tap, ?tab=documents…). Sem isto, um aviso de "assine
  // este TAP" levava só à visão geral do projeto e a pessoa ainda precisava
  // caçar onde estava o pedido.
  const openedTabRef = useRef<string | null>(null);
  useEffect(() => {
    const tabParam = searchParams?.get("tab");
    if (!tabParam || openedTabRef.current === tabParam) return;
    // Respeita alias legado (docpages → documents) e o que o usuário pode ver.
    const alvo = normalizeProjectTabs([tabParam])[0];
    if (alvo && visibleTabs.includes(alvo)) {
      openedTabRef.current = tabParam;
      setActiveTab(alvo);
    }
  }, [searchParams, visibleTabs]);

  // do que é editável.
  const openedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const activityParam = searchParams?.get("activity");
    if (!activityParam || activities.length === 0) return;
    if (openedDeepLinkRef.current === activityParam) return;

    const target = activities.find((a) => a.id === activityParam);
    if (!target) {
      openedDeepLinkRef.current = activityParam;
      toast.error("Atividade da notificação não encontrada (pode ter sido arquivada ou você não tem acesso).");
      return;
    }

    openedDeepLinkRef.current = activityParam;
    setEditActivityInitialTab("details");
    setEditingActivity(target);
    setEditActivityDialogOpen(true);
  }, [activities, searchParams]);

  // O cartão de tarefa dentro de um documento escrito ("/tarefa") dispara
  // `open-activity` ao clicar em Abrir. Até agora ninguém escutava esse evento
  // e o botão não fazia nada. Abre igual ao deep-link de notificação: sem
  // passar pela guarda de edição, porque abrir para VER não é editar — o
  // próprio dialog decide o que fica editável.
  useEffect(() => {
    const onOpenActivity = (e: Event) => {
      const detail = (e as CustomEvent<{ activityId?: string }>).detail;
      if (!detail?.activityId) return;
      const target = activities.find((a) => a.id === detail.activityId);
      if (!target) {
        toast.error("Atividade não encontrada — pode ter sido excluída ou arquivada.");
        return;
      }
      setEditActivityInitialTab("details");
      setEditingActivity(target);
      setEditActivityDialogOpen(true);
    };
    window.addEventListener("open-activity", onOpenActivity);
    return () => window.removeEventListener("open-activity", onOpenActivity);
  }, [activities, toast]);

  const fetchPendingChangeRequests = useCallback(async () => {
    if (!id) return;
    const { count } = await supabase
      .from("change_requests" as any)
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .eq("is_trashed", false)
      .eq("status", "pending");
    setPendingChangeRequests(count ?? 0);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchPendingChangeRequests();
    const channel = supabase
      .channel(`pending-changes-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "change_requests", filter: `project_id=eq.${id}` }, () => fetchPendingChangeRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchPendingChangeRequests]);

  useEffect(() => {
    if (authLoading) return;
    if (id) {
      fetchActiveSprint();
      fetchMembers();
      fetchRisks();
      void supabase
        .rpc("generate_overdue_notifications", { p_project_id: id })
        .then(({ error }) => {
          if (!error) return;
          // 42883 = a função existe mas depende de outra que não existe
          // (notification_recipient_user_ids). É migration faltando na VM, não
          // defeito de código: as notificações de atraso simplesmente não são
          // geradas. Rebaixado a warn e silencioso em produção — o usuário não
          // pode agir sobre isso, e um erro vermelho a cada abertura de projeto
          // vira ruído que esconde falha de verdade.
          const migrationFaltando = error.code === "42883" || error.code === "PGRST202";
          if (migrationFaltando && process.env.NODE_ENV === "production") return;
          // O objeto de erro do Supabase não serializa em console.error — sem
          // extrair os campos, o log saía como "{}" e não dizia nada.
          const log = migrationFaltando ? console.warn : console.error;
          log(
            `[project-page] generate_overdue_notifications: ${error.message}`,
            {
              projectId: id,
              code: error.code,
              details: error.details,
              hint: migrationFaltando
                ? "Aplique 20260528193000_targeted_activity_notifications.sql na VM."
                : error.hint,
            },
          );
        });
    }

    if (!id) return;

    const activitiesChannel = supabase
      .channel(`realtime-activities-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities", filter: `project_id=eq.${id}` },
        () => {
          fetchProjectData();
        }
      )
      .subscribe();

    const timeEntriesChannel = supabase
      .channel(`realtime-time-entries-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries", filter: `project_id=eq.${id}` },
        () => {
          fetchProjectData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(activitiesChannel);
      supabase.removeChannel(timeEntriesChannel);
    };
  }, [id, authLoading]);

  useEffect(() => {
    if (authLoading || permissionsLoading || !id) return;
    fetchProjectData();
  }, [activityScopedAccess, authLoading, permissionsLoading, id]);

  const loadAccess = useCallback(async (silent = false) => {
    if (!id) return;

    if (isRealAdmin) {
      setUserPerms({ can_create: true, can_edit: true, can_delete: true, can_move: true });
      setAllowedTabs(null);
      setPermissionsLoading(false);
      setAccessDenied(false);
      return;
    }

    if (!currentUser?.id) {
      setUserPerms(null);
      setAccessDenied(false);
      setAllowedTabs(normalizeProjectTabs());
      setPermissionsLoading(false);
      return;
    }

    if (!silent) {
      setPermissionsLoading(true);
    }

    try {
      const projectPromise = (async () => {
        const primary = await supabase
          .from("projects")
          .select("created_by, owner, assignees, manager, is_trashed")
          .eq("id", id)
          .maybeSingle();

        if (!primary.error) {
          return primary as { data: any; error: any };
        }

        const fallback = await supabase
          .from("projects")
          .select("owner, assignees, is_trashed")
          .eq("id", id)
          .maybeSingle();

        return fallback as { data: any; error: any };
      })();

      const [{ data: perms }, { data: tabPerms, error: tabError }, { data: projectRow }] = await Promise.all([
        supabase
          .from("project_members")
          .select("id, invitation_status, can_create, can_edit, can_delete, can_move")
          .eq("project_id", id)
          .eq("user_id", currentUser.id)
          .maybeSingle(),
        supabase
          .from("user_tab_permissions")
          .select("allowed_tabs")
          .eq("user_id", currentUser.id)
          .maybeSingle(),
        projectPromise,
      ]);

      // Compute access from four sources: explicit member, project creator,
      // project Líder (owner)/Gerente (manager), or listed Participante
      // (assignees). Uses tolerant identity matching so short and long forms
      // of the same name still resolve to the right user.
      const candidates = buildUserCandidates([
        profile?.full_name,
        profile?.email,
        currentUser.email,
        profile?.id,
        currentUser.id,
      ]);

      const ownerMatch = matchesIdentity(projectRow?.owner, candidates);

      const creatorMatch =
        typeof projectRow?.created_by === "string" &&
        projectRow.created_by === currentUser.id;

      const managerMatch = matchesIdentity(projectRow?.manager, candidates);

      const assigneeMatch =
        Array.isArray(projectRow?.assignees) &&
        anyMatchesIdentity(projectRow!.assignees!, candidates);

      const normalizedInvitationStatus = (perms?.invitation_status || "accepted").toLowerCase();
      const hasValidMembership = !!perms?.id && normalizedInvitationStatus !== "declined";
      const hasProjectWideAccess = creatorMatch || ownerMatch || managerMatch;

      // Ter uma atividade dentro de um projeto ARQUIVADO não abre a porta:
      // quem tem vínculo formal (membro, criador, líder, participante) segue
      // entrando para consultar o histórico, mas o acesso por tarefa solta
      // acompanha o arquivamento do projeto.
      const projectTrashed = projectRow?.is_trashed === true;

      let activityAssignmentMatch = false;
      if (!projectTrashed && !hasValidMembership && !hasProjectWideAccess && !assigneeMatch) {
        const { data: projectActivities } = await supabase
          .from("activities")
          .select("assigned_to, participants")
          .eq("project_id", id)
          .eq("is_trashed", false);

        activityAssignmentMatch =
          Array.isArray(projectActivities) &&
          projectActivities.some((activity: any) => (
            matchesIdentity(activity.assigned_to, candidates) ||
            (Array.isArray(activity.participants) && anyMatchesIdentity(activity.participants, candidates))
          ));
      }

      const hasImplicitAccess = hasProjectWideAccess || assigneeMatch || activityAssignmentMatch;
      const hasNonMemberImplicitAccess = assigneeMatch || activityAssignmentMatch;
      const isActivityScoped = !hasValidMembership && !hasProjectWideAccess && hasNonMemberImplicitAccess;

      if (!hasValidMembership && !hasImplicitAccess) {
        // Regra estrita: somente criador, membro ou equipe.
        setAccessDenied(true);
        setActivityScopedAccess(false);
        setUserPerms({ can_create: false, can_edit: false, can_delete: false, can_move: false });
        setAllowedTabs(normalizeProjectTabs());
        return;
      }
      setAccessDenied(false);
      setActivityScopedAccess(isActivityScoped);
      // If member exists, use those granular permissions. Otherwise (Líder/Participante),
      // grant full operational permissions by default.
      setUserPerms(
        hasValidMembership
          ? {
              can_create: true,
              can_edit: !!perms.can_edit,
              can_delete: !!perms.can_delete,
              can_move: !!perms.can_move,
            }
          : isActivityScoped
            ? { can_create: false, can_edit: false, can_delete: false, can_move: false }
            : { can_create: true, can_edit: true, can_delete: true, can_move: true }
      );

      if (tabError) {
        console.error("Tab permissions fetch error:", tabError);
      }

      const normalizedTabs = normalizeProjectTabs(tabPerms?.allowed_tabs);
      setAllowedTabs(normalizedTabs);
      setActiveTab((currentTab) => (normalizedTabs.includes(currentTab) ? currentTab : normalizedTabs[0]));
    } catch (error) {
      console.error("[project-page] loadAccess failed", error);
      setAccessDenied(true);
      setActivityScopedAccess(false);
      setUserPerms({ can_create: false, can_edit: false, can_delete: false, can_move: false });
      setAllowedTabs(normalizeProjectTabs());
    } finally {
      setPermissionsLoading(false);
    }
  }, [id, currentUser?.email, currentUser?.id, isRealAdmin, profile?.email, profile?.full_name]);

  useEffect(() => {
    if (authLoading || !id) return;
    void loadAccess();
  }, [authLoading, id, loadAccess]);

  // Load visible tabs preference (per user+project) from localStorage
  useEffect(() => {
    if (!id || !currentUser?.id) return;
    const key = `project-visible-tabs-${currentUser.id}-${id}`;
    const saved = localStorage.getItem(key);
    let next: string[] = ["kanban"];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          next = sanitizeVisibleProjectTabs(parsed);
        }
      } catch {
        // ignore
      }
    }
    next = sanitizeVisibleProjectTabs(next);
    setVisibleTabs(next);
    setActiveTab((current) => (next.includes(current) ? current : next[0] ?? "kanban"));
  }, [id, currentUser?.id]);

  const persistVisibleTabs = useCallback((next: string[]) => {
    if (!id || !currentUser?.id) return;
    const key = `project-visible-tabs-${currentUser.id}-${id}`;
    localStorage.setItem(key, JSON.stringify(next));
  }, [id, currentUser?.id]);

  useEffect(() => {
    if (!allowedTabs) return;

    const availableTabs = new Set(
      allowedTabs.filter((tab) =>
        (!isQualityProject || tab !== "calendar") &&   // Qualidade nunca teve calendário
        (SHOW_CALENDAR || tab !== "calendar"),          // Calendário ocultado por flag
      ),
    );

    const fallbackTab = availableTabs.has("kanban")
      ? "kanban"
      : Array.from(availableTabs)[0] ?? "kanban";

    const nextVisibleTabs = visibleTabs.filter((tab) => availableTabs.has(tab));
    const sanitizedVisibleTabs = nextVisibleTabs.length > 0 ? nextVisibleTabs : [fallbackTab];

    if (!arraysEqual(visibleTabs, sanitizedVisibleTabs)) {
      setVisibleTabs(sanitizedVisibleTabs);
      persistVisibleTabs(sanitizedVisibleTabs);
    }

    if (!sanitizedVisibleTabs.includes(activeTab)) {
      setActiveTab(sanitizedVisibleTabs[0] ?? fallbackTab);
    }
  }, [activeTab, allowedTabs, isQualityProject, persistVisibleTabs, visibleTabs]);

  // Safety net: sempre persiste visibleTabs no localStorage quando muda.
  // Evita perda silenciosa caso algum caller esqueça de chamar persistVisibleTabs.
  // Também usa uma chave fallback (sem userId) para o caso raro de auth ainda não estar pronta.
  const visibleTabsHydratedRef = useRef(false);
  useEffect(() => {
    if (!id) return;
    // Pula a primeira execução (estado inicial default = ["kanban"]),
    // para não sobrescrever um valor salvo antes que o load termine.
    if (!visibleTabsHydratedRef.current) {
      visibleTabsHydratedRef.current = true;
      return;
    }
    try {
      const userKey = currentUser?.id
        ? `project-visible-tabs-${currentUser.id}-${id}`
        : `project-visible-tabs-anon-${id}`;
      localStorage.setItem(userKey, JSON.stringify(visibleTabs));
    } catch {
      // quota / privado — ignora
    }
  }, [visibleTabs, id, currentUser?.id]);

  // Reseta o flag de hidratação ao trocar de projeto/usuário
  useEffect(() => {
    visibleTabsHydratedRef.current = false;
  }, [id, currentUser?.id]);

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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `id=eq.${id}`,
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
          table: "activities",
          filter: `project_id=eq.${id}`,
        },
        () => {
          void loadAccess(true);
          fetchProjectData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(accessChannel);
    };
  }, [authLoading, id, currentUser?.id, isAdmin, loadAccess]);

  /** Riscos abertos do projeto — alimentam o indicador do cabeçalho.
   *  Antes o risco não entrava em NENHUM indicador: registrar não mudava nada
   *  em tela alguma, o que é o motivo mais forte para ninguém registrar
   *  (medido em 04/08/2026: zero riscos em 52 projetos). */
  const fetchRisks = async () => {
    const { data, error } = await supabase
      .from("risks")
      .select("id, probability, impact, status")
      .eq("project_id", id!)
      .eq("is_trashed", false);
    if (error) return; // degrada em silêncio: indicador some, aba continua
    setRisks(data || []);
  };

  const fetchMembers = async () => {
    const [{ data: memberData }, { data: activityAssignments }] = await Promise.all([
      supabase
        .from("project_members").select("user_id").eq("project_id", id!),
      supabase
        .from("activities").select("assigned_to").eq("project_id", id!).not("assigned_to", "is", null),
    ]);

    const memberIds = (memberData || [])
      .map((m) => String(m.user_id || "").trim())
      .filter(Boolean);

    const assignedValues = (activityAssignments || [])
      .map((row) => String((row as { assigned_to?: string | null }).assigned_to || "").trim())
      .filter(Boolean);

    const assignedIds = assignedValues.filter(looksLikeUuid);
    const assignedEmails = assignedValues.filter((value) => !looksLikeUuid(value) && value.includes("@"));
    const assignedNames = assignedValues.filter((value) => !looksLikeUuid(value) && !value.includes("@"));

    const mergedById = new Map<string, { id: string; full_name: string | null; sector: string | null; avatar_url: string | null; email: string | null }>();

    const allIds = Array.from(new Set([...memberIds, ...assignedIds]));
    if (allIds.length > 0) {
      // Em lotes: esta lista junta membros e responsáveis de TODAS as atividades,
      // então cresce com o projeto e pode estourar o limite de URL do proxy
      // (ver lib/chunkedIn).
      const profilesById = await selectInChunks<{ id: string; full_name: string | null; sector: string | null; avatar_url: string | null; email: string | null }>(
        allIds,
        (batch) => supabase
          .from("profiles")
          .select("id, full_name, sector, avatar_url, email")
          .in("id", batch),
      ).catch(() => []);

      profilesById.forEach((profile) => {
        mergedById.set(profile.id, profile);
      });
    }

    if (assignedNames.length > 0) {
      const uniqueNames = Array.from(new Set(assignedNames));
      const { data: profilesByName } = await supabase
        .from("profiles")
        .select("id, full_name, sector, avatar_url, email")
        .in("full_name", uniqueNames);

      (profilesByName || []).forEach((profile) => {
        mergedById.set(profile.id, profile as { id: string; full_name: string | null; sector: string | null; avatar_url: string | null; email: string | null });
      });
    }

    if (assignedEmails.length > 0) {
      const uniqueEmails = Array.from(new Set(assignedEmails));
      const { data: profilesByEmail } = await supabase
        .from("profiles")
        .select("id, full_name, sector, avatar_url, email")
        .in("email", uniqueEmails);

      (profilesByEmail || []).forEach((profile) => {
        mergedById.set(profile.id, profile as { id: string; full_name: string | null; sector: string | null; avatar_url: string | null; email: string | null });
      });
    }

    const profiles = Array.from(mergedById.values());
    setMembers(profiles.filter((p) => p.full_name) as { full_name: string; sector: string | null }[]);

    const map: Record<string, string> = {};
    const sectorMap: Record<string, string> = {};
    const avatarMap = buildAvatarLookupMap(profiles);

    profiles.forEach((profile) => {
      const fullName = typeof profile.full_name === "string" ? profile.full_name.trim() : "";
      const sector = typeof profile.sector === "string" ? profile.sector.trim() : "";

      if (profile.id && fullName) {
        map[profile.id] = fullName;
      }
      if (sector) {
        if (profile.id) sectorMap[profile.id] = sector;
        if (fullName) sectorMap[fullName] = sector;
      }
    });

    setProfilesMap(map);
    setProfileAvatarMap(avatarMap);
    setProfileSectorMap(sectorMap);
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

  const toErrorMessage = (error: unknown, source: string) => {
    if (error instanceof Error) {
      return `${source}: ${error.message}`;
    }

    if (typeof error === "object" && error !== null) {
      const maybeError = error as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };

      const parts = [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
        .filter(Boolean)
        .join(" | ");

      return `${source}: ${parts || "erro desconhecido"}`;
    }

    return `${source}: erro desconhecido`;
  };

  const fetchProjectData = async () => {
    try {
      const [
        { data: projectData, error: projectError },
        { data: phasesData, error: phasesError },
        { data: activitiesData, error: activitiesError },
        { data: timeEntriesData },
      ] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).single(),
        supabase
          .from("phases").select("*").eq("project_id", id).eq("is_trashed", false)
          .order("display_order", { ascending: true }),
        (supabase
          .from("activities").select("*").eq("project_id", id) as any).eq("is_trashed", false)
          .order("display_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("time_entries").select("activity_id, duration_minutes").eq("project_id", id),
      ]);

      if (projectError) throw new Error(toErrorMessage(projectError, "projects"));
      setProject(projectData);
      if (phasesError) throw new Error(toErrorMessage(phasesError, "phases"));
      if (activitiesError) throw new Error(toErrorMessage(activitiesError, "activities"));

      const candidateUsers = buildUserCandidates([
        profile?.full_name,
        profile?.email,
        currentUser?.email,
        profile?.id,
        currentUser?.id,
      ]);

      const visibleActivities = activityScopedAccess
        ? (activitiesData || []).filter((activity: any) => (
            matchesIdentity(activity.assigned_to, candidateUsers) ||
            (Array.isArray(activity.participants) && anyMatchesIdentity(activity.participants, candidateUsers))
          ))
        : (activitiesData || []);

      const visiblePhaseIds = new Set(
        visibleActivities
          .map((activity: any) => activity.phase_id)
          .filter((phaseId: string | null | undefined): phaseId is string => Boolean(phaseId)),
      );

      setPhases(
        activityScopedAccess
          ? (phasesData || []).filter((phase) => visiblePhaseIds.has(phase.id))
          : (phasesData || []),
      );
      setActivities(visibleActivities);

      // Build consumed-minutes map for kanban cards
      const map: Record<string, number> = {};
      for (const entry of (timeEntriesData || [])) {
        if (entry.activity_id && entry.duration_minutes) {
          map[entry.activity_id] = (map[entry.activity_id] || 0) + entry.duration_minutes;
        }
      }
      setConsumedMinutesByActivity(map);
    } catch (error) {
      const message = toErrorMessage(error, "fetchProjectData");
      console.error("Erro ao buscar dados do projeto:", { message, error });
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };


  const handleAddActivity = async () => {
    if (isProjectConcluded) {
      showProjectLockedToast("criar atividades");
      return;
    }
    if (!newActivity.trim() || !id) return;
    try {
      await supabase.from("activities").insert({
        project_id: id, title: newActivity, status: "pending",
        assigned_to: newActivityAssigned || null, start_date: newActivityStartDate || null,
        end_date: newActivityEndDate || null, cost: parseFloat(newActivityCost) || 0,
        hours: parseFloat(newActivityHours) || 0, phase_id: newActivityPhaseId || null,
        priority: newActivityPriority,
      });
      toast.success("Atividade adicionada!");
      setNewActivity(""); setNewActivityAssigned(""); setNewActivityStartDate(""); setNewActivityEndDate("");
      setNewActivityCost(""); setNewActivityHours(""); setNewActivityPhaseId(""); setNewActivityPriority("medium");
      setShowAddActivity(false);
      fetchProjectData();
    } catch { toast.error("Erro ao adicionar atividade"); }
  };

  const handleToggleActivity = async (activityId: string, currentStatus: string) => {
    if (isProjectConcluded) {
      showProjectLockedToast("alterar atividades");
      return;
    }
    const act = activities.find(a => a.id === activityId);
    if (act && !canMutateActivity(act)) {
      toast.error("Somente o criador ou responsável da atividade pode concluir/reabrir.");
      return;
    }
    if (act && isActivityBlocked(activityId, act.phase_id)) {
      toast.error("Atividade bloqueada: resolva a solicitação de mudança");
      return;
    }
    const newStatus = currentStatus === "completed" ? "pending" : "completed";

    const { data: hierarchyRows } = await supabase
      .from("activities")
      .select("id,parent_id,status")
      .eq("project_id", id)
      .eq("is_trashed", false);

    const childrenMap = new Map<string, string[]>();
    const parentById = new Map<string, string | null>();
    const statusById = new Map<string, string>();
    (hierarchyRows || []).forEach((candidate) => {
      parentById.set(candidate.id, candidate.parent_id || null);
      statusById.set(candidate.id, candidate.status || "pending");
      if (!candidate.parent_id) return;
      const arr = childrenMap.get(candidate.parent_id) || [];
      arr.push(candidate.id);
      childrenMap.set(candidate.parent_id, arr);
    });

    const descendantIds: string[] = [];
    const stack = [...(childrenMap.get(activityId) || [])];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      descendantIds.push(current);
      const children = childrenMap.get(current) || [];
      children.forEach((childId) => stack.push(childId));
    }

    const idsToUpdate = [activityId, ...descendantIds];
    const completedAt = newStatus === "completed" ? new Date().toISOString() : null;
    const today = new Date().toISOString().slice(0, 10);
    const updatePayload: any = { status: newStatus, completed_at: completedAt };
    let finalStageId: string | null = null;
    let reopenStageId: string | null = null;

    if (id) {
      const { data: stageRows } = await supabase
        .from("workflow_stages")
        .select("id, title, display_order, is_final")
        .eq("project_id", id)
        .order("display_order", { ascending: true });

      const stageList = stageRows || [];
      finalStageId = stageList.find((stage) => stage.is_final)?.id || null;

      const normalized = (value: string | null | undefined) =>
        (value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();

      const explicitAFazer = stageList.find((stage) => {
        const title = normalized(stage.title);
        return title === "a fazer" || title === "afazer" || title.includes("a fazer");
      });
      const displayOrderOne = stageList.find(
        (stage) => !stage.is_final && stage.display_order === 1,
      );
      const firstActiveStage = stageList.find(
        (stage) => !stage.is_final && stage.display_order > 0,
      );
      const backlogStage = stageList.find((stage) => stage.display_order === 0);
      reopenStageId = (explicitAFazer || displayOrderOne || firstActiveStage || backlogStage)?.id || null;

      if (newStatus === "completed" && finalStageId) {
        updatePayload.workflow_stage_id = finalStageId;
      }
      if (newStatus === "pending" && reopenStageId) {
        updatePayload.workflow_stage_id = reopenStageId;
      }

      // Datas reais (actual_start/end) sao SEMPRE manuais — o sistema nao as
      // preenche nem limpa automaticamente ao concluir/reabrir.

      if (newStatus === "pending" && !reopenStageId) {
        toast.error("Não foi possível identificar a coluna de reabertura (A Fazer).");
        return;
      }
    }

    // Em lotes: concluir um item com muitos descendentes gera uma lista longa,
    // que estoura o limite de URL do proxy (ver lib/chunkedIn).
    const { error: updateActivitiesError } = await mutateInChunks(idsToUpdate, (batch) =>
      (supabase.from("activities").update(updatePayload) as any).in("id", batch),
    );
    if (updateActivitiesError) {
      toast.error(`Erro ao atualizar atividade(s): ${updateActivitiesError.message}`);
      return;
    }

    idsToUpdate.forEach((idToUpdate) => {
      statusById.set(idToUpdate, newStatus);
    });

    if (updatePayload.workflow_stage_id) {
      const { error: updateStoriesError } = await mutateInChunks(idsToUpdate, (batch) =>
        (supabase.from("user_stories").update({ stage_id: updatePayload.workflow_stage_id }) as any)
          .in("activity_id", batch));
      if (updateStoriesError) {
        toast.error(`Erro ao atualizar estágio das histórias: ${updateStoriesError.message}`);
      }
    }

    // Recalcula ancestrais: pai só fica concluído com 100% dos filhos diretos concluídos.
    const ancestorIds: string[] = [];
    const seenAncestors = new Set<string>();
    let cursor = parentById.get(activityId) || null;
    while (cursor) {
      if (seenAncestors.has(cursor)) break;
      seenAncestors.add(cursor);
      ancestorIds.push(cursor);
      cursor = parentById.get(cursor) || null;
    }

    const ancestorsToComplete: string[] = [];
    const ancestorsToReopen: string[] = [];

    ancestorIds.forEach((ancestorId) => {
      const childIds = childrenMap.get(ancestorId) || [];
      const allChildrenCompleted =
        childIds.length > 0 && childIds.every((childId) => statusById.get(childId) === "completed");
      const previousStatus = statusById.get(ancestorId) || "pending";
      const nextStatus = allChildrenCompleted ? "completed" : "pending";

      if (previousStatus !== nextStatus) {
        if (nextStatus === "completed") ancestorsToComplete.push(ancestorId);
        else ancestorsToReopen.push(ancestorId);
      }

      statusById.set(ancestorId, nextStatus);
    });

    if (ancestorsToComplete.length > 0) {
      const completePayload: any = {
        status: "completed",
        completed_at: new Date().toISOString(),
      };
      if (finalStageId) completePayload.workflow_stage_id = finalStageId;
      const { error: completeAncestorsError } = await (supabase.from("activities").update(completePayload) as any).in("id", ancestorsToComplete);
      if (completeAncestorsError) {
        toast.error(`Erro ao concluir atividade pai: ${completeAncestorsError.message}`);
        return;
      }
      if (finalStageId) {
        const { error: completeAncestorStoriesError } = await (supabase.from("user_stories").update({ stage_id: finalStageId }) as any)
          .in("activity_id", ancestorsToComplete);
        if (completeAncestorStoriesError) {
          toast.error(`Erro ao atualizar histórias da atividade pai: ${completeAncestorStoriesError.message}`);
        }
      }
    }

    if (ancestorsToReopen.length > 0) {
      const reopenPayload: any = { status: "pending", completed_at: null, actual_end_date: null };
      if (reopenStageId) reopenPayload.workflow_stage_id = reopenStageId;
      const { error: reopenAncestorsError } = await (supabase.from("activities").update(reopenPayload) as any).in("id", ancestorsToReopen);
      if (reopenAncestorsError) {
        toast.error(`Erro ao reabrir atividade pai: ${reopenAncestorsError.message}`);
        return;
      }
      if (reopenStageId) {
        const { error: reopenAncestorStoriesError } = await (supabase.from("user_stories").update({ stage_id: reopenStageId }) as any)
          .in("activity_id", ancestorsToReopen);
        if (reopenAncestorStoriesError) {
          toast.error(`Erro ao atualizar histórias da reabertura: ${reopenAncestorStoriesError.message}`);
        }
      }
    }

    fetchProjectData();
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (isProjectConcluded) {
      showProjectLockedToast("alterar atividades");
      return;
    }
    const act = activities.find(a => a.id === activityId);
    if (act && !canMutateActivity(act)) {
      toast.error("Somente o criador ou responsável da atividade pode arquivar.");
      return;
    }
    if (act && isActivityBlocked(activityId, act.phase_id)) {
      toast.error("Atividade bloqueada: resolva a solicitação de mudança");
      return;
    }
    const ok = await appConfirm({
      title: "Arquivar atividade",
      description: "Tem certeza que deseja mover esta atividade para a lixeira?",
      confirmText: "Arquivar",
      destructive: true,
    });
    if (!ok) return;
    const trashedAt = new Date().toISOString();
    // Coletar a atividade + todos os descendentes (subtarefas em qualquer nível)
    const idsToTrash = new Set<string>([activityId]);
    let frontier: string[] = [activityId];
    while (frontier.length > 0) {
      const children = activities.filter(a => a.parent_id && frontier.includes(a.parent_id));
      const newIds = children.map(c => c.id).filter(cid => !idsToTrash.has(cid));
      if (newIds.length === 0) break;
      newIds.forEach(nid => idsToTrash.add(nid));
      frontier = newIds;
    }
    // Em lotes: arquivar uma fase leva junto todos os descendentes, e essa
    // lista cresce sem teto (ver lib/chunkedIn).
    const { error } = await mutateInChunks(Array.from(idsToTrash), (batch) =>
      (supabase.from("activities").update({ is_trashed: true, trashed_at: trashedAt } as any) as any).in("id", batch),
    );
    if (error) {
      toast.error("Não foi possível arquivar a atividade.", { description: error.message });
      return;
    }

    // O PAI perdeu o último filho? Volta a ser folha.
    // Criar subatividade promove o pai a agrupador (a regra do banco exige isso
    // para aceitar filho), mas nada desfazia quando o último saía: o item ficava
    // com cara de agrupador, sem nada dentro, para sempre. Quem é Fase declarada
    // (nível 1 do código EAP) não é rebaixado — ver eapShouldDemote.
    const arquivada = activities.find((a) => a.id === activityId);
    const paiId = arquivada?.parent_id;
    if (paiId) {
      const pai = activities.find((a) => a.id === paiId);
      const sobrouFilho = activities.some(
        (a) => a.parent_id === paiId && !idsToTrash.has(a.id) && !a.is_trashed,
      );
      if (pai && eapShouldDemote({ item_type: pai.item_type, wbs_code: pai.wbs_code }, sobrouFilho)) {
        // Falha aqui não desfaz o arquivamento, que é o que o usuário pediu.
        await supabase.from("activities").update({ item_type: "atividade" } as any).eq("id", paiId);
      }
    }

    // Desfazer: arquivar é soft-delete (is_trashed), então reverter é só
    // limpar as flags dos MESMOS ids — inclusive os descendentes que entraram
    // na cascata. Sem isto, o caminho de volta era achar cada item na Lixeira e
    // restaurar um por um.
    const trashedIds = Array.from(idsToTrash);
    toast.success(
      trashedIds.length > 1
        ? `Atividade e ${trashedIds.length - 1} subtarefa(s) movidas para a lixeira`
        : "Atividade movida para a lixeira",
      {
        action: {
          label: "Desfazer",
          onClick: async () => {
            const { error: undoError } = await mutateInChunks(trashedIds, (batch) =>
              (supabase.from("activities").update({ is_trashed: false, trashed_at: null } as any) as any).in("id", batch));
            if (undoError) {
              toast.error("Não foi possível desfazer.", { description: undoError.message });
              return;
            }
            toast.success("Arquivamento desfeito");
            fetchProjectData();
          },
        },
      },
    );
    fetchProjectData();
  };

  const handleActivityDragEnd = async (event: DragEndEvent) => {
    if (isProjectConcluded) {
      showProjectLockedToast("reordenar atividades");
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const parentActs = activities.filter((a) => !a.parent_id);
    const activeActivity = parentActs.find((a) => a.id === active.id);
    if (activeActivity && !canMutateActivity(activeActivity)) {
      toast.error("Somente o criador ou responsável da atividade pode reordenar.");
      return;
    }
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

  const backlogFilteredActivities = useMemo(
    () =>
      activities.filter((a: any) => {
        if (listSearch && !a.title?.toLowerCase().includes(listSearch.toLowerCase())) return false;
        if (listStatusFilter !== "all" && a.status !== listStatusFilter) return false;
        if (listPriorityFilter !== "all" && a.priority !== listPriorityFilter) return false;
        return true;
      }),
    [activities, listSearch, listStatusFilter, listPriorityFilter]
  );

  if (isLoading || authLoading || permissionsLoading) {
    return (<div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Carregando projeto...</p></div>);
  }
  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <p className="text-lg font-semibold text-foreground mb-2">Acesso restrito</p>
          <p className="text-sm text-muted-foreground mb-4">Você não tem autorização para visualizar este projeto. Solicite ao administrador para ser adicionado como membro.</p>
          <Button onClick={() => router.push("/projects")}>Voltar</Button>
        </div>
      </div>
    );
  }
  if (!project) {
    return (<div className="min-h-screen bg-background flex items-center justify-center"><div className="text-center"><p className="text-muted-foreground mb-4">Projeto não encontrado</p><Button onClick={() => router.push("/projects")}>Voltar</Button></div></div>);
  }

  const completedActivities = activities.filter((a) => a.status === "completed").length;
  const activityProgress = activities.length > 0 ? (completedActivities / activities.length) * 100 : 0;


  return (
    <main className="px-4 py-4 bg-muted/70 dark:bg-background min-h-[calc(100vh-3.5rem)]">
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
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-muted-foreground">Projeto:</span>
                  <span className="font-semibold text-foreground truncate max-w-[260px]" title={project.title}>
                    {project.title}
                  </span>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingProject(project); setEditDialogOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
                {/* UMA pessoa só no topo: mostrar Líder e Gestor lado a lado
                    enchia a barra sem acrescentar — quem olha o cabeçalho quer
                    saber a quem recorrer, não o organograma. A ficha continua
                    com os dois campos.

                    Cai para o Líder quando não há Gestor: em 02/08/2026, 41 dos
                    52 projetos têm líder e nenhum gestor — mostrar só o gestor
                    deixaria a maioria dos cabeçalhos sem pessoa nenhuma. */}
                {(() => {
                  const gestor = project.manager?.trim() || "";
                  const lider = project.owner?.trim() || "";
                  const quem = gestor || lider;
                  if (!quem) return null;
                  return (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">{gestor ? "Gestor:" : "Líder:"}</span>
                      <span className="font-medium text-foreground">{quem}</span>
                    </div>
                  );
                })()}
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
                {/* Riscos ao lado do progresso: é a informação que muda uma
                    decisão de gestão, e antes não aparecia em tela nenhuma.
                    Só surge quando há risco aberto — projeto sem risco não
                    ganha um "0" para ignorar. */}
                {riscosResumo.abertos > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("risks")}
                    title="Ver riscos do projeto"
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-colors ${
                      riscosResumo.criticos > 0
                        ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                        : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15"
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium text-xs tabular-nums">
                      {riscosResumo.criticos > 0
                        ? `${riscosResumo.criticos} crítico${riscosResumo.criticos > 1 ? "s" : ""}`
                        : `${riscosResumo.abertos} risco${riscosResumo.abertos > 1 ? "s" : ""}`}
                    </span>
                  </button>
                )}
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
              onNavigateToActivity={(activity) => openEditActivity(activity as any)}
            />
          )}

          {(isChangeBlocked || hasScopedBlocks) && (
            <Card className="px-4 py-3 border-2 border-amber-500/60 bg-amber-500/10">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  {isChangeBlocked ? (
                    <>
                      <p className="font-semibold text-amber-900 dark:text-amber-200">
                        Projeto bloqueado: {pendingChangeRequests} solicitação{pendingChangeRequests > 1 ? "ões" : ""} de mudança aguardando aprovação
                      </p>
                      <p className="text-amber-800/80 dark:text-amber-300/80 text-xs mt-0.5">
                        Nenhuma alteração pode ser feita até que as solicitações sejam aprovadas ou rejeitadas.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-amber-900 dark:text-amber-200">
                        {blockedActivityIds.size} atividade{blockedActivityIds.size !== 1 ? "s" : ""} bloqueada{blockedActivityIds.size !== 1 ? "s" : ""}{blockedPhaseIds.size > 0 ? ` e ${blockedPhaseIds.size} fase${blockedPhaseIds.size !== 1 ? "s" : ""}` : ""} por solicitação de mudança
                      </p>
                      <p className="text-amber-800/80 dark:text-amber-300/80 text-xs mt-0.5">
                        Os itens marcados com cadeado só serão liberados quando a solicitação for aprovada (ou arquivada se rejeitada).
                      </p>
                    </>
                  )}
                </div>
                <Button size="sm" variant="outline" className="border-amber-500/60" onClick={() => setActiveTab("changes")}>
                  Ver solicitações
                </Button>
              </div>
            </Card>
          )}

          {/* Tabs — Phases tab REMOVED */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {(() => {
              const allDefinitions = [
                { value: "kanban", label: "Kanban", icon: <Kanban className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-violet-500" },
                { value: "backlog", label: "Backlog", icon: <Inbox className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-amber-500" },
                { value: "timeline", label: "Cronograma", icon: <GanttChart className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-emerald-500" },
                ...(isQualityProject || !SHOW_CALENDAR ? [] : [
                  { value: "calendar", label: "Calendário", icon: <Calendar className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-rose-500" },
                ]),
                { value: "documents", label: "Documentos", icon: <FileText className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-blue-500" },
                // Registros: linha do tempo única de reuniões, documentos e
                // lições. Não substitui as três abas — responde "o que andou
                // neste projeto?", que hoje exige abrir as três e comparar datas.
                { value: "registros", label: "Registros", icon: <History className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-slate-500" },
                ...(SHOW_USER_STORIES ? [
                  { value: "stories", label: "Histórias", icon: <BookOpen className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-fuchsia-500" },
                ] : []),
                { value: "tap", label: "TAP", icon: <ClipboardList className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-indigo-500" },
                { value: "meetings", label: "Reuniões", icon: <Users className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-teal-500" },
                { value: "risks", label: "Riscos", icon: <AlertTriangle className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-red-500" },
                { value: "changes", label: "Mudanças", icon: <GitPullRequest className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-orange-500" },
                { value: "dependencies", label: "Dependências", icon: <GitPullRequest className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-cyan-500" },
                { value: "financials", label: "Financeiro", icon: <DollarSign className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-green-600" },
                { value: "lessons", label: "Lições", icon: <BookOpen className="w-4 h-4" fill="currentColor" fillOpacity={0.22} strokeWidth={2.25} />, iconColor: "text-yellow-500" },
              ];
              const permittedDefs = allDefinitions.filter(t => !allowedTabs || allowedTabs.includes(t.value));
              const activeTabsSet = new Set(visibleTabs);
              const renderedTabs = permittedDefs.filter(t => activeTabsSet.has(t.value));
              const availableToAdd = permittedDefs.filter(t => !activeTabsSet.has(t.value));

              const handleAddTab = (val: string) => {
                const next = [...visibleTabs, val];
                setVisibleTabs(next);
                persistVisibleTabs(next);
                setActiveTab(val);
                setTabPickerOpen(false);
              };
              const handleRemoveTab = (val: string) => {
                const next = visibleTabs.filter(v => v !== val);
                setVisibleTabs(next);
                persistVisibleTabs(next);
                if (activeTab === val) setActiveTab(next[0] ?? "kanban");
              };

              return (
                <div className="mb-2">
                  <DraggableTabBar
                    storageKey={`project-tabs-order-${id}`}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    tabs={renderedTabs}
                    onRemoveTab={handleRemoveTab}
                    removableValues={renderedTabs.map(t => t.value)}
                    extraSlotPosition="left"
                    extraSlot={
                      <Popover open={tabPickerOpen} onOpenChange={setTabPickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                            aria-label="Adicionar visualização"
                          >
                            <Plus className="w-4 h-4" />
                            Visualização
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 p-2">
                          <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                            Adicionar visualização
                          </div>
                          {availableToAdd.length === 0 ? (
                            <div className="text-xs text-muted-foreground px-2 py-3 text-center">
                              Todas as visualizações disponíveis já foram adicionadas.
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5 max-h-80 overflow-y-auto">
                              {availableToAdd.map(t => (
                                <button
                                  key={t.value}
                                  onClick={() => handleAddTab(t.value)}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted/80 focus-visible:bg-muted/80 active:bg-muted/80 focus-visible:outline-none transition-colors text-left"
                                >
                                  <span className={t.iconColor ?? ""}>{t.icon}</span>
                                  <span>{t.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    }
                  />
                </div>
              );
            })()}

            <TabsContent value="kanban" className="mt-0">
              <ActivityKanban
                projectId={id!} activities={activities} phases={phases}
                consumedMinutesByActivity={consumedMinutesByActivity}
                onDataChanged={fetchProjectData}
                onEditActivity={(activity) => openEditActivity(activity)}
                onDeleteActivity={handleDeleteActivity}
                onToggleActivity={handleToggleActivity}
                isAdmin={canDelete}
                canCreate={canCreate}
                projectLocked={isProjectConcluded}
                isQualityProject={isQualityProject}
                profilesMap={profilesMap}
                profileSectorMap={profileSectorMap}
                profileAvatarMap={profileAvatarMap}
                onOpenCreateTask={(stageId) => {
                  if (isProjectConcluded) {
                    showProjectLockedToast("criar atividades");
                    return;
                  }
                  setCreateTaskStageId(stageId);
                  setShowAddActivity(true);
                }}
              />
            </TabsContent>



            <TabsContent value="timeline" className="mt-0">
              <ProjectCronogramaPanel
                projectIds={[id!]}
                defaultMode="table"
                onEditActivity={(activity) => openEditActivity(activity)}
              />
            </TabsContent>

            {!isQualityProject && SHOW_CALENDAR && (
              <TabsContent value="calendar" className="mt-0">
                <ProjectCalendarView
                  projectId={id!}
                  activities={activities as any}
                  onEditActivity={(actId) => {
                    const act = activities.find(a => a.id === actId);
                    if (act) { setEditingActivity(act); setEditActivityDialogOpen(true); }
                  }}
                  onDataChanged={fetchProjectData}
                />
              </TabsContent>
            )}

            {/* CENTRAL DE DOCUMENTOS — as antigas abas "Documentos" e "Páginas"
                fundidas. Eram metades do mesmo trabalho: uma escrevia e não
                distribuía, a outra distribuía e não escrevia. A escolha entre
                escrever e enviar arquivo virou sub-navegação, não aba do
                projeto. A rota antiga (?tab=docpages) continua abrindo aqui. */}
            <TabsContent value="documents" className="mt-0">
              <DocumentCenter
                projectId={id!}
                phases={phases}
                // wbs_code e phase_id vão junto: o seletor de atividade busca
                // pelo código e agrupa pela fase escolhida. O `.map` antes
                // descartava os dois, e o agrupamento não teria por onde saber.
                activities={activities.map(a => ({
                  id: a.id,
                  title: a.title,
                  wbs_code: a.wbs_code ?? null,
                  phase_id: a.phase_id ?? null,
                }))}
                canManageProject={isAdmin}
                onActivityCreated={fetchProjectData}
              />
            </TabsContent>

            <TabsContent value="stories" className="mt-0">
              {SHOW_USER_STORIES && <UserStoriesBoard projectId={id!} projectLocked={isProjectConcluded} />}
            </TabsContent>

            <TabsContent value="tap" className="mt-0">
              <ProjectCharter projectId={id!} project={project} phases={phases} members={members} onMembersChanged={fetchMembers} />
            </TabsContent>

            <TabsContent value="meetings" className="mt-0">
              <MeetingsManager
                projectId={id!} phases={phases}
                // Sem esta prop o componente caía no default `false` e NINGUÉM
                // podia registrar decisão ou ação — nem admin, nem gestor. As
                // seções apareciam como títulos vazios, sem campo de entrada e
                // sem dizer por quê. Mesmo critério dos outros painéis da tela.
                canManageProject={canEdit}
                // Devolve o ID da atividade criada para quem chamou poder GRAVAR
                // O VÍNCULO. Antes retornava void: a ação de reunião virava
                // tarefa e as duas ficavam sem ligação nenhuma — a ata não sabia
                // que a tarefa existia, e a tarefa não sabia de onde veio.
                // `dueDate` idem: o prazo já foi combinado na reunião.
                onCreateActivity={async (title, assignedTo, dueDate) => {
                  if (isProjectConcluded) {
                    showProjectLockedToast("criar atividades");
                    return null;
                  }
                  const { data, error } = await supabase
                    .from("activities")
                    .insert({
                      project_id: id!,
                      title,
                      assigned_to: assignedTo || null,
                      end_date: dueDate || null,
                      status: "pending",
                      priority: "medium",
                    })
                    .select("id")
                    .single();
                  if (error) {
                    toast.error("Não foi possível criar a atividade.", { description: error.message });
                    return null;
                  }
                  fetchProjectData();
                  return (data as { id: string } | null)?.id ?? null;
                }}
                onCreateBlocker={async (description) => {
                  await supabase.from("risks").insert({ project_id: id!, description, probability: "high", impact: "high", status: "identified", category: "impediment" });
                }}
                onCreateLesson={async (problem, suggestion) => {
                  await supabase.from("lessons_learned").insert({ project_id: id!, problem, suggestion: suggestion || null, category: "process" });
                }}
              />
            </TabsContent>

            <TabsContent value="registros" className="mt-0">
              <ProjectRegistrosTimeline projectId={id!} />
            </TabsContent>

            <TabsContent value="lessons" className="mt-0">
              <LessonsLearned projectId={id!} phases={phases} />
            </TabsContent>

            <TabsContent value="risks" className="mt-0">
              <RisksManager projectId={id!} />
            </TabsContent>

            <TabsContent value="changes" className="mt-0">
              <ChangeRequestsManager
                projectId={id!}
                projectOwner={project.owner}
                onChanged={fetchPendingChangeRequests}
              />
            </TabsContent>

            <TabsContent value="dependencies" className="mt-0">
              <ProjectDependenciesView
                projectId={id!}
                onEditActivity={(actId) => {
                  const act = activities.find((a) => a.id === actId);
                  if (act) { setEditingActivity(act); setEditActivityDialogOpen(true); }
                }}
              />
            </TabsContent>

            <TabsContent value="backlog" className="mt-3 space-y-3">
              {/* Barra única: ações à esquerda · busca/filtros/opções à direita */}
              <div className="flex flex-wrap items-center gap-2">
                {canCreate ? (
                  <>
                    <Button size="sm" variant="default" onClick={() => setShowQuickCreate(true)} className="gap-1.5 h-9">
                      <Plus className="w-4 h-4" /> Nova Atividade
                    </Button>
                    <ImportWBSDialog projectId={id!} onDataChanged={fetchProjectData} />
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="default"
                    disabled
                    className="gap-1.5 h-9"
                    title={
                      isProjectConcluded
                        ? "Projeto concluído — reabra para criar atividades."
                        : isChangeBlocked
                          ? "Bloqueado por uma solicitação de mudança em aberto."
                          : !canWrite
                            ? "Seu acesso a este projeto é somente leitura."
                            : "Você não tem permissão para criar atividades neste projeto."
                    }
                  >
                    <Plus className="w-4 h-4" /> Nova Atividade
                  </Button>
                )}

                <span className="flex-1" />

                <div className="relative w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Buscar..."
                    className="pl-8 h-9"
                  />
                </div>
                <Select value={listStatusFilter} onValueChange={setListStatusFilter}>
                  <SelectTrigger className="w-[128px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Status: todos</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="in_progress">Em andamento</SelectItem>
                    <SelectItem value="completed">Concluída</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={listPriorityFilter} onValueChange={setListPriorityFilter}>
                  <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Prioridade: todas</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                    <SelectItem value="critica">Crítica</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
                {(listSearch || listStatusFilter !== "all" || listPriorityFilter !== "all") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setListSearch(""); setListStatusFilter("all"); setListPriorityFilter("all"); }}
                    className="gap-1 h-9"
                  >
                    <X className="w-3.5 h-3.5" /> Limpar
                  </Button>
                )}

                {canCreate && (phases.length > 0 || activities.length > 0) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="outline" className="h-9 w-9" title="Mais opções">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {phases.length > 0 && (
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async () => {
                          const ok = await appConfirm({
                            title: "Arquivar fases",
                            description: `Arquivar TODAS as ${phases.length} fases? Elas podem ser restauradas no Arquivo.`,
                            confirmText: "Arquivar",
                            destructive: true,
                          });
                          if (!ok) return;
                          await (supabase.from("phases").update({ is_trashed: true, trashed_at: new Date().toISOString() } as any).eq("project_id", id));
                          toast.success(`${phases.length} fases arquivadas!`); fetchProjectData();
                        }}>
                          <Trash2 className="w-4 h-4 mr-2" /> Arquivar todas as fases
                        </DropdownMenuItem>
                      )}
                      {activities.length > 0 && (
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async () => {
                          const ok = await appConfirm({
                            title: "Arquivar atividades",
                            description: `Arquivar TODAS as ${activities.length} atividades? Elas podem ser restauradas no Arquivo.`,
                            confirmText: "Arquivar",
                            destructive: true,
                          });
                          if (!ok) return;
                          await (supabase.from("activities").update({ is_trashed: true, trashed_at: new Date().toISOString() } as any).eq("project_id", id) as any).eq("is_trashed", false);
                          toast.success(`${activities.length} atividades arquivadas!`); fetchProjectData();
                        }}>
                          <Trash2 className="w-4 h-4 mr-2" /> Arquivar todas as atividades
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <BacklogSection
                projectId={id!}
                activities={backlogFilteredActivities}
                phases={phases}
                onEditActivity={(activity) => openEditActivity(activity as any)}
                onDeleteActivity={handleDeleteActivity}
                onToggleActivity={handleToggleActivity}
                onDataChanged={fetchProjectData}
                isAdmin={canDelete}
                deleteBlockedReason={
                  isProjectConcluded ? "Projeto concluído — reabra o projeto para arquivar atividades."
                  : isChangeBlocked ? "Há uma solicitação de mudança aberta neste projeto."
                  : !canWrite ? "Seu acesso a este projeto é somente leitura."
                  : "Você não tem permissão para arquivar atividades neste projeto."
                }
                hasActiveFilters={!!listSearch || listStatusFilter !== "all" || listPriorityFilter !== "all"}
              />
            </TabsContent>

            <TabsContent value="financials" className="mt-0">
              <ProjectFinancials
                projectId={id!}
                budgetPlanned={project.budget_planned}
                budgetUsed={project.budget_used}
                onProjectUpdated={fetchProjectData}
                canManageProject={canEdit}
                phases={phases.map((p) => ({ id: p.id, title: p.title }))}
                projectStart={(project as { start_date?: string | null }).start_date ?? null}
                projectEnd={project.due_date ?? null}
                progressPct={activityProgress}
              />
            </TabsContent>
          </Tabs>
        </div>

        <EditProjectDialog project={editingProject} open={editDialogOpen} onOpenChange={setEditDialogOpen} onProjectUpdated={fetchProjectData} />
        <EditActivityDialog
          activity={editingActivity}
          open={editActivityDialogOpen}
          onOpenChange={(o) => {
            setEditActivityDialogOpen(o);
            if (!o) setEditActivityInitialTab("details");
          }}
          onActivityUpdated={fetchProjectData} phases={phases} allActivities={activities}
          projectId={id!} isQualityProject={isQualityProject}
          consumedMinutesByActivity={consumedMinutesByActivity}
          initialTab={editActivityInitialTab}
          // Sem isto o diálogo deixava preencher tudo e só falhava ao salvar.
          // Quem é responsável pela atividade edita mesmo com isto falso.
          canEditProject={canEdit}
        />
        {project && (
          <EditActivityDialog
            activity={null}
            open={showAddActivity}
            onOpenChange={(o) => {
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
            projectId={id!}
            isQualityProject={isQualityProject}
            consumedMinutesByActivity={consumedMinutesByActivity}
            createMode
            defaultStageId={createTaskStageId}
            defaultPhaseId={createTaskPhaseId}
            defaultParentId={createTaskParentId}
            projectLocked={isProjectConcluded}
          />
        )}
        <QuickCreateActivity
          open={showQuickCreate}
          onOpenChange={setShowQuickCreate}
          projectId={id!}
          parentOptions={activities as any}
          disabledReason={isProjectConcluded ? "Projeto concluído. Reabra para criar atividades." : null}
          onCreated={fetchProjectData}
          onOpenDetails={async (activityId) => {
            await fetchProjectData();
            const created = activities.find((a) => a.id === activityId)
              || (await supabase.from("activities").select("*").eq("id", activityId).maybeSingle()).data;
            if (created) openEditActivity(created as any);
          }}
        />
    </main>
  );
}
