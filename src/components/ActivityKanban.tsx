'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  MoreHorizontal,
  Check,
  Copy,
  ArrowRightLeft,
  Shuffle,
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
  SlidersHorizontal,
  Flag,
  Building2,
  Tag as TagIcon,
  Calendar as CalendarIcon,
  Users,
  Link2,
  LayoutGrid,
  User,
  Layers,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkflowStageManager } from "@/components/WorkflowStageManager";
import { getBlockedDays, formatBlockedDays } from "@/lib/blockedTime";
import { KANBAN_TOKENS } from "@/lib/kanbanTokens";
import {
  computeActivityProgress,
  type ActivityProgress,
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
import { resolveEapKind, eapTypeOptions, eapToPersisted, EAP_LABELS, type EapKind } from "@/lib/eapModel";
import { ToastAction } from "@/components/ui/toast";
import { computeCardAging, CARD_AGING_CLASSES } from "@/lib/cardAging";
import { cn } from "@/lib/utils";

const formatHours = (hours: number): string => {
  if (!hours || hours <= 0) return "";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
};

const toHoursNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const progressLabelFromPercent = (percent: number): string => {
  if (percent >= 100) return "Validada";
  if (percent >= 75) return "Concluída";
  if (percent >= 50) return "Realizada";
  if (percent >= 25) return "Iniciada";
  return "Não iniciada";
};

const STAGE_PRESET_COLORS = [
  "hsl(220, 15%, 50%)",
  "hsl(38, 92%, 50%)",
  "hsl(220, 90%, 56%)",
  "hsl(199, 89%, 48%)",
  "hsl(270, 70%, 55%)",
  "hsl(142, 76%, 36%)",
  "hsl(0, 84%, 60%)",
  "hsl(340, 82%, 52%)",
];

// Cor estável para uma etiqueta (mesmo texto -> mesma cor). Paleta suave que
// funciona em tema claro e escuro.
const TAG_TONES = [
  "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
  "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
];
const tagColorClass = (tag: string) => {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_TONES[h % TAG_TONES.length];
};

const getProgressBarColor = (percent: number, paused: boolean) => {
  if (paused) return "bg-muted-foreground/30";
  if (percent >= 100) return "bg-emerald-500";
  if (percent >= 75) return "bg-violet-500";
  if (percent >= 50) return "bg-blue-500";
  if (percent >= 25) return "bg-amber-500";
  return "bg-muted-foreground/40";
};

const getStageDisplayTitle = (title: string) => {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const lettersOnly = normalized.replace(/[^a-z]/g, "");

  if (
    normalized === "concluida" ||
    normalized === "concluada" ||
    normalized === "concluãda" ||
    lettersOnly === "concluida" ||
    lettersOnly === "concluada" ||
    (lettersOnly.startsWith("conclu") && lettersOnly.endsWith("da"))
  ) {
    return "Concluída";
  }

  return title;
};

// Campos configuráveis do card. O usuário liga/desliga cada um pelo painel
// "⚙ Card". Alguns elementos (título, código EAP, ícone de tipo, bloqueio e
// alerta de subs impedidas) são sinais críticos e NÃO entram aqui — sempre
// aparecem.
export type CardFields = {
  priority: boolean;
  progress: boolean;
  assignee: boolean;
  participants: boolean;
  dueDate: boolean;
  hours: boolean;
  subCount: boolean;
  description: boolean;
  breadcrumb: boolean;
  subSummary: boolean;
  tags: boolean;
  dependencies: boolean;
};

// Defaults = exatamente os campos da imagem aprovada (Fase 1): prioridade,
// barra de progresso, responsável e prazo. participants/hours/subCount
// estavam ligados por padrão e não aparecem na imagem — eram o motivo do
// card acumular "0h/10h · 2 subtarefas" ao lado da barra. Continuam
// disponíveis no painel "⚙ Card", só passam a começar desligados.
export const DEFAULT_CARD_FIELDS: CardFields = {
  priority: true,
  progress: true,
  assignee: true,
  participants: false,
  dueDate: true,
  hours: false,
  subCount: false,
  description: false,
  breadcrumb: false,
  subSummary: false,
  tags: false,
  dependencies: false,
};

// Ordem + rótulos + agrupamento para o painel de configuração.
export const CARD_FIELD_GROUPS: { group: string; items: { key: keyof CardFields; label: string }[] }[] = [
  { group: "Conteúdo", items: [
    { key: "description", label: "Descrição" },
    { key: "progress", label: "Barra de progresso" },
    { key: "breadcrumb", label: "Caminho do pai (EAP)" },
  ]},
  { group: "Pessoas", items: [
    { key: "assignee", label: "Responsável" },
    { key: "participants", label: "Participantes" },
  ]},
  { group: "Metadados", items: [
    { key: "priority", label: "Prioridade" },
    { key: "dueDate", label: "Prazo" },
    { key: "hours", label: "Horas" },
    { key: "tags", label: "Tags / etiquetas" },
    { key: "dependencies", label: "Dependências" },
  ]},
  { group: "Subtarefas", items: [
    { key: "subCount", label: "Contador de subtarefas" },
    { key: "subSummary", label: "Resumo (feitas / abertas)" },
  ]},
];

/**
 * Largura mínima da coluna. Abaixo disto o card deixa de ser legível: o título
 * quebra em três linhas, o rodapé colide e a barra de progresso some.
 * Passando disso, o quadro rola na horizontal em vez de espremer as colunas.
 */
const MIN_COLUMN_WIDTH = 272;

// Medidas do quadro: fonte única em lib/kanbanTokens (a imagem aprovada).
// Nunca reintroduzir tabelas de densidade aqui — ver o comentário no token.

interface WorkflowStage {
  id: string;
  project_id: string;
  title: string;
  color: string;
  display_order: number;
  is_final: boolean;
  is_blocked: boolean;
  is_visible: boolean;
  progress_percent?: number | null;
  contributes_to_progress?: boolean;
  wip_limit?: number | null;
  /** Quando true, o quadro IMPEDE exceder o wip_limit (opt-in por coluna). */
  wip_strict?: boolean | null;
  /** Categoria semântica — fonte da verdade, independente do título. */
  categoria?: WorkflowCategory;
}

interface Phase {
  id: string;
  title: string;
}

interface Activity {
  id: string;
  title: string;
  wbs_code?: string | null;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at?: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  cost: number;
  hours: number;
  phase_id: string | null;
  display_order?: number | null;
  priority?: string;
  priority_score?: number | null;
  tags?: string[];
  parent_id?: string | null;
  workflow_stage_id?: string | null;
  last_progress_stage_id?: string | null;
  story_points?: number;
  participants?: string[];
  deadline_flag?: string | null;
  last_update_date?: string | null;
  is_milestone?: boolean;
  progress_flag?: number | null;
  blocked_since?: string | null;
  /** Quando entrou na coluna atual — base do envelhecimento (card aging). */
  stage_entered_at?: string | null;
  blocked_days_total?: number | null;
  /** Bloqueio "in place": marcado na atividade, não pela coluna. */
  is_blocked?: boolean | null;
  blocked_reason?: string | null;
  created_by?: string | null;
}

// Filtro por coluna (Frente B): mesmos campos do filtro geral, exceto
// "Coluna/Status" (não faz sentido dentro da própria coluna). Serializável
// (arrays em vez de Sets) para persistir por projeto.
interface ColumnFilter {
  assignees: string[];
  priorities: string[];
  sectors: string[];
  types: string[];
  participants: string[];
  tags: string[];
  dueRange: { from: string; to: string };
  startRange: { from: string; to: string };
  hoursRange: { min: string; max: string };
  blocked: boolean;
}
const EMPTY_COLUMN_FILTER: ColumnFilter = {
  assignees: [], priorities: [], sectors: [], types: [], participants: [], tags: [],
  dueRange: { from: "", to: "" }, startRange: { from: "", to: "" }, hoursRange: { min: "", max: "" },
  blocked: false,
};
const columnFilterActive = (f: ColumnFilter): boolean =>
  f.assignees.length > 0 || f.priorities.length > 0 || f.sectors.length > 0 ||
  f.types.length > 0 || f.participants.length > 0 || f.tags.length > 0 ||
  !!(f.dueRange.from || f.dueRange.to) || !!(f.startRange.from || f.startRange.to) ||
  !!(f.hoursRange.min || f.hoursRange.max) || f.blocked;

interface ActivityKanbanProps {
  projectId: string;
  activities: Activity[];
  phases: Phase[];
  consumedMinutesByActivity?: Record<string, number>;
  onDataChanged: () => void;
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  onToggleActivity: (activityId: string, currentStatus: string) => void;
  isAdmin?: boolean;
  canCreate?: boolean;
  projectLocked?: boolean;
  isQualityProject?: boolean;
  onOpenCreateTask?: (stageId: string) => void;
  /** Mapa de id de perfil → nome completo para resolução de assigned_to */
  profilesMap?: Record<string, string>;
  /** Mapa de id de perfil → avatar_url */
  profileAvatarMap?: Record<string, string>;
  /** Mapa de id/nome de perfil → setor (para raia por setor) */
  profileSectorMap?: Record<string, string>;
}

type HoursStat = {
  planned: number;
  consumed: number;
  hasSubs: boolean;
};

type SubActivityStatusSummary = {
  completed: number;
  pending: number;
};

function SortableKanbanCard({
  activity,
  phases,
  onEdit,
  onDelete,
  onToggle,
  onDuplicate,
  onCopyLink,
  onMoveToStage,
  moveTargets,
  onChangeType,
  onLinkParent,
  isAdmin,
  isBlocked,
  onToggleBlocked,
  hasStory,
  storyCount,
  onStoryClick,
  onCreateStory,
  isQualityProject,
  stageColor,
  subActivityCount,
  dependencyCount,
  waitingOnCount,
  commentCount,
  attachmentCount,
  relationItems,
  onOpenRelated,
  onRemoveRelation,
  isExpanded,
  onToggleExpand,
  progress,
  cardFields,
  parentBreadcrumb,
  blockedSubsCount,
  subActivityStatusSummary,
  hoursStat,
  profilesMap = {},
  profileAvatarMap = {},
}: {
  activity: Activity;
  phases: Phase[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate?: () => void;
  onCopyLink?: () => void;
  onMoveToStage?: (stageId: string) => void;
  moveTargets?: { id: string; title: string; color: string }[];
  onChangeType?: (kind: EapKind) => void;
  onLinkParent?: () => void;
  isAdmin?: boolean;
  isBlocked?: boolean;
  onToggleBlocked?: () => void;
  hasStory?: boolean;
  storyCount?: number;
  onStoryClick?: () => void;
  onCreateStory?: () => void;
  isQualityProject?: boolean;
  stageColor?: string;
  subActivityCount?: number;
  dependencyCount?: { pred: number; succ: number };
  /** Predecessoras ainda nao concluidas — dependencia bloqueante. */
  waitingOnCount?: number;
  commentCount?: number;
  attachmentCount?: number;
  relationItems?: { id: string; title: string; relationId: string; relationType: string }[];
  onOpenRelated?: (activityId: string) => void;
  onRemoveRelation?: (relationId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  progress?: ActivityProgress;
  cardFields?: CardFields;
  parentBreadcrumb?: { id: string; title: string; wbsCode?: string | null } | null;
  blockedSubsCount?: number;
  subActivityStatusSummary?: SubActivityStatusSummary;
  hoursStat?: HoursStat;
  profilesMap?: Record<string, string>;
  profileAvatarMap?: Record<string, string>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: activity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <KanbanCard
        activity={activity}
        phases={phases}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggle={onToggle}
        onDuplicate={onDuplicate}
        onCopyLink={onCopyLink}
        onMoveToStage={onMoveToStage}
        moveTargets={moveTargets}
        onChangeType={onChangeType}
        onLinkParent={onLinkParent}
        dragListeners={listeners}
        isAdmin={isAdmin}
        isBlocked={isBlocked}
        onToggleBlocked={onToggleBlocked}
        hasStory={hasStory}
        storyCount={storyCount}
        onStoryClick={onStoryClick}
        onCreateStory={onCreateStory}
        isQualityProject={isQualityProject}
        stageColor={stageColor}
        subActivityCount={subActivityCount}
        dependencyCount={dependencyCount}
        waitingOnCount={waitingOnCount}
        commentCount={commentCount}
        attachmentCount={attachmentCount}
        relationItems={relationItems}
        onOpenRelated={onOpenRelated}
        onRemoveRelation={onRemoveRelation}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        progress={progress}
        cardFields={cardFields}
        parentBreadcrumb={parentBreadcrumb}
        blockedSubsCount={blockedSubsCount}
        subActivityStatusSummary={subActivityStatusSummary}
        hoursStat={hoursStat}
        profilesMap={profilesMap}
        profileAvatarMap={profileAvatarMap}
      />
    </div>
  );
}

function KanbanCard({
  activity,
  phases,
  onEdit,
  onDelete,
  onToggle,
  onDuplicate,
  onCopyLink,
  onMoveToStage,
  moveTargets,
  onChangeType,
  onLinkParent,
  dragListeners,
  isAdmin,
  isBlocked,
  onToggleBlocked,
  hasStory,
  storyCount,
  onStoryClick,
  onCreateStory,
  isQualityProject,
  stageColor,
  subActivityCount,
  dependencyCount,
  waitingOnCount,
  commentCount,
  attachmentCount,
  relationItems,
  onOpenRelated,
  onRemoveRelation,
  isExpanded,
  onToggleExpand,
  progress,
  cardFields = DEFAULT_CARD_FIELDS,
  parentBreadcrumb,
  blockedSubsCount,
  subActivityStatusSummary,
  hoursStat,
  readOnlyPreview = false,
  profilesMap = {},
  profileAvatarMap = {},
}: {
  activity: Activity;
  phases: Phase[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate?: () => void;
  onCopyLink?: () => void;
  /** Move o card para outra coluna do quadro (substitui o antigo "mover para backlog"). */
  onMoveToStage?: (stageId: string) => void;
  /** Colunas visíveis do quadro, destinos possíveis do "Mover para →". */
  moveTargets?: { id: string; title: string; color: string }[];
  /** Converte o papel EAP do item (Fase / Atividade / Marco). */
  onChangeType?: (kind: EapKind) => void;
  onLinkParent?: () => void;
  dragListeners?: any;
  isAdmin?: boolean;
  isBlocked?: boolean;
  onToggleBlocked?: () => void;
  hasStory?: boolean;
  storyCount?: number;
  onStoryClick?: () => void;
  onCreateStory?: () => void;
  isQualityProject?: boolean;
  stageColor?: string;
  subActivityCount?: number;
  dependencyCount?: { pred: number; succ: number };
  /** Predecessoras ainda nao concluidas — dependencia bloqueante. */
  waitingOnCount?: number;
  commentCount?: number;
  attachmentCount?: number;
  relationItems?: { id: string; title: string; relationId: string; relationType: string }[];
  onOpenRelated?: (activityId: string) => void;
  onRemoveRelation?: (relationId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  progress?: ActivityProgress;
  cardFields?: CardFields;
  parentBreadcrumb?: { id: string; title: string; wbsCode?: string | null } | null;
  blockedSubsCount?: number;
  subActivityStatusSummary?: SubActivityStatusSummary;
  hoursStat?: HoursStat;
  readOnlyPreview?: boolean;
  profilesMap?: Record<string, string>;
  profileAvatarMap?: Record<string, string>;
}) {
  const getPriorityIndicator = (priority?: string) => {
    const lvl = normalizeGut(priority);
    if (lvl === "pendente") return null;
    const meta = GUT_META[lvl];
    return (
      <div
        className={`w-1.5 h-1.5 rounded-full ${meta.dotClass} ${meta.pulse ? "animate-pulse" : ""}`}
        title={meta.label}
      />
    );
  };

  const parseDate = (d: string) => { const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day); };
  const isOverdue = activity.end_date && parseDate(activity.end_date) < new Date() && activity.status !== "completed";

  // O menu "..." vive num container que só aparece no hover. Ao mover o mouse
  // para dentro do dropdown o card perde o hover, e sem isto o gatilho sumiria
  // com o menu ainda aberto.
  const [menuOpen, setMenuOpen] = useState(false);

  const isMilestone = !!(activity as any).is_milestone;
  const eapType = (activity as any).item_type as string | undefined;
  // Modelo unificado (lib/eapModel): agrupador = Fase/Entrega. Cobre 'fase',
  // 'pacote' legado e qualquer item com filhos. Exibido sempre como Fase.
  const isPhase =
    !isMilestone && (eapType === "fase" || eapType === "pacote" || (subActivityCount ?? 0) > 0);
  // Bloqueio vem ANTES de marco: é o estado que exige ação, e um marco
  // travado precisa ser lido como travado.
  const cardBorderClass = isBlocked
    ? "border-l-[3px] border-l-amber-500 bg-amber-500/[0.06]"
    : isMilestone
      ? "border-amber-500 border-l-[4px] border-l-amber-500 bg-amber-500/5"
      : isOverdue
        ? "border-destructive border-l-[3px] border-l-destructive animate-pulse-overdue"
        : "border-border";

  const tooltipLines = [
    activity.title,
    activity.description ? `📝 ${activity.description}` : null,
    activity.assigned_to ? `Responsável: ${profilesMap[activity.assigned_to] ?? activity.assigned_to}` : null,
    activity.priority
      ? `⚡ Prioridade: ${GUT_META[normalizeGut(activity.priority)].label}${activity.priority_score ? ` (${activity.priority_score})` : ""}`
      : null,
    activity.start_date ? `📅 Início: ${parseDate(activity.start_date).toLocaleDateString("pt-BR")}` : null,
    activity.end_date ? `📅 Fim: ${parseDate(activity.end_date).toLocaleDateString("pt-BR")}` : null,
    isQualityProject && activity.last_update_date ? `🔄 Atualização: ${parseDate(activity.last_update_date).toLocaleDateString("pt-BR")}` : null,
    isQualityProject && activity.deadline_flag ? `🚦 Flag: ${activity.deadline_flag === "green" ? "Em dia" : activity.deadline_flag === "orange" ? "Atenção" : activity.deadline_flag === "red" ? "Vencido" : ""}` : null,
    activity.hours > 0 ? `⏱ Tempo: ${formatHours(activity.hours)}` : null,
    activity.status === "completed" ? "✅ Concluída" : null,
  ].filter(Boolean);

  // Andamento calculado automaticamente pela posição no Kanban
  const progressInfo: ActivityProgress = progress
    ?? { percent: 0, paused: false, label: "Não iniciada" };
  const progressPaused = progressInfo.paused;
  const progressPercent = progressInfo.percent ?? 0;
  const progressBarColor = getProgressBarColor(progressPercent, progressPaused);
  const progressBarWidth = progressPaused ? 100 : progressPercent;
  const progressTooltip = progressPaused
    ? "Pausada (coluna de bloqueio)"
    : `${progressPercent}% — ${progressInfo.label}`;
  const progressBadge = progressPaused ? "⏸" : `${progressPercent}%`;
  const assigneeRaw = (activity.assigned_to || "").trim();
  const assigneeName = assigneeRaw
    ? (profilesMap[assigneeRaw] ?? assigneeRaw)
    : null;
  const assigneeAvatar = resolveAvatarFromLookup(assigneeRaw, assigneeName, profileAvatarMap);

  const d = KANBAN_TOKENS;

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`relative bg-card border border-border rounded-lg ${d.card} shadow-md hover:shadow-lg transition-shadow cursor-pointer group ${cardBorderClass}`}
            onClick={onEdit}
          >
            {/* Alça de arrastar FORA do fluxo: como coluna fixa ela roubava
                ~20px de largura de todo card, o tempo todo, para uma ação que
                só importa no hover. Agora flutua sobre a borda esquerda. */}
            {dragListeners ? (
              <button
                className="absolute left-0 top-0 bottom-0 w-4 flex items-start justify-center pt-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
                {...dragListeners}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
            ) : null}
            <div className={`flex items-start ${d.gap}`}>
              <div className="flex-1 min-w-0 overflow-hidden">
                {parentBreadcrumb && cardFields.breadcrumb && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Reaproveita onOpenRelated para abrir o pai (já existe handler de abrir atividade por id)
                      onOpenRelated?.(parentBreadcrumb.id);
                    }}
                    className="flex items-center gap-1 mb-1 px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground max-w-full"
                    title={`Subtarefa de: ${parentBreadcrumb.title}`}
                  >
                    <span className="shrink-0">↳</span>
                    {parentBreadcrumb.wbsCode ? (
                      <span className="inline-flex items-center h-4 px-1 rounded border border-border bg-muted/40 text-[10px] font-mono text-muted-foreground align-middle shrink-0">
                        {parentBreadcrumb.wbsCode}
                      </span>
                    ) : null}
                    <span className="truncate">{parentBreadcrumb.title}</span>
                  </button>
                )}
                <div className="flex items-start gap-1.5 mb-2">
                  {isMilestone && (
                    <Diamond
                      className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0 mt-0.5"
                      aria-label="Marco"
                    />
                  )}
                  {!isMilestone && isPhase && (
                    <Layers className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" aria-label="Fase / Entrega" />
                  )}
                  <p
                    className={`${d.title} font-medium line-clamp-2 flex-1 min-w-0 ${
                      activity.status === "completed"
                        ? "line-through text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {activity.wbs_code ? (
                      <span className="inline-flex items-center h-[17px] px-1.5 mr-1.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground align-middle">
                        {activity.wbs_code}
                      </span>
                    ) : null}
                    <span>{activity.title}</span>
                  </p>
                  {/* Prioridade alinhada à direita do título (layout limpo) */}
                  {cardFields.priority && (() => {
                    const lvl = normalizeGut(activity.priority);
                    if (lvl === "pendente") return null;
                    const meta = GUT_META[lvl];
                    return (
                      <span
                        className={`shrink-0 mt-0.5 inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold leading-none ${meta.badgeClass} ${meta.pulse ? "animate-pulse-strong" : ""}`}
                        title={`Prioridade: ${meta.label}${activity.priority_score ? ` (${activity.priority_score})` : ""}`}
                        aria-label={`Prioridade ${meta.label}`}
                      >
                        {meta.label}
                      </span>
                    );
                  })()}
            {/* Acoes NO FLUXO, no fim da linha do titulo: [Concluir][...].
                Absolutas elas sobrepunham o que estivesse no canto (badge de
                prioridade, inicio do titulo). Em fluxo a sobreposicao e
                impossivel — e com so 2 botoes o custo e 44px fixos, nao os
                ~140px da fileira antiga de 6 icones. Invisiveis fora do hover
                (opacity preserva o espaco: o layout nao pula), visiveis com o
                menu aberto e na navegacao por teclado. */}
            {!readOnlyPreview && (
              <div
                className={`shrink-0 flex items-center gap-0.5 -mt-0.5 -mr-1 transition-opacity ${menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Button size="icon" variant="ghost" className="h-[22px] w-[22px] text-muted-foreground hover:bg-muted/70 hover:text-foreground" onClick={onToggle} title={activity.status === "completed" ? "Reabrir" : "Concluir"}>
                  {activity.status === "completed" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </Button>
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-[22px] w-[22px] flex items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      title="Opções da atividade"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-52"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {/* "Editar" saiu: clicar em qualquer lugar do card já abre a
                        edição (onClick={onEdit} no card), então o item era morto. */}
                    {onDuplicate && (
                      <DropdownMenuItem
                        className="focus:bg-muted/60 focus:text-foreground"
                        onSelect={() => onDuplicate()}
                      >
                        <Copy className="w-3.5 h-3.5 mr-2" /> Duplicar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="focus:bg-muted/60 focus:text-foreground"
                      onSelect={() => onCopyLink?.()}
                    >
                      <Link2 className="w-3.5 h-3.5 mr-2" /> Copiar link
                    </DropdownMenuItem>

                    {/* "Mover para →" substitui o antigo "Mover para Backlog", que
                        mandava o card para o stage display_order=0 — coluna que o
                        quadro não renderiza, fazendo o card desaparecer sem aviso. */}
                    {onMoveToStage && moveTargets && moveTargets.length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="focus:bg-muted/60 focus:text-foreground data-[state=open]:bg-muted/60">
                          <ArrowRightLeft className="w-3.5 h-3.5 mr-2" /> Mover para
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent sideOffset={6} className="w-52">
                          {moveTargets.map((s) => (
                            <DropdownMenuItem
                              key={s.id}
                              disabled={s.id === activity.workflow_stage_id}
                              className="text-xs focus:bg-muted/60 focus:text-foreground"
                              onSelect={() => onMoveToStage(s.id)}
                            >
                              <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="truncate">{s.title}</span>
                              {s.id === activity.workflow_stage_id && (
                                <Check className="w-3 h-3 ml-auto text-primary shrink-0" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    {/* Aninhar: era "Vincular ao pai" — nome que não dizia o que
                        fazia. Fica junto do "Mover para" por serem ambos sobre
                        realocar o item; é o ÚNICO caminho para re-aninhar um card,
                        então não pode sair do menu (o diálogo de edição não faz). */}
                    {onLinkParent && (
                      <DropdownMenuItem
                        className="focus:bg-muted/60 focus:text-foreground"
                        onSelect={() => onLinkParent()}
                      >
                        <Layers className="w-3.5 h-3.5 mr-2" /> Aninhar em uma fase
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    {onToggleBlocked && (
                      <DropdownMenuItem
                        className="focus:bg-muted/60 focus:text-foreground"
                        onSelect={() => onToggleBlocked()}
                        title={isBlocked ? "Desbloquear" : "Bloquear (o card fica onde está)"}
                      >
                        <Flag className={`w-3.5 h-3.5 mr-2 ${isBlocked ? "fill-current text-amber-600 dark:text-amber-500" : ""}`} />
                        {isBlocked ? "Desbloquear" : "Bloquear"}
                      </DropdownMenuItem>
                    )}
                    {/* Converter tipo (papéis EAP): já existia no Backlog e no
                        diálogo — o quadro era a única tela sem. */}
                    {onChangeType && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="focus:bg-muted/60 focus:text-foreground data-[state=open]:bg-muted/60">
                          <Shuffle className="w-3.5 h-3.5 mr-2" /> Converter em
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent sideOffset={6} className="w-44">
                          {eapTypeOptions({ hasChildren: (subActivityCount ?? 0) > 0 }).map((k) => {
                            const currentKind: EapKind = isMilestone
                              ? "marco"
                              : isPhase
                                ? "fase"
                                : "atividade";
                            return (
                              <DropdownMenuItem
                                key={k}
                                disabled={k === currentKind}
                                className="text-xs focus:bg-muted/60 focus:text-foreground"
                                onSelect={() => onChangeType(k)}
                              >
                                <span className="truncate">{EAP_LABELS[k]}</span>
                                {k === currentKind && <Check className="w-3 h-3 ml-auto text-primary shrink-0" />}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    {SHOW_USER_STORIES && onCreateStory && (
                      <DropdownMenuItem
                        className="focus:bg-muted/60 focus:text-foreground"
                        onSelect={() => onCreateStory()}
                      >
                        <BookOpen className="w-3.5 h-3.5 mr-2" /> Criar História
                      </DropdownMenuItem>
                    )}

                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          onSelect={() => onDelete()}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
                </div>

                {cardFields.description && activity.description && (
                  <p className={`${d.desc} text-muted-foreground ${d.descClamp} mb-1.5 leading-relaxed`}>
                    {activity.description}
                  </p>
                )}

                {/* Etiquetas (tags) — coloridas de forma estável por texto */}
                {cardFields.tags && Array.isArray(activity.tags) && activity.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {activity.tags.slice(0, 6).map((tag) => (
                      <span key={tag} className={cn("px-1.5 py-0 rounded text-[10px] font-medium border", tagColorClass(tag))}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Barra de andamento (calculada pelo Kanban) */}
                {cardFields.progress && !isQualityProject && (
                <div
                  className="mb-2 flex items-center gap-2"
                  title={progressTooltip}
                >
                  <div className="flex-1 h-[5px] rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${progressBarColor} transition-all ${progressPaused ? "opacity-50" : ""}`}
                      style={{ width: `${progressBarWidth}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {progressBadge}
                  </span>
                </div>
                )}

                {/* Bloqueio in place: o card continua na coluna onde o trabalho
                    está, com o motivo legível e há quanto tempo está travado. */}
                {isBlocked && (
                  <div
                    className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-500"
                    title={
                      activity.blocked_since
                        ? `Bloqueada desde ${new Date(activity.blocked_since).toLocaleString("pt-BR")}`
                        : "Bloqueada"
                    }
                  >
                    <Flag className="w-3 h-3 shrink-0 fill-current" />
                    <span className="truncate">
                      {activity.blocked_reason
                        ? `Bloqueada — ${activity.blocked_reason}`
                        : "Bloqueada"}
                    </span>
                    {(() => {
                      const label = formatBlockedDays(getBlockedDays(activity));
                      return label ? (
                        <span className="ml-auto shrink-0 font-normal text-muted-foreground tabular-nums">
                          {label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Dependência bloqueante: espera predecessora não concluída.
                    Distinto do bloqueio manual (que é uma decisão de alguém) —
                    aqui é sequenciamento. Sem isso, um card pronto para começar
                    e um travado esperando outro pareciam idênticos no quadro. */}
                {!isBlocked && waitingOnCount && waitingOnCount > 0 ? (
                  <div
                    className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-orange-700 dark:text-orange-400"
                    title={`Aguarda ${waitingOnCount} predecessora(s) ainda não concluída(s)`}
                  >
                    <Hourglass className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {waitingOnCount === 1
                        ? "Aguarda 1 predecessora"
                        : `Aguarda ${waitingOnCount} predecessoras`}
                    </span>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-1">
                  {!!blockedSubsCount && blockedSubsCount > 0 && (
                    <Badge
                      className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] px-1.5 py-0 animate-pulse"
                      title={`${blockedSubsCount} subtarefa(s) impedida(s)`}
                    >
                      ⚠ {blockedSubsCount} sub{blockedSubsCount > 1 ? "s" : ""} impedida{blockedSubsCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {/* Bloqueio virou linha própria, fora desta faixa de badges —
                      ver o bloco "Bloqueio in place" logo abaixo. */}
                  {isQualityProject && activity.deadline_flag && activity.deadline_flag !== "" && (
                    <Badge className={`text-[10px] px-1.5 py-0 ${
                      activity.deadline_flag === "green" ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30" :
                      activity.deadline_flag === "orange" ? "bg-orange-500/20 text-orange-600 border-orange-500/30" :
                      activity.deadline_flag === "red" ? "bg-destructive/20 text-destructive border-destructive/30" : ""
                    }`}>
                      {activity.deadline_flag === "green" ? "🟢 Em dia" :
                       activity.deadline_flag === "orange" ? "🟠 Atenção" :
                       activity.deadline_flag === "red" ? "🔴 Vencido" : ""}
                    </Badge>
                  )}
                  {/* Avatar limpo, sem moldura de badge: ancora o rodapé à
                      esquerda enquanto o prazo ancora à direita. */}
                  {cardFields.assignee && activity.assigned_to && (
                    <Avatar className="h-5 w-5 shrink-0" title={assigneeName || "Responsável"}>
                      {assigneeAvatar ? <AvatarImage src={assigneeAvatar} alt={assigneeName || "Responsável"} /> : null}
                      <AvatarFallback className="text-[8.5px] font-semibold bg-primary/15 text-primary">
                        {getAvatarInitials(assigneeName)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  {cardFields.participants && activity.participants && activity.participants.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-accent/30" title={`Participantes: ${activity.participants.join(", ")}`}>
                      👥 +{activity.participants.length}
                    </Badge>
                  )}
                  {isQualityProject && activity.last_update_date && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5 text-primary/80">
                      🔄 {parseDate(activity.last_update_date).toLocaleDateString("pt-BR")}
                    </Badge>
                  )}
                  {SHOW_USER_STORIES && hasStory && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30 cursor-pointer hover:bg-primary/20 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onStoryClick?.(); }}
                    >
                      📖 {storyCount && storyCount > 1 ? `${storyCount} Histórias` : "História"}
                    </Badge>
                  )}
                  {cardFields.hours && hoursStat && (hoursStat.planned > 0 || hoursStat.consumed > 0) ? (
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 ${
                        hoursStat.consumed > hoursStat.planned
                          ? "bg-destructive/15 text-destructive border border-destructive/30"
                          : hoursStat.consumed > 0
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                          : ""
                      }`}
                      title={
                        hoursStat.hasSubs
                          ? "Consumido automático nas subatividades / planejado"
                          : "Consumido automático / planejado"
                      }
                    >
                      {formatHours(hoursStat.consumed) || "0h"}/{formatHours(hoursStat.planned) || "0h"}
                    </Badge>
                  ) : cardFields.hours && toHoursNumber(activity.hours) > 0 ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {formatHours(toHoursNumber(activity.hours))}
                    </Badge>
                  ) : null}
                  {cardFields.dependencies && dependencyCount && (dependencyCount.pred > 0 || dependencyCount.succ > 0) && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30 font-semibold"
                      title={`${dependencyCount.pred} predecessora(s) · ${dependencyCount.succ} sucessora(s)`}
                    >
                      🔗 {dependencyCount.pred > 0 && `←${dependencyCount.pred}`}
                      {dependencyCount.pred > 0 && dependencyCount.succ > 0 && " "}
                      {dependencyCount.succ > 0 && `→${dependencyCount.succ}`}
                    </Badge>
                  )}
                  {cardFields.dependencies && relationItems && relationItems.length > 0 ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] font-medium bg-background text-muted-foreground border border-border/60 hover:bg-muted/40 hover:text-foreground transition-colors"
                          title="Gerenciar vínculos"
                        >
                          <Link2 className="w-2.5 h-2.5" strokeWidth={2.25} />
                          {relationItems.length}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        className="w-72 p-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[11px] font-semibold text-foreground">
                            {relationItems.length} {relationItems.length === 1 ? "vínculo" : "vínculos"}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="text-[10px] text-primary hover:underline font-medium"
                            title="Adicionar/editar vínculos na atividade"
                          >
                            + Adicionar
                          </button>
                        </div>
                        <ul className="space-y-1 max-h-64 overflow-auto">
                          {relationItems.map((r) => (
                            <li
                              key={r.relationId}
                              className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/60"
                            >
                              <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0">
                                #{r.id.slice(0, 6)}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onOpenRelated?.(r.id); }}
                                className="flex-1 min-w-0 text-left text-[11px] text-foreground truncate hover:text-primary hover:underline"
                                title="Abrir atividade vinculada"
                              >
                                {r.title || "(sem título)"}
                              </button>
                              <span className="text-[10px] text-muted-foreground/70 shrink-0 capitalize">
                                {r.relationType.replace(/_/g, " ")}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onRemoveRelation?.(r.relationId); }}
                                className="p-0.5 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                title="Remover vínculo"
                              >
                                <XIcon className="w-3 h-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </PopoverContent>
                    </Popover>
                  ) : null}

                  {/* Envelhecimento: há quanto tempo está parado NESTA coluna.
                      A métrica central do Kanban, antes ausente — sem ela um card
                      esquecido há 40 dias parecia igual a um que entrou hoje.
                      Só aparece a partir de 3 dias, para não poluir. */}
                  {(() => {
                    const aging = computeCardAging(activity.stage_entered_at, activity.status);
                    if (!aging) return null;
                    return (
                      <span
                        className={`shrink-0 inline-flex items-center gap-0.5 text-[10px] tabular-nums ${CARD_AGING_CLASSES[aging.tone]}`}
                        title={`Há ${aging.days} dia(s) nesta coluna`}
                      >
                        <Hourglass className="w-2.5 h-2.5" /> {aging.label}
                      </span>
                    );
                  })()}

                  {/* Discussão e anexos: sinais universais de card (Trello, Jira,
                      Asana, Notion todos exibem). Sempre visíveis — é presença de
                      conteúdo, não preferência de campo. */}
                  {commentCount && commentCount > 0 ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums"
                      title={`${commentCount} ${commentCount === 1 ? "comentário" : "comentários"}`}
                    >
                      <MessageSquare className="w-2.5 h-2.5" /> {commentCount}
                    </span>
                  ) : null}
                  {attachmentCount && attachmentCount > 0 ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums"
                      title={`${attachmentCount} ${attachmentCount === 1 ? "anexo" : "anexos"}`}
                    >
                      <Paperclip className="w-2.5 h-2.5" /> {attachmentCount}
                    </span>
                  ) : null}

                  {/* Prazo por ÚLTIMO e com ml-auto: ancora na borda direita do
                      card, fechando a linha que o avatar abre à esquerda — é o
                      que elimina a faixa vazia. Texto tabular, sem moldura nem
                      emoji; o atraso se lê pela cor. */}
                  {cardFields.dueDate && activity.end_date && (
                    <span
                      className={`ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] tabular-nums ${
                        isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"
                      }`}
                      title={`Prazo: ${parseDate(activity.end_date).toLocaleDateString("pt-BR")}`}
                    >
                      {isOverdue && <AlertCircle className="w-2.5 h-2.5" />}
                      {parseDate(activity.end_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </span>
                  )}
                </div>
                {(isPhase || cardFields.subCount) && subActivityCount && subActivityCount > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
                    className="flex items-center gap-1 mt-1.5 text-[10px] font-medium text-primary hover:text-primary/80 hover:underline transition-colors"
                    title={isExpanded ? "Recolher subtarefas" : "Expandir subtarefas"}
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <GitFork className="w-3 h-3" />
                    <span>{subActivityCount} {subActivityCount === 1 ? "subtarefa" : "subtarefas"}</span>
                  </button>
                ) : null}
                {cardFields.subSummary && subActivityStatusSummary && (subActivityStatusSummary.completed > 0 || subActivityStatusSummary.pending > 0) ? (
                  <Badge
                    variant="outline"
                    className="mt-1 text-[10px] px-1.5 py-0 bg-muted/40 border-border/60 text-muted-foreground"
                    title="Resumo das subatividades"
                  >
                    Subs: {subActivityStatusSummary.completed} concluidas / {subActivityStatusSummary.pending} pendentes
                  </Badge>
                ) : null}
              </div>
            </div>

          </div>
        </TooltipTrigger>
        {/* Com o menu aberto o tooltip do card so atrapalha: o ponteiro esta
            sobre as opcoes, nao sobre o card. */}
        {!menuOpen && (
          <TooltipContent side="right" className="max-w-[280px] space-y-1 text-xs">
            {tooltipLines.map((line, i) => (
              <p key={i} className={i === 0 ? "font-semibold" : "text-muted-foreground"}>{line}</p>
            ))}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// Lista de opções em linhas compactas com checkbox (padrão Linear/Notion).
// Substitui os chips grandes; mostra busca quando há muitas opções.
function FilterOptionList({
  options, selected, onToggle, dot, searchable, searchPlaceholder = "Buscar...",
}: {
  options: { value: string; label: string }[];
  selected: (v: string) => boolean;
  onToggle: (v: string) => void;
  dot?: (v: string) => string | undefined;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const showSearch = searchable ?? options.length > 8;
  const filtered = q.trim() ? options.filter((o) => norm(o.label).includes(norm(q.trim()))) : options;
  return (
    <div className="space-y-1">
      {showSearch && (
        <div className="relative mb-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="h-8 pl-8 text-xs" />
        </div>
      )}
      <div className="max-h-[200px] overflow-y-auto -mx-1 px-1">
        {filtered.length === 0 && <div className="px-2 py-4 text-center text-xs text-muted-foreground">Nada encontrado</div>}
        {filtered.map((o) => {
          const on = selected(o.value);
          const d = dot?.(o.value);
          return (
            <button key={o.value} type="button" onClick={() => onToggle(o.value)}
              className={cn("w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                on ? "bg-primary/10 text-primary" : "hover:bg-muted/60")}>
              <span className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                on ? "bg-primary border-primary" : "border-input")}>
                {on && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
              </span>
              {d && <span className={cn("w-2 h-2 rounded-full shrink-0", d)} />}
              <span className="truncate flex-1">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Painel de filtro POR COLUNA (Frente B). Reaproveita o mesmo layout accordion
// do filtro geral, sem "Coluna/Status". Estado vem por props (do pai).
function ColumnFilterPanel({
  stageId, filter, onChange,
  assigneeOptions, sectorOptions, participantOptions, tagOptions,
  profilesMap,
}: {
  stageId: string;
  filter: ColumnFilter;
  onChange: (stageId: string, next: ColumnFilter) => void;
  assigneeOptions: string[];
  sectorOptions: string[];
  participantOptions: string[];
  tagOptions: string[];
  profilesMap: Record<string, string>;
}) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const active = columnFilterActive(filter);
  const activeCount =
    filter.assignees.length + filter.priorities.length + filter.sectors.length +
    filter.types.length + filter.participants.length + filter.tags.length +
    (filter.dueRange.from || filter.dueRange.to ? 1 : 0) +
    (filter.startRange.from || filter.startRange.to ? 1 : 0) +
    (filter.hoursRange.min || filter.hoursRange.max ? 1 : 0) +
    (filter.blocked ? 1 : 0);

  const toggleArr = (arr: string[], v: string) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  const set = (patch: Partial<ColumnFilter>) => onChange(stageId, { ...filter, ...patch });

  const PRIORITIES: [string, string, string][] = [
    ["urgente", "Urgente", "bg-red-500"], ["critica", "Crítica", "bg-orange-500"],
    ["alta", "Alta", "bg-amber-500"], ["media", "Média", "bg-sky-500"], ["baixa", "Baixa", "bg-emerald-500"],
  ];
  const EAP: [string, string][] = [["fase", "Fase / Entrega"], ["atividade", "Atividade"], ["marco", "Marco"]];

  const Section = ({ id, label, summary, on, children }: { id: string; label: string; summary: string; on: boolean; children: React.ReactNode }) => {
    const open = openSection === id;
    return (
      <div className="border-b last:border-b-0">
        <button type="button" onClick={() => setOpenSection(open ? null : id)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors">
          <span className="text-[13px] font-medium text-foreground">{label}</span>
          <span className={cn("ml-auto text-xs truncate max-w-[120px]", on ? "text-primary font-medium" : "text-muted-foreground")}>{summary}</span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        {open && <div className="px-4 pb-3 pt-0.5">{children}</div>}
      </div>
    );
  };
  const sumSet = (a: string[], all = "Todos") => a.length === 0 ? all : a.length === 1 ? a[0] : `${a.length} selecionados`;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setOpenSection(null); }}>
      <PopoverTrigger asChild>
        <button type="button"
          className={cn("h-5 w-5 flex items-center justify-center rounded hover:bg-accent transition-colors",
            active ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          // dnd-kit sequestra o pointerdown do header: paramos só na fase de
          // captura para o drag não iniciar, mas deixamos o Radix (via onClick do
          // PopoverTrigger) alternar a abertura normalmente.
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          title="Filtrar apenas esta coluna">
          <Filter className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[290px] p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Filtros</span>
          <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent-soft text-primary bg-primary/10">só esta coluna</span>
          {active && (
            <button type="button" onClick={() => onChange(stageId, EMPTY_COLUMN_FILTER)}
              className="ml-auto text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1">
              <XIcon className="w-3.5 h-3.5" /> Limpar
            </button>
          )}
        </div>

        <Section id="assignee" label="Responsável" summary={filter.assignees.length === 0 ? "Todos" : filter.assignees.length === 1 ? (profilesMap[filter.assignees[0]] ?? filter.assignees[0]) : `${filter.assignees.length} selecionados`} on={filter.assignees.length > 0}>
          <FilterOptionList
            options={assigneeOptions.map((n) => ({ value: n, label: profilesMap[n] ?? n }))}
            selected={(v) => filter.assignees.includes(v)}
            onToggle={(v) => set({ assignees: toggleArr(filter.assignees, v) })}
            searchPlaceholder="Buscar pessoa..."
          />
        </Section>

        <Section id="priority" label="Prioridade" summary={sumSet(filter.priorities, "Todas")} on={filter.priorities.length > 0}>
          <FilterOptionList
            options={PRIORITIES.map(([v, label]) => ({ value: v, label }))}
            selected={(v) => filter.priorities.includes(v)}
            onToggle={(v) => set({ priorities: toggleArr(filter.priorities, v) })}
            dot={(v) => PRIORITIES.find((p) => p[0] === v)?.[2]}
          />
        </Section>

        {sectorOptions.length > 0 && (
          <Section id="sector" label="Setor" summary={sumSet(filter.sectors)} on={filter.sectors.length > 0}>
            <FilterOptionList
              options={[...sectorOptions.map((s) => ({ value: s, label: s })), { value: "__none__", label: "Sem setor" }]}
              selected={(v) => filter.sectors.includes(v)}
              onToggle={(v) => set({ sectors: toggleArr(filter.sectors, v) })}
            />
          </Section>
        )}

        <Section id="type" label="Tipo (EAP)" summary={sumSet(filter.types)} on={filter.types.length > 0}>
          <FilterOptionList
            options={EAP.map(([v, label]) => ({ value: v, label }))}
            selected={(v) => filter.types.includes(v)}
            onToggle={(v) => set({ types: toggleArr(filter.types, v) })}
          />
        </Section>

        {participantOptions.length > 0 && (
          <Section id="participant" label="Participante" summary={sumSet(filter.participants)} on={filter.participants.length > 0}>
            <FilterOptionList
              options={participantOptions.map((p) => ({ value: p, label: profilesMap[p] ?? p }))}
              selected={(v) => filter.participants.includes(v)}
              onToggle={(v) => set({ participants: toggleArr(filter.participants, v) })}
              searchPlaceholder="Buscar participante..."
            />
          </Section>
        )}

        {tagOptions.length > 0 && (
          <Section id="tags" label="Etiquetas" summary={sumSet(filter.tags, "Todas")} on={filter.tags.length > 0}>
            <FilterOptionList
              options={tagOptions.map((t) => ({ value: t, label: t }))}
              selected={(v) => filter.tags.includes(v)}
              onToggle={(v) => set({ tags: toggleArr(filter.tags, v) })}
              searchPlaceholder="Buscar etiqueta..."
            />
          </Section>
        )}

        <Section id="due" label="Prazo" summary={filter.dueRange.from || filter.dueRange.to ? "Definido" : "Qualquer"} on={!!(filter.dueRange.from || filter.dueRange.to)}>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">De</label>
              <Input type="date" value={filter.dueRange.from} onChange={(e) => set({ dueRange: { ...filter.dueRange, from: e.target.value } })} className="h-8 text-xs flex-1" /></div>
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">Até</label>
              <Input type="date" value={filter.dueRange.to} onChange={(e) => set({ dueRange: { ...filter.dueRange, to: e.target.value } })} className="h-8 text-xs flex-1" /></div>
          </div>
        </Section>

        <Section id="start" label="Início" summary={filter.startRange.from || filter.startRange.to ? "Definido" : "Qualquer"} on={!!(filter.startRange.from || filter.startRange.to)}>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">De</label>
              <Input type="date" value={filter.startRange.from} onChange={(e) => set({ startRange: { ...filter.startRange, from: e.target.value } })} className="h-8 text-xs flex-1" /></div>
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">Até</label>
              <Input type="date" value={filter.startRange.to} onChange={(e) => set({ startRange: { ...filter.startRange, to: e.target.value } })} className="h-8 text-xs flex-1" /></div>
          </div>
        </Section>

        <Section id="hours" label="Horas" summary={filter.hoursRange.min || filter.hoursRange.max ? "Definido" : "Qualquer"} on={!!(filter.hoursRange.min || filter.hoursRange.max)}>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><label className="w-10 text-xs text-muted-foreground shrink-0">Mín</label>
              <Input type="number" min="0" value={filter.hoursRange.min} onChange={(e) => set({ hoursRange: { ...filter.hoursRange, min: e.target.value } })} className="h-8 text-xs flex-1" /></div>
            <div className="flex items-center gap-2"><label className="w-10 text-xs text-muted-foreground shrink-0">Máx</label>
              <Input type="number" min="0" value={filter.hoursRange.max} onChange={(e) => set({ hoursRange: { ...filter.hoursRange, max: e.target.value } })} className="h-8 text-xs flex-1" /></div>
          </div>
        </Section>

        <div className="border-b last:border-b-0">
          <button type="button" onClick={() => set({ blocked: !filter.blocked })}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors">
            <span className="text-[13px] font-medium text-foreground">Apenas bloqueadas</span>
            <span className={cn("ml-auto w-9 h-5 rounded-full relative transition-colors shrink-0", filter.blocked ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform", filter.blocked && "translate-x-4")} />
            </span>
          </button>
        </div>

        {active && (
          <div className="px-4 py-2 border-t bg-muted/30 text-[11px] text-muted-foreground">
            {activeCount} filtro{activeCount > 1 ? "s" : ""} nesta coluna
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SortableColumn({
  stage,
  stageActivities,
  activities,
  phases,
  widthPct,
  isLast,
  onEditActivity,
  onDeleteActivity,
  onToggleActivity,
  onMoveToStage,
  moveTargets,
  onDuplicateActivity,
  onCopyActivityLink,
  onChangeActivityType,
  onToggleBlocked,
  onLinkParent,
  onCreateActivity,
  storyLinkedActivities,
  isAdmin,
  canCreate,
  onResizeStart,
  onStoryClick,
  onCreateStory,
  isQualityProject,
  onOpenCreateTask,
  subActivityCounts,
  hoursStatsByActivity,
  dependencyCounts,
  waitingOnCounts,
  commentCounts,
  attachmentCounts,
  relationCounts,
  onOpenRelated,
  onRemoveRelation,
  isAdminOrGestor,
  onRenameStage,
  onDeleteStage,
  onChangeStageColor,
  onSetStageProgress,
  onSetStageWipLimit,
  onToggleStageWipStrict,
  onToggleStageContributes,
  onToggleStageFinal,
  onToggleStageBlocked,
  onToggleStageVisible,
  allStages,
  cardFields,
  profilesMap = {},
  profileAvatarMap = {},
  laneId,
  collapsed = false,
  onToggleCollapse,
  columnFilterSlot,
}: {
  stage: WorkflowStage;
  stageActivities: Activity[];
  laneId?: string;
  collapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  columnFilterSlot?: React.ReactNode;
  activities: Activity[];
  phases: Phase[];
  widthPct: number;
  isLast: boolean;
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  onToggleActivity: (activityId: string, currentStatus: string) => void;
  onMoveToStage: (activityId: string, stageId: string) => void;
  moveTargets?: { id: string; title: string; color: string }[];
  onDuplicateActivity?: (activityId: string) => void;
  onCopyActivityLink?: (activityId: string) => void;
  onChangeActivityType?: (activityId: string, kind: EapKind) => void;
  onToggleBlocked: (activityId: string) => void;
  onLinkParent?: (activityId: string, currentParentId: string | null) => void;
  onCreateActivity: (stageId: string, title: string, phaseId: string | null, displayOrder: number | null) => Promise<void>;
  storyLinkedActivities: Map<string, number>;
  isAdmin?: boolean;
  canCreate?: boolean;
  onResizeStart: (e: React.MouseEvent, stageId: string, widthPct: number) => void;
  onStoryClick: (activityId: string) => void;
  onCreateStory: (activity: Activity) => void;
  isQualityProject?: boolean;
  onOpenCreateTask?: (stageId: string) => void;
  subActivityCounts: Map<string, number>;
  dependencyCounts?: Map<string, { pred: number; succ: number }>;
  waitingOnCounts?: Map<string, number>;
  commentCounts?: Map<string, number>;
  attachmentCounts?: Map<string, number>;
  relationCounts?: Map<string, { id: string; title: string; relationId: string; relationType: string }[]>;
  onOpenRelated?: (activityId: string) => void;
  onRemoveRelation?: (relationId: string) => void;
  isAdminOrGestor?: boolean;
  onRenameStage: (id: string, title: string) => Promise<void>;
  onDeleteStage: (id: string) => Promise<void>;
  onChangeStageColor: (id: string, color: string) => Promise<void>;
  onSetStageProgress: (id: string, current: number | null | undefined) => Promise<void>;
  onSetStageWipLimit: (id: string, current: number | null | undefined) => Promise<void>;
  onToggleStageWipStrict?: (id: string, current: boolean) => Promise<void>;
  onToggleStageContributes: (id: string, current: boolean | undefined) => Promise<void>;
  onToggleStageFinal: (id: string, current: boolean) => Promise<void>;
  onToggleStageBlocked: (id: string, current: boolean) => Promise<void>;
  onToggleStageVisible: (id: string, current: boolean) => Promise<void>;
  allStages: WorkflowStage[];
  cardFields: CardFields;
  hoursStatsByActivity?: Map<string, HoursStat>;
  profilesMap?: Record<string, string>;
  profileAvatarMap?: Record<string, string>;
}) {
  const [colSort, setColSort] = useState<string>("updated:desc");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPhase, setQuickPhase] = useState("");
  const [quickOrder, setQuickOrder] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(stage.title);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Map: parentId -> list of children, ordered by display_order
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Activity[]>();
    activities.forEach((a) => {
      if (a.parent_id) {
        if (!map.has(a.parent_id)) map.set(a.parent_id, []);
        map.get(a.parent_id)!.push(a);
      }
    });
    map.forEach((arr) =>
      arr.sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999)),
    );
    return map;
  }, [activities]);

  const descendantSummaryById = useMemo(() => {
    const memo = new Map<string, { completed: number; pending: number }>();

    const walk = (id: string, seen = new Set<string>()): { completed: number; pending: number } => {
      if (memo.has(id)) return memo.get(id)!;
      if (seen.has(id)) return { completed: 0, pending: 0 };

      const nextSeen = new Set(seen);
      nextSeen.add(id);

      const children = childrenByParent.get(id) || [];
      let completed = 0;
      let pending = 0;

      children.forEach((child) => {
        if (child.status === "completed") completed += 1;
        else pending += 1;

        const deep = walk(child.id, nextSeen);
        completed += deep.completed;
        pending += deep.pending;
      });

      const summary = { completed, pending };
      memo.set(id, summary);
      return summary;
    };

    activities.forEach((a) => {
      memo.set(a.id, walk(a.id));
    });

    return memo;
  }, [activities, childrenByParent]);

  const descendantProgressById = useMemo(() => {
    const memo = new Map<string, { sum: number; count: number }>();

    const walk = (id: string, seen = new Set<string>()): { sum: number; count: number } => {
      if (memo.has(id)) return memo.get(id)!;
      if (seen.has(id)) return { sum: 0, count: 0 };

      const nextSeen = new Set(seen);
      nextSeen.add(id);

      const children = childrenByParent.get(id) || [];
      let sum = 0;
      let count = 0;

      children.forEach((child) => {
        const info = computeActivityProgress(child.workflow_stage_id, allStages, child.last_progress_stage_id);
        const pct = info.paused ? 0 : (info.percent ?? 0);
        sum += pct;
        count += 1;

        const deep = walk(child.id, nextSeen);
        sum += deep.sum;
        count += deep.count;
      });

      const result = { sum, count };
      memo.set(id, result);
      return result;
    };

    activities.forEach((a) => {
      memo.set(a.id, walk(a.id));
    });

    return memo;
  }, [activities, childrenByParent, allStages]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    // Em raias (laneId presente) a coluna nao e reordenavel — evita ids de dnd
    // duplicados no mesmo contexto (a mesma coluna aparece em cada raia).
    useSortable({ id: `col-${stage.id}`, disabled: !!laneId });

  // Visual ClickUp-like: colunas com fundo claro neutro e uma fina faixa colorida no topo
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    // `1 1 X%` sozinho deixava as colunas se comprimirem sem limite: com 7
    // colunas cada uma ficava com ~14% e o card virava uma tira, com título
    // quebrando em três linhas. minWidth trava o encolhimento e o quadro passa
    // a rolar na horizontal — é assim que Trello, Jira e ClickUp se comportam.
    flex: `1 1 ${widthPct}%`,
    minWidth: MIN_COLUMN_WIDTH,
    marginRight: isLast ? 0 : 8,
    borderTop: `3px solid ${stage.color}`,
    // Fundo cinza neutro (token dedicado, sem o matiz azul do --muted).
    backgroundColor: "hsl(var(--kanban-col-bg))",
  };

  const phaseOrderMap: Record<string, number> = {};
  phases.forEach((p, i) => { phaseOrderMap[p.id] = i; });
  const priorityWeight: Record<GutLevel, number> = { urgente: 0, critica: 1, alta: 2, media: 3, baixa: 4, pendente: 5 };
  const stageActivityIds = useMemo(() => new Set(stageActivities.map((a) => a.id)), [stageActivities]);

  const sortStageItems = useCallback((list: Activity[]) => {
    // colSort = "criterio:dir" (ex.: "due:asc"). Cada critério define uma ordem
    // base ascendente; a direção só inverte o resultado.
    const [criterion, dir = "asc"] = colSort.split(":");
    const cmp = (a: Activity, b: Activity): number => {
      switch (criterion) {
        case "wbs": {
          const pA = a.phase_id ? (phaseOrderMap[a.phase_id] ?? 999) : 999;
          const pB = b.phase_id ? (phaseOrderMap[b.phase_id] ?? 999) : 999;
          if (pA !== pB) return pA - pB;
          return (a.display_order ?? 9999) - (b.display_order ?? 9999);
        }
        case "updated":
          return new Date(a.updated_at || a.created_at).getTime() - new Date(b.updated_at || b.created_at).getTime();
        case "priority":
          return (priorityWeight[normalizeGut(a.priority)] ?? 5) - (priorityWeight[normalizeGut(b.priority)] ?? 5);
        case "due": {
          const da = a.end_date ? new Date(a.end_date).getTime() : Infinity;
          const db = b.end_date ? new Date(b.end_date).getTime() : Infinity;
          return da - db;
        }
        case "assigned":
          return (a.assigned_to || "zzz").localeCompare(b.assigned_to || "zzz");
        case "hours":
          return (Number(a.hours) || 0) - (Number(b.hours) || 0);
        case "title":
          return (a.title || "").localeCompare(b.title || "");
        default:
          return 0;
      }
    };
    const sorted = [...list].sort((a, b) => (dir === "desc" ? -cmp(a, b) : cmp(a, b)));
    return sorted;
  }, [colSort, phases]);

  const rootStageActivities = useMemo(() => {
    return sortStageItems(
      stageActivities.filter((a) => {
        if (!a.parent_id) return true;
        // Subtarefa: só esconde da raiz se o PAI também estiver nesta coluna
        // (nesse caso ela aparece aninhada sob o pai). Caso contrário, aparece
        // como card independente com breadcrumb do pai.
        return !stageActivityIds.has(a.parent_id);
      })
    );
  }, [stageActivities, stageActivityIds, sortStageItems]);

  const sortedActivities = rootStageActivities;

  const visibleCardCount = useMemo(() => {
    return sortedActivities.reduce((total, activity) => {
      const inlineChildren = (childrenByParent.get(activity.id) || []).filter((child) => stageActivityIds.has(child.id));
      return total + 1 + (expandedIds.has(activity.id) ? inlineChildren.length : 0);
    }, 0);
  }, [sortedActivities, childrenByParent, stageActivityIds, expandedIds]);

  const dCol = KANBAN_TOKENS;

  // Renderiza um card e, se expandido, seus filhos — RECURSIVAMENTE, de modo que
  // fase → pacote → atividade (netos e além) apareçam ao expandir. Cada filho
  // recebe sua contagem real e seu próprio controle de expansão.
  // `ancestors` protege contra ciclos em parent_id (dado corrompido) — sem isso
  // um ciclo A↔B travaria a aba num loop infinito de render.
  const renderActivityNode = (
    activity: Activity,
    depth: number,
    ancestors: Set<string> = new Set(),
  ): React.ReactNode => {
    if (ancestors.has(activity.id)) return null;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(activity.id);
    const allChildren = childrenByParent.get(activity.id) || [];
    const inlineChildren = allChildren.filter((child) => stageActivityIds.has(child.id));
    const externalChildren = allChildren.filter((child) => !stageActivityIds.has(child.id));
    const subActivityStatusSummary =
      descendantSummaryById.get(activity.id) || { completed: 0, pending: 0 };
    const parentProgress = (() => {
      const deepProgress = descendantProgressById.get(activity.id);
      const totalSubs = deepProgress?.count || 0;
      if (totalSubs === 0) {
        return computeActivityProgress(activity.workflow_stage_id, allStages, activity.last_progress_stage_id);
      }
      const percent = Math.max(0, Math.min(100, Math.round((deepProgress!.sum / totalSubs))));
      return { percent, paused: false, label: progressLabelFromPercent(percent) } as ActivityProgress;
    })();
    const expanded = expandedIds.has(activity.id);
    const isMirrorParent = !stageActivityIds.has(activity.id) && inlineChildren.length > 0;
    const parentAct = activity.parent_id ? activities.find((p) => p.id === activity.parent_id) : null;
    const parentBreadcrumb = parentAct && parentAct.workflow_stage_id !== activity.workflow_stage_id
      ? { id: parentAct.id, title: parentAct.title, wbsCode: parentAct.wbs_code }
      : null;
    // Subtarefas impedidas: agora pela flag da própria atividade, não por
    // estarem numa coluna de bloqueio.
    const blockedSubsCount = allChildren.filter((c) => c.is_blocked).length;

    const commonCardProps = {
      activity,
      phases,
      onEdit: () => onEditActivity(activity),
      onDelete: () => onDeleteActivity(activity.id),
      onToggle: () => onToggleActivity(activity.id, activity.status),
      onMoveToStage: (stageId: string) => onMoveToStage(activity.id, stageId),
      moveTargets,
      onDuplicate: onDuplicateActivity ? () => onDuplicateActivity(activity.id) : undefined,
      onCopyLink: onCopyActivityLink ? () => onCopyActivityLink(activity.id) : undefined,
      onChangeType: onChangeActivityType ? (kind: EapKind) => onChangeActivityType(activity.id, kind) : undefined,
      onLinkParent: () => onLinkParent?.(activity.id, activity.parent_id ?? null),
      isAdmin,
      // "block in place": o bloqueio é da ATIVIDADE, não da coluna — o card
      // fica onde o trabalho está e segue contando no limite de WIP.
      isBlocked: !!activity.is_blocked,
      onToggleBlocked: () => onToggleBlocked(activity.id),
      hasStory: storyLinkedActivities.has(activity.id),
      storyCount: storyLinkedActivities.get(activity.id) || 0,
      onStoryClick: () => onStoryClick(activity.id),
      onCreateStory: () => onCreateStory(activity),
      isQualityProject,
      stageColor: stage.color,
      dependencyCount: dependencyCounts?.get(activity.id),
      waitingOnCount: waitingOnCounts?.get(activity.id),
      commentCount: commentCounts?.get(activity.id),
      attachmentCount: attachmentCounts?.get(activity.id),
      relationItems: relationCounts?.get(activity.id) || [],
      onOpenRelated,
      onRemoveRelation,
      subActivityCount: allChildren.length,
      isExpanded: expanded,
      onToggleExpand: () => toggleExpanded(activity.id),
      progress: parentProgress,
      cardFields,
      parentBreadcrumb,
      blockedSubsCount,
      subActivityStatusSummary,
      hoursStat: hoursStatsByActivity?.get(activity.id),
      profilesMap,
      profileAvatarMap,
    };

    return (
      <div key={activity.id} className={dCol.colBodyGap}>
        {isMirrorParent ? (
          <KanbanCard {...commonCardProps} readOnlyPreview />
        ) : depth === 0 ? (
          <SortableKanbanCard {...commonCardProps} />
        ) : (
          // Filhos aninhados não são sortable (drag é por raiz de coluna).
          <KanbanCard {...commonCardProps} />
        )}
        {expanded && (inlineChildren.length > 0 || externalChildren.length > 0) && (
          <div className="ml-4 pl-2 border-l-2 border-primary/30 space-y-1.5">
            {isMirrorParent && (
              <div className="px-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5 text-primary border-primary/20">
                  Pai agrupador
                </Badge>
              </div>
            )}
            {inlineChildren.map((child) => renderActivityNode(child, depth + 1, nextAncestors))}
            {externalChildren.map((child) => {
              const childStage = allStages.find((s) => s.id === child.workflow_stage_id);
              return (
                <div key={child.id} className="space-y-1">
                  {childStage && (
                    <div className="flex items-center gap-1.5 px-1">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide text-white"
                        style={{ backgroundColor: childStage.color }}
                        title={`Esta subtarefa está em "${getStageDisplayTitle(childStage.title)}"`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                        {getStageDisplayTitle(childStage.title)}
                      </span>
                    </div>
                  )}
                  {renderActivityNode(child, depth + 1, nextAncestors)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        // minWidth precisa ser anulado: o spread traz MIN_COLUMN_WIDTH e a
        // coluna recolhida tem largura fixa de 44px.
        style={{ ...style, flex: "0 0 auto", width: 44, minWidth: 44 }}
        {...attributes}
        className="relative rounded-lg border bg-card border-border flex flex-col items-center overflow-hidden shadow-sm cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => onToggleCollapse?.(stage.id)}
        title={`${getStageDisplayTitle(stage.title)} · ${visibleCardCount} card(s) — clique para expandir`}
      >
        <div className="flex flex-col items-center gap-2 py-2 h-full w-full">
          <ChevronsRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <Badge variant="secondary" className="text-[10px] px-1 py-0 min-w-[18px] text-center shrink-0">
            {visibleCardCount}
          </Badge>
          <div
            className="text-[11px] font-semibold text-muted-foreground mt-1 whitespace-nowrap"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {getStageDisplayTitle(stage.title)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="group/col relative min-w-0 rounded-lg border border-border flex flex-col overflow-hidden shadow-sm"
    >
      {/* Column Header - drag handle for column reordering */}
      <div className={`${dCol.colHeaderPad} border-b border-border/60`} style={{ backgroundColor: "hsl(var(--kanban-col-head))" }}>
        <div className="flex items-center justify-between cursor-grab active:cursor-grabbing" {...listeners}>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={() => {
                  if (renameValue.trim() && renameValue.trim() !== stage.title) {
                    onRenameStage(stage.id, renameValue.trim());
                  }
                  setRenaming(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (renameValue.trim() && renameValue.trim() !== stage.title) {
                      onRenameStage(stage.id, renameValue.trim());
                    }
                    setRenaming(false);
                  } else if (e.key === "Escape") {
                    setRenameValue(stage.title);
                    setRenaming(false);
                  }
                }}
                className={`${dCol.colHeaderTitle} font-semibold text-foreground bg-transparent border-b border-border outline-none w-32`}
              />
            ) : (
              <h3 className={`${dCol.colHeaderTitle} font-semibold text-foreground truncate`}>
                {getStageDisplayTitle(stage.title)}
              </h3>
            )}
            {/* A categoria NÃO é exibida ao lado do título: com várias colunas
                classificadas como "andamento", o cabeçalho passava a repetir
                "EM ANDAMENTO" quadro afora e dava a impressão de que os nomes
                das colunas tinham mudado. Ela vive no menu da coluna, onde é
                escolhida — e é lá que se confere. */}
            {stage.wip_limit != null && stage.wip_limit > 0 ? (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 min-w-[20px] text-center shrink-0 font-semibold ${
                  visibleCardCount > stage.wip_limit
                    ? "bg-destructive/15 text-destructive border-destructive/40"
                    : visibleCardCount === stage.wip_limit
                    ? "bg-orange-500/15 text-orange-600 border-orange-500/40"
                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
                }`}
                title={
                  visibleCardCount > stage.wip_limit
                    ? `Limite de WIP excedido: ${visibleCardCount} de ${stage.wip_limit}`
                    : `${visibleCardCount} de ${stage.wip_limit} (limite de WIP)`
                }
              >
                {visibleCardCount} / {stage.wip_limit}
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 min-w-[20px] text-center shrink-0"
                title={`${visibleCardCount} card(s) visível(is) nesta coluna`}
              >
                {visibleCardCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Controles secundários (filtro, ordenar, recolher) só no hover:
                cinco ícones fixos competiam com o próprio nome da coluna, que
                em coluna estreita chegava a truncar. Criar e o menu ficam
                sempre visíveis, por serem as ações do dia a dia. */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover/col:opacity-100 focus-within:opacity-100 transition-opacity">
            {/* Filtro por coluna (Frente B) — construído no pai, injetado aqui */}
            {columnFilterSlot}
            {/* Ordenar cards desta coluna — ícone discreto (era um select de largura total) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "h-5 w-5 flex items-center justify-center rounded hover:bg-accent transition-colors",
                    colSort === "updated:desc" ? "text-muted-foreground hover:text-foreground" : "text-primary",
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Ordenar cards desta coluna"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Ordenar por</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(() => {
                  const [activeCrit, activeDir = "asc"] = colSort.split(":");
                  // Padrão Linear/Notion: lista enxuta só com nomes; a direção é a
                  // seta no item ativo — clicar no ativo inverte.
                  const criteria: { id: string; label: string; defaultDir: "asc" | "desc" }[] = [
                    { id: "updated", label: "Atualização", defaultDir: "desc" },
                    { id: "priority", label: "Prioridade", defaultDir: "asc" },
                    { id: "due", label: "Prazo", defaultDir: "asc" },
                    { id: "assigned", label: "Responsável", defaultDir: "asc" },
                    { id: "hours", label: "Horas", defaultDir: "desc" },
                    { id: "title", label: "Título", defaultDir: "asc" },
                  ];
                  return criteria.map((c) => {
                    const isActive = activeCrit === c.id;
                    const nextDir = isActive ? (activeDir === "asc" ? "desc" : "asc") : c.defaultDir;
                    return (
                      <DropdownMenuItem
                        key={c.id}
                        onSelect={() => setColSort(`${c.id}:${nextDir}`)}
                        className="gap-2 text-xs"
                      >
                        <span className={cn("flex-1", isActive && "font-medium text-primary")}>{c.label}</span>
                        {isActive && (activeDir === "asc"
                          ? <ArrowUp className="w-3.5 h-3.5 text-primary shrink-0" />
                          : <ArrowDown className="w-3.5 h-3.5 text-primary shrink-0" />)}
                      </DropdownMenuItem>
                    );
                  });
                })()}
              </DropdownMenuContent>
            </DropdownMenu>
            {onToggleCollapse && (
              <button
                type="button"
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse(stage.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Recolher coluna"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
            )}
            </div>
            {canCreate && (
              <button
                type="button"
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  // Criação INLINE na coluna, não diálogo: digitar o título e dar
                  // Enter é o gesto padrão (Trello/Linear/Notion) e o form inline
                  // já existia aqui — só estava inalcançável, porque
                  // onOpenCreateTask sempre vinha preenchido e abria o modal.
                  // O formulário completo continua a um clique, dentro do inline.
                  setShowQuickAdd((v) => !v);
                }}
                title="Criar atividade nesta coluna"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            {isAdminOrGestor && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Opções da coluna"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <DropdownMenuLabel className="text-xs">Gerenciar coluna</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      setRenameValue(stage.title);
                      setRenaming(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Renomear
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="focus:bg-muted/60 focus:text-foreground data-[state=open]:bg-muted/60 data-[state=open]:text-foreground">
                      <div className="w-3.5 h-3.5 mr-2 rounded-full" style={{ backgroundColor: stage.color }} />
                      Alterar cor
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent sideOffset={6} className="p-2">
                      <div className="grid grid-cols-4 gap-1.5">
                        {STAGE_PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="w-6 h-6 rounded-full ring-1 ring-border hover:ring-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/40"
                            style={{ backgroundColor: c }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onChangeStageColor(stage.id, c);
                            }}
                          />
                        ))}
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onToggleStageFinal(stage.id, stage.is_final);
                    }}
                    title="Final: atividades nesta coluna passam a representar 100% do fluxo."
                  >
                    <Check className="w-3.5 h-3.5 mr-2 text-success" />
                    {stage.is_final ? "Remover marca de Final" : "Marcar como Final"}
                  </DropdownMenuItem>
                  {/* "Marcar como Bloqueio" saiu daqui: bloqueio é do ITEM, não
                      da coluna. Uma coluna de bloqueio tira o card do fluxo,
                      escapa do limite de WIP e distorce o tempo por etapa —
                      agora se bloqueia pelo próprio card, que fica no lugar. */}
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onSetStageProgress(stage.id, stage.progress_percent ?? null);
                    }}
                    title="Define um percentual fixo para esta coluna. Em branco = automático por posição."
                  >
                    <LayoutGrid className="w-3.5 h-3.5 mr-2" />
                    {stage.progress_percent == null
                      ? "Definir progresso (%)"
                      : `Editar progresso (${stage.progress_percent}%)`}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onSetStageWipLimit(stage.id, stage.wip_limit ?? null);
                    }}
                    title="Limite de cards em andamento (WIP). Em branco = sem limite."
                  >
                    <Layers className="w-3.5 h-3.5 mr-2" />
                    {stage.wip_limit == null
                      ? "Definir limite (WIP)"
                      : `Editar limite WIP (${stage.wip_limit})`}
                  </DropdownMenuItem>
                  {/* Só faz sentido oferecer o modo rígido quando existe limite. */}
                  {stage.wip_limit != null && stage.wip_limit > 0 && onToggleStageWipStrict && (
                    <DropdownMenuItem
                      className="focus:bg-muted/60 focus:text-foreground"
                      onSelect={(e) => {
                        e.preventDefault();
                        onToggleStageWipStrict(stage.id, !!(stage as any).wip_strict);
                      }}
                      title="Rígido: o quadro IMPEDE trazer mais cards ao atingir o limite. Flexível: apenas avisa."
                    >
                      {(stage as any).wip_strict
                        ? <Check className="w-3.5 h-3.5 mr-2 text-success" />
                        : <span className="w-3.5 h-3.5 mr-2" />}
                      {(stage as any).wip_strict ? "Limite rígido (impede)" : "Tornar limite rígido"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onToggleStageContributes(stage.id, stage.contributes_to_progress);
                    }}
                    title="Quando desativado, esta coluna não avança o progresso do fluxo."
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                    {stage.contributes_to_progress === false
                      ? "Incluir no progresso"
                      : "Remover do progresso"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onToggleStageVisible(stage.id, stage.is_visible);
                    }}
                  >
                    {stage.is_visible ? <EyeOff className="w-3.5 h-3.5 mr-2" /> : <Eye className="w-3.5 h-3.5 mr-2" />}
                    {stage.is_visible ? "Ocultar coluna" : "Mostrar coluna"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      onDeleteStage(stage.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir coluna
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Quick Add Form */}
      {showQuickAdd && canCreate && (
        <div className="px-2 pb-2 space-y-2 border-b border-border/50" onClick={(e) => e.stopPropagation()}>
          <Input
            placeholder="Título da atividade..."
            className="h-8 text-xs"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && quickTitle.trim()) {
                setQuickLoading(true);
                onCreateActivity(stage.id, quickTitle.trim(), quickPhase || null, quickOrder ? parseInt(quickOrder) : null)
                  // Enter cria e MANTÉM o campo aberto (só limpa o título): ao
                  // planejar, criam-se várias tarefas em sequência. Fase e nº EAP
                  // persistem de propósito — costumam repetir entre itens irmãos.
                  // Esc fecha.
                  .then(() => { setQuickTitle(""); })
                  .finally(() => setQuickLoading(false));
              }
              if (e.key === "Escape") setShowQuickAdd(false);
            }}
          />
          {phases.length > 0 && (
            <select
              className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              value={quickPhase}
              onChange={(e) => setQuickPhase(e.target.value)}
            >
              <option value="">Sem fase (EAP)</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          )}
          <Input
            placeholder="Nº EAP (opcional, ex: 1.2.3)"
            className="h-7 text-xs"
            value={quickOrder}
            onChange={(e) => setQuickOrder(e.target.value)}
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              disabled={!quickTitle.trim() || quickLoading}
              onClick={() => {
                setQuickLoading(true);
                onCreateActivity(stage.id, quickTitle.trim(), quickPhase || null, quickOrder ? parseInt(quickOrder) : null)
                  .then(() => { setQuickTitle(""); setQuickPhase(""); setQuickOrder(""); setShowQuickAdd(false); })
                  .finally(() => setQuickLoading(false));
              }}
            >
              {quickLoading ? "Criando..." : "Criar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowQuickAdd(false)}>
              Cancelar
            </Button>
          </div>
          {/* Porta para o formulário completo: o inline cobre o caso comum
              (título, fase, EAP); responsável, prazo, horas e o resto continuam
              a um clique daqui, sem virar pedágio de toda criação. */}
          {onOpenCreateTask && (
            <button
              type="button"
              className="w-full text-[11px] text-muted-foreground hover:text-primary transition-colors text-left"
              onClick={() => { setShowQuickAdd(false); onOpenCreateTask(stage.id); }}
            >
              Mais campos (prazo, responsável…)
            </button>
          )}
        </div>
      )}

      {/* Droppable Column Body */}
      <DroppableColumn stage={stage} laneId={laneId}>
        <SortableContext
          items={stageActivities.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {sortedActivities.length === 0 ? (
            <div className="flex items-center justify-center h-16 border-2 border-dashed border-border/30 rounded-lg">
              <p className="text-[11px] text-muted-foreground/50">Arraste aqui</p>
            </div>
          ) : (
            sortedActivities.map((activity) => renderActivityNode(activity, 0))
          )}
        </SortableContext>
      </DroppableColumn>

      {/* Resize Handle */}
      {!isLast && (
        <div
          className="absolute top-0 -right-[5px] w-[10px] h-full cursor-col-resize z-10 group flex items-center justify-center"
          onMouseDown={(e) => onResizeStart(e, stage.id, widthPct)}
        >
          <div className="w-[3px] h-8 rounded-full bg-border/50 group-hover:bg-primary/60 transition-colors" />
        </div>
      )}
    </div>
  );
}


function DroppableColumn({
  stage,
  children,
  laneId,
}: {
  stage: WorkflowStage;
  children: React.ReactNode;
  laneId?: string;
}) {
  // Em raias, o id do droppable inclui a raia p/ nao colidir entre raias; o
  // handleDragEnd extrai o stageId (parte antes de "--").
  const { setNodeRef, isOver } = useDroppable({ id: laneId ? `stage-${stage.id}--${laneId}` : `stage-${stage.id}` });
  const d = KANBAN_TOKENS;
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 ${d.colBodyPad} min-h-[120px] rounded-b-xl transition-colors ${
        isOver ? "bg-primary/5 ring-2 ring-primary/20 ring-inset" : ""
      }`}
    >
      {children}
    </div>
  );
}

function AddStageColumn({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="shrink-0 self-start pt-3 pl-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Adicionar uma coluna ao quadro"
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors whitespace-nowrap"
      >
        <Plus className="w-3 h-3" />
        Nova coluna
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onChanged?.();
        }}
      >
        <DialogContent className="max-w-[750px] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Configurar colunas do quadro</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <WorkflowStageManager projectId={projectId} onChanged={onChanged} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  const showProjectLockedToast = (action: string) => {
    toast({
      title: "Projeto concluído",
      description: `Reabra o projeto para ${action}.`,
      variant: "destructive",
    });
  };
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragType, setDragType] = useState<"card" | "column" | null>(null);
  const columnWidthsKey = `kanban-col-widths:${projectId}`;
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(`kanban-col-widths:${projectId}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  // Colunas recolhidas (só front-end, persistido por projeto).
  const collapsedStagesKey = `kanban-collapsed-stages:${projectId}`;
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(`kanban-collapsed-stages:${projectId}`);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleCollapsedStage = useCallback((stageId: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      try {
        window.localStorage.setItem(collapsedStagesKey, JSON.stringify([...next]));
      } catch { /* quota */ }
      return next;
    });
  }, [collapsedStagesKey]);
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
  const [createStoryTitle, setCreateStoryTitle] = useState("");
  const [createStoryNarrative, setCreateStoryNarrative] = useState("");
  const [createStoryLoading, setCreateStoryLoading] = useState(false);
  const [linkParentIds, setLinkParentIds] = useState<string[] | null>(null);
  const [linkParentCurrent, setLinkParentCurrent] = useState<string | null>(null);
  const canManageHierarchy = isAdmin || canCreate;
  
  // Optimistic overrides: activityId -> new workflow_stage_id
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});

  // Chaves de preferência substituídas por versões novas: limpa a antiga
  // para não acumular lixo indefinidamente no localStorage do usuário.
  // - kanban-density (Fase 0): densidade S/M/G removida, o quadro tem um só
  //   tamanho, o da imagem aprovada (lib/kanbanTokens).
  // - kanban-card-fields v1 (Fase 1): campo virou versionado porque o merge
  //   com o default antigo (participants/hours/subCount=true) sobrescrevia
  //   o novo padrão para quem já tinha usado o quadro; ver cardFieldsKey.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(`kanban-density:${projectId}`);
      window.localStorage.removeItem(`kanban-card-fields:${projectId}`);
    }
  }, [projectId]);

  // Campos visíveis do card (⚙ Card), persistido por projeto. Faz merge com os
  // defaults para tolerar chaves novas adicionadas em versões futuras.
  //
  // Chave em v2 (Fase 1): quem já usava o quadro tinha participants/hours/
  // subCount=true salvos no v1 — o merge "...DEFAULT_CARD_FIELDS, ...raw"
  // faria o valor salvo vencer e a mudança de padrão nunca apareceria para
  // ninguém que já tivesse aberto a tela antes. Bump de versão zera todo
  // mundo para o novo padrão uma vez; o v1 fica órfão e inofensivo.
  const cardFieldsKey = `kanban-card-fields:v2:${projectId}`;
  const [cardFields, setCardFields] = useState<CardFields>(() => {
    if (typeof window === "undefined") return DEFAULT_CARD_FIELDS;
    try {
      const raw = window.localStorage.getItem(cardFieldsKey);
      return raw ? { ...DEFAULT_CARD_FIELDS, ...JSON.parse(raw) } : DEFAULT_CARD_FIELDS;
    } catch {
      return DEFAULT_CARD_FIELDS;
    }
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(cardFieldsKey, JSON.stringify(cardFields)); } catch { /* quota */ }
    }
  }, [cardFields, cardFieldsKey]);
  const toggleCardField = useCallback((key: keyof CardFields) => {
    setCardFields((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Filtro "Apenas minhas tarefas" — persistido por projeto
  const { user, profile } = useAuth();
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

  // Agrupamento em raias (swimlanes): nenhum / por fase / por responsável.
  const [groupBy, setGroupBy] = useState<"none" | "phase" | "assignee" | "priority" | "sector" | "tag" | "blocked" | "due" | "customGroup">("none");
  // Times de raia (nível B): grupos nomeados de pessoas, por projeto,
  // compartilhados via banco. Alimentam a "Raia por time" quando o usuário
  // escolhe agrupar por time — não alteram o comportamento padrão do Kanban.
  type LaneTeam = { id: string; name: string; members: string[] };
  const [laneGroups, setLaneGroups] = useState<LaneTeam[]>([]);
  const [manageGroupsOpen, setManageGroupsOpen] = useState(false);
  const [teamsUnavailable, setTeamsUnavailable] = useState(false); // migration ainda não aplicada

  const fetchTeams = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("kanban_teams")
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
    const { data, error } = await (supabase as any)
      .from("kanban_teams")
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
    await (supabase as any)
      .from("kanban_teams")
      .update({ name: team.name, members: team.members, updated_at: new Date().toISOString() })
      .eq("id", team.id);
  }, []);

  const deleteTeam = useCallback(async (id: string) => {
    setLaneGroups((gs) => gs.filter((x) => x.id !== id));
    await (supabase as any).from("kanban_teams").delete().eq("id", id);
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
    setFilterTags(new Set()); setFilterBlocked(false);
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

  // Colunas de bloqueio (para o filtro "Bloqueadas").
  const blockedStageIdSet = useMemo(
    () => new Set(stages.filter((s) => s.is_blocked).map((s) => s.id)),
    [stages],
  );

  // Ids que são pais de alguém (agrupadores de fato), derivado das atividades.
  const parentIdsWithChildren = useMemo(() => {
    const s = new Set<string>();
    activities.forEach((a) => { const p = (a as any).parent_id; if (p) s.add(p); });
    return s;
  }, [activities]);

  // Tipo EAP de uma atividade (fonte única: lib/eapModel). Três papéis:
  // Fase/Entrega (agrupa; cobre 'pacote' legado e itens com filhos), Atividade, Marco.
  const activityEapType = useCallback((a: Activity): string => {
    return resolveEapKind(a as any, parentIdsWithChildren.has(a.id));
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
      if (myId && (a as any).created_by === myId) return true;
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
    [myId, myName]
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

  // Initialize equal column widths when stages change
  useEffect(() => {
    const visibleStages = stages.filter((s) => s.display_order > 0);
    if (visibleStages.length === 0) return;
    // Only initialize if no widths set yet
    setColumnWidths((prev) => {
      const hasAll = visibleStages.every((s) => prev[s.id]);
      if (hasAll) return prev;
      const equalWidth = 100 / visibleStages.length;
      const widths: Record<string, number> = {};
      visibleStages.forEach((s) => (widths[s.id] = prev[s.id] || equalWidth));
      return widths;
    });
  }, [stages]);

  const handleResizeStart = useCallback((e: React.MouseEvent, stageId: string, currentWidthPct: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.offsetWidth;
    const startWidth = (currentWidthPct / 100) * containerWidth;
    resizingRef.current = { stageId, startX: e.clientX, startWidth };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return;
      const diff = ev.clientX - resizingRef.current.startX;
      const newWidthPx = Math.max(160, resizingRef.current.startWidth + diff);
      const newWidthPct = (newWidthPx / containerRef.current.offsetWidth) * 100;
      setColumnWidths((prev) => ({ ...prev, [resizingRef.current!.stageId]: newWidthPct }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Persiste a largura ao soltar (nao a cada pixel).
      setColumnWidths((prev) => {
        try { window.localStorage.setItem(columnWidthsKey, JSON.stringify(prev)); } catch { /* quota */ }
        return prev;
      });
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [columnWidthsKey]);

  // KeyboardSensor além do ponteiro: sem ele o quadro é inoperável por teclado
  // (mover card só com mouse). O Backlog já usava este par — o Kanban ficou
  // atrás por omissão, não por decisão.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    fetchStages();
    // Fetch activities that have linked user stories
    supabase.from("user_stories").select("activity_id").eq("project_id", projectId).eq("is_trashed", false).not("activity_id", "is", null)
      .then(({ data }) => {
        if (data) {
          const countMap = new Map<string, number>();
          data.forEach((s: any) => {
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
          (data || []).forEach((d: any) => {
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
          (data || []).forEach((d: any) => {
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
      supabase
        .from("activity_comments")
        .select("activity_id")
        .in("activity_id", ids)
        .eq("is_trashed", false)
        .then(({ data }) => {
          const map = new Map<string, number>();
          (data || []).forEach((c: any) => {
            map.set(c.activity_id, (map.get(c.activity_id) || 0) + 1);
          });
          setCommentCounts(map);
        });
      supabase
        .from("project_documents")
        .select("activity_id")
        .in("activity_id", ids)
        .eq("is_trashed", false)
        .then(({ data }) => {
          const map = new Map<string, number>();
          (data || []).forEach((d: any) => {
            if (d.activity_id) map.set(d.activity_id, (map.get(d.activity_id) || 0) + 1);
          });
          setAttachmentCounts(map);
        });
      supabase
        .from("task_relations")
        .select("id, source_activity_id, target_activity_id, relation_type")
        .or(
          `source_activity_id.in.(${ids.join(",")}),target_activity_id.in.(${ids.join(",")})`,
        )
        .then(({ data }) => {
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
          (data || []).forEach((r: any) => {
            push(r.source_activity_id, r.target_activity_id, r.id, r.relation_type);
            push(r.target_activity_id, r.source_activity_id, r.id, r.relation_type);
          });
          setRelationCounts(map);
        });
    } else {
      setDependencyCounts(new Map());
      setWaitingOnCounts(new Map());
      setCommentCounts(new Map());
      setAttachmentCounts(new Map());
      setRelationCounts(new Map());
    }
  }, [projectId, activities]);

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
  }, [projectId]);

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

  

  const fetchStages = async () => {
    const { data, error } = await supabase
      .from("workflow_stages")
      .select("*")
      .eq("project_id", projectId)
      .order("display_order");
    console.log("[Kanban] fetchStages:", { data, error, projectId });
    if (data) {
      const normalized = data.map((s) => ({
        ...s,
        title: getStageDisplayTitle(s.title),
        // Enquanto a migration não roda, deriva a categoria das flags antigas
        // para a UI já se comportar pela categoria.
        categoria: parseWorkflowCategory((s as any).categoria) ?? categoryFromLegacyFlags(s as any),
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
  };

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
    onDataChanged();
  }, [activities, canMutateActivity, onDataChanged, projectLocked, showProjectLockedToast, stages, toast]);

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

  /** Copia o deep-link da atividade (a rota do projeto já trata ?activity=). */
  const handleCopyActivityLink = useCallback(async (activityId: string) => {
    try {
      const url = `${window.location.origin}${window.location.pathname}?activity=${activityId}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado" });
    } catch {
      toast({ title: "Não foi possível copiar o link", variant: "destructive" });
    }
  }, [toast]);

  /** Converte o papel EAP (Fase / Atividade / Marco) direto do quadro — já
   *  existia no Backlog e no diálogo; o Kanban era a única tela sem. */
  const handleChangeActivityType = useCallback(async (activityId: string, kind: EapKind) => {
    if (projectLocked) {
      showProjectLockedToast("alterar atividades");
      return;
    }
    const activity = activities.find((a) => a.id === activityId);
    if (!canMutateActivity(activity)) {
      toast({ title: "Somente o criador ou responsável da atividade pode alterar o tipo.", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("activities")
      .update(eapToPersisted(kind) as never)
      .eq("id", activityId);
    if (error) {
      toast({ title: "Erro ao converter tipo", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Convertida em ${EAP_LABELS[kind]}` });
    onDataChanged();
  }, [activities, canMutateActivity, onDataChanged, projectLocked, showProjectLockedToast, toast]);

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

    // "onlyMine" sempre se aplica; o filtro geral/coluna é decidido POR coluna.
    const source = onlyMine ? activities.filter(isMineActivity) : activities;
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

    const phaseOrderMap: Record<string, number> = {};
    phases.forEach((p, i) => {
      phaseOrderMap[p.id] = i;
    });

    // Default sort by WBS asc (no per-column sort here; sorting is done inside each column)
    const defaultSort = (a: Activity, b: Activity) => {
      const phaseA = a.phase_id ? (phaseOrderMap[a.phase_id] ?? 999) : 999;
      const phaseB = b.phase_id ? (phaseOrderMap[b.phase_id] ?? 999) : 999;
      if (phaseA !== phaseB) return phaseA - phaseB;
      return (a.display_order ?? 9999) - (b.display_order ?? 9999);
    };

    Object.keys(map).forEach((key) => {
      map[key].sort(defaultSort);
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

      const visibleStages = stages.filter((s) => s.display_order > 0);
      const oldIndex = visibleStages.findIndex((s) => s.id === activeColId);
      const newIndex = visibleStages.findIndex((s) => s.id === overColId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(visibleStages, oldIndex, newIndex);
      // Update local state immediately
      const backlogStages = stages.filter((s) => s.display_order === 0);
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
    if (targetStageId === currentStageId) return;

    // Regra container: atividade-pai (com subatividades) não pode ser movida manualmente.
    // Ela só transita por automação quando todas as subs forem concluídas/reabertas.
    // Admin pode sobrescrever.
    const childCount = subActivityCounts.get(activityId) || 0;
    if (childCount > 0 && !isAdmin) {
      toast({
        title: "Atividade-pai bloqueada para mover",
        description:
          "Esta atividade é um container de subatividades. Ela move automaticamente para Final quando todas as subs estiverem concluídas.",
        variant: "destructive",
      });
      return;
    }

    const stage = stages.find((s) => s.id === targetStageId);

    // Limite de WIP RÍGIDO (opt-in por coluna, wip_strict): impede o drop que
    // ultrapassaria o limite. Sem isto o limite só avisava depois do fato — e um
    // limite que nunca impede é decorativo, exatamente a crítica que a
    // literatura Kanban faz. Colunas sem wip_strict seguem só sinalizando.
    if (stage?.wip_limit != null && stage.wip_limit > 0 && (stage as any).wip_strict) {
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

    if (draggedActivity && newStatus === "completed") {
      const { data: hierarchyRows } = await supabase
        .from("activities")
        .select("id,parent_id,status")
        .eq("project_id", projectId)
        .eq("is_trashed", false);

      const childrenMap = new Map<string, Array<{ id: string; status: string; parent_id: string | null }>>();
      (hierarchyRows || []).forEach((candidate) => {
        if (!candidate.parent_id) return;
        const arr = childrenMap.get(candidate.parent_id) || [];
        arr.push(candidate as { id: string; status: string; parent_id: string | null });
        childrenMap.set(candidate.parent_id, arr);
      });

      const stack = [...(childrenMap.get(draggedActivity.id) || [])];
      const seen = new Set<string>();
      let pendingCount = 0;

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (seen.has(current.id)) continue;
        seen.add(current.id);

        if (current.status !== "completed") {
          pendingCount += 1;
        }

        const children = childrenMap.get(current.id) || [];
        children.forEach((child) => stack.push(child));
      }

      if (pendingCount > 0) {
        toast({
          title: "Atividade com pendências",
          description: `Não é possível concluir enquanto existirem ${pendingCount} subatividade(s) pendente(s).`,
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
          const completePayload: any = { status: "completed", completed_at: new Date().toISOString() };
          if (finalStageId) completePayload.workflow_stage_id = finalStageId;
          await (supabase.from("activities").update(completePayload) as any).in("id", ancestorsToComplete);
          if (finalStageId) {
            await (supabase.from("user_stories").update({ stage_id: finalStageId }) as any)
              .in("activity_id", ancestorsToComplete);
          }
        }

        if (ancestorsToReopen.length > 0) {
          const reopenPayload: any = { status: "pending", completed_at: null };
          if (reopenStageId) reopenPayload.workflow_stage_id = reopenStageId;
          await (supabase.from("activities").update(reopenPayload) as any).in("id", ancestorsToReopen);
          if (reopenStageId) {
            await (supabase.from("user_stories").update({ stage_id: reopenStageId }) as any)
              .in("activity_id", ancestorsToReopen);
          }
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
    const { error } = await supabase.from("activities").insert({
      project_id: projectId,
      title,
      phase_id: phaseId,
      status: "pending",
    });
    if (error) {
      toast({ title: "Erro ao criar atividade", description: error.message, variant: "destructive" });
    } else {
      onDataChanged();
    }
  };


  const visibleStages = useMemo(() => stages.filter((s) => s.display_order > 0 && s.is_visible !== false), [stages]);
  /** Destinos do "Mover para →" no menu do card: as colunas que o quadro mostra. */
  const moveTargets = useMemo(
    () => visibleStages.map((s) => ({ id: s.id, title: getStageDisplayTitle(s.title), color: s.color })),
    [visibleStages],
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
  }, [stages, projectId, toast]);

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
  }, [toast]);

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
  }, [stages, toast, appConfirm]);

  const handleChangeStageColor = useCallback(async (id: string, color: string) => {
    await supabase.from("workflow_stages").update({ color }).eq("id", id);
    fetchStages();
  }, []);

  const handleToggleStageFinal = useCallback(async (id: string, current: boolean) => {
    await supabase.from("workflow_stages").update({ is_final: !current, ...(current ? {} : { is_blocked: false }) }).eq("id", id);
    fetchStages();
  }, []);

  const handleToggleStageBlocked = useCallback(async (id: string, current: boolean) => {
    await supabase.from("workflow_stages").update({ is_blocked: !current, ...(current ? {} : { is_final: false }) }).eq("id", id);
    fetchStages();
  }, []);

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
  }, [toast]);

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
  }, [toast]);

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
  }, [toast]);

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
  }, [toast]);

  const handleToggleStageVisible = useCallback(async (id: string, current: boolean) => {
    await supabase.from("workflow_stages").update({ is_visible: !current }).eq("id", id);
    fetchStages();
  }, []);

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
            filterParticipants.size + (startActive ? 1 : 0) + (hoursActive ? 1 : 0);

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
          const EAP_LABELS: Record<string, string> = { fase: "Fase / Entrega", atividade: "Atividade", marco: "Marco", pacote: "Fase / Entrega" };
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
                      <Input
                        type="date"
                        value={filterDueRange.from}
                        max={filterDueRange.to || undefined}
                        onChange={(e) => setFilterDueRange((r) => ({ ...r, from: e.target.value }))}
                        className="h-8 text-xs flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-8 text-xs text-muted-foreground shrink-0">Até</label>
                      <Input
                        type="date"
                        value={filterDueRange.to}
                        min={filterDueRange.from || undefined}
                        onChange={(e) => setFilterDueRange((r) => ({ ...r, to: e.target.value }))}
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

                {/* Coluna / Status do fluxo */}
                {stages.filter((s) => s.display_order > 0).length > 0 && (
                  <AccordionSection id="stage" label="Coluna / Status" summary={summaryStage} active={filterStages.size > 0}>
                    <FilterOptionList
                      options={stages.filter((s) => s.display_order > 0).map((s) => ({ value: s.id, label: s.title }))}
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
                    options={(["fase", "atividade", "marco"] as const).map((t) => ({ value: t, label: EAP_LABELS[t] }))}
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
                      <Input type="date" value={filterStartRange.from} max={filterStartRange.to || undefined}
                        onChange={(e) => setFilterStartRange((r) => ({ ...r, from: e.target.value }))}
                        className="h-8 text-xs flex-1" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-8 text-xs text-muted-foreground shrink-0">Até</label>
                      <Input type="date" value={filterStartRange.to} min={filterStartRange.from || undefined}
                        onChange={(e) => setFilterStartRange((r) => ({ ...r, to: e.target.value }))}
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

        {hasActiveFilters && (
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
        {/* Agrupar em raias (swimlanes) — menu clicável de critérios */}
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
          const current = laneOptions.find((o) => o.id === groupBy) ?? laneOptions[0];
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={groupBy !== "none" ? "default" : "outline"}
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  title="Agrupar cards em raias horizontais"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  {groupBy === "none" ? "Raias" : current.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Agrupar em raias
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {laneOptions.map((o) => (
                  <DropdownMenuItem
                    key={o.id}
                    onSelect={() => setGroupBy(o.id)}
                    className="gap-2 text-xs"
                  >
                    <span className="text-muted-foreground">{o.icon}</span>
                    <span className="flex-1">{o.label}</span>
                    {groupBy === o.id && <Check className="w-3.5 h-3.5 text-primary" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setManageGroupsOpen(true)} className="gap-2 text-xs">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="flex-1">Gerenciar times…</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })()}
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
        <Button
          variant={onlyMine ? "default" : "outline"}
          size="sm"
          className="h-7 gap-1.5 text-xs"
          title="Mostrar apenas minhas tarefas (Líder, Participante ou Criador)"
          onClick={() => setOnlyMine((v) => !v)}
        >
          <User className="w-3.5 h-3.5" />
          Minhas
        </Button>
        {/* Configuração do card: liga/desliga cada informação exibida */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" title="Configurar o que aparece nos cards">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Card
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0" collisionPadding={12}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b">
              <span className="text-sm font-semibold">Exibição do card</span>
              <button
                type="button"
                onClick={() => setCardFields(DEFAULT_CARD_FIELDS)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                title="Restaurar padrão"
              >
                Restaurar
              </button>
            </div>
            <div className="max-h-[min(420px,60vh)] overflow-y-auto py-1">
              {CARD_FIELD_GROUPS.map((grp) => (
                <div key={grp.group}>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {grp.group}
                  </div>
                  {grp.items.map((it) => (
                    <label
                      key={it.key}
                      className="flex items-center justify-between px-3 py-1.5 text-[13px] cursor-pointer hover:bg-muted/50"
                    >
                      <span className={cardFields[it.key] ? "" : "text-muted-foreground"}>{it.label}</span>
                      <Switch
                        checked={cardFields[it.key]}
                        onCheckedChange={() => toggleCardField(it.key)}
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
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
                      onEdit={() => onEditActivity(activity)}
                      onDelete={() => onDeleteActivity(activity.id)}
                      onToggle={() => onToggleActivity(activity.id, activity.status)}
                      onDuplicate={() => handleDuplicateActivity(activity.id)}
                      onCopyLink={() => handleCopyActivityLink(activity.id)}
                      onMoveToStage={(stageId) => handleMoveToStage(activity.id, stageId)}
                      moveTargets={moveTargets}
                      onChangeType={canManageHierarchy ? (kind) => handleChangeActivityType(activity.id, kind) : undefined}
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
                      progress={computeActivityProgress(activity.workflow_stage_id, stages, activity.last_progress_stage_id)}
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
            const widthPct = columnWidths[stage.id] || (100 / visibleStages.length);
            return (
              <SortableColumn
                key={laneId ? `${laneId}-${stage.id}` : stage.id}
                laneId={laneId}
                collapsed={collapsedStages.has(stage.id)}
                onToggleCollapse={toggleCollapsedStage}
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
                onEditActivity={onEditActivity}
                onDeleteActivity={onDeleteActivity}
                onToggleActivity={onToggleActivity}
                onMoveToStage={handleMoveToStage}

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
                    onEditActivity(target);
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
                {(isAdmin || canCreate) && (
                  <AddStageColumn projectId={projectId} onChanged={fetchStages} />
                )}
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
              progress={computeActivityProgress(activeActivity.workflow_stage_id, stages, activeActivity.last_progress_stage_id)}
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
                data.forEach((s: any) => {
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
