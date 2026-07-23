'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus,
  BookOpen,
  GitFork,
  MoreHorizontal,
  Check,
  X as XIcon,
  Eye,
  EyeOff,
  Diamond,
  ChevronRight,
  ChevronDown,
  Link2,
  LayoutGrid,
  User,
  Layers,
  Package,
} from "lucide-react";
import {
  DndContext,
  rectIntersection,
  PointerSensor,
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
import {
  computeActivityProgress,
  type ActivityProgress,
} from "@/lib/activityProgress";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeGut, GUT_META, type GutLevel } from "@/lib/gutPriority";
import { LinkParentDialog } from "@/components/LinkParentDialog";
import { inferStagePreset } from "@/lib/workflowStageRules";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";

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

export type KanbanDensity = "sm" | "md" | "lg";

const DENSITY_CLASSES: Record<KanbanDensity, {
  card: string;
  title: string;
  desc: string;
  showDesc: boolean;
  showProgress: boolean;
  showBadges: boolean;
  descClamp: string;
  gap: string;
  colHeaderPad: string;
  colBodyPad: string;
  colBodyGap: string;
  colHeaderTitle: string;
}> = {
  sm: {
    card: "p-1.5",
    title: "text-[11px] leading-tight",
    desc: "text-[10px]",
    showDesc: false,
    showProgress: false,
    showBadges: false,
    descClamp: "line-clamp-1",
    gap: "gap-1",
    colHeaderPad: "px-2 py-1",
    colBodyPad: "p-1 space-y-1",
    colBodyGap: "space-y-1",
    colHeaderTitle: "text-xs",
  },
  md: {
    card: "p-2.5",
    title: "text-xs leading-snug",
    desc: "text-[11px]",
    showDesc: true,
    showProgress: true,
    showBadges: true,
    descClamp: "line-clamp-1",
    gap: "gap-1.5",
    colHeaderPad: "px-2.5 py-2",
    colBodyPad: "p-2 space-y-2",
    colBodyGap: "space-y-1.5",
    colHeaderTitle: "text-sm",
  },
  lg: {
    card: "p-3.5",
    title: "text-sm leading-snug",
    desc: "text-xs",
    showDesc: true,
    showProgress: true,
    showBadges: true,
    descClamp: "line-clamp-3",
    gap: "gap-2",
    colHeaderPad: "px-3 py-2.5",
    colBodyPad: "p-3 space-y-2.5",
    colBodyGap: "space-y-2",
    colHeaderTitle: "text-sm",
  },
};

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
  blocked_days_total?: number | null;
  created_by?: string | null;
}

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
  onMoveToBacklog,
  onLinkParent,
  isAdmin,
  isBlocked,
  hasStory,
  storyCount,
  onStoryClick,
  onCreateStory,
  isQualityProject,
  stageColor,
  subActivityCount,
  dependencyCount,
  relationItems,
  onOpenRelated,
  onRemoveRelation,
  isExpanded,
  onToggleExpand,
  progress,
  density,
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
  onMoveToBacklog: () => void;
  onLinkParent?: () => void;
  isAdmin?: boolean;
  isBlocked?: boolean;
  hasStory?: boolean;
  storyCount?: number;
  onStoryClick?: () => void;
  onCreateStory?: () => void;
  isQualityProject?: boolean;
  stageColor?: string;
  subActivityCount?: number;
  dependencyCount?: { pred: number; succ: number };
  relationItems?: { id: string; title: string; relationId: string; relationType: string }[];
  onOpenRelated?: (activityId: string) => void;
  onRemoveRelation?: (relationId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  progress?: ActivityProgress;
  density?: KanbanDensity;
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
        onMoveToBacklog={onMoveToBacklog}
        onLinkParent={onLinkParent}
        dragListeners={listeners}
        isAdmin={isAdmin}
        isBlocked={isBlocked}
        hasStory={hasStory}
        storyCount={storyCount}
        onStoryClick={onStoryClick}
        onCreateStory={onCreateStory}
        isQualityProject={isQualityProject}
        stageColor={stageColor}
        subActivityCount={subActivityCount}
        dependencyCount={dependencyCount}
        relationItems={relationItems}
        onOpenRelated={onOpenRelated}
        onRemoveRelation={onRemoveRelation}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        progress={progress}
        density={density}
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
  onMoveToBacklog,
  onLinkParent,
  dragListeners,
  isAdmin,
  isBlocked,
  hasStory,
  storyCount,
  onStoryClick,
  onCreateStory,
  isQualityProject,
  stageColor,
  subActivityCount,
  dependencyCount,
  relationItems,
  onOpenRelated,
  onRemoveRelation,
  isExpanded,
  onToggleExpand,
  progress,
  density = "md",
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
  onMoveToBacklog: () => void;
  onLinkParent?: () => void;
  dragListeners?: any;
  isAdmin?: boolean;
  isBlocked?: boolean;
  hasStory?: boolean;
  storyCount?: number;
  onStoryClick?: () => void;
  onCreateStory?: () => void;
  isQualityProject?: boolean;
  stageColor?: string;
  subActivityCount?: number;
  dependencyCount?: { pred: number; succ: number };
  relationItems?: { id: string; title: string; relationId: string; relationType: string }[];
  onOpenRelated?: (activityId: string) => void;
  onRemoveRelation?: (relationId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  progress?: ActivityProgress;
  density?: KanbanDensity;
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

  const isMilestone = !!(activity as any).is_milestone;
  const eapType = (activity as any).item_type as string | undefined;
  const isPhase = eapType === "fase";
  // Pacote explícito, OU inferido: tem subitens e não é fase/marco (papel pela
  // posição na árvore — coerente mesmo sem o tipo 'pacote' gravado no banco).
  const isPackage = !isMilestone && !isPhase &&
    (eapType === "pacote" || (!!subActivityCount && subActivityCount > 0));
  const cardBorderClass = isMilestone
    ? "border-amber-500 border-l-[4px] border-l-amber-500 bg-amber-500/5"
    : isBlocked
      ? "border-orange-500 border-l-[3px] border-l-orange-500 bg-orange-500/5"
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

  const d = DENSITY_CLASSES[density];

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`bg-card border border-border rounded-lg ${d.card} shadow-md hover:shadow-lg transition-shadow cursor-pointer group ${cardBorderClass}`}
            onClick={onEdit}
          >
            <div className={`flex items-start ${d.gap}`}>
              {dragListeners ? (
                <button
                  className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
                  onClick={(e) => e.stopPropagation()}
                  {...dragListeners}
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </button>
              ) : null}
              <div className="flex-1 min-w-0 overflow-hidden">
                {parentBreadcrumb && (
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
                <div className="flex items-start gap-1.5 mb-1">
                  {(() => {
                    const lvl = normalizeGut(activity.priority);
                    if (lvl === "pendente") return null;
                    const meta = GUT_META[lvl];
                    return (
                      <span
                        className={`shrink-0 mt-0.5 ml-1 inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold leading-none ${meta.badgeClass} ${meta.pulse ? "animate-pulse-strong" : ""}`}
                        title={`Prioridade: ${meta.label}${activity.priority_score ? ` (${activity.priority_score})` : ""}`}
                        aria-label={`Prioridade ${meta.label}`}
                      >
                        {meta.shortLabel}
                      </span>
                    );
                  })()}
                  {isMilestone && (
                    <Diamond
                      className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0 mt-0.5"
                      aria-label="Marco"
                    />
                  )}
                  {!isMilestone && isPhase && (
                    <Layers className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" aria-label="Fase" />
                  )}
                  {!isMilestone && isPackage && (
                    <Package className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-label="Pacote de trabalho" />
                  )}
                  <p
                    className={`${d.title} font-medium line-clamp-2 flex-1 min-w-0 ${
                      activity.status === "completed"
                        ? "line-through text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {activity.wbs_code ? (
                      <span className="inline-flex items-center h-4 px-1 mr-1 rounded border border-border bg-muted/40 text-[10px] font-mono text-muted-foreground align-middle">
                        {activity.wbs_code}
                      </span>
                    ) : null}
                    <span>{activity.title}</span>
                  </p>
                </div>

                {d.showDesc && activity.description && (
                  <p className={`${d.desc} text-muted-foreground ${d.descClamp} mb-1.5 leading-relaxed`}>
                    {activity.description}
                  </p>
                )}

                {/* Barra de andamento (calculada pelo Kanban) */}
                {d.showProgress && !isQualityProject && (
                <div
                  className="mb-1.5 flex items-center gap-1.5"
                  title={progressTooltip}
                >
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${progressBarColor} transition-all ${progressPaused ? "opacity-50" : ""}`}
                      style={{ width: `${progressBarWidth}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground tabular-nums shrink-0">
                    {progressBadge}
                  </span>
                </div>
                )}

                {d.showBadges && (
                <div className="flex flex-wrap gap-1">
                  {!!blockedSubsCount && blockedSubsCount > 0 && (
                    <Badge
                      className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] px-1.5 py-0 animate-pulse"
                      title={`${blockedSubsCount} subtarefa(s) impedida(s)`}
                    >
                      ⚠ {blockedSubsCount} sub{blockedSubsCount > 1 ? "s" : ""} impedida{blockedSubsCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {isBlocked && (
                    <Badge
                      className="bg-orange-500/20 text-orange-600 border-orange-500/30 text-[10px] px-1.5 py-0"
                      title={
                        activity.blocked_since
                          ? `Bloqueada desde ${new Date(activity.blocked_since).toLocaleString("pt-BR")}`
                          : undefined
                      }
                    >
                      🚫 {(() => {
                        const days = getBlockedDays(activity);
                        const label = formatBlockedDays(days);
                        return label ? label : "Bloqueada";
                      })()}
                    </Badge>
                  )}
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
                  {activity.assigned_to && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      <span className="inline-flex items-center gap-1 max-w-[180px]">
                        <Avatar className="h-3.5 w-3.5 shrink-0">
                          {assigneeAvatar ? <AvatarImage src={assigneeAvatar} alt={assigneeName || "Responsável"} /> : null}
                          <AvatarFallback className="text-[7px] font-semibold">
                            {getAvatarInitials(assigneeName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{assigneeName}</span>
                      </span>
                    </Badge>
                  )}
                  {activity.participants && activity.participants.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-accent/30">
                      👥 +{activity.participants.length}
                    </Badge>
                  )}
                  {activity.end_date && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${
                        isOverdue
                          ? "border-destructive bg-destructive/10 text-destructive font-semibold"
                          : ""
                      }`}
                    >
                      {isOverdue && <AlertCircle className="w-2.5 h-2.5 mr-0.5" />}
                      📅 {parseDate(activity.end_date).toLocaleDateString("pt-BR")}
                    </Badge>
                  )}
                  {isQualityProject && activity.last_update_date && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5 text-primary/80">
                      🔄 {parseDate(activity.last_update_date).toLocaleDateString("pt-BR")}
                    </Badge>
                  )}
                  {hasStory && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30 cursor-pointer hover:bg-primary/20 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onStoryClick?.(); }}
                    >
                      📖 {storyCount && storyCount > 1 ? `${storyCount} Histórias` : "História"}
                    </Badge>
                  )}
                  {hoursStat && (hoursStat.planned > 0 || hoursStat.consumed > 0) ? (
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
                  ) : toHoursNumber(activity.hours) > 0 ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {formatHours(toHoursNumber(activity.hours))}
                    </Badge>
                  ) : null}
                  {dependencyCount && (dependencyCount.pred > 0 || dependencyCount.succ > 0) && (
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
                  {relationItems && relationItems.length > 0 ? (
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
                              <span className="font-mono text-[9px] text-muted-foreground/60 shrink-0">
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
                              <span className="text-[9px] text-muted-foreground/70 shrink-0 capitalize">
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
                </div>
                )}
                {subActivityCount && subActivityCount > 0 ? (
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
                {subActivityStatusSummary && (subActivityStatusSummary.completed > 0 || subActivityStatusSummary.pending > 0) ? (
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

            {!readOnlyPreview && (
              <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:bg-muted/70 hover:text-foreground" onClick={onToggle} title="Concluir">
                  {activity.status === "completed" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:bg-muted/70 hover:text-foreground" onClick={onEdit} title="Editar">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:bg-muted/70 hover:text-foreground" onClick={onMoveToBacklog} title="Mover para Backlog">
                  <Inbox className="w-3.5 h-3.5" />
                </Button>
                {onLinkParent && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    onClick={onLinkParent}
                    title="Vincular ao pai"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                {onCreateStory && (
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:bg-muted/70 hover:text-foreground" onClick={onCreateStory} title="Criar História">
                    <BookOpen className="w-3.5 h-3.5" />
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={onDelete}
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[280px] space-y-1 text-xs">
          {tooltipLines.map((line, i) => (
            <p key={i} className={i === 0 ? "font-semibold" : "text-muted-foreground"}>{line}</p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  onMoveToBacklog,
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
  relationCounts,
  onOpenRelated,
  onRemoveRelation,
  isAdminOrGestor,
  onRenameStage,
  onDeleteStage,
  onChangeStageColor,
  onSetStageProgress,
  onToggleStageContributes,
  onToggleStageFinal,
  onToggleStageBlocked,
  onToggleStageVisible,
  allStages,
  density,
  profilesMap = {},
  profileAvatarMap = {},
}: {
  stage: WorkflowStage;
  stageActivities: Activity[];
  activities: Activity[];
  phases: Phase[];
  widthPct: number;
  isLast: boolean;
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  onToggleActivity: (activityId: string, currentStatus: string) => void;
  onMoveToBacklog: (activityId: string) => void;
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
  relationCounts?: Map<string, { id: string; title: string; relationId: string; relationType: string }[]>;
  onOpenRelated?: (activityId: string) => void;
  onRemoveRelation?: (relationId: string) => void;
  isAdminOrGestor?: boolean;
  onRenameStage: (id: string, title: string) => Promise<void>;
  onDeleteStage: (id: string) => Promise<void>;
  onChangeStageColor: (id: string, color: string) => Promise<void>;
  onSetStageProgress: (id: string, current: number | null | undefined) => Promise<void>;
  onToggleStageContributes: (id: string, current: boolean | undefined) => Promise<void>;
  onToggleStageFinal: (id: string, current: boolean) => Promise<void>;
  onToggleStageBlocked: (id: string, current: boolean) => Promise<void>;
  onToggleStageVisible: (id: string, current: boolean) => Promise<void>;
  allStages: WorkflowStage[];
  density: KanbanDensity;
  hoursStatsByActivity?: Map<string, HoursStat>;
  profilesMap?: Record<string, string>;
  profileAvatarMap?: Record<string, string>;
}) {
  const [colSort, setColSort] = useState<string>("updated_desc");
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
    useSortable({ id: `col-${stage.id}` });

  // Visual ClickUp-like: colunas com fundo claro neutro e uma fina faixa colorida no topo
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    flex: `1 1 ${widthPct}%`,
    marginRight: isLast ? 0 : 8,
    borderTop: stage.is_blocked ? undefined : `3px solid ${stage.color}`,
  };

  const phaseOrderMap: Record<string, number> = {};
  phases.forEach((p, i) => { phaseOrderMap[p.id] = i; });
  const priorityWeight: Record<GutLevel, number> = { urgente: 0, critica: 1, alta: 2, media: 3, baixa: 4, pendente: 5 };
  const stageActivityIds = useMemo(() => new Set(stageActivities.map((a) => a.id)), [stageActivities]);

  const sortStageItems = useCallback((list: Activity[]) => {
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (colSort) {
        case "wbs_asc": {
          const pA = a.phase_id ? (phaseOrderMap[a.phase_id] ?? 999) : 999;
          const pB = b.phase_id ? (phaseOrderMap[b.phase_id] ?? 999) : 999;
          if (pA !== pB) return pA - pB;
          return (a.display_order ?? 9999) - (b.display_order ?? 9999);
        }
        case "wbs_desc": {
          const pA = a.phase_id ? (phaseOrderMap[a.phase_id] ?? -1) : -1;
          const pB = b.phase_id ? (phaseOrderMap[b.phase_id] ?? -1) : -1;
          if (pA !== pB) return pB - pA;
          return (b.display_order ?? -1) - (a.display_order ?? -1);
        }
        case "updated_desc":
          return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
        case "updated_asc":
          return new Date(a.updated_at || a.created_at).getTime() - new Date(b.updated_at || b.created_at).getTime();
        case "priority":
          return (priorityWeight[normalizeGut(a.priority)] ?? 5) - (priorityWeight[normalizeGut(b.priority)] ?? 5);
        case "due_date": {
          const da = a.end_date ? new Date(a.end_date).getTime() : Infinity;
          const db = b.end_date ? new Date(b.end_date).getTime() : Infinity;
          return da - db;
        }
        case "assigned":
          return (a.assigned_to || "zzz").localeCompare(b.assigned_to || "zzz");
        default:
          return 0;
      }
    });
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

  const dCol = DENSITY_CLASSES[density];

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
    const blockedStageIds = new Set(allStages.filter((s) => s.is_blocked).map((s) => s.id));
    const blockedSubsCount = allChildren.filter((c) => c.workflow_stage_id && blockedStageIds.has(c.workflow_stage_id)).length;

    const commonCardProps = {
      activity,
      phases,
      onEdit: () => onEditActivity(activity),
      onDelete: () => onDeleteActivity(activity.id),
      onToggle: () => onToggleActivity(activity.id, activity.status),
      onMoveToBacklog: () => onMoveToBacklog(activity.id),
      onLinkParent: () => onLinkParent?.(activity.id, activity.parent_id ?? null),
      isAdmin,
      isBlocked: stage.is_blocked,
      hasStory: storyLinkedActivities.has(activity.id),
      storyCount: storyLinkedActivities.get(activity.id) || 0,
      onStoryClick: () => onStoryClick(activity.id),
      onCreateStory: () => onCreateStory(activity),
      isQualityProject,
      stageColor: stage.color,
      dependencyCount: dependencyCounts?.get(activity.id),
      relationItems: relationCounts?.get(activity.id) || [],
      onOpenRelated,
      onRemoveRelation,
      subActivityCount: allChildren.length,
      isExpanded: expanded,
      onToggleExpand: () => toggleExpanded(activity.id),
      progress: parentProgress,
      density,
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
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide text-white"
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`relative min-w-0 rounded-lg border flex flex-col overflow-hidden shadow-sm ${
        stage.is_blocked
          ? "bg-orange-500/10 border-orange-500/40"
          : "bg-card border-border"
      }`}
    >
      {/* Column Header - drag handle for column reordering */}
      <div className={`${dCol.colHeaderPad} border-b border-border/60 bg-muted/30`}>
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
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 min-w-[20px] text-center shrink-0"
              title={`${visibleCardCount} card(s) visível(is) nesta coluna`}
            >
              {visibleCardCount}
            </Badge>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canCreate && (
              <button
                type="button"
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenCreateTask) {
                    onOpenCreateTask(stage.id);
                  } else {
                    setShowQuickAdd(!showQuickAdd);
                  }
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
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onToggleStageBlocked(stage.id, stage.is_blocked);
                    }}
                    title="Bloqueio: atividades nesta coluna ficam pausadas, sem avanço de progresso."
                  >
                    <AlertCircle className="w-3.5 h-3.5 mr-2 text-orange-500" />
                    {stage.is_blocked ? "Remover Bloqueio" : "Marcar como Bloqueio"}
                  </DropdownMenuItem>
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
        <div className="-mt-[3.5px]" onClick={(e) => e.stopPropagation()}>
            <Select value={colSort} onValueChange={setColSort}>
              <SelectTrigger className="h-6 text-[10px] w-full border-border/40 bg-background/50">
                <div className="flex items-center gap-1">
                  <ArrowUpDown className="w-3 h-3 shrink-0" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated_desc">Recente</SelectItem>
                <SelectItem value="updated_asc">Antiga</SelectItem>
                <SelectItem value="priority">Prioridade</SelectItem>
                <SelectItem value="due_date">Prazo</SelectItem>
                <SelectItem value="assigned">Responsável</SelectItem>
                
              </SelectContent>
            </Select>
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
                  .then(() => { setQuickTitle(""); setQuickPhase(""); setQuickOrder(""); setShowQuickAdd(false); })
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
        </div>
      )}

      {/* Droppable Column Body */}
      <DroppableColumn stage={stage} density={density}>
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
  density = "md",
}: {
  stage: WorkflowStage;
  children: React.ReactNode;
  density?: KanbanDensity;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}` });
  const d = DENSITY_CLASSES[density];
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
        title="Criar grupo"
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors whitespace-nowrap"
      >
        <Plus className="w-3 h-3" />
        Criar grupo
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
            <DialogTitle>Configurar grupos do Kanban</DialogTitle>
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
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [storyLinkedActivities, setStoryLinkedActivities] = useState<Map<string, number>>(new Map());
  const [dependencyCounts, setDependencyCounts] = useState<Map<string, { pred: number; succ: number }>>(new Map());
  const [relationCounts, setRelationCounts] = useState<
    Map<string, { id: string; title: string; relationId: string; relationType: string }[]>
  >(new Map());
  const [storyDrawerActivityId, setStoryDrawerActivityId] = useState<string | null>(null);
  const [storyDrawerOpen, setStoryDrawerOpen] = useState(false);
  const [createStoryActivity, setCreateStoryActivity] = useState<Activity | null>(null);
  const [createStoryTitle, setCreateStoryTitle] = useState("");
  const [createStoryNarrative, setCreateStoryNarrative] = useState("");
  const [createStoryLoading, setCreateStoryLoading] = useState(false);
  const [linkParentIds, setLinkParentIds] = useState<string[] | null>(null);
  const [linkParentCurrent, setLinkParentCurrent] = useState<string | null>(null);
  const canManageHierarchy = isAdmin || canCreate;
  
  // Optimistic overrides: activityId -> new workflow_stage_id
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});

  // Densidade dos cards (S / M / G), persistida por projeto
  const densityKey = `kanban-density:${projectId}`;
  const [density, setDensity] = useState<KanbanDensity>(() => {
    if (typeof window === "undefined") return "md";
    const stored = window.localStorage.getItem(densityKey);
    return stored === "sm" || stored === "lg" ? stored : "md";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(densityKey, density);
    }
  }, [density, densityKey]);

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
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
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
      const normalized = data.map((s) => ({ ...s, title: getStageDisplayTitle(s.title) }));
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
  }, [activities, stages, phases, optimisticMoves, onlyMine, isMineActivity]);

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
      targetStageId = overId.replace("stage-", "");
    } else if (overId.startsWith("col-")) {
      targetStageId = overId.replace("col-", "");
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

  // ===== Stage management handlers (admin/gestor only) =====
  const handleCreateStage = useCallback(async (title: string) => {
    const preset = inferStagePreset(title, undefined);
    const normalizedTitle = getStageDisplayTitle(preset.normalizedTitle);
    const maxOrder = stages.reduce((max, s) => Math.max(max, s.display_order), -1);
    const colorIdx = stages.length % STAGE_PRESET_COLORS.length;
    const basePayload = {
      project_id: projectId,
      title: normalizedTitle,
      color: STAGE_PRESET_COLORS[colorIdx],
      display_order: maxOrder + 1,
      is_final: preset.isFinal,
      is_blocked: preset.isBlocked,
      is_exception: preset.isException,
    };
    let { error } = await supabase.from("workflow_stages").insert(basePayload);
    if (error && /(is_exception|is_blocked|progress_percent|contributes_to_progress)/i.test(error.message || "")) {
      const compat = await supabase.from("workflow_stages").insert({
        project_id: projectId,
        title: normalizedTitle,
        color: STAGE_PRESET_COLORS[colorIdx],
        display_order: maxOrder + 1,
        is_final: preset.isFinal,
      });
      error = compat.error;
    }
    if (error) {
      toast({ title: "Erro ao criar grupo", description: error.message, variant: "destructive" });
    } else {
      fetchStages();
    }
  }, [stages, projectId, toast]);

  const handleRenameStage = useCallback(async (id: string, title: string) => {
    const stage = stages.find((s) => s.id === id);
    const preset = inferStagePreset(title, stage?.display_order);
    const normalizedTitle = getStageDisplayTitle(preset.normalizedTitle);
    let { error } = await supabase
      .from("workflow_stages")
      .update({
        title: normalizedTitle,
        is_final: preset.isFinal,
        is_blocked: preset.isBlocked,
        is_exception: preset.isException,
      })
      .eq("id", id);
    if (error && /(is_exception|is_blocked|progress_percent|contributes_to_progress)/i.test(error.message || "")) {
      const compat = await supabase
        .from("workflow_stages")
        .update({
          title: normalizedTitle,
          is_final: preset.isFinal,
        })
        .eq("id", id);
      error = compat.error;
    }
    if (error) toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
    else fetchStages();
  }, [stages, toast]);

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
      {/* Toolbar - densidade dos cards */}
      <div className="flex items-center justify-end gap-2 px-2">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              title="Tamanho dos cards"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              {density === "sm" ? "Pequeno" : density === "lg" ? "Grande" : "Médio"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Tamanho dos cards
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDensity("sm")}>
              {density === "sm" && <Check className="w-3.5 h-3.5 mr-2" />}
              <span className={density === "sm" ? "font-medium" : "ml-[22px]"}>Pequeno</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDensity("md")}>
              {density === "md" && <Check className="w-3.5 h-3.5 mr-2" />}
              <span className={density === "md" ? "font-medium" : "ml-[22px]"}>Médio</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDensity("lg")}>
              {density === "lg" && <Check className="w-3.5 h-3.5 mr-2" />}
              <span className={density === "lg" ? "font-medium" : "ml-[22px]"}>Grande</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          <div ref={containerRef} className="flex pb-4 pt-2 px-2 w-full rounded-lg bg-muted/40" style={{ minHeight: 400 }}>
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
                      onMoveToBacklog={() => handleMoveToBacklog(activity.id)}
                      onLinkParent={canManageHierarchy ? () => openLinkParent(activity.id, activity.parent_id ?? null) : undefined}
                      isAdmin={isAdmin}
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
                      density={density}
                      hoursStat={hoursStatsByActivity.get(activity.id)}
                      profilesMap={profilesMap}
                      profileAvatarMap={profileAvatarMap}
                    />
                  ))
                )}
              </div>
            </div>
          )}
          {visibleStages.map((stage, idx) => {
            const stageActivities = activitiesByStage[stage.id] || [];
            const widthPct = columnWidths[stage.id] || (100 / visibleStages.length);
            return (
              <SortableColumn
                key={stage.id}
                stage={stage}
                stageActivities={stageActivities}
                activities={activities}
                phases={phases}
                widthPct={widthPct}
                isLast={idx === visibleStages.length - 1}
                onEditActivity={onEditActivity}
                onDeleteActivity={onDeleteActivity}
                onToggleActivity={onToggleActivity}
                onMoveToBacklog={handleMoveToBacklog}
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
                onToggleStageContributes={handleToggleStageContributes}
                onToggleStageFinal={handleToggleStageFinal}
                onToggleStageBlocked={handleToggleStageBlocked}
                onToggleStageVisible={handleToggleStageVisible}
                allStages={stages}
                density={density}
                profilesMap={profilesMap}
                profileAvatarMap={profileAvatarMap}
              />
            );
          })}
          {(isAdmin || canCreate) && (
            <AddStageColumn projectId={projectId} onChanged={fetchStages} />
          )}
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
              onMoveToBacklog={() => {}}
              hasStory={storyLinkedActivities.has(activeActivity.id)}
              progress={computeActivityProgress(activeActivity.workflow_stage_id, stages, activeActivity.last_progress_stage_id)}
              density={density}
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

      {/* Dialog para criar história rápida */}
      <Dialog open={!!createStoryActivity} onOpenChange={(open) => { if (!open) setCreateStoryActivity(null); }}>
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
    </div>
  );
};
