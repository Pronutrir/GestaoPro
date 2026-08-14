'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { DateField } from "@/components/ui/date-field";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  GripVertical,
  AlertCircle,
  Inbox,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  BookOpen,
  GitFork,
  Check,
  Copy,
  ArrowRightLeft,
  MessageSquare,
  Paperclip,
  Hourglass,
  X as XIcon,
  Eye,
  EyeOff,
  Diamond,
  ChevronRight,
  ChevronDown,
  ChevronsRight,
  ChevronsLeft,
  Flag,
  Building2,
  Tag as TagIcon,
  Calendar as CalendarIcon,
  Users,
  Link2,
  User,
  Layers,
  List,
  Search,
  Filter,
} from "lucide-react";
import {
  DndContext,
  rectIntersection,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDroppable,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { UserStoryDrawer } from "@/components/UserStoryDrawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getBlockedDays, formatBlockedDays } from "@/lib/blockedTime";
import { KANBAN_TOKENS } from "@/lib/kanbanTokens";
import {
  computeActivityProgress,
  type ActivityProgress,
  type SubActivityLike,
} from "@/lib/activityProgress";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeGut, GUT_META, type GutLevel } from "@/lib/gutPriority";
import { LinkParentDialog } from "@/components/LinkParentDialog";
import {
  suggestCategoryFromTitle, categoryFromLegacyFlags, parseWorkflowCategory,
  type WorkflowCategory,
} from "@/lib/workflowCategory";
import { SHOW_USER_STORIES } from "@/lib/featureFlags";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { resolveEapKind, eapCanGroup, EAP_LABELS as EAP_LABELS_CANON } from "@/lib/eapModel";
import { ToastAction } from "@/components/ui/toast";
import { computeCardAging, CARD_AGING_CLASSES } from "@/lib/cardAging";
import { cn } from "@/lib/utils";
import {
  getStageDisplayTitle,
  toHoursNumber,
  formatHours,
  tagColorClass,
  getProgressBarColor,
  progressLabelFromPercent,
  STAGE_PRESET_COLORS,
  GROUP_BY_VALUES,
  MIN_COLUMN_WIDTH,
  EMPTY_COLUMN_FILTER,
  columnFilterActive,
  DEFAULT_CARD_FIELDS,
  DEFAULT_BOARD_SORT,
  colunasDoQuadro,
  colunasOcultas,
  ehColunaDeEntrada,
  type GroupByValue,
  type CardFields,
  type WorkflowStage,
  type Phase,
  type Activity,
  type ColumnFilter,
  type HoursStat,
  type SubActivityStatusSummary,
  type ActivityKanbanProps,
} from "./kanban/shared";
import { useKanbanPrefs } from "@/hooks/useKanbanPrefs";
import { migrarOrdenacaoDasColunas } from "@/lib/kanbanPrefs";
import { GerenciarColunas, type PlanoDeSalvamento } from "./kanban/GerenciarColunas";
import { KanbanCard, SortableKanbanCard } from "./kanban/KanbanCard";
import {
  SortableColumn,
  DroppableColumn,
  FilterOptionList,
  ColumnFilterPanel,
} from "./kanban/KanbanColumn";
import { VisoesMenu } from "./kanban/VisoesMenu";
import { ActivityDetailPanel } from "./kanban/ActivityDetailPanel";
import { selectInChunks } from "@/lib/chunkedIn";

// Compat: o tipo CardFields morava aqui antes do fatiamento (Fase 4).
// Valores (DEFAULT_CARD_FIELDS etc.) agora só em kanban/shared — re-exportar
// valor daqui quebraria o fast refresh do arquivo do componente.
export type { CardFields } from "./kanban/shared";

// kanban_teams e kanban_views ainda não estão nos tipos gerados do Supabase
// (migrations pendentes na VM) — únicos `any` tolerados do arquivo, cada um
// num ponto só. Remover quando os tipos forem regenerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const teamsTable = () => (supabase as any).from("kanban_teams");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const viewsTable = () => (supabase as any).from("kanban_views");

export const ActivityKanban = ({
  projectId,
  activities,
  phases,
  onDataChanged,
  onEditActivity,
  onDeleteActivity,
  onToggleActivity,
  isAdmin = false,
  canCreate = false,
  projectLocked = false,
  isQualityProject = false,
  onOpenCreateTask,
  profilesMap = {},
  profileAvatarMap = {},
  profileSectorMap = {},
}: ActivityKanbanProps) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const showProjectLockedToast = useCallback((action: string) => {
    toast({
      title: "Projeto concluído",
      description: `Reabra o projeto para ${action}.`,
      variant: "destructive",
    });
  }, [toast]);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragType, setDragType] = useState<"card" | "column" | null>(null);

  // Preferências de exibição (campos do card, raias, larguras, colunas
  // recolhidas, ordenação por coluna). Ficavam em cinco chaves soltas de
  // localStorage e não seguiam a pessoa: configurar o quadro no trabalho e
  // abrir em casa devolvia tudo ao padrão. Agora o navegador é cache e o banco
  // é a verdade — ver lib/kanbanPrefs.ts.
  //
  // FILTROS continuam locais de propósito (busca do momento, não gosto).
  const { user, profile } = useAuth();
  // `restaurarPrefs` existe no hook mas não é usado aqui: o "Restaurar" da tela
  // fica sob "Campos do card" e restaura só eles — zerar larguras e raias num
  // clique com esse rótulo surpreenderia.
  const { prefs, setPrefs } = useKanbanPrefs(projectId, user?.id ?? null);
  const columnWidths = prefs.columnWidths;
  // Espelho para o handler de arrasto ler a largura atual sem entrar nas deps
  // do useCallback (recriar o handler no meio do gesto perderia o movimento).
  const columnWidthsRef = useRef<Record<string, number>>(columnWidths);
  const collapsedStages = useMemo(() => new Set(prefs.collapsedStages), [prefs.collapsedStages]);
  const toggleCollapsedStage = useCallback((stageId: string) => {
    setPrefs((p) => {
      const next = new Set(p.collapsedStages);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return { collapsedStages: [...next] };
    });
  }, [setPrefs]);
  const setColumnSort = useCallback((stageId: string, value: string) => {
    setPrefs((p) => ({ columnSorts: { ...p.columnSorts, [stageId]: value } }));
  }, [setPrefs]);
  // A ordenação por coluna morava em `kanban-col-sort:{stageId}`, chave sem o
  // projectId — só dá para achá-la depois que os stages chegam. Sem esta
  // varredura, quem escolheu "por prazo" perderia a escolha nesta versão.
  const ordenacoesMigradas = useRef(false);
  useEffect(() => {
    if (ordenacoesMigradas.current || stages.length === 0) return;
    const achadas = migrarOrdenacaoDasColunas(stages.map((s) => s.id), prefs.columnSorts);
    ordenacoesMigradas.current = true;
    if (achadas) setPrefs((p) => ({ columnSorts: { ...achadas, ...p.columnSorts } }));
  }, [stages, prefs.columnSorts, setPrefs]);
  const [storyLinkedActivities, setStoryLinkedActivities] = useState<Map<string, number>>(new Map());
  const [dependencyCounts, setDependencyCounts] = useState<Map<string, { pred: number; succ: number }>>(new Map());
  // Predecessoras ainda nao concluidas por atividade (dependencia bloqueante).
  const [waitingOnCounts, setWaitingOnCounts] = useState<Map<string, number>>(new Map());
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  const [attachmentCounts, setAttachmentCounts] = useState<Map<string, number>>(new Map());
  const [relationCounts, setRelationCounts] = useState<
    Map<string, { id: string; title: string; relationId: string; relationType: string }[]>
  >(new Map());
  const [storyDrawerActivityId, setStoryDrawerActivityId] = useState<string | null>(null);
  const [storyDrawerOpen, setStoryDrawerOpen] = useState(false);
  const [createStoryActivity, setCreateStoryActivity] = useState<Activity | null>(null);
  // Bloqueio "in place": a atividade fica na coluna e recebe a flag.
  const [blockingActivity, setBlockingActivity] = useState<Activity | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockSaving, setBlockSaving] = useState(false);
  // Painel de detalhe (Item 2): clique no card abre LEITURA; editar é botão.
  // Guarda só o id — o objeto vem sempre fresco da lista de atividades.
  const [detailId, setDetailId] = useState<string | null>(null);
  const openDetail = useCallback((a: Activity) => setDetailId(a.id), []);
  const [createStoryTitle, setCreateStoryTitle] = useState("");
  const [createStoryNarrative, setCreateStoryNarrative] = useState("");
  const [createStoryLoading, setCreateStoryLoading] = useState(false);
  const [linkParentIds, setLinkParentIds] = useState<string[] | null>(null);
  const [linkParentCurrent, setLinkParentCurrent] = useState<string | null>(null);
  const canManageHierarchy = isAdmin || canCreate;
  
  // Optimistic overrides: activityId -> new workflow_stage_id
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});

  // Campos visíveis do card (⚙ Card). A limpeza das chaves antigas e o merge
  // com os defaults moraram aqui até 12/08/2026; hoje são responsabilidade de
  // lib/kanbanPrefs (limparChavesAntigas / sanearPrefs), junto com a lição de
  // versionar a chave sempre que um DEFAULT_* persistido mudar de valor.
  const cardFields = prefs.cardFields;
  const toggleCardField = useCallback((key: keyof CardFields) => {
    setPrefs((p) => ({ cardFields: { ...p.cardFields, [key]: !p.cardFields[key] } }));
  }, [setPrefs]);

  // Filtro "Apenas minhas tarefas" — persistido por projeto
  const myName = (profile?.full_name || "").trim().toLowerCase();
  const myId = user?.id || null;
  const onlyMineKey = `kanban-only-mine:${projectId}`;
  const [onlyMine, setOnlyMine] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(onlyMineKey) === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(onlyMineKey, onlyMine ? "1" : "0");
    }
  }, [onlyMine, onlyMineKey]);

  // Agrupamento em raias (swimlanes) — segue a pessoa entre computadores.
  const groupBy = prefs.groupBy;
  const setGroupBy = useCallback((v: GroupByValue) => setPrefs({ groupBy: v }), [setPrefs]);
  // Times de raia (nível B): grupos nomeados de pessoas, por projeto,
  // compartilhados via banco. Alimentam a "Raia por time" quando o usuário
  // escolhe agrupar por time — não alteram o comportamento padrão do Kanban.
  type LaneTeam = { id: string; name: string; members: string[] };
  const [laneGroups, setLaneGroups] = useState<LaneTeam[]>([]);
  const [manageGroupsOpen, setManageGroupsOpen] = useState(false);
  const [gerenciarColunasOpen, setGerenciarColunasOpen] = useState(false);
  const [teamsUnavailable, setTeamsUnavailable] = useState(false); // migration ainda não aplicada

  const fetchTeams = useCallback(async () => {
    const { data, error } = await teamsTable()
      .select("id, name, members")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) {
      // Tabela ausente na VM: mantém o recurso desabilitado sem quebrar o board.
      if (/kanban_teams|relation|does not exist|schema cache/i.test(error.message)) {
        setTeamsUnavailable(true);
      }
      return;
    }
    setTeamsUnavailable(false);
    setLaneGroups((data as LaneTeam[]) || []);
  }, [projectId]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const createTeam = useCallback(async () => {
    const { data, error } = await teamsTable()
      .insert({ project_id: projectId, name: "", members: [] })
      .select("id, name, members")
      .single();
    if (error) {
      if (/kanban_teams|relation|does not exist|schema cache/i.test(error.message)) {
        setTeamsUnavailable(true);
        toast({ title: "Times indisponíveis", description: "Aplique a migration kanban_teams na VM para habilitar.", variant: "destructive" });
      }
      return;
    }
    setLaneGroups((gs) => [...gs, data as LaneTeam]);
  }, [projectId, toast]);

  const saveTeam = useCallback(async (team: LaneTeam) => {
    setLaneGroups((gs) => gs.map((x) => x.id === team.id ? team : x)); // otimista
    await teamsTable()
      .update({ name: team.name, members: team.members, updated_at: new Date().toISOString() })
      .eq("id", team.id);
  }, []);

  const deleteTeam = useCallback(async (id: string) => {
    setLaneGroups((gs) => gs.filter((x) => x.id !== id));
    await teamsTable().delete().eq("id", id);
  }, []);

  // Filtros do board: busca textual + responsável + fase + prioridade.
  const filtersKey = `kanban-filters:${projectId}`;
  const [search, setSearch] = useState("");
  // Multi-seleção: cada filtro é um Set de valores; vazio = "todos".
  const [filterAssignees, setFilterAssignees] = useState<Set<string>>(new Set());
  const [filterPhases, setFilterPhases] = useState<Set<string>>(new Set());
  const [filterPriorities, setFilterPriorities] = useState<Set<string>>(new Set());
  // Prazo: intervalo de datas (YYYY-MM-DD). Vazio = qualquer prazo.
  const [filterDueRange, setFilterDueRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());
  const [filterBlocked, setFilterBlocked] = useState(false);
  // Filtros adicionais (Frente A): aproveitam campos que já existem no card.
  const [filterStages, setFilterStages] = useState<Set<string>>(new Set());     // workflow_stage_id
  const [filterSectors, setFilterSectors] = useState<Set<string>>(new Set());   // setor do responsável
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());       // item_type/marco
  const [filterParticipants, setFilterParticipants] = useState<Set<string>>(new Set());
  const [filterStartRange, setFilterStartRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [filterHoursRange, setFilterHoursRange] = useState<{ min: string; max: string }>({ min: "", max: "" });
  // Filtro por coluna (Frente B): map stageId -> ColumnFilter, persistido por projeto.
  const columnFiltersKey = `kanban-col-filters:${projectId}`;
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(`kanban-col-filters:${projectId}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(columnFiltersKey, JSON.stringify(columnFilters)); } catch { /* quota */ }
    }
  }, [columnFilters, columnFiltersKey]);
  const setColumnFilter = useCallback((stageId: string, next: ColumnFilter) => {
    setColumnFilters((prev) => {
      // Remove a chave quando o filtro fica vazio (mantém o map enxuto).
      if (!columnFilterActive(next)) {
        const { [stageId]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [stageId]: next };
    });
  }, []);
  // Busca local dentro do painel de filtros (só para a lista de responsáveis).
  const [assigneeQuery, setAssigneeQuery] = useState("");
  // Seção aberta no painel de filtros (accordion). null = todas fechadas.
  const [filterOpenSection, setFilterOpenSection] = useState<string | null>(null);

  // Carrega filtros salvos ao montar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(filtersKey);
      if (!raw) return;
      const f = JSON.parse(raw);
      if (Array.isArray(f.assignees)) setFilterAssignees(new Set(f.assignees));
      if (Array.isArray(f.phases)) setFilterPhases(new Set(f.phases));
      if (Array.isArray(f.priorities)) setFilterPriorities(new Set(f.priorities));
      if (f.dueRange && typeof f.dueRange.from === "string" && typeof f.dueRange.to === "string") setFilterDueRange(f.dueRange);
      if (Array.isArray(f.tags)) setFilterTags(new Set(f.tags));
      if (typeof f.blocked === "boolean") setFilterBlocked(f.blocked);
      if (Array.isArray(f.stages)) setFilterStages(new Set(f.stages));
      if (Array.isArray(f.sectors)) setFilterSectors(new Set(f.sectors));
      if (Array.isArray(f.types)) setFilterTypes(new Set(f.types));
      if (Array.isArray(f.participants)) setFilterParticipants(new Set(f.participants));
      if (f.startRange && typeof f.startRange.from === "string" && typeof f.startRange.to === "string") setFilterStartRange(f.startRange);
      if (f.hoursRange && typeof f.hoursRange.min === "string" && typeof f.hoursRange.max === "string") setFilterHoursRange(f.hoursRange);
    } catch { /* ignore */ }
  }, [filtersKey]);
  // Persiste os filtros (nao a busca textual, que e efemera).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(filtersKey, JSON.stringify({
        assignees: Array.from(filterAssignees),
        phases: Array.from(filterPhases),
        priorities: Array.from(filterPriorities),
        dueRange: filterDueRange,
        tags: Array.from(filterTags),
        blocked: filterBlocked,
        stages: Array.from(filterStages),
        sectors: Array.from(filterSectors),
        types: Array.from(filterTypes),
        participants: Array.from(filterParticipants),
        startRange: filterStartRange,
        hoursRange: filterHoursRange,
      }));
    } catch { /* quota */ }
  }, [filtersKey, filterAssignees, filterPhases, filterPriorities, filterDueRange, filterTags, filterBlocked, filterStages, filterSectors, filterTypes, filterParticipants, filterStartRange, filterHoursRange]);

  const dueActive = !!(filterDueRange.from || filterDueRange.to);
  const startActive = !!(filterStartRange.from || filterStartRange.to);
  const hoursActive = !!(filterHoursRange.min || filterHoursRange.max);
  const hasActiveFilters =
    search.trim() !== "" ||
    filterAssignees.size > 0 || filterPhases.size > 0 || filterPriorities.size > 0 ||
    dueActive || filterTags.size > 0 || filterBlocked ||
    filterStages.size > 0 || filterSectors.size > 0 || filterTypes.size > 0 ||
    filterParticipants.size > 0 || startActive || hoursActive;
  const clearFilters = () => {
    setSearch("");
    setFilterAssignees(new Set()); setFilterPhases(new Set()); setFilterPriorities(new Set());
    setFilterDueRange({ from: "", to: "" });
    setFilterTags(new Set()); setFilterBlocked(false); setOnlyMine(false);
    setFilterStages(new Set()); setFilterSectors(new Set()); setFilterTypes(new Set());
    setFilterParticipants(new Set()); setFilterStartRange({ from: "", to: "" }); setFilterHoursRange({ min: "", max: "" });
  };
  // Helper para alternar um valor num Set de filtro.
  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });

  // ===== Visões salvas (Item 3 da rodada final) — tabela kanban_views =====
  // Combinação nomeada de filtros + raia + ordenação + campos do card, por
  // projeto, compartilhada com o time. Some da toolbar se a migration não rodou.
  type KanbanViewConfig = {
    filters?: {
      assignees?: string[]; phases?: string[]; priorities?: string[];
      dueRange?: { from: string; to: string }; tags?: string[]; blocked?: boolean;
      stages?: string[]; sectors?: string[]; types?: string[]; participants?: string[];
      startRange?: { from: string; to: string }; hoursRange?: { min: string; max: string };
      onlyMine?: boolean;
    };
    groupBy?: string;
    cardFields?: Partial<CardFields>;
  };
  type KanbanView = { id: string; name: string; config: KanbanViewConfig; created_by: string | null };
  const [views, setViews] = useState<KanbanView[]>([]);
  const [viewsUnavailable, setViewsUnavailable] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");

  const fetchViews = useCallback(async () => {
    const { data, error } = await viewsTable()
      .select("id, name, config, created_by")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) {
      if (/kanban_views|relation|does not exist|schema cache/i.test(error.message)) setViewsUnavailable(true);
      return;
    }
    setViewsUnavailable(false);
    setViews((data as KanbanView[]) || []);
  }, [projectId]);
  useEffect(() => { fetchViews(); }, [fetchViews]);

  const buildViewConfig = (): KanbanViewConfig => ({
    filters: {
      assignees: Array.from(filterAssignees), phases: Array.from(filterPhases),
      priorities: Array.from(filterPriorities), dueRange: filterDueRange,
      tags: Array.from(filterTags), blocked: filterBlocked,
      stages: Array.from(filterStages), sectors: Array.from(filterSectors),
      types: Array.from(filterTypes), participants: Array.from(filterParticipants),
      startRange: filterStartRange, hoursRange: filterHoursRange,
      onlyMine,
    },
    groupBy, cardFields,
  });

  const applyView = (v: KanbanView) => {
    const c = v.config || {};
    const f = c.filters || {};
    setFilterAssignees(new Set(f.assignees ?? []));
    setFilterPhases(new Set(f.phases ?? []));
    setFilterPriorities(new Set(f.priorities ?? []));
    setFilterDueRange(f.dueRange ?? { from: "", to: "" });
    setFilterTags(new Set(f.tags ?? []));
    setFilterBlocked(!!f.blocked);
    setFilterStages(new Set(f.stages ?? []));
    setFilterSectors(new Set(f.sectors ?? []));
    setFilterTypes(new Set(f.types ?? []));
    setFilterParticipants(new Set(f.participants ?? []));
    setFilterStartRange(f.startRange ?? { from: "", to: "" });
    setFilterHoursRange(f.hoursRange ?? { min: "", max: "" });
    setOnlyMine(!!f.onlyMine);
    // Raia e campos do card num setPrefs só: separados, o segundo leria o
    // estado anterior ao primeiro e uma das duas mudanças se perderia.
    setPrefs({
      groupBy: (GROUP_BY_VALUES as readonly string[]).includes(c.groupBy ?? "") ? (c.groupBy as GroupByValue) : "none",
      cardFields: { ...DEFAULT_CARD_FIELDS, ...(c.cardFields ?? {}) },
    });
    setActiveViewId(v.id);
  };

  const activeView = activeViewId ? views.find((v) => v.id === activeViewId) ?? null : null;
  const viewDirty = !!activeView && JSON.stringify(buildViewConfig()) !== JSON.stringify(activeView.config);

  const saveNewView = async () => {
    const name = saveViewName.trim();
    if (!name) return;
    const { data, error } = await viewsTable()
      .insert({ project_id: projectId, name, config: buildViewConfig() })
      .select("id, name, config, created_by")
      .single();
    if (error) {
      toast({ title: "Não foi possível salvar a visão.", description: error.message, variant: "destructive" });
      return;
    }
    setViews((vs) => [...vs, data as KanbanView]);
    setActiveViewId((data as KanbanView).id);
    setSaveViewOpen(false);
    setSaveViewName("");
    toast({ title: `Visão "${name}" salva`, description: "Visível para todos que participam do projeto." });
  };

  const updateActiveView = async () => {
    if (!activeView) return;
    const config = buildViewConfig();
    const { error } = await viewsTable()
      .update({ config, updated_at: new Date().toISOString() })
      .eq("id", activeView.id);
    if (error) {
      toast({ title: "Não foi possível atualizar a visão.", description: error.message, variant: "destructive" });
      return;
    }
    setViews((vs) => vs.map((v) => (v.id === activeView.id ? { ...v, config } : v)));
    toast({ title: `Visão "${activeView.name}" atualizada` });
  };

  const deleteView = async (v: KanbanView) => {
    const { error } = await viewsTable().delete().eq("id", v.id);
    if (error) {
      toast({ title: "Não foi possível excluir a visão.", description: error.message, variant: "destructive" });
      return;
    }
    setViews((vs) => vs.filter((x) => x.id !== v.id));
    if (activeViewId === v.id) setActiveViewId(null);
    toast({ title: `Visão "${v.name}" excluída` });
  };

  // Colunas de bloqueio (para o filtro "Bloqueadas").
  const blockedStageIdSet = useMemo(
    () => new Set(stages.filter((s) => s.is_blocked).map((s) => s.id)),
    [stages],
  );

  // Ids que são pais de alguém (agrupadores de fato), derivado das atividades.
  const parentIdsWithChildren = useMemo(() => {
    const s = new Set<string>();
    activities.forEach((a) => { const p = a.parent_id; if (p) s.add(p); });
    return s;
  }, [activities]);

  /** Filhos por pai — a barra de progresso passa a medir trabalho feito
   *  (subatividades concluídas) em vez de posição no quadro. */
  const filhosPorPai = useMemo(() => {
    const m = new Map<string, SubActivityLike[]>();
    activities.forEach((a) => {
      if (!a.parent_id) return;
      const arr = m.get(a.parent_id) || [];
      // `is_milestone` vai junto: marco entra na média como 0 ou 100, nunca
      // pelo meio — arrastá-lo para "Em Revisão" não realiza meio marco.
      arr.push({ status: a.status, workflow_stage_id: a.workflow_stage_id, is_milestone: a.is_milestone });
      m.set(a.parent_id, arr);
    });
    return m;
  }, [activities]);

  // Tipo EAP de uma atividade (fonte única: lib/eapModel). Três papéis:
  // Fase/Entrega (agrupa; cobre 'pacote' legado e itens com filhos), Atividade, Marco.
  const activityEapType = useCallback((a: Activity): string => {
    return resolveEapKind(a, parentIdsWithChildren.has(a.id));
  }, [parentIdsWithChildren]);

  /** Fase, Pacote ou Entrega — a CAIXA, que vale a média dos filhos e ignora a
   *  própria coluna. Mover a caixa não move o que está dentro dela. */
  const ehAgrupador = useCallback((a: Activity): boolean => {
    return eapCanGroup(resolveEapKind(a, parentIdsWithChildren.has(a.id)));
  }, [parentIdsWithChildren]);

  const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const matchesFilters = useCallback((a: Activity) => {
    if (filterAssignees.size > 0 && !filterAssignees.has(a.assigned_to || "")) return false;
    if (filterPhases.size > 0) {
      const key = a.phase_id || "__none__";
      if (!filterPhases.has(key)) return false;
    }
    if (filterPriorities.size > 0 && !filterPriorities.has(normalizeGut(a.priority))) return false;
    if (filterDueRange.from || filterDueRange.to) {
      // Sem prazo definido não entra num filtro por período.
      const end = a.end_date ? a.end_date.slice(0, 10) : null;
      if (!end) return false;
      if (filterDueRange.from && end < filterDueRange.from) return false;
      if (filterDueRange.to && end > filterDueRange.to) return false;
    }
    if (filterTags.size > 0) {
      const tags = a.tags || [];
      if (!tags.some((t) => filterTags.has(t))) return false;
    }
    if (filterBlocked) {
      const stageBlocked = a.workflow_stage_id ? blockedStageIdSet.has(a.workflow_stage_id) : false;
      if (!stageBlocked && !a.blocked_since) return false;
    }
    // --- Filtros adicionais (Frente A) ---
    if (filterStages.size > 0) {
      if (!a.workflow_stage_id || !filterStages.has(a.workflow_stage_id)) return false;
    }
    if (filterSectors.size > 0) {
      const s = a.assigned_to ? (profileSectorMap[a.assigned_to] || "") : "";
      if (!filterSectors.has(s || "__none__")) return false;
    }
    if (filterTypes.size > 0 && !filterTypes.has(activityEapType(a))) return false;
    if (filterParticipants.size > 0) {
      const parts = a.participants || [];
      if (!parts.some((p) => filterParticipants.has(p))) return false;
    }
    if (filterStartRange.from || filterStartRange.to) {
      const start = a.start_date ? a.start_date.slice(0, 10) : null;
      if (!start) return false;
      if (filterStartRange.from && start < filterStartRange.from) return false;
      if (filterStartRange.to && start > filterStartRange.to) return false;
    }
    if (filterHoursRange.min || filterHoursRange.max) {
      const h = Number(a.hours) || 0;
      if (filterHoursRange.min && h < Number(filterHoursRange.min)) return false;
      if (filterHoursRange.max && h > Number(filterHoursRange.max)) return false;
    }
    const q = normalize(search.trim());
    if (q) {
      const hay = normalize([a.title, a.assigned_to || "", (a.tags || []).join(" ")].join(" "));
      if (!hay.includes(q)) return false;
    }
    return true;
  }, [filterAssignees, filterPhases, filterPriorities, filterDueRange, filterTags, filterBlocked, blockedStageIdSet, filterStages, filterSectors, filterTypes, filterParticipants, filterStartRange, filterHoursRange, profileSectorMap, activityEapType, search]);

  // Matcher do filtro POR COLUNA (Frente B). Mesmos critérios do geral, menos
  // Coluna/Status e busca textual. Usa arrays (do ColumnFilter serializável).
  const matchColumnFilter = useCallback((a: Activity, f: ColumnFilter): boolean => {
    if (f.assignees.length > 0 && !f.assignees.includes(a.assigned_to || "")) return false;
    if (f.priorities.length > 0 && !f.priorities.includes(normalizeGut(a.priority))) return false;
    if (f.sectors.length > 0) {
      const s = a.assigned_to ? (profileSectorMap[a.assigned_to] || "") : "";
      if (!f.sectors.includes(s || "__none__")) return false;
    }
    if (f.types.length > 0 && !f.types.includes(activityEapType(a))) return false;
    if (f.participants.length > 0) {
      const parts = a.participants || [];
      if (!parts.some((p) => f.participants.includes(p))) return false;
    }
    if (f.tags.length > 0) {
      const tags = a.tags || [];
      if (!tags.some((t) => f.tags.includes(t))) return false;
    }
    if (f.dueRange.from || f.dueRange.to) {
      const end = a.end_date ? a.end_date.slice(0, 10) : null;
      if (!end) return false;
      if (f.dueRange.from && end < f.dueRange.from) return false;
      if (f.dueRange.to && end > f.dueRange.to) return false;
    }
    if (f.startRange.from || f.startRange.to) {
      const start = a.start_date ? a.start_date.slice(0, 10) : null;
      if (!start) return false;
      if (f.startRange.from && start < f.startRange.from) return false;
      if (f.startRange.to && start > f.startRange.to) return false;
    }
    if (f.hoursRange.min || f.hoursRange.max) {
      const h = Number(a.hours) || 0;
      if (f.hoursRange.min && h < Number(f.hoursRange.min)) return false;
      if (f.hoursRange.max && h > Number(f.hoursRange.max)) return false;
    }
    if (f.blocked) {
      const stageBlocked = a.workflow_stage_id ? blockedStageIdSet.has(a.workflow_stage_id) : false;
      if (!stageBlocked && !a.blocked_since) return false;
    }
    return true;
  }, [profileSectorMap, activityEapType, blockedStageIdSet]);

  // Opções de responsável (nomes distintos presentes nas atividades).
  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    activities.forEach((a) => { if (a.assigned_to) set.add(a.assigned_to); });
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  }, [activities]);

  // Tags distintas presentes nas atividades (para o filtro de etiquetas).
  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    activities.forEach((a) => (a.tags || []).forEach((t) => { if (t) set.add(t); }));
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  }, [activities]);

  // Setores distintos (via responsável) presentes nas atividades.
  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    activities.forEach((a) => {
      const s = a.assigned_to ? profileSectorMap[a.assigned_to] : "";
      if (s) set.add(s);
    });
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  }, [activities, profileSectorMap]);

  // Participantes distintos presentes nas atividades.
  const participantOptions = useMemo(() => {
    const set = new Set<string>();
    activities.forEach((a) => (a.participants || []).forEach((p) => { if (p) set.add(p); }));
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  }, [activities]);


  // Raias (swimlanes) derivadas do groupBy. Cada raia agrupa os cards por fase
  // ou responsável; o board renderiza as mesmas colunas dentro de cada raia.
  const lanes = useMemo(() => {
    if (groupBy === "phase") {
      const list = phases.map((p) => ({
        id: p.id, label: p.title, match: (a: Activity) => a.phase_id === p.id,
      }));
      list.push({ id: "__none__", label: "Sem fase", match: (a: Activity) => !a.phase_id });
      return list;
    }
    if (groupBy === "assignee") {
      const list = assigneeOptions.map((name) => ({
        id: name, label: name, match: (a: Activity) => (a.assigned_to || "") === name,
      }));
      list.push({ id: "__none__", label: "Sem responsável", match: (a: Activity) => !a.assigned_to });
      return list;
    }
    if (groupBy === "priority") {
      const order: { id: GutLevel; label: string }[] = [
        { id: "urgente", label: "Urgente" },
        { id: "critica", label: "Crítica" },
        { id: "alta", label: "Alta" },
        { id: "media", label: "Média" },
        { id: "baixa", label: "Baixa" },
        { id: "pendente", label: "Sem prioridade" },
      ];
      return order.map((o) => ({
        id: o.id, label: o.label, match: (a: Activity) => normalizeGut(a.priority) === o.id,
      }));
    }
    if (groupBy === "sector") {
      // Resolve o setor de uma atividade a partir do responsável.
      const sectorOf = (a: Activity) => {
        const who = a.assigned_to || "";
        return (who && profileSectorMap[who]) ? profileSectorMap[who] : "";
      };
      const set = new Set<string>();
      activities.forEach((a) => { const s = sectorOf(a); if (s) set.add(s); });
      const list = Array.from(set).sort((x, y) => x.localeCompare(y)).map((s) => ({
        id: s, label: s, match: (a: Activity) => sectorOf(a) === s,
      }));
      list.push({ id: "__none__", label: "Sem setor", match: (a: Activity) => !sectorOf(a) });
      return list;
    }
    if (groupBy === "tag") {
      const list = tagOptions.map((t) => ({
        id: t, label: t, match: (a: Activity) => (a.tags || []).includes(t),
      }));
      list.push({ id: "__none__", label: "Sem etiqueta", match: (a: Activity) => !(a.tags && a.tags.length > 0) });
      return list;
    }
    if (groupBy === "blocked") {
      const isBlk = (a: Activity) => {
        const stageBlocked = a.workflow_stage_id ? blockedStageIdSet.has(a.workflow_stage_id) : false;
        return stageBlocked || !!a.blocked_since;
      };
      return [
        { id: "blocked", label: "Bloqueadas", match: (a: Activity) => isBlk(a) },
        { id: "flowing", label: "Fluindo", match: (a: Activity) => !isBlk(a) },
      ];
    }
    if (groupBy === "due") {
      const startOfToday = new Date(new Date().toDateString());
      const endOfWeek = new Date(startOfToday); endOfWeek.setDate(endOfWeek.getDate() + (7 - startOfToday.getDay()));
      const endOfNextWeek = new Date(endOfWeek); endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
      const dueBucket = (a: Activity): string => {
        if (!a.end_date) return "nodate";
        const end = new Date(a.end_date.slice(0, 10) + "T12:00:00");
        if (end < startOfToday) return "overdue";
        if (end <= endOfWeek) return "week";
        if (end <= endOfNextWeek) return "next";
        return "later";
      };
      const order: { id: string; label: string }[] = [
        { id: "overdue", label: "Atrasadas" },
        { id: "week", label: "Esta semana" },
        { id: "next", label: "Próxima semana" },
        { id: "later", label: "Depois" },
        { id: "nodate", label: "Sem prazo" },
      ];
      return order.map((o) => ({
        id: o.id, label: o.label, match: (a: Activity) => dueBucket(a) === o.id,
      }));
    }
    if (groupBy === "customGroup") {
      const valid = laneGroups.filter((g) => g.members.length > 0);
      const list = valid.map((g) => {
        const memberSet = new Set(g.members);
        return {
          id: g.id, label: g.name || "Time",
          match: (a: Activity) => !!a.assigned_to && memberSet.has(a.assigned_to),
        };
      });
      const allGrouped = new Set(valid.flatMap((g) => g.members));
      list.push({
        id: "__none__", label: "Outros",
        match: (a: Activity) => !a.assigned_to || !allGrouped.has(a.assigned_to),
      });
      return list;
    }
    return [];
  }, [groupBy, phases, assigneeOptions, activities, profileSectorMap, tagOptions, blockedStageIdSet, laneGroups]);

  const isMineActivity = useCallback(
    (a: Activity) => {
      if (!myId && !myName) return false;
      if (myId && a.created_by === myId) return true;
      if (myId && a.assigned_to === myId) return true;
      if (myName) {
        if ((a.assigned_to || "").trim().toLowerCase() === myName) return true;
        // Resolve UUID → nome para comparação
        const resolvedName = a.assigned_to ? (profilesMap[a.assigned_to] || "").trim().toLowerCase() : "";
        if (resolvedName && resolvedName === myName) return true;
        if (Array.isArray(a.participants) && a.participants.some((p) => (p || "").trim().toLowerCase() === myName)) return true;
      }
      return false;
    },
    [myId, myName, profilesMap]
  );

  const canMutateActivity = useCallback((a?: Activity | null) => {
    if (!a) return false;
    if (isAdmin) return true;
    if (myId && a.created_by === myId) return true;
    if (myId && a.assigned_to === myId) return true;
    if (myName) {
      const assignedRaw = (a.assigned_to || "").trim().toLowerCase();
      const resolvedAssigned = a.assigned_to ? (profilesMap[a.assigned_to] || "").trim().toLowerCase() : "";
      if (assignedRaw && assignedRaw === myName) return true;
      if (resolvedAssigned && resolvedAssigned === myName) return true;
    }
    return false;
  }, [isAdmin, myId, myName, profilesMap]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef<{ stageId: string; startX: number; startWidth: number } | null>(null);

  // Largura de quem ainda não tem: divide o espaço em partes iguais. É CÁLCULO,
  // não preferência — por isso não vai para `setPrefs`. Gravar aqui criaria uma
  // linha no banco em todo primeiro acesso, com larguras que ninguém escolheu,
  // e o efeito se realimentaria (lê columnWidths, escreve columnWidths).
  const larguraPadrao = useMemo(() => {
    const visiveis = colunasDoQuadro(stages);
    if (visiveis.length === 0) return {};
    const igual = 100 / visiveis.length;
    const out: Record<string, number> = {};
    for (const s of visiveis) out[s.id] = igual;
    return out;
  }, [stages]);

  // Largura durante o arrasto: estado efêmero, fora das preferências. Cada
  // pixel do movimento entraria no debounce e viraria escrita no banco — o
  // valor só vira preferência quando a mão solta. Enquanto arrasta, a coluna
  // segue este valor; em repouso, `larguraArrastando` é null e vale a pref.
  const [larguraArrastando, setLarguraArrastando] = useState<Record<string, number> | null>(null);
  // O que a pessoa escolheu vence o padrão calculado, coluna a coluna.
  const larguraEfetiva = useMemo(
    () => ({ ...larguraPadrao, ...(larguraArrastando ?? columnWidths) }),
    [larguraPadrao, larguraArrastando, columnWidths],
  );
  // O handler de arrasto lê daqui: precisa das larguras JÁ resolvidas (com o
  // padrão preenchido), senão arrastar a primeira coluna gravaria só ela e as
  // outras voltariam ao cálculo na próxima carga.
  useEffect(() => { columnWidthsRef.current = larguraEfetiva; }, [larguraEfetiva]);

  const handleResizeStart = useCallback((e: React.MouseEvent, stageId: string, currentWidthPct: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.offsetWidth;
    const startWidth = (currentWidthPct / 100) * containerWidth;
    resizingRef.current = { stageId, startX: e.clientX, startWidth };
    let ultimo: Record<string, number> | null = null;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return;
      const diff = ev.clientX - resizingRef.current.startX;
      const newWidthPx = Math.max(160, resizingRef.current.startWidth + diff);
      const newWidthPct = (newWidthPx / containerRef.current.offsetWidth) * 100;
      setLarguraArrastando((prev) => {
        ultimo = { ...(prev ?? columnWidthsRef.current), [resizingRef.current!.stageId]: newWidthPct };
        return ultimo;
      });
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Persiste ao soltar (não a cada pixel): uma escrita por gesto.
      if (ultimo) setPrefs({ columnWidths: ultimo });
      setLarguraArrastando(null);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [setPrefs]);

  // KeyboardSensor além do ponteiro: sem ele o quadro é inoperável por teclado
  // (mover card só com mouse). O Backlog já usava este par — o Kanban ficou
  // atrás por omissão, não por decisão.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchStages = useCallback(async () => {
    const { data } = await supabase
      .from("workflow_stages")
      .select("*")
      .eq("project_id", projectId)
      .order("display_order");
    if (data) {
      const normalized = data.map((s) => ({
        ...s,
        title: getStageDisplayTitle(s.title),
        // Enquanto a migration não roda, deriva a categoria das flags antigas
        // para a UI já se comportar pela categoria. A coluna `categoria` pode
        // nem existir nos tipos gerados — leitura estrutural, sem `any`.
        categoria: parseWorkflowCategory((s as Record<string, unknown>).categoria) ?? categoryFromLegacyFlags(s),
      }));
      setStages(normalized);

      // Autocorrige no banco títulos legados com encoding ruim (ex.: Concluãda/ConcluÃda).
      const fixes = normalized.filter((s, idx) => s.title !== data[idx].title);
      if (fixes.length > 0) {
        await Promise.all(
          fixes.map((s) =>
            supabase
              .from("workflow_stages")
              .update({ title: s.title })
              .eq("id", s.id)
          )
        );
      }
    }
  }, [projectId]);

  useEffect(() => {
    fetchStages();
    // Fetch activities that have linked user stories
    supabase.from("user_stories").select("activity_id").eq("project_id", projectId).eq("is_trashed", false).not("activity_id", "is", null)
      .then(({ data }) => {
        if (data) {
          const countMap = new Map<string, number>();
          data.forEach((s) => {
            countMap.set(s.activity_id, (countMap.get(s.activity_id) || 0) + 1);
          });
          setStoryLinkedActivities(countMap);
        }
      });
    // Fetch task dependencies for badge counters
    const ids = activities.map((a) => a.id);
    if (ids.length > 0) {
      supabase
        .from("task_dependencies")
        .select("predecessor_id, successor_id")
        .or(`predecessor_id.in.(${ids.join(",")}),successor_id.in.(${ids.join(",")})`)
        .then(({ data }) => {
          const map = new Map<string, { pred: number; succ: number }>();
          (data || []).forEach((d) => {
            const p = map.get(d.successor_id) || { pred: 0, succ: 0 };
            p.pred += 1;
            map.set(d.successor_id, p);
            const s = map.get(d.predecessor_id) || { pred: 0, succ: 0 };
            s.succ += 1;
            map.set(d.predecessor_id, s);
          });
          setDependencyCounts(map);

          // Dependência BLOQUEANTE: quantas predecessoras ainda não concluídas.
          // Contagem sozinha não diz o que importa — um card pronto para começar
          // e um travado esperando outro pareciam idênticos no quadro.
          const statusById = new Map(activities.map((a) => [a.id, a.status]));
          const waiting = new Map<string, number>();
          (data || []).forEach((d) => {
            const predStatus = statusById.get(d.predecessor_id);
            // Só conta predecessora que existe neste projeto e não terminou.
            if (predStatus !== undefined && predStatus !== "completed") {
              waiting.set(d.successor_id, (waiting.get(d.successor_id) || 0) + 1);
            }
          });
          setWaitingOnCounts(waiting);
        });
      // Contagem de comentários e anexos por atividade: os dois sinais mais
      // universais de card no mercado ("tem discussão aqui", "tem arquivo").
      // Em lotes: com muitas atividades a lista de ids estoura o limite de URL
      // do proxy e a requisição volta 502 (ver lib/chunkedIn).
      selectInChunks<{ activity_id: string }>(ids, (batch) =>
        supabase
          .from("activity_comments")
          .select("activity_id")
          .in("activity_id", batch)
          .eq("is_trashed", false),
      )
        .then((data) => {
          const map = new Map<string, number>();
          (data || []).forEach((c) => {
            map.set(c.activity_id, (map.get(c.activity_id) || 0) + 1);
          });
          setCommentCounts(map);
        })
        .catch(() => setCommentCounts(new Map()));
      selectInChunks<{ activity_id: string | null }>(ids, (batch) =>
        supabase
          .from("project_documents")
          .select("activity_id")
          .in("activity_id", batch)
          .eq("is_trashed", false),
      )
        .then((data) => {
          const map = new Map<string, number>();
          (data || []).forEach((d) => {
            if (d.activity_id) map.set(d.activity_id, (map.get(d.activity_id) || 0) + 1);
          });
          setAttachmentCounts(map);
        })
        .catch(() => setAttachmentCounts(new Map()));
      // Este era o pior caso: o `.or()` monta a lista de ids DUAS vezes na mesma
      // URL, então estourava o limite do proxy com metade das atividades. Em
      // lotes, cada requisição carrega no máximo 2×50 ids.
      selectInChunks<{ id: string; source_activity_id: string; target_activity_id: string; relation_type: string }>(
        ids,
        (batch) =>
          supabase
            .from("task_relations")
            .select("id, source_activity_id, target_activity_id, relation_type")
            .or(`source_activity_id.in.(${batch.join(",")}),target_activity_id.in.(${batch.join(",")})`),
      )
        .then((data) => {
          const titleById = new Map<string, string>();
          activities.forEach((a) => titleById.set(a.id, a.title));
          const map = new Map<
            string,
            { id: string; title: string; relationId: string; relationType: string }[]
          >();
          const push = (
            key: string,
            otherId: string,
            relationId: string,
            relationType: string,
          ) => {
            const list = map.get(key) || [];
            if (!list.find((x) => x.relationId === relationId)) {
              list.push({
                id: otherId,
                title: titleById.get(otherId) || "",
                relationId,
                relationType,
              });
              map.set(key, list);
            }
          };
          (data || []).forEach((r) => {
            push(r.source_activity_id, r.target_activity_id, r.id, r.relation_type);
            push(r.target_activity_id, r.source_activity_id, r.id, r.relation_type);
          });
          setRelationCounts(map);
        })
        .catch(() => setRelationCounts(new Map()));
    } else {
      setDependencyCounts(new Map());
      setWaitingOnCounts(new Map());
      setCommentCounts(new Map());
      setAttachmentCounts(new Map());
      setRelationCounts(new Map());
    }
  }, [projectId, activities, fetchStages]);

  // Realtime sync for workflow_stages so newly created columns appear immediately
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`workflow_stages_${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workflow_stages", filter: `project_id=eq.${projectId}` },
        () => {
          fetchStages();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchStages]);

  // Realtime sync for activities so kanban updates live when other users move/edit cards.
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`kanban_activities_${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities", filter: `project_id=eq.${projectId}` },
        () => {
          // Limpa overrides otimistas locais e força recarga dos dados do projeto.
          setOptimisticMoves({});
          onDataChanged();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, onDataChanged]);

  

  /**
   * Bloquear/desbloquear "in place": a atividade permanece na coluna onde o
   * trabalho está e recebe a flag. Desbloquear é imediato; bloquear abre o
   * diálogo do motivo (o trigger no banco cuida de blocked_since e do
   * acumulado em blocked_days_total).
   */
  const handleToggleBlocked = async (activityId: string) => {
    if (projectLocked) {
      showProjectLockedToast("bloquear atividades");
      return;
    }
    const activity = activities.find((a) => a.id === activityId);
    if (!canMutateActivity(activity)) {
      toast({ title: "Somente o criador ou responsável da atividade pode bloquear.", variant: "destructive" });
      return;
    }
    if (activity?.is_blocked) {
      const { error } = await supabase
        .from("activities")
        .update({ is_blocked: false } as never)
        .eq("id", activityId);
      if (error) {
        toast({ title: "Erro ao desbloquear", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Atividade desbloqueada" });
      onDataChanged();
      return;
    }
    setBlockReason("");
    setBlockingActivity(activity ?? null);
  };

  const confirmBlockActivity = async () => {
    if (!blockingActivity) return;
    setBlockSaving(true);
    const { error } = await supabase
      .from("activities")
      .update({
        is_blocked: true,
        blocked_reason: blockReason.trim() || null,
      } as never)
      .eq("id", blockingActivity.id);
    setBlockSaving(false);
    if (error) {
      toast({ title: "Erro ao bloquear", description: error.message, variant: "destructive" });
      return;
    }
    setBlockingActivity(null);
    setBlockReason("");
    onDataChanged();
  };

  const handleMoveToBacklog = async (activityId: string) => {
    if (projectLocked) {
      showProjectLockedToast("mover atividades");
      return;
    }
    const activity = activities.find((a) => a.id === activityId);
    if (!canMutateActivity(activity)) {
      toast({ title: "Somente o criador ou responsável da atividade pode mover para backlog.", variant: "destructive" });
      return;
    }
    const backlogStage = stages.find((s) => s.display_order === 0);
    if (!backlogStage) {
      toast({ title: "Etapa de Backlog não encontrada", variant: "destructive" });
      return;
    }
    setOptimisticMoves((prev) => ({ ...prev, [activityId]: backlogStage.id }));
    await supabase
      .from("activities")
      .update({ workflow_stage_id: backlogStage.id })
      .eq("id", activityId);
    await supabase
      .from("user_stories")
      .update({ stage_id: backlogStage.id })
      .eq("activity_id", activityId); 
    onDataChanged();
  };

  /**
   * Filhos diretos que AINDA NÃO estão na coluna de destino — a lista que
   * impede o pai de andar na frente do conteúdo.
   *
   * Fonte única das duas portas de entrada (arrastar e menu "mover para"):
   * regra de negócio duplicada é regra que diverge no primeiro ajuste.
   *
   * Filho cancelado não conta: saiu do escopo, não é trabalho pendente.
   * `optimisticMoves` entra porque o filho recém-arrastado ainda não voltou do
   * banco — sem isso, mover o pai logo depois seria barrado por engano.
   *
   * Só DESCENDENTE DIRETO decide: o neto é problema do filho, e se o filho
   * está na coluna é porque a regra já foi aplicada a ele.
   */
  const filhosForaDaColuna = useCallback((paiId: string, destinoId: string) => {
    const canceladaIds = new Set(
      stages.filter((s) => parseWorkflowCategory((s as { categoria?: string }).categoria) === "cancelada")
        .map((s) => s.id),
    );
    return activities.filter((f) => {
      if (f.parent_id !== paiId) return false;
      if (f.workflow_stage_id && canceladaIds.has(f.workflow_stage_id)) return false;
      // MARCO FICA FORA DA CONTA. Ele não entra no quadro, então nunca
      // "chegaria" a coluna nenhuma — contá-lo travaria o pai para sempre em
      // qualquer fase que tenha um. Ele é ponto de controle, não trabalho
      // pendente: quem responde pelo avanço são as atividades.
      if (f.is_milestone) return false;
      return (optimisticMoves[f.id] || f.workflow_stage_id) !== destinoId;
    });
  }, [activities, optimisticMoves, stages]);

  /**
   * O PAI ACOMPANHA QUANDO TODOS OS FILHOS CHEGAM À MESMA COLUNA.
   *
   * Mover o pai não move os filhos — proposital: a caixa pode avançar antes do
   * conteúdo. O caminho inverso já existia, mas SÓ PARA A COLUNA FINAL: o
   * bloco `ancestorsToComplete` do arrasto leva o pai quando todos os filhos
   * ficam `completed`.
   *
   * O buraco era a coluna INTERMEDIÁRIA. Levar as cinco atividades de uma
   * entrega para "Em Revisão" deixava a entrega em "A Fazer", sozinha, sem
   * nada acontecendo ali — e o quadro mostrava um agrupador num lugar onde o
   * trabalho não está mais.
   *
   * Sobe RECURSIVAMENTE: se a entrega era a última pendência da fase, a fase
   * vai junto.
   *
   * `status` não é gravado (diferente do caminho da coluna final, onde a
   * conclusão dos filhos É a conclusão do pai): numa coluna intermediária não
   * há o que concluir. O percentual da caixa é a média dos filhos e ignora a
   * coluna dela (ver `isGrouper`), então o número segue verdadeiro.
   */
  const subirPaisCompletos = useCallback(async (activityId: string, stageId: string) => {
    const porId = new Map(activities.map((a) => [a.id, a]));
    const filhosDe = new Map<string, Activity[]>();
    for (const a of activities) {
      if (!a.parent_id) continue;
      filhosDe.set(a.parent_id, [...(filhosDe.get(a.parent_id) ?? []), a]);
    }
    const subiram: string[] = [];
    // `visto` protege contra ciclo em parent_id (dado corrompido): sem ele um
    // A↔B travaria o laço para sempre.
    const visto = new Set<string>([activityId]);
    let atual = porId.get(activityId);
    while (atual?.parent_id && !visto.has(atual.parent_id)) {
      visto.add(atual.parent_id);
      const pai = porId.get(atual.parent_id);
      if (!pai) break;
      // Marco fora da conta: ele não entra no quadro, então nunca chegaria a
      // esta coluna — contá-lo impediria o pai de subir para sempre.
      const irmaos = (filhosDe.get(pai.id) ?? []).filter((f) => !f.is_milestone);
      if (irmaos.length === 0) break;
      // A coluna do item recém-movido ainda não voltou do banco, então o valor
      // dele vem do argumento — não de `activities`, que está desatualizado.
      const todosLa = irmaos.every((f) =>
        (f.id === activityId ? stageId : f.workflow_stage_id) === stageId,
      );
      if (!todosLa || pai.workflow_stage_id === stageId) break;
      if (!canMutateActivity(pai)) break;
      subiram.push(pai.id);
      atual = pai;
    }
    if (subiram.length === 0) return;

    setOptimisticMoves((prev) => {
      const next = { ...prev };
      for (const id of subiram) next[id] = stageId;
      return next;
    });
    const { error } = await supabase
      .from("activities")
      .update({ workflow_stage_id: stageId } as never)
      .in("id", subiram);
    if (error) {
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        for (const id of subiram) delete next[id];
        return next;
      });
      return;
    }
    const nomes = subiram.map((id) => porId.get(id)?.title).filter(Boolean);
    toast({
      title: subiram.length === 1
        ? "A fase acompanhou"
        : `${subiram.length} agrupadores acompanharam`,
      description: `${nomes.join(", ")} — todos os itens de dentro chegaram aqui.`,
    });
  }, [activities, canMutateActivity, toast]);

  /**
   * Move o card para QUALQUER coluna do quadro. Generaliza o antigo
   * handleMoveToBacklog, que só mandava para o stage display_order=0 — uma
   * coluna que o quadro não renderiza, então o card sumia da tela sem aviso.
   */
  const handleMoveToStage = useCallback(async (activityId: string, stageId: string) => {
    if (projectLocked) {
      showProjectLockedToast("mover atividades");
      return;
    }
    const activity = activities.find((a) => a.id === activityId);
    if (!canMutateActivity(activity)) {
      toast({ title: "Somente o criador ou responsável da atividade pode mover.", variant: "destructive" });
      return;
    }
    const target = stages.find((s) => s.id === stageId);
    if (!target) return;

    // Mesma regra do arrasto: a caixa não anda na frente do conteúdo.
    const bloqueio = filhosForaDaColuna(activityId, stageId);
    if (bloqueio.length > 0) {
      const n = bloqueio.length;
      toast({
        title: "Mova o que está dentro primeiro",
        description:
          `${n} ${n === 1 ? "item ainda não está" : "itens ainda não estão"} em ` +
          `"${getStageDisplayTitle(target.title)}": ${bloqueio.slice(0, 3).map((f) => `"${f.title}"`).join(", ")}` +
          `${n > 3 ? ` e mais ${n - 3}` : ""}. Quando o último chegar, a fase acompanha sozinha.`,
        variant: "destructive",
      });
      return;
    }

    const previousStageId = activity?.workflow_stage_id ?? null;

    setOptimisticMoves((prev) => ({ ...prev, [activityId]: stageId }));
    const { error } = await supabase
      .from("activities")
      .update({ workflow_stage_id: stageId } as never)
      .eq("id", activityId);
    if (error) {
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        delete next[activityId];
        return next;
      });
      toast({ title: "Não foi possível mover a atividade.", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("user_stories").update({ stage_id: stageId } as never).eq("activity_id", activityId);

    // Desfazer: mover é a ação mais fácil de errar no quadro (um clique no
    // submenu errado) e a mais barata de reverter — é só o stage anterior.
    toast({
      title: `Movida para "${getStageDisplayTitle(target.title)}"`,
      action: previousStageId ? (
        <ToastAction
          altText="Desfazer"
          onClick={async () => {
            setOptimisticMoves((prev) => ({ ...prev, [activityId]: previousStageId }));
            await supabase
              .from("activities")
              .update({ workflow_stage_id: previousStageId } as never)
              .eq("id", activityId);
            await supabase.from("user_stories").update({ stage_id: previousStageId } as never).eq("activity_id", activityId);
            onDataChanged();
          }}
        >
          Desfazer
        </ToastAction>
      ) : undefined,
    });
    await subirPaisCompletos(activityId, stageId);
    onDataChanged();
  }, [activities, canMutateActivity, filhosForaDaColuna, onDataChanged, projectLocked, showProjectLockedToast, stages, subirPaisCompletos, toast]);

  /** Duplica a atividade (com a subárvore). A capacidade já existia em
   *  lib/duplicateActivity, usada só dentro do diálogo de edição. */
  const handleDuplicateActivity = useCallback(async (activityId: string) => {
    if (projectLocked) {
      showProjectLockedToast("duplicar atividades");
      return;
    }
    try {
      const { duplicateActivity } = await import("@/lib/duplicateActivity");
      await duplicateActivity({ activityId, includeChildren: true });
      toast({ title: "Atividade duplicada", description: "As subtarefas também foram duplicadas." });
      onDataChanged();
    } catch (e) {
      toast({
        title: "Erro ao duplicar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  }, [onDataChanged, projectLocked, showProjectLockedToast, toast]);

  // Atribuir, Prazo, Converter e Copiar link saíram do menu do card
  // (decisão de produto 29/07/2026): o menu só carrega o que o diálogo de
  // edição não cobre, e clicar no card já abre o diálogo. Os handlers foram
  // removidos junto — prop opcional sem consumidor é feature invisível que
  // compila limpa (foi exatamente o bug do menu em 8925146).

  const openLinkParent = useCallback((activityId: string, currentParentId: string | null) => {
    setLinkParentIds([activityId]);
    setLinkParentCurrent(currentParentId);
  }, []);

  // Clear optimistic moves when activities prop changes (parent refetched)
  useEffect(() => {
    setOptimisticMoves({});
  }, [activities]);

  const subActivityCounts = useMemo(() => {
    // Constrói árvore parent -> filhos diretos e calcula total de descendentes (recursivo)
    const childrenMap = new Map<string, string[]>();
    activities.forEach((a) => {
      if (a.parent_id) {
        if (!childrenMap.has(a.parent_id)) childrenMap.set(a.parent_id, []);
        childrenMap.get(a.parent_id)!.push(a.id);
      }
    });
    const counts = new Map<string, number>();
    const countDescendants = (id: string, visited: Set<string>): number => {
      if (visited.has(id)) return 0;
      visited.add(id);
      const direct = childrenMap.get(id) || [];
      let total = direct.length;
      for (const childId of direct) {
        total += countDescendants(childId, visited);
      }
      return total;
    };
    activities.forEach((a) => {
      if (childrenMap.has(a.id)) {
        counts.set(a.id, countDescendants(a.id, new Set()));
      }
    });
    return counts;
  }, [activities]);

  // Mapa de horas consumidas/planejadas por atividade
  // - Consumo automático: horas planejadas entram no consumo ao concluir
  // - Com subs: consumo vem da soma das subatividades concluídas
  // - Sem subs: consumo do próprio item quando concluído
  const hoursStatsByActivity = useMemo(() => {
    const childrenMap = new Map<string, Activity[]>();
    activities.forEach((a) => {
      if (a.parent_id) {
        const arr = childrenMap.get(a.parent_id) || [];
        arr.push(a);
        childrenMap.set(a.parent_id, arr);
      }
    });
    const map = new Map<string, HoursStat>();

    // Rollup recursivo: um nó com filhos agrega planejado/consumido de TODA a
    // subárvore (fase → pacote → atividade), não só dos filhos diretos. Sem isso,
    // as horas de um neto não sobem para a fase. Folhas usam as próprias horas.
    const walk = (a: Activity, seen = new Set<string>()): HoursStat => {
      if (map.has(a.id)) return map.get(a.id)!;
      if (seen.has(a.id)) return { planned: 0, consumed: 0, hasSubs: false };
      const nextSeen = new Set(seen);
      nextSeen.add(a.id);

      const kids = childrenMap.get(a.id) || [];
      if (kids.length > 0) {
        let planned = 0;
        let consumed = 0;
        kids.forEach((c) => {
          const sub = walk(c, nextSeen);
          planned += sub.planned;
          consumed += sub.consumed;
        });
        const stat: HoursStat = { planned, consumed, hasSubs: true };
        map.set(a.id, stat);
        return stat;
      }

      const ownH = toHoursNumber(a.hours);
      const stat: HoursStat = {
        planned: ownH,
        consumed: a.status === "completed" ? ownH : 0,
        hasSubs: false,
      };
      map.set(a.id, stat);
      return stat;
    };

    activities.forEach((a) => walk(a));
    return map;
  }, [activities]);

  const activitiesByStage = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    stages.forEach((s) => (map[s.id] = []));

    /**
     * MARCO NÃO ENTRA NO QUADRO (14/08/2026).
     *
     * Kanban mede TRABALHO passando por estágios. Marco não passa: ele
     * acontece — é um ponto no tempo, sem duração, horas ou custo. O lugar
     * dele é o Backlog (a lista do que existe) e o Cronograma (o losango do
     * Gantt), onde a data é o que importa.
     *
     * Já vínhamos tapando o buraco de trás para a frente: o marco valia 0 ou
     * 100 porque a régua das colunas não servia para ele. A causa era estar
     * numa régua que não é a dele.
     *
     * O gesto de atingir passa a ser um BOTÃO no Backlog e no Cronograma —
     * arrastar deixa de ser o único caminho.
     *
     * "onlyMine" sempre se aplica; o filtro geral/coluna é decidido POR coluna.
     */
    const semMarcos = activities.filter((a) => !a.is_milestone);
    const source = onlyMine ? semMarcos.filter(isMineActivity) : semMarcos;
    source.forEach((a) => {
      // Use optimistic override if available
      const stageId = optimisticMoves[a.id] || a.workflow_stage_id;
      if (stageId && map[stageId]) {
        map[stageId].push(a);
      } else if (stages.length > 0) {
        map[stages[0].id].push(a);
      }
    });

    // Filtro por coluna SUBSTITUI o geral: se a coluna tem filtro próprio,
    // aplica só ele; caso contrário, aplica o filtro geral do quadro.
    Object.keys(map).forEach((stageId) => {
      const colFilter = columnFilters[stageId];
      if (colFilter && columnFilterActive(colFilter)) {
        map[stageId] = map[stageId].filter((a) => matchColumnFilter(a, colFilter));
      } else if (hasActiveFilters) {
        map[stageId] = map[stageId].filter(matchesFilters);
      }
    });

    // Ordem base: posição manual (display_order). Quem ordena de fato é cada
    // coluna, por sortStageItems — este passo só garante um ponto de partida
    // estável.
    //
    // Antes aqui havia um sort por fase + posição, com o comentário "Default
    // sort by WBS asc". Ele era descartado no passo seguinte, porque a coluna
    // reordenava tudo por "updated:desc". O comentário descrevia um
    // comportamento que não acontecia — a ordem por EAP virou uma OPÇÃO do
    // menu de ordenação, onde ela é escolhida de propósito.
    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) => (a.display_order ?? 999999) - (b.display_order ?? 999999));
    });

    return map;
  }, [activities, stages, phases, optimisticMoves, onlyMine, isMineActivity, hasActiveFilters, matchesFilters, columnFilters, matchColumnFilter]);

  const handleCreateStory = async () => {
    if (projectLocked) {
      showProjectLockedToast("criar histórias");
      return;
    }
    if (!createStoryActivity || !createStoryTitle.trim()) return;
    setCreateStoryLoading(true);

    // Use the activity's own workflow stage, or fall back to the first workflow stage
    let stageId = createStoryActivity.workflow_stage_id || null;
    if (!stageId) {
      const { data: stagesData } = await supabase
        .from("workflow_stages")
        .select("id")
        .eq("project_id", projectId)
        .order("display_order", { ascending: true })
        .limit(1);
      stageId = stagesData?.[0]?.id || null;
    }

    const { error } = await supabase.from("user_stories").insert({
      project_id: projectId,
      activity_id: createStoryActivity.id,
      phase_id: createStoryActivity.phase_id,
      title: createStoryTitle.trim(),
      narrative: createStoryNarrative.trim(),
      persona: "",
      action: "",
      benefit: "",
      acceptance_criteria: [],
      priority: "medium",
      status: "draft",
      stage_id: stageId,
    });
    setCreateStoryLoading(false);
    if (error) {
      toast({ title: "Erro ao criar história", description: error.message, variant: "destructive" });
    } else {
      setStoryLinkedActivities((prev) => {
        const next = new Map(prev);
        next.set(createStoryActivity.id, (next.get(createStoryActivity.id) || 0) + 1);
        return next;
      });
      setCreateStoryActivity(null);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    if (id.startsWith("col-")) {
      setActiveId(id);
      setDragType("column");
    } else {
      setActiveId(id);
      setDragType("card");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (projectLocked) {
      setActiveId(null);
      setDragType(null);
      showProjectLockedToast("mover atividades");
      return;
    }
    setActiveId(null);
    setDragType(null);
    const { active, over } = event;
    if (!over) return;

    // Handle column reordering
    if (dragType === "column") {
      const activeColId = (active.id as string).replace("col-", "");
      const overColId = (over.id as string).replace("col-", "");
      if (activeColId === overColId) return;

      // A coluna de entrada APARECE no quadro mas não entra no arrasto: ela é
      // definida por `display_order = 0` e trocá-la de lugar mudaria onde as
      // atividades nascem. Arrastar outra para cima dela também não a desloca —
      // as demais são renumeradas a partir de 1.
      const reordenaveis = stages.filter((s) => !ehColunaDeEntrada(s));
      const oldIndex = reordenaveis.findIndex((s) => s.id === activeColId);
      const newIndex = reordenaveis.findIndex((s) => s.id === overColId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(reordenaveis, oldIndex, newIndex);
      // Update local state immediately
      const backlogStages = stages.filter(ehColunaDeEntrada);
      const updatedStages = [
        ...backlogStages,
        ...reordered.map((s, i) => ({ ...s, display_order: i + 1 })),
      ];
      setStages(updatedStages);

      // Persist to database
      try {
        await Promise.all(
          reordered.map((s, i) =>
            supabase
              .from("workflow_stages")
              .update({ display_order: i + 1 })
              .eq("id", s.id)
          )
        );
        onDataChanged();
      } catch {
        toast({ title: "Erro ao reordenar colunas", variant: "destructive" });
        fetchStages();
      }
      return;
    }

    // Handle card movement between stages
    const activityId = active.id as string;
    const overId = over.id as string;

    let targetStageId: string | null = null;

    if (overId.startsWith("stage-")) {
      // Em raias o id e "stage-{id}--{laneId}" — pega so o stageId.
      targetStageId = overId.replace("stage-", "").split("--")[0];
    } else if (overId.startsWith("col-")) {
      targetStageId = overId.replace("col-", "").split("--")[0];
    } else {
      const overActivity = activities.find((a) => a.id === overId);
      if (overActivity) {
        targetStageId = overActivity.workflow_stage_id || (stages.length > 0 ? stages[0].id : null);
      }
    }

    if (!targetStageId) return;

    const draggedActivity = activities.find((a) => a.id === activityId);
    if (!canMutateActivity(draggedActivity)) {
      toast({ title: "Somente o criador ou responsável da atividade pode mover no kanban.", variant: "destructive" });
      return;
    }
    const currentStageId = draggedActivity?.workflow_stage_id || (stages.length > 0 ? stages[0].id : null);

    // REORDENAR DENTRO DA COLUNA. Antes este caso só dava `return`: arrastar um
    // card para outra posição na mesma coluna não gravava nada, e a ordem
    // voltava ao recarregar. Jira, Linear e Trello tratam a posição como dado
    // do quadro — é o gesto central de um Kanban.
    if (targetStageId === currentStageId) {
      // Só reordena se soltou SOBRE outro card; soltar no vazio da coluna não
      // define posição nenhuma.
      const overActivity = activities.find((a) => a.id === overId);
      if (!overActivity || overActivity.id === activityId) return;

      const naColuna = (activitiesByStage[targetStageId] || []).filter((a) => !a.parent_id);
      const de = naColuna.findIndex((a) => a.id === activityId);
      const para = naColuna.findIndex((a) => a.id === overId);
      if (de < 0 || para < 0 || de === para) return;

      const reordenado = [...naColuna];
      const [movido] = reordenado.splice(de, 1);
      reordenado.splice(para, 0, movido);

      // Sem atualização otimista aqui: `activities` vem por prop, e
      // optimisticMoves só guarda COLUNA, não posição. O onDataChanged no fim
      // recarrega — o custo é um piscar, não uma ordem errada na tela.
      // A ordem é do PROJETO, não preferência individual (como no Linear):
      // grava em activities.display_order, que todos leem.
      const resultados = await Promise.all(
        reordenado.map((a, i) =>
          supabase.from("activities").update({ display_order: i + 1 }).eq("id", a.id),
        ),
      );
      if (resultados.some((r) => r.error)) {
        toast({ title: "Erro ao reordenar", variant: "destructive" });
      }
      onDataChanged();
      return;
    }

    // A antiga "regra container" (pai com subatividades só movia por automação,
    // salvo admin) saiu: o menu "Mover para →" nunca a aplicou, então o mesmo
    // card que o menu movia o arraste recusava — incoerência pura. A automação
    // que leva o pai para Final quando as subs concluem continua valendo; o
    // movimento manual apenas convive com ela, como sempre conviveu via menu.

    const stage = stages.find((s) => s.id === targetStageId);

    // Limite de WIP RÍGIDO (opt-in por coluna, wip_strict): impede o drop que
    // ultrapassaria o limite. Sem isto o limite só avisava depois do fato — e um
    // limite que nunca impede é decorativo, exatamente a crítica que a
    // literatura Kanban faz. Colunas sem wip_strict seguem só sinalizando.
    if (stage?.wip_limit != null && stage.wip_limit > 0 && stage.wip_strict) {
      const currentInTarget = activities.filter(
        (a) => (optimisticMoves[a.id] || a.workflow_stage_id) === targetStageId && a.id !== activityId,
      ).length;
      if (currentInTarget >= stage.wip_limit) {
        toast({
          title: `"${getStageDisplayTitle(stage.title)}" está no limite de WIP`,
          description: `A coluna aceita ${stage.wip_limit} e já tem ${currentInTarget}. Conclua ou mova algo antes de trazer mais trabalho.`,
          variant: "destructive",
        });
        return;
      }
    }

    const newStatus = stage?.is_final ? "completed" : "pending";

    /**
     * A CAIXA NÃO ANDA NA FRENTE DO CONTEÚDO.
     *
     * Antes a trava valia só para a coluna FINAL e olhava `status`: dava para
     * arrastar uma fase de "A Fazer" para "Em Revisão" com as onze tarefas
     * paradas atrás. O quadro dizia que a fase estava em revisão sem que
     * ninguém tivesse revisado coisa alguma.
     *
     * Agora vale para QUALQUER coluna e olha ONDE os filhos estão: o pai só
     * entra numa coluna quando todos os filhos vivos já estão nela — que é o
     * mesmo critério pelo qual o pai SOBE sozinho quando o último filho chega
     * (`subirPaisCompletos`). Os dois sentidos passam a ter uma regra só.
     *
     * Filho cancelado não trava: saiu do escopo, não é trabalho pendente.
     *
     * Só DESCENDENTES DIRETOS decidem. O neto é problema do filho — se ele
     * está na coluna, é porque a regra já foi aplicada a ele.
     */
    if (draggedActivity) {
      const foraDaColuna = filhosForaDaColuna(draggedActivity.id, targetStageId);
      if (foraDaColuna.length > 0) {
        const n = foraDaColuna.length;
        const amostra = foraDaColuna.slice(0, 3).map((f) => `"${f.title}"`).join(", ");
        toast({
          title: "Mova o que está dentro primeiro",
          description:
            `${n} ${n === 1 ? "item ainda não está" : "itens ainda não estão"} em ` +
            `"${getStageDisplayTitle(stage?.title || "")}": ${amostra}${n > 3 ? ` e mais ${n - 3}` : ""}. ` +
            "Quando o último chegar, a fase acompanha sozinha.",
          variant: "destructive",
        });
        return;
      }
    }

    // Optimistic update — move card instantly in the UI (após validações)
    setOptimisticMoves((prev) => ({ ...prev, [activityId]: targetStageId! }));

    const completedAt = stage?.is_final ? new Date().toISOString() : null;

    // Fire DB update in background
    Promise.resolve(
      (async () => {
        await supabase
          .from("activities")
          .update({
            workflow_stage_id: targetStageId,
            status: newStatus,
            completed_at: completedAt,
          })
          .eq("id", activityId);

        await supabase
          .from("user_stories")
          .update({ stage_id: targetStageId })
          .eq("activity_id", activityId);

        // Recalcula os pais: só ficam concluídos quando 100% dos filhos diretos estiverem concluídos.
        const { data: stageRows } = await supabase
          .from("workflow_stages")
          .select("id, title, display_order, is_final")
          .eq("project_id", projectId)
          .order("display_order", { ascending: true });

        const normalized = (value: string | null | undefined) =>
          (value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();

        const stageList = stageRows || [];
        const finalStageId =
          targetStageId && stage?.is_final
            ? targetStageId
            : stageList.find((s) => s.is_final)?.id || null;
        const explicitAFazer = stageList.find((s) => {
          const title = normalized(s.title);
          return title === "a fazer" || title === "afazer" || title.includes("a fazer");
        });
        const displayOrderOne = stageList.find((s) => !s.is_final && s.display_order === 1);
        const firstActiveStage = stageList.find((s) => !s.is_final && s.display_order > 0);
        const backlogStage = stageList.find((s) => s.display_order === 0);
        const reopenStageId = (explicitAFazer || displayOrderOne || firstActiveStage || backlogStage)?.id || null;

        const { data: hierarchyRows } = await supabase
          .from("activities")
          .select("id,parent_id,status")
          .eq("project_id", projectId)
          .eq("is_trashed", false);

        const parentById = new Map<string, string | null>();
        const childrenByParent = new Map<string, string[]>();
        const statusById = new Map<string, string>();

        (hierarchyRows || []).forEach((row) => {
          parentById.set(row.id, row.parent_id || null);
          statusById.set(row.id, row.status || "pending");
          if (!row.parent_id) return;
          const arr = childrenByParent.get(row.parent_id) || [];
          arr.push(row.id);
          childrenByParent.set(row.parent_id, arr);
        });

        statusById.set(activityId, newStatus);

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
          const childIds = childrenByParent.get(ancestorId) || [];
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
          const completePayload: { status: string; completed_at: string; workflow_stage_id?: string } =
            { status: "completed", completed_at: new Date().toISOString() };
          if (finalStageId) completePayload.workflow_stage_id = finalStageId;
          await supabase.from("activities").update(completePayload).in("id", ancestorsToComplete);
          if (finalStageId) {
            await supabase.from("user_stories").update({ stage_id: finalStageId })
              .in("activity_id", ancestorsToComplete);
          }
        }

        if (ancestorsToReopen.length > 0) {
          const reopenPayload: { status: string; completed_at: string | null; workflow_stage_id?: string } =
            { status: "pending", completed_at: null };
          if (reopenStageId) reopenPayload.workflow_stage_id = reopenStageId;
          await supabase.from("activities").update(reopenPayload).in("id", ancestorsToReopen);
          if (reopenStageId) {
            await supabase.from("user_stories").update({ stage_id: reopenStageId })
              .in("activity_id", ancestorsToReopen);
          }
        }

        // COLUNA INTERMEDIÁRIA: o bloco acima só leva o pai para a FINAL, e
        // só quando os filhos ficam `completed`. Levar as cinco tarefas de uma
        // entrega para "Em Revisão" não conclui nada — mas deixa a entrega
        // sozinha na coluna antiga. Aqui ela acompanha.
        if (!stage?.is_final && targetStageId) {
          await subirPaisCompletos(activityId, targetStageId);
        }
      })()
    )
      .then(() => onDataChanged())
      .catch(() => {
        setOptimisticMoves((prev) => {
          const next = { ...prev };
          delete next[activityId];
          return next;
        });
        toast({ title: "Erro ao mover atividade", variant: "destructive" });
      });

    // Send notification in background (don't block)
    if (stage?.is_blocked && draggedActivity) {
      supabase.rpc("generate_overdue_notifications", { p_project_id: projectId }).then(() => {});
    }
  };

  const handleCreateActivity = async (stageId: string, title: string, phaseId: string | null, displayOrder: number | null) => {
    // Regra: toda atividade nova nasce no Backlog (display_order 0).
    // O usuário moverá manualmente para a coluna desejada do Kanban.
    const backlogStage =
      stages.find(s => /backlog/i.test(s.title)) ||
      stages.find(s => s.display_order === 0) ||
      stages[0];
    const targetStageId = backlogStage?.id ?? stageId;
    // Card novo entra no FIM da coluna, não no topo. Com ordem manual, "no
    // topo" seria furar a fila que alguém montou — e o comportamento anterior
    // (ordem por atualização) já colocava todo card novo em primeiro por
    // acidente, não por decisão.
    const ultimaPosicao = (activitiesByStage[targetStageId] || [])
      .reduce((max, a) => Math.max(max, a.display_order ?? 0), 0);
    const { error } = await supabase.from("activities").insert({
      project_id: projectId,
      title,
      phase_id: phaseId,
      status: "pending",
      display_order: ultimaPosicao + 1,
    });
    if (error) {
      toast({ title: "Erro ao criar atividade", description: error.message, variant: "destructive" });
    } else {
      onDataChanged();
    }
  };


  // A coluna de entrada (Backlog) entra aqui desde 12/08/2026 — ver
  // `colunasDoQuadro` em kanban/shared para o porquê e as referências.
  const visibleStages = useMemo(() => colunasDoQuadro(stages), [stages]);

  /**
   * Colunas ocultas e quantas tarefas há em cada uma.
   *
   * Ocultar é do PROJETO (workflow_stages.is_visible), então a coluna some para
   * todo mundo — e sem rastro algum no quadro. Pior: a tarefa continua com
   * aquele status e some junto, sem aparecer em lugar nenhum. O marcador ao
   * fim do quadro existe para isso não ser silencioso.
   */
  const hiddenStages = useMemo(() => colunasOcultas(stages), [stages]);
  const countByStage = useMemo(() => {
    const m = new Map<string, number>();
    activities.forEach((a) => {
      if (!a.workflow_stage_id) return;
      m.set(a.workflow_stage_id, (m.get(a.workflow_stage_id) ?? 0) + 1);
    });
    return m;
  }, [activities]);
  /**
   * Atalhos de teclado do quadro (referência: Linear).
   *  N  nova tarefa na primeira coluna
   *  /  foca a busca
   *  M  alterna "só minhas"
   *  Esc limpa a busca
   * Ignora quando o foco está em campo de texto ou há modificador — senão
   * digitar "n" numa busca criaria tarefa.
   */
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable;

      if (e.key === "Escape" && typing && el === searchInputRef.current) {
        setSearch("");
        searchInputRef.current?.blur();
        return;
      }
      if (typing) return;

      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "n" || e.key === "N") {
        if (!canCreate) return;
        // De propósito pula a coluna de entrada: o atalho é para começar a
        // trabalhar numa tarefa, não para engrossar a fila. Quem quer somar ao
        // Backlog usa o "+" da própria coluna, que agora está à vista.
        const first = stages.find((s) => !ehColunaDeEntrada(s) && s.is_visible !== false);
        if (first && onOpenCreateTask) {
          e.preventDefault();
          onOpenCreateTask(first.id);
        }
        return;
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setOnlyMine((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canCreate, onOpenCreateTask, stages]);

  /** Destinos do "Mover para →": as mesmas colunas que o seletor de status do
   *  diálogo de edição oferece, com a MESMA marcação.
   *
   *  Antes o Kanban listava coluna oculta sem nenhum sinal, enquanto a edição
   *  listava a mesma coluna com o selo "oculta" — dois tratamentos para o mesmo
   *  dado. Aqui a coluna oculta continua sendo um destino possível (é assim que
   *  se aposenta uma etapa sem perder o histórico), mas `hidden` faz o menu
   *  avisar que o cartão vai sumir do quadro. */
  const moveTargets = useMemo(
    () =>
      [...stages]
        .sort((a, b) => a.display_order - b.display_order)
        .map((s) => ({
          id: s.id,
          title: getStageDisplayTitle(s.title),
          color: s.color,
          hidden: s.is_visible === false,
        })),
    [stages],
  );

  // ===== Stage management handlers (admin/gestor only) =====
  const handleCreateStage = useCallback(async (title: string) => {
    const normalizedTitle = getStageDisplayTitle(title.trim());
    const maxOrder = stages.reduce((max, s) => Math.max(max, s.display_order), -1);
    const colorIdx = stages.length % STAGE_PRESET_COLORS.length;
    // O nome só SUGERE a categoria inicial; ela é editável no menu da coluna
    // e nunca mais muda sozinha. "Concluída" já existente impede duplicar a
    // categoria de conclusão (índice único no banco).
    let suggested = suggestCategoryFromTitle(normalizedTitle);
    if (suggested === "concluida" && stages.some((s) => s.categoria === "concluida")) {
      suggested = "andamento";
    }
    // `as never`: os tipos gerados do Supabase ainda não conhecem `categoria`
    // (serão regerados após a migration). O fallback abaixo cobre o banco
    // que ainda não tem a coluna.
    const basePayload = {
      project_id: projectId,
      title: normalizedTitle,
      color: STAGE_PRESET_COLORS[colorIdx],
      display_order: maxOrder + 1,
      categoria: suggested,
      is_final: suggested === "concluida",
    } as never;
    let { error } = await supabase.from("workflow_stages").insert(basePayload);
    if (error && /categoria/i.test(error.message || "")) {
      // Banco ainda sem a migration da categoria: cria só com o essencial.
      const compat = await supabase.from("workflow_stages").insert({
        project_id: projectId,
        title: normalizedTitle,
        color: STAGE_PRESET_COLORS[colorIdx],
        display_order: maxOrder + 1,
        is_final: suggested === "concluida",
      });
      error = compat.error;
    }
    if (error) {
      toast({ title: "Erro ao criar coluna", description: error.message, variant: "destructive" });
    } else {
      fetchStages();
    }
  }, [stages, projectId, toast, fetchStages]);

  // Renomear altera APENAS o título. A semântica mora na categoria, escolhida
  // explicitamente no menu da coluna — antes daqui, renomear "Concluída" para
  // "Entregue ao cliente" desmarcava is_final em silêncio e derrubava o
  // progresso de todas as atividades da coluna.
  const handleRenameStage = useCallback(async (id: string, title: string) => {
    const normalizedTitle = getStageDisplayTitle(title.trim());
    if (!normalizedTitle) return;
    const { error } = await supabase
      .from("workflow_stages")
      .update({ title: normalizedTitle })
      .eq("id", id);
    if (error) toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
    else fetchStages();
  }, [toast, fetchStages]);

  const handleDeleteStage = useCallback(async (id: string) => {
    const stage = stages.find((s) => s.id === id);
    if (stage && stage.display_order === 0) {
      toast({ title: "A etapa Backlog não pode ser excluída", variant: "destructive" });
      return;
    }
    const ok = await appConfirm({
      title: "Excluir coluna do Kanban?",
      description: "Atividades nesta coluna perderão a associação. Esta ação não pode ser desfeita.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("workflow_stages").delete().eq("id", id);
    if (error) toast({ title: "Erro ao excluir", variant: "destructive" });
    else { fetchStages(); }
  }, [stages, toast, appConfirm, fetchStages]);

  const handleChangeStageColor = useCallback(async (id: string, color: string) => {
    await supabase.from("workflow_stages").update({ color }).eq("id", id);
    fetchStages();
  }, [fetchStages]);

  const handleToggleStageFinal = useCallback(async (id: string, current: boolean) => {
    await supabase.from("workflow_stages").update({ is_final: !current, ...(current ? {} : { is_blocked: false }) }).eq("id", id);
    fetchStages();
  }, [fetchStages]);

  const handleToggleStageBlocked = useCallback(async (id: string, current: boolean) => {
    await supabase.from("workflow_stages").update({ is_blocked: !current, ...(current ? {} : { is_final: false }) }).eq("id", id);
    fetchStages();
  }, [fetchStages]);

  const handleSetStageProgress = useCallback(async (id: string, current: number | null | undefined) => {
    const initial = current == null ? "" : String(current);
    const input = window.prompt(
      "Defina o progresso desta coluna (0-100). Deixe em branco para automático por posição.",
      initial,
    );
    if (input === null) return;

    const raw = input.trim();
    let progress: number | null = null;
    if (raw.length > 0) {
      const parsed = Number(raw.replace(",", "."));
      if (!Number.isFinite(parsed)) {
        toast({ title: "Percentual inválido", description: "Informe um número entre 0 e 100.", variant: "destructive" });
        return;
      }
      progress = Math.max(0, Math.min(100, Math.round(parsed)));
    }

    const { error } = await supabase
      .from("workflow_stages")
      .update({ progress_percent: progress, contributes_to_progress: progress === null ? undefined : true } as never)
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao salvar progresso", description: error.message, variant: "destructive" });
      return;
    }
    fetchStages();
  }, [toast, fetchStages]);

  const handleSetStageWipLimit = useCallback(async (id: string, current: number | null | undefined) => {
    const initial = current == null ? "" : String(current);
    const input = window.prompt(
      "Defina o limite de cards (WIP) desta coluna. Deixe em branco para remover o limite.",
      initial,
    );
    if (input === null) return;

    const raw = input.trim();
    let limit: number | null = null;
    if (raw.length > 0) {
      const parsed = Number(raw.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast({ title: "Limite inválido", description: "Informe um número inteiro ≥ 0.", variant: "destructive" });
        return;
      }
      limit = Math.max(0, Math.round(parsed));
    }

    const { error } = await supabase
      .from("workflow_stages")
      .update({ wip_limit: limit } as never)
      .eq("id", id);

    if (error) {
      // Coluna wip_limit ainda não aplicada na VM: avisa sem quebrar.
      if (/wip_limit/i.test(error.message)) {
        toast({
          title: "Limite de WIP indisponível",
          description: "A migration wip_limit ainda não foi aplicada no banco. Rode-a na VM para habilitar.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Erro ao salvar limite", description: error.message, variant: "destructive" });
      return;
    }
    fetchStages();
  }, [toast, fetchStages]);

  /** Alterna entre limite de WIP que só avisa e limite que IMPEDE o drop. */
  const handleToggleStageWipStrict = useCallback(async (id: string, current: boolean) => {
    const next = !current;
    const { error } = await supabase
      .from("workflow_stages")
      .update({ wip_strict: next } as never)
      .eq("id", id);

    if (error) {
      // Mesmo padrão do wip_limit: se a migration não rodou na VM, avisa em vez
      // de estourar um erro técnico na cara do usuário.
      if (/wip_strict/i.test(error.message)) {
        toast({
          title: "Limite rígido indisponível",
          description: "A migration wip_strict ainda não foi aplicada no banco. Rode scripts/apply-workflow-stage-wip-strict.sh na VM.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Erro ao alterar o limite", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: next ? "Limite rígido ativado" : "Limite volta a apenas avisar",
      description: next
        ? "O quadro passa a impedir trazer mais cards ao atingir o limite."
        : undefined,
    });
    fetchStages();
  }, [toast, fetchStages]);

  const handleToggleStageContributes = useCallback(async (id: string, current: boolean | undefined) => {
    const next = current === false;
    const { error } = await supabase
      .from("workflow_stages")
      .update({ contributes_to_progress: next } as never)
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao atualizar contribuição", description: error.message, variant: "destructive" });
      return;
    }
    fetchStages();
  }, [toast, fetchStages]);

  const handleToggleStageVisible = useCallback(async (id: string, current: boolean) => {
    await supabase.from("workflow_stages").update({ is_visible: !current }).eq("id", id);
    fetchStages();
  }, [fetchStages]);

  // Aplica de uma vez o que a tela "Gerenciar colunas" montou. Ela edita uma
  // CÓPIA e só chega aqui no Salvar, então este é o único ponto que escreve.
  //
  // Ordem: excluir → alterar → criar → reordenar. Excluir antes evita gastar
  // ordem com linha que vai sumir; reordenar por último trabalha sobre a lista
  // final, já com as novas dentro.
  const handleSalvarColunas = useCallback(async (plano: PlanoDeSalvamento) => {
    const falhas: string[] = [];

    for (const id of plano.excluidas) {
      const { error } = await supabase.from("workflow_stages").delete().eq("id", id);
      if (error) falhas.push(`excluir: ${error.message}`);
    }

    for (const l of plano.alteradas) {
      const titulo = getStageDisplayTitle(l.title.trim());
      const { error } = await supabase
        .from("workflow_stages")
        .update({
          title: titulo,
          color: l.color,
          progress_percent: l.progress_percent,
          wip_limit: l.wip_limit,
          is_visible: l.is_visible,
          categoria: l.categoria,
          // `is_final` é a leitura legada de "concluída" — o quadro pré-migration
          // ainda depende dela. Mantidas em acordo para os dois caminhos darem a
          // mesma resposta; divergir faria o progresso mudar conforme quem lê.
          is_final: l.categoria === "concluida",
        } as never)
        .eq("id", l.id);
      if (error) falhas.push(`"${titulo}": ${error.message}`);
    }

    // As novas entram no fim; a reordenação logo abaixo põe cada uma no lugar.
    let ordemLivre = stages.reduce((m, s) => Math.max(m, s.display_order), 0) + 1;
    const idPorChave = new Map<string, string>();
    for (const l of plano.criadas) {
      const titulo = getStageDisplayTitle(l.title.trim());
      if (!titulo) continue;
      // A categoria vem ESCOLHIDA da tabela — o palpite pelo título só
      // pré-preenche o campo lá, e a pessoa vê e confirma. Antes ele era
      // gravado direto e virava definitivo.
      // Continua valendo a precaução do índice único: se outra coluna já é a
      // "concluída" do projeto, o insert falharia depois de a pessoa salvar.
      let categoria = l.categoria;
      if (categoria === "concluida" && stages.some((s) => s.categoria === "concluida")) {
        categoria = "andamento";
      }
      const base = {
        project_id: projectId,
        title: titulo,
        color: l.color,
        display_order: ordemLivre++,
        progress_percent: l.progress_percent,
        wip_limit: l.wip_limit,
        is_visible: l.is_visible,
        categoria,
        is_final: categoria === "concluida",
      };
      let criado = await supabase.from("workflow_stages").insert(base as never).select("id").single();
      if (criado.error && /categoria/i.test(criado.error.message || "")) {
        const { categoria: _fora, ...semCategoria } = base;
        criado = await supabase.from("workflow_stages").insert(semCategoria as never).select("id").single();
      }
      if (criado.error) falhas.push(`criar "${titulo}": ${criado.error.message}`);
      else if (criado.data?.id) idPorChave.set(l.id, criado.data.id);
    }

    if (plano.ordem) {
      // Troca as chaves temporárias ("novo:0") pelos ids que o banco devolveu.
      const ids = plano.ordem.map((id) => idPorChave.get(id) ?? id).filter((id) => !id.startsWith("novo:"));
      // A partir de 1, NUNCA de 0: `display_order = 0` é o que marca a coluna
      // de entrada. Numerando de 0, a primeira coluna reordenada assumiria esse
      // papel e passaria a receber tudo que nasce no projeto — e a entrada
      // original viraria uma coluna comum. A entrada é excluída da renumeração.
      const idEntrada = stages.find(ehColunaDeEntrada)?.id;
      const resultados = await Promise.all(
        ids
          .filter((id) => id !== idEntrada)
          .map((id, i) =>
            supabase.from("workflow_stages").update({ display_order: i + 1 }).eq("id", id),
          ),
      );
      const erro = resultados.find((r) => r.error);
      if (erro?.error) falhas.push(`ordem: ${erro.error.message}`);
    }

    if (plano.entrada) {
      // Desmarca a anterior ANTES de marcar a nova: o banco tem índice único
      // parcial de uma entrada por projeto, e marcar primeiro colidiria.
      const novaEntrada = idPorChave.get(plano.entrada) ?? plano.entrada;
      const anterior = stages.find(ehColunaDeEntrada);
      if (anterior && anterior.id !== novaEntrada) {
        const r = await supabase
          .from("workflow_stages")
          .update({ is_entry_point: false } as never)
          .eq("id", anterior.id);
        if (r.error && !/is_entry_point/i.test(r.error.message || "")) {
          falhas.push(`entrada: ${r.error.message}`);
        }
      }
      const r = await supabase
        .from("workflow_stages")
        .update({ is_entry_point: true } as never)
        .eq("id", novaEntrada);
      if (r.error) {
        // Coluna ausente = migration não rodou: o quadro segue no comportamento
        // antigo (a primeira é a entrada) em vez de acusar erro à toa.
        if (/is_entry_point|column|schema cache/i.test(r.error.message || "")) {
          toast({
            title: "Coluna de entrada não pôde ser alterada",
            description: "Aplique a migration apply-coluna-de-entrada.sh na VM para habilitar.",
            variant: "destructive",
          });
        } else {
          falhas.push(`entrada: ${r.error.message}`);
        }
      }
    }

    await fetchStages();

    if (falhas.length > 0) {
      toast({
        title: falhas.length === 1 ? "Uma mudança não foi salva" : `${falhas.length} mudanças não foram salvas`,
        description: falhas[0],
        variant: "destructive",
      });
    }
  }, [projectId, stages, fetchStages, toast]);

  // As 8 ações de administrar coluna, num objeto só. Memoizado porque vai como
  // prop: literal inline recriaria a identidade a cada render do quadro.
  const acoesDeColuna = useMemo(() => ({
    onRename: handleRenameStage,
    onDelete: handleDeleteStage,
    onChangeColor: handleChangeStageColor,
    onSetProgress: handleSetStageProgress,
    onSetWipLimit: handleSetStageWipLimit,
    onToggleWipStrict: handleToggleStageWipStrict,
    onToggleContributes: handleToggleStageContributes,
    onToggleFinal: handleToggleStageFinal,
    onToggleVisible: handleToggleStageVisible,
  }), [
    handleRenameStage, handleDeleteStage, handleChangeStageColor,
    handleSetStageProgress, handleSetStageWipLimit, handleToggleStageWipStrict,
    handleToggleStageContributes, handleToggleStageFinal, handleToggleStageVisible,
  ]);

  const activeActivity = dragType === "card" && activeId ? activities.find((a) => a.id === activeId) : null;
  const activeColumn = dragType === "column" && activeId ? visibleStages.find((s) => `col-${s.id}` === activeId) : null;

  // "Tarefas do Dia" - quality only: activities where end_date or last_update_date <= today
  const dailyTasks = useMemo(() => {
    if (!isQualityProject) return [];
    const todayStr = new Date().toISOString().split("T")[0];
    const source = onlyMine ? activities.filter(isMineActivity) : activities;
    return source.filter((a) => {
      if (a.status === "completed") return false;
      const endMatch = a.end_date && a.end_date <= todayStr;
      const updateMatch = a.last_update_date && a.last_update_date <= todayStr;
      return endMatch || updateMatch;
    });
  }, [activities, isQualityProject, onlyMine, isMineActivity]);


  if (stages.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Carregando etapas do workflow...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-1.5 mt-2">
      {/* Toolbar — filtros + densidade */}
      <div className="flex items-center gap-2 px-2 flex-wrap">
        {/* Busca */}
        <div className="relative w-full max-w-[240px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefa..."
            className="h-7 pl-8 pr-7 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* FILTROS — um único painel com tudo */}
        {(() => {
          const activeCount =
            filterAssignees.size + filterPhases.size + filterPriorities.size +
            (dueActive ? 1 : 0) + filterTags.size + (filterBlocked ? 1 : 0) +
            filterStages.size + filterSectors.size + filterTypes.size +
            filterParticipants.size + (startActive ? 1 : 0) + (hoursActive ? 1 : 0) +
            (onlyMine ? 1 : 0);

          const PRIORITIES: [string, string, string][] = [
            ["urgente", "Urgente", "bg-red-500"],
            ["critica", "Crítica", "bg-orange-500"],
            ["alta", "Alta", "bg-amber-500"],
            ["media", "Média", "bg-sky-500"],
            ["baixa", "Baixa", "bg-emerald-500"],
          ];
          // Formata YYYY-MM-DD -> dd/mm (sem drift de fuso).
          const fmtBr = (ymd: string) => {
            if (!ymd) return "";
            const [y, m, d] = ymd.split("-");
            return `${d}/${m}`;
          };


          const filteredAssignees = assigneeQuery.trim()
            ? assigneeOptions.filter((n) => normalize(n).includes(normalize(assigneeQuery.trim())))
            : assigneeOptions;

          // Resumo textual do que está selecionado em cada seção (mostrado quando fechada).
          const priorityLabelMap: Record<string, string> = { urgente: "Urgente", critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa" };
          const summaryAssignee = filterAssignees.size === 0 ? "Todos"
            : filterAssignees.size === 1 ? (profilesMap[[...filterAssignees][0]] ?? [...filterAssignees][0])
            : `${filterAssignees.size} selecionados`;
          const summaryPriority = filterPriorities.size === 0 ? "Todas"
            : filterPriorities.size === 1 ? priorityLabelMap[[...filterPriorities][0]]
            : `${filterPriorities.size} selecionadas`;
          const summaryDue = !dueActive ? "Qualquer"
            : filterDueRange.from && filterDueRange.to ? `${fmtBr(filterDueRange.from)} – ${fmtBr(filterDueRange.to)}`
            : filterDueRange.from ? `A partir de ${fmtBr(filterDueRange.from)}`
            : `Até ${fmtBr(filterDueRange.to)}`;
          const summaryPhase = filterPhases.size === 0 ? "Todas" : `${filterPhases.size} selecionada${filterPhases.size > 1 ? "s" : ""}`;
          const summaryTags = filterTags.size === 0 ? "Todas"
            : filterTags.size === 1 ? [...filterTags][0]
            : `${filterTags.size} selecionadas`;
          // Resumo genérico para Sets multi-seleção.
          const summarySet = (s: Set<string>, one?: string, all = "Todos") =>
            s.size === 0 ? all : s.size === 1 ? (one ?? [...s][0]) : `${s.size} selecionados`;
          const stageTitleOf = (id: string) => stages.find((st) => st.id === id)?.title ?? id;
          const summaryStage = filterStages.size === 0 ? "Todas"
            : filterStages.size === 1 ? stageTitleOf([...filterStages][0])
            : `${filterStages.size} selecionadas`;
          const summarySector = summarySet(filterSectors);
          const summaryParticipant = summarySet(filterParticipants);
          // 'pacote' é tipo legado do banco e nunca aparece como opção; entra
          // aqui só para o resumo do filtro não sair vazio se vier no dado.
          const EAP_LABELS: Record<string, string> = { ...EAP_LABELS_CANON, pacote: EAP_LABELS_CANON.entrega };
          const summaryType = filterTypes.size === 0 ? "Todos"
            : filterTypes.size === 1 ? EAP_LABELS[[...filterTypes][0]]
            : `${filterTypes.size} selecionados`;
          const summaryStart = !startActive ? "Qualquer"
            : filterStartRange.from && filterStartRange.to ? `${fmtBr(filterStartRange.from)} – ${fmtBr(filterStartRange.to)}`
            : filterStartRange.from ? `A partir de ${fmtBr(filterStartRange.from)}`
            : `Até ${fmtBr(filterStartRange.to)}`;
          const summaryHours = !hoursActive ? "Qualquer"
            : filterHoursRange.min && filterHoursRange.max ? `${filterHoursRange.min}–${filterHoursRange.max}h`
            : filterHoursRange.min ? `≥ ${filterHoursRange.min}h`
            : `≤ ${filterHoursRange.max}h`;

          // Cabeçalho clicável de cada seção do accordion.
          const AccordionSection = ({ id, label, summary, active, children }: {
            id: string; label: string; summary: string; active: boolean; children: React.ReactNode;
          }) => {
            const open = filterOpenSection === id;
            return (
              <div className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => setFilterOpenSection(open ? null : id)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="text-[13px] font-medium text-foreground">{label}</span>
                  <span className={cn("ml-auto text-xs truncate max-w-[140px]", active ? "text-primary font-medium" : "text-muted-foreground")}>
                    {summary}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
                </button>
                {open && <div className="px-4 pb-3 pt-0.5">{children}</div>}
              </div>
            );
          };

          return (
            <Popover onOpenChange={(o) => { if (!o) { setAssigneeQuery(""); setFilterOpenSection(null); } }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-7 gap-1.5 text-xs", activeCount > 0 && "border-primary text-primary")}>
                  <Filter className="w-3.5 h-3.5" />
                  Filtros
                  {activeCount > 0 && (
                    <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {activeCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[300px] p-0" collisionPadding={12}>
                {/* Cabeçalho */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold">Filtros</span>
                  </div>
                  {activeCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1 transition-colors"
                    >
                      <XIcon className="w-3.5 h-3.5" /> Limpar
                    </button>
                  )}
                </div>

                {/* Aviso: colunas com filtro próprio ignoram este filtro geral */}
                {Object.keys(columnFilters).length > 0 && (
                  <div className="flex items-start gap-2 px-4 py-2 bg-warning/10 border-b border-warning/20 text-[11px] text-warning">
                    <Filter className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>
                      {Object.keys(columnFilters).length} coluna(s) com filtro próprio — nelas vale só o filtro da coluna, não este.
                    </span>
                  </div>
                )}

                {/* Seções recolhíveis */}
                <AccordionSection id="assignee" label="Responsável" summary={summaryAssignee} active={filterAssignees.size > 0}>
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={assigneeQuery}
                      onChange={(e) => setAssigneeQuery(e.target.value)}
                      placeholder="Buscar pessoa..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <div className="max-h-[220px] overflow-y-auto -mx-1 px-1 space-y-0.5">
                    {filteredAssignees.length === 0 && (
                      <div className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhuma pessoa</div>
                    )}
                    {filteredAssignees.map((name) => {
                      const active = filterAssignees.has(name);
                      const resolved = profilesMap[name] ?? name;
                      const avatar = resolveAvatarFromLookup(name, resolved, profileAvatarMap);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleInSet(setFilterAssignees, name)}
                          className={cn(
                            "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                            active ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                          )}
                        >
                          <Avatar className="h-4 w-4 shrink-0">
                            {avatar ? <AvatarImage src={avatar} alt={resolved} /> : null}
                            <AvatarFallback className="text-[7px] font-semibold">{getAvatarInitials(resolved)}</AvatarFallback>
                          </Avatar>
                          <span className="truncate flex-1">{resolved}</span>
                          {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </AccordionSection>

                <AccordionSection id="priority" label="Prioridade" summary={summaryPriority} active={filterPriorities.size > 0}>
                  <FilterOptionList
                    options={PRIORITIES.map(([v, label]) => ({ value: v, label }))}
                    selected={(v) => filterPriorities.has(v)}
                    onToggle={(v) => toggleInSet(setFilterPriorities, v)}
                    dot={(v) => PRIORITIES.find((p) => p[0] === v)?.[2]}
                  />
                </AccordionSection>

                <AccordionSection id="due" label="Prazo" summary={summaryDue} active={dueActive}>
                  {/* Campos De/Até com date-picker nativo do navegador (localizado, digitável).
                      Compactos e empilhados para nunca estourar a largura do painel. */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="w-8 text-xs text-muted-foreground shrink-0">De</label>
                      <DateField
                        value={filterDueRange.from}
                        max={filterDueRange.to || undefined}
                        onChange={(v) => setFilterDueRange((r) => ({ ...r, from: v }))}
                        className="h-8 text-xs flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-8 text-xs text-muted-foreground shrink-0">Até</label>
                      <DateField
                        value={filterDueRange.to}
                        min={filterDueRange.from || undefined}
                        onChange={(v) => setFilterDueRange((r) => ({ ...r, to: v }))}
                        className="h-8 text-xs flex-1"
                      />
                    </div>
                    {dueActive && (
                      <button
                        type="button"
                        onClick={() => setFilterDueRange({ from: "", to: "" })}
                        className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                      >
                        <XIcon className="w-3 h-3" /> Limpar período
                      </button>
                    )}
                  </div>
                </AccordionSection>

                {phases.length > 0 && (
                  <AccordionSection id="phase" label="Fase" summary={summaryPhase} active={filterPhases.size > 0}>
                    <FilterOptionList
                      options={[...phases.map((p) => ({ value: p.id, label: p.title })), { value: "__none__", label: "Sem fase" }]}
                      selected={(v) => filterPhases.has(v)}
                      onToggle={(v) => toggleInSet(setFilterPhases, v)}
                      searchPlaceholder="Buscar fase..."
                    />
                  </AccordionSection>
                )}

                {tagOptions.length > 0 && (
                  <AccordionSection id="tags" label="Etiquetas" summary={summaryTags} active={filterTags.size > 0}>
                    <FilterOptionList
                      options={tagOptions.map((t) => ({ value: t, label: t }))}
                      selected={(v) => filterTags.has(v)}
                      onToggle={(v) => toggleInSet(setFilterTags, v)}
                      searchPlaceholder="Buscar etiqueta..."
                    />
                  </AccordionSection>
                )}

                {/* Coluna / Status do fluxo. Inclui a coluna de entrada: ela
                    aparece no quadro, então filtrar por ela precisa funcionar —
                    antes o filtro a omitia e não havia como isolar a fila. */}
                {stages.length > 0 && (
                  <AccordionSection id="stage" label="Coluna / Status" summary={summaryStage} active={filterStages.size > 0}>
                    <FilterOptionList
                      options={stages.map((s) => ({ value: s.id, label: s.title }))}
                      selected={(v) => filterStages.has(v)}
                      onToggle={(v) => toggleInSet(setFilterStages, v)}
                      searchPlaceholder="Buscar coluna..."
                    />
                  </AccordionSection>
                )}

                {/* Setor */}
                {sectorOptions.length > 0 && (
                  <AccordionSection id="sector" label="Setor" summary={summarySector} active={filterSectors.size > 0}>
                    <FilterOptionList
                      options={[...sectorOptions.map((s) => ({ value: s, label: s })), { value: "__none__", label: "Sem setor" }]}
                      selected={(v) => filterSectors.has(v)}
                      onToggle={(v) => toggleInSet(setFilterSectors, v)}
                    />
                  </AccordionSection>
                )}

                {/* Tipo EAP */}
                <AccordionSection id="type" label="Tipo (EAP)" summary={summaryType} active={filterTypes.size > 0}>
                  <FilterOptionList
                    options={(["fase", "entrega", "atividade", "marco"] as const).map((t) => ({ value: t, label: EAP_LABELS[t] }))}
                    selected={(v) => filterTypes.has(v)}
                    onToggle={(v) => toggleInSet(setFilterTypes, v)}
                  />
                </AccordionSection>

                {/* Participante */}
                {participantOptions.length > 0 && (
                  <AccordionSection id="participant" label="Participante" summary={summaryParticipant} active={filterParticipants.size > 0}>
                    <FilterOptionList
                      options={participantOptions.map((p) => ({ value: p, label: profilesMap[p] ?? p }))}
                      selected={(v) => filterParticipants.has(v)}
                      onToggle={(v) => toggleInSet(setFilterParticipants, v)}
                      searchPlaceholder="Buscar participante..."
                    />
                  </AccordionSection>
                )}

                {/* Início (intervalo De/Até) */}
                <AccordionSection id="start" label="Início" summary={summaryStart} active={startActive}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="w-8 text-xs text-muted-foreground shrink-0">De</label>
                      <DateField value={filterStartRange.from} max={filterStartRange.to || undefined}
                        onChange={(v) => setFilterStartRange((r) => ({ ...r, from: v }))}
                        className="h-8 text-xs flex-1" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-8 text-xs text-muted-foreground shrink-0">Até</label>
                      <DateField value={filterStartRange.to} min={filterStartRange.from || undefined}
                        onChange={(v) => setFilterStartRange((r) => ({ ...r, to: v }))}
                        className="h-8 text-xs flex-1" />
                    </div>
                    {startActive && (
                      <button type="button" onClick={() => setFilterStartRange({ from: "", to: "" })}
                        className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1">
                        <XIcon className="w-3 h-3" /> Limpar
                      </button>
                    )}
                  </div>
                </AccordionSection>

                {/* Horas (faixa mín/máx) */}
                <AccordionSection id="hours" label="Horas" summary={summaryHours} active={hoursActive}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="w-10 text-xs text-muted-foreground shrink-0">Mín</label>
                      <Input type="number" min="0" placeholder="0" value={filterHoursRange.min}
                        onChange={(e) => setFilterHoursRange((r) => ({ ...r, min: e.target.value }))}
                        className="h-8 text-xs flex-1" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-10 text-xs text-muted-foreground shrink-0">Máx</label>
                      <Input type="number" min="0" placeholder="—" value={filterHoursRange.max}
                        onChange={(e) => setFilterHoursRange((r) => ({ ...r, max: e.target.value }))}
                        className="h-8 text-xs flex-1" />
                    </div>
                    {hoursActive && (
                      <button type="button" onClick={() => setFilterHoursRange({ min: "", max: "" })}
                        className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1">
                        <XIcon className="w-3 h-3" /> Limpar
                      </button>
                    )}
                  </div>
                </AccordionSection>

                {/* Minhas: era botão solto na toolbar; como filtro que é, mora
                    aqui (Fase 2). O atalho M continua alternando de fora. */}
                <div className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOnlyMine((v) => !v)}
                    title="Líder, Participante ou Criador — atalho M"
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-[13px] font-medium text-foreground">Apenas minhas tarefas</span>
                    <span className={cn(
                      "ml-auto w-9 h-5 rounded-full relative transition-colors shrink-0",
                      onlyMine ? "bg-primary" : "bg-muted-foreground/30",
                    )}>
                      <span className={cn(
                        "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform",
                        onlyMine && "translate-x-4",
                      )} />
                    </span>
                  </button>
                </div>

                {/* Bloqueadas: toggle simples direto no cabeçalho da seção */}
                <div className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setFilterBlocked((v) => !v)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-[13px] font-medium text-foreground">Apenas bloqueadas</span>
                    <span className={cn(
                      "ml-auto w-9 h-5 rounded-full relative transition-colors shrink-0",
                      filterBlocked ? "bg-primary" : "bg-muted-foreground/30",
                    )}>
                      <span className={cn(
                        "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform",
                        filterBlocked && "translate-x-4",
                      )} />
                    </span>
                  </button>
                </div>

                {/* Rodapé: contador de resultado */}
                <div className="px-4 py-2 border-t bg-muted/30 text-[11px] text-muted-foreground">
                  {activities.filter((a) => matchesFilters(a) && (!onlyMine || isMineActivity(a))).length} de {activities.length} atividades
                </div>
              </PopoverContent>
            </Popover>
          );
        })()}

        {(hasActiveFilters || onlyMine) && (
          <>
            <span className="text-[11px] text-muted-foreground">
              {activities.filter((a) => matchesFilters(a) && (!onlyMine || isMineActivity(a))).length} de {activities.length}
            </span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={clearFilters}>
              <XIcon className="w-3.5 h-3.5" /> Limpar
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
        {/* VISÕES — Raias e Campos do card num botão só (ver VisoesMenu).
            "Minhas" saiu da régua: era botão aqui E linha dentro de Filtros,
            duplicando o mesmo estado (e acendendo o badge de um painel que a
            pessoa nem abriu). Ficou onde ele de fato pertence — em Filtros,
            porque reduz QUAIS tarefas aparecem. O atalho M segue igual. */}
        {(() => {
          const laneOptions: { id: typeof groupBy; label: string; icon: React.ReactNode }[] = [
            { id: "none", label: "Sem raias", icon: <XIcon className="w-3.5 h-3.5" /> },
            { id: "phase", label: "Por fase", icon: <Layers className="w-3.5 h-3.5" /> },
            { id: "assignee", label: "Por responsável", icon: <User className="w-3.5 h-3.5" /> },
            { id: "sector", label: "Por setor", icon: <Building2 className="w-3.5 h-3.5" /> },
            { id: "priority", label: "Por prioridade", icon: <Flag className="w-3.5 h-3.5" /> },
            { id: "tag", label: "Por etiqueta", icon: <TagIcon className="w-3.5 h-3.5" /> },
            { id: "due", label: "Por prazo", icon: <CalendarIcon className="w-3.5 h-3.5" /> },
            { id: "blocked", label: "Por bloqueio", icon: <AlertCircle className="w-3.5 h-3.5" /> },
            { id: "customGroup", label: "Por time", icon: <Users className="w-3.5 h-3.5" /> },
          ];
          return (
            <VisoesMenu
              laneOptions={laneOptions}
              groupBy={groupBy}
              onGroupByChange={(id) => setGroupBy(id as typeof groupBy)}
              onManageGroups={() => setManageGroupsOpen(true)}
              cardFields={cardFields}
              onToggleCardField={toggleCardField}
              onRestoreCardFields={() => setPrefs({ cardFields: DEFAULT_CARD_FIELDS })}
              alerta={hiddenStages.some((s) => (countByStage.get(s.id) ?? 0) > 0)}
            />
          );
        })()}
        {/* COLUNAS — vizinho de Visões porque é da mesma família: o que o
            quadro mostra. Antes só existia no FIM da fila de colunas, onde só
            aparecia depois de rolar o quadro inteiro até a direita. O ponto
            âmbar é o mesmo aviso de tarefa presa em coluna oculta. */}
        {(isAdmin || canCreate) && (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-7 gap-1.5 text-xs",
              hiddenStages.some((s) => (countByStage.get(s.id) ?? 0) > 0) && "border-warning text-warning",
            )}
            onClick={() => setGerenciarColunasOpen(true)}
            title="Nome, cor, progresso, limite de WIP, visibilidade e ordem das colunas"
          >
            <List className="w-3.5 h-3.5 shrink-0" />
            Colunas
            {hiddenStages.some((s) => (countByStage.get(s.id) ?? 0) > 0) && (
              <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" title="Há tarefa em coluna oculta" />
            )}
          </Button>
        )}
        {/* "Por time" depende de existir um time cadastrado, mas o cadastro
            estava escondido dois níveis abaixo, no fim do menu de outra função —
            quem não sabia que existia, não achava. Com a raia por time ativa, o
            acesso fica ao lado, visível. Extra: sem nenhum time cadastrado, o
            botão se explica em vez de deixar o quadro vazio sem motivo. */}
        {groupBy === "customGroup" && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setManageGroupsOpen(true)}
            title="Criar e editar os times usados nas raias"
          >
            <Users className="w-3.5 h-3.5" />
            {laneGroups.length === 0 ? "Criar um time" : `Times (${laneGroups.length})`}
          </Button>
        )}
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visibleStages.map((s) => `col-${s.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          {/* overflow-x-auto: com muitas colunas o quadro rola em vez de
              espremer cada uma até o card ficar ilegível (ver MIN_COLUMN_WIDTH). */}
          <div ref={containerRef} className="flex pb-4 pt-2 px-2 w-full overflow-x-auto rounded-lg bg-muted/40" style={{ minHeight: 400 }}>
          {/* Tarefas do Dia - Quality Only */}
          {isQualityProject && (
            <div
              className="relative min-w-0 rounded-xl border flex flex-col overflow-hidden bg-orange-500/10 border-orange-500/40"
              style={{ flex: `1 1 ${100 / (visibleStages.length + 1)}%`, marginRight: 6 }}
            >
              <div className="p-2 border-b border-orange-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
                    <h3 className="text-sm font-semibold text-foreground truncate">Tarefas do Dia</h3>
                  </div>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 min-w-[20px] text-center bg-orange-500/20 text-orange-600">
                    {dailyTasks.length}
                  </Badge>
                </div>
              </div>
              <div className="flex-1 p-2 space-y-2 min-h-[120px] overflow-y-auto">
                {dailyTasks.length === 0 ? (
                  <div className="flex items-center justify-center h-20 border-2 border-dashed border-orange-500/20 rounded-lg">
                    <p className="text-xs text-muted-foreground/50">Nenhuma tarefa pendente hoje ✅</p>
                  </div>
                ) : (
                  dailyTasks.map((activity) => (
                    <KanbanCard
                      key={`daily-${activity.id}`}
                      activity={activity}
                      phases={phases}
                      onEdit={() => openDetail(activity)}
                      onDelete={() => onDeleteActivity(activity.id)}
                      onToggle={() => onToggleActivity(activity.id, activity.status)}
                      onDuplicate={() => handleDuplicateActivity(activity.id)}
                      onMoveToStage={(stageId) => handleMoveToStage(activity.id, stageId)}
                      moveTargets={moveTargets}
                      isAdmin={isAdmin}
                      isBlocked={!!activity.is_blocked}
                      onToggleBlocked={() => handleToggleBlocked(activity.id)}
                      hasStory={storyLinkedActivities.has(activity.id)}
                      storyCount={storyLinkedActivities.get(activity.id) || 0}
                      onStoryClick={() => { setStoryDrawerActivityId(activity.id); setStoryDrawerOpen(true); }}
                      onCreateStory={() => {
                        if (projectLocked) {
                          showProjectLockedToast("criar histórias");
                          return;
                        }
                        setCreateStoryActivity(activity);
                        setCreateStoryTitle("");
                        setCreateStoryNarrative("");
                      }}
                      isQualityProject={isQualityProject}
                      subActivityCount={subActivityCounts.get(activity.id) || 0}
                      progress={computeActivityProgress(activity.workflow_stage_id, stages, activity.last_progress_stage_id, filhosPorPai.get(activity.id), activity.is_milestone, ehAgrupador(activity))}
                      cardFields={cardFields}
                      hoursStat={hoursStatsByActivity.get(activity.id)}
                      profilesMap={profilesMap}
                      profileAvatarMap={profileAvatarMap}
                    />
                  ))
                )}
              </div>
            </div>
          )}
          {(() => {
          const renderColumn = (stage: WorkflowStage, idx: number, laneMatch?: (a: Activity) => boolean, laneId?: string) => {
            const base = activitiesByStage[stage.id] || [];
            const stageActivities = laneMatch ? base.filter(laneMatch) : base;
            const widthPct = larguraEfetiva[stage.id] || (100 / visibleStages.length);
            return (
              <SortableColumn
                key={laneId ? `${laneId}-${stage.id}` : stage.id}
                laneId={laneId}
                collapsed={collapsedStages.has(stage.id)}
                onToggleCollapse={toggleCollapsedStage}
                colSort={prefs.columnSorts[stage.id] ?? DEFAULT_BOARD_SORT}
                onChangeColSort={setColumnSort}
                onAbrirGerenciarColunas={() => setGerenciarColunasOpen(true)}
                columnFilterSlot={
                  <ColumnFilterPanel
                    stageId={stage.id}
                    filter={columnFilters[stage.id] ?? EMPTY_COLUMN_FILTER}
                    onChange={setColumnFilter}
                    assigneeOptions={assigneeOptions}
                    sectorOptions={sectorOptions}
                    participantOptions={participantOptions}
                    tagOptions={tagOptions}
                    profilesMap={profilesMap}
                  />
                }
                stage={stage}
                stageActivities={stageActivities}
                activities={activities}
                phases={phases}
                widthPct={widthPct}
                isLast={idx === visibleStages.length - 1}
                onEditActivity={openDetail}
                onDeleteActivity={onDeleteActivity}
                onToggleActivity={onToggleActivity}
                onMoveToStage={handleMoveToStage}
                moveTargets={moveTargets}
                onDuplicateActivity={handleDuplicateActivity}
                onToggleBlocked={handleToggleBlocked}
                onLinkParent={canManageHierarchy ? openLinkParent : undefined}
                onCreateActivity={handleCreateActivity}
                storyLinkedActivities={storyLinkedActivities}
                isAdmin={isAdmin}
                canCreate={canCreate}
                onResizeStart={handleResizeStart}
                onStoryClick={(activityId) => { setStoryDrawerActivityId(activityId); setStoryDrawerOpen(true); }}
                onCreateStory={(activity) => {
                  if (projectLocked) {
                    showProjectLockedToast("criar histórias");
                    return;
                  }
                  setCreateStoryActivity(activity);
                  setCreateStoryTitle("");
                  setCreateStoryNarrative("");
                }}
                isQualityProject={isQualityProject}
                onOpenCreateTask={onOpenCreateTask}
                subActivityCounts={subActivityCounts}
                dependencyCounts={dependencyCounts}
                waitingOnCounts={waitingOnCounts}
                commentCounts={commentCounts}
                attachmentCounts={attachmentCounts}
                relationCounts={relationCounts}
                hoursStatsByActivity={hoursStatsByActivity}
                onOpenRelated={(activityId) => {
                  const target = activities.find((a) => a.id === activityId);
                  if (target) {
                    openDetail(target);
                  } else {
                    toast({
                      title: "Atividade vinculada não encontrada",
                      description: "A atividade pode estar em outro projeto ou foi removida.",
                      variant: "destructive",
                    });
                  }
                }}
                onRemoveRelation={async (relationId) => {
                  const { error } = await supabase
                    .from("task_relations")
                    .delete()
                    .eq("id", relationId);
                  if (error) {
                    toast({
                      title: "Erro ao remover vínculo",
                      description: error.message,
                      variant: "destructive",
                    });
                    return;
                  }
                  setRelationCounts((prev) => {
                    const next = new Map(prev);
                    next.forEach((list, key) => {
                      const filtered = list.filter((r) => r.relationId !== relationId);
                      if (filtered.length === 0) next.delete(key);
                      else next.set(key, filtered);
                    });
                    return next;
                  });
                }}
                isAdminOrGestor={isAdmin || canCreate}
                onRenameStage={handleRenameStage}
                onDeleteStage={handleDeleteStage}
                onChangeStageColor={handleChangeStageColor}
                onSetStageProgress={handleSetStageProgress}
                onSetStageWipLimit={handleSetStageWipLimit}
                onToggleStageWipStrict={handleToggleStageWipStrict}
                onToggleStageContributes={handleToggleStageContributes}
                onToggleStageFinal={handleToggleStageFinal}
                onToggleStageBlocked={handleToggleStageBlocked}
                onToggleStageVisible={handleToggleStageVisible}
                allStages={stages}
                cardFields={cardFields}
                profilesMap={profilesMap}
                profileAvatarMap={profileAvatarMap}
              />
            );
          };

          // Sem raias: colunas lado a lado (comportamento padrão).
          if (groupBy === "none" || lanes.length === 0) {
            return (
              <>
                {visibleStages.map((stage, idx) => renderColumn(stage, idx))}
                {/* O "Colunas" do FIM DA FILA saiu em 13/08/2026: havia dois
                    botões com o mesmo nome e o mesmo destino — um na régua,
                    ao lado de Visões, e outro aqui, só alcançável depois de
                    rolar o quadro inteiro para a direita. Ficou o da régua,
                    que está sempre à vista. */}
              </>
            );
          }

          // Com raias: cada raia é uma faixa horizontal com todas as colunas,
          // filtradas para os cards daquela raia. Raias vazias são omitidas.
          return (
            <div className="flex flex-col gap-3 w-full">
              {lanes.map((lane) => {
                const laneCount = visibleStages.reduce(
                  (n, s) => n + (activitiesByStage[s.id] || []).filter(lane.match).length, 0,
                );
                if (laneCount === 0) return null;
                return (
                  <div key={lane.id} className="rounded-lg border border-border/60 bg-background/40">
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-muted/40 rounded-t-lg sticky left-0">
                      {groupBy === "phase" ? <Layers className="w-3.5 h-3.5 text-primary" />
                        : groupBy === "priority" ? <Flag className="w-3.5 h-3.5 text-primary" />
                        : groupBy === "sector" ? <Building2 className="w-3.5 h-3.5 text-primary" />
                        : groupBy === "tag" ? <TagIcon className="w-3.5 h-3.5 text-primary" />
                        : groupBy === "due" ? <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                        : groupBy === "blocked" ? <AlertCircle className="w-3.5 h-3.5 text-primary" />
                        : groupBy === "customGroup" ? <Users className="w-3.5 h-3.5 text-primary" />
                        : <User className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span className="text-xs font-semibold">{lane.label}</span>
                      <span className="text-[10px] text-muted-foreground">{laneCount} {laneCount === 1 ? "card" : "cards"}</span>
                    </div>
                    <div className="flex p-2 overflow-x-auto">
                      {visibleStages.map((stage, idx) => renderColumn(stage, idx, lane.match, lane.id))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
          })()}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeActivity ? (
          <div className="rotate-2 opacity-90 w-[260px]">
            <KanbanCard
              activity={activeActivity}
              phases={phases}
              onEdit={() => {}}
              onDelete={() => {}}
              onToggle={() => {}}
              hasStory={storyLinkedActivities.has(activeActivity.id)}
              progress={computeActivityProgress(activeActivity.workflow_stage_id, stages, activeActivity.last_progress_stage_id, filhosPorPai.get(activeActivity.id), activeActivity.is_milestone, ehAgrupador(activeActivity))}
              cardFields={cardFields}
              profilesMap={profilesMap}
              profileAvatarMap={profileAvatarMap}
            />
          </div>
        ) : activeColumn ? (
          <div className="opacity-70 w-[200px] rounded-xl border bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeColumn.color }} />
              <span className="text-sm font-semibold text-foreground">{getStageDisplayTitle(activeColumn.title)}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>
      {/* Painel de detalhe do card — Editar abre o diálogo de edição de sempre. */}
      <ActivityDetailPanel
        activity={detailId ? activities.find((a) => a.id === detailId) ?? null : null}
        stages={stages}
        phases={phases}
        projectId={projectId}
        profilesMap={profilesMap}
        profileAvatarMap={profileAvatarMap}
        waitingOnCount={detailId ? waitingOnCounts.get(detailId) : undefined}
        onClose={() => setDetailId(null)}
        onEdit={(a) => {
          setDetailId(null);
          onEditActivity(a);
        }}
        onToggleComplete={(a) => onToggleActivity(a.id, a.status)}
      />
      <UserStoryDrawer
        activityId={storyDrawerActivityId}
        projectId={projectId}
        projectLocked={projectLocked}
        open={storyDrawerOpen}
        onOpenChange={setStoryDrawerOpen}
        onStoriesChanged={() => {
          supabase.from("user_stories").select("activity_id").eq("project_id", projectId).eq("is_trashed", false).not("activity_id", "is", null)
            .then(({ data }) => {
              if (data) {
                const countMap = new Map<string, number>();
                data.forEach((s) => {
                  countMap.set(s.activity_id, (countMap.get(s.activity_id) || 0) + 1);
                });
                setStoryLinkedActivities(countMap);
              }
            });
        }}
      />

      {linkParentIds && linkParentIds.length > 0 && (
        <LinkParentDialog
          open={!!linkParentIds}
          onOpenChange={(open) => {
            if (!open) {
              setLinkParentIds(null);
              setLinkParentCurrent(null);
            }
          }}
          projectId={projectId}
          activityIds={linkParentIds}
          currentParentId={linkParentCurrent}
          onLinked={() => {
            onDataChanged();
            fetchStages();
          }}
        />
      )}

      {/* Bloquear atividade — o card NÃO sai da coluna ("block in place"),
          para continuar contando no WIP e no tempo por etapa. */}
      <Dialog open={!!blockingActivity} onOpenChange={(open) => { if (!open) setBlockingActivity(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-amber-600 fill-current" />
              Bloquear atividade
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Atividade</Label>
              <p className="text-sm font-medium">{blockingActivity?.title}</p>
            </div>
            <div>
              <Label htmlFor="block-reason" className="text-xs text-muted-foreground">
                O que está impedindo?
              </Label>
              <Input
                id="block-reason"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Ex.: aguardando acesso ao ambiente"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") confirmBlockActivity(); }}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                A atividade continua nesta coluna. O tempo bloqueado começa a contar agora.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBlockingActivity(null)}>Cancelar</Button>
            <Button onClick={confirmBlockActivity} disabled={blockSaving}>
              {blockSaving ? "Bloqueando..." : "Bloquear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para criar história rápida — oculto junto com o recurso
          (ver SHOW_USER_STORIES em lib/featureFlags). */}
      <Dialog open={SHOW_USER_STORIES && !!createStoryActivity} onOpenChange={(open) => { if (!open) setCreateStoryActivity(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Criar História
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Atividade vinculada</Label>
              <p className="text-sm font-medium">{createStoryActivity?.title}</p>
            </div>
            {createStoryActivity?.phase_id && (
              <div>
                <Label className="text-xs text-muted-foreground">Fase (EAP)</Label>
                <p className="text-sm">{phases.find(p => p.id === createStoryActivity?.phase_id)?.title || "—"}</p>
              </div>
            )}
            <div>
              <Label className="text-xs">Título *</Label>
              <Input
                placeholder="Título da história..."
                value={createStoryTitle}
                onChange={(e) => setCreateStoryTitle(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Narrativa / Contexto</Label>
              <Textarea
                placeholder="Descreva o contexto e a narrativa desta história..."
                value={createStoryNarrative}
                onChange={(e) => setCreateStoryNarrative(e.target.value)}
                className="min-h-[100px] mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateStoryActivity(null)}>Cancelar</Button>
            <Button onClick={handleCreateStory} disabled={!createStoryTitle.trim() || createStoryLoading}>
              {createStoryLoading ? "Criando..." : "Criar História"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gerenciar colunas — a tabela com todas de uma vez (nome, cor,
          progresso, WIP, visibilidade e ordem). Recebe TODAS as colunas:
          a oculta precisa aparecer aqui, senão volta a não ter onde ser
          editada. */}
      <GerenciarColunas
        open={gerenciarColunasOpen}
        onOpenChange={setGerenciarColunasOpen}
        stages={stages}
        countByStage={countByStage}
        onSalvar={handleSalvarColunas}
      />

      {/* Gerenciar grupos de raia (estilo Jira: uma raia agrega vários responsáveis) */}
      <Dialog open={manageGroupsOpen} onOpenChange={setManageGroupsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Times</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Crie times de pessoas (compartilhados com o projeto). Ao usar “Raias por time”, cada time vira uma raia com as atividades de qualquer um dos seus membros.
          </p>

          {teamsUnavailable && (
            <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
              Os times ainda não estão disponíveis: aplique a migration <span className="font-mono">kanban_teams</span> no banco (VM) para habilitar.
            </div>
          )}

          <div className="space-y-3 max-h-[55vh] overflow-y-auto py-1">
            {laneGroups.length === 0 && !teamsUnavailable && (
              <div className="text-center text-xs text-muted-foreground py-6 border border-dashed rounded-lg">
                Nenhum time ainda. Clique em “Novo time” para começar.
              </div>
            )}
            {laneGroups.map((g) => (
              <div key={g.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={g.name}
                    placeholder="Nome do time (ex.: Time TI)"
                    onChange={(e) => setLaneGroups((gs) => gs.map((x) => x.id === g.id ? { ...x, name: e.target.value } : x))}
                    onBlur={() => saveTeam(g)}
                    className="h-8 text-sm flex-1"
                  />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {g.members.length} {g.members.length === 1 ? "membro" : "membros"}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTeam(g.id)}
                    className="h-8 w-8 flex items-center justify-center rounded text-destructive hover:bg-destructive/10 shrink-0"
                    title="Remover time"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {assigneeOptions.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma pessoa nas atividades.</span>}
                  {assigneeOptions.map((name) => {
                    const inGroup = g.members.includes(name);
                    const resolved = profilesMap[name] ?? name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => saveTeam({
                          ...g,
                          members: inGroup ? g.members.filter((m) => m !== name) : [...g.members, name],
                        })}
                        className={cn(
                          "inline-flex items-center gap-1 h-7 rounded-full border px-2.5 text-xs transition-colors",
                          inGroup ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/60",
                        )}
                      >
                        {inGroup && <Check className="w-3 h-3" />}
                        {resolved}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={createTeam}
              disabled={teamsUnavailable}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" /> Novo time
            </Button>
            <Button
              onClick={() => { setManageGroupsOpen(false); setGroupBy("customGroup"); }}
              disabled={laneGroups.filter((g) => g.members.length > 0).length === 0}
            >
              Aplicar raias por time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
