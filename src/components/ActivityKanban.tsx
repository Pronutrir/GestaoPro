'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { UserStoryDrawer } from "@/components/UserStoryDrawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkflowStageManager } from "@/components/WorkflowStageManager";

const formatHours = (hours: number): string => {
  if (!hours || hours <= 0) return "";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
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

interface WorkflowStage {
  id: string;
  project_id: string;
  title: string;
  color: string;
  display_order: number;
  is_final: boolean;
  is_blocked: boolean;
  is_visible: boolean;
}

interface Phase {
  id: string;
  title: string;
}

interface Activity {
  id: string;
  title: string;
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
  tags?: string[];
  parent_id?: string | null;
  workflow_stage_id?: string | null;
  story_points?: number;
  participants?: string[];
  deadline_flag?: string | null;
  last_update_date?: string | null;
  is_milestone?: boolean;
}

interface ActivityKanbanProps {
  projectId: string;
  activities: Activity[];
  phases: Phase[];
  onDataChanged: () => void;
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  onToggleActivity: (activityId: string, currentStatus: string) => void;
  isAdmin?: boolean;
  canCreate?: boolean;
  isQualityProject?: boolean;
  onOpenCreateTask?: (stageId: string) => void;
}

function SortableKanbanCard({
  activity,
  phases,
  onEdit,
  onDelete,
  onToggle,
  onMoveToBacklog,
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
}: {
  activity: Activity;
  phases: Phase[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onMoveToBacklog: () => void;
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
}: {
  activity: Activity;
  phases: Phase[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onMoveToBacklog: () => void;
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
}) {
  const getPriorityIndicator = (priority?: string) => {
    switch (priority) {
      case "high":
        return <div className="w-1.5 h-1.5 rounded-full bg-destructive" title="Alta" />;
      case "medium":
        return <div className="w-1.5 h-1.5 rounded-full bg-warning" title="Média" />;
      case "low":
        return <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" title="Baixa" />;
      default:
        return null;
    }
  };

  const parseDate = (d: string) => { const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day); };
  const isOverdue = activity.end_date && parseDate(activity.end_date) < new Date() && activity.status !== "completed";

  const isMilestone = !!(activity as any).is_milestone;
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
    activity.assigned_to ? `👤 Responsável: ${activity.assigned_to}` : null,
    activity.priority ? `⚡ Prioridade: ${activity.priority === "high" ? "Alta" : activity.priority === "medium" ? "Média" : "Baixa"}` : null,
    activity.start_date ? `📅 Início: ${parseDate(activity.start_date).toLocaleDateString("pt-BR")}` : null,
    activity.end_date ? `📅 Fim: ${parseDate(activity.end_date).toLocaleDateString("pt-BR")}` : null,
    isQualityProject && activity.last_update_date ? `🔄 Atualização: ${parseDate(activity.last_update_date).toLocaleDateString("pt-BR")}` : null,
    isQualityProject && activity.deadline_flag ? `🚦 Flag: ${activity.deadline_flag === "green" ? "Em dia" : activity.deadline_flag === "orange" ? "Atenção" : activity.deadline_flag === "red" ? "Vencido" : ""}` : null,
    activity.hours > 0 ? `⏱ Tempo: ${formatHours(activity.hours)}` : null,
    activity.status === "completed" ? "✅ Concluída" : null,
  ].filter(Boolean);

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`bg-card border border-border rounded-lg p-2.5 shadow-md hover:shadow-lg transition-shadow cursor-pointer group ${cardBorderClass}`}
            onClick={onEdit}
          >
            <div className="flex items-start gap-2">
              <button
                className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
                {...dragListeners}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center gap-1.5 mb-1">
                  {getPriorityIndicator(activity.priority)}
                  {isMilestone && (
                    <Diamond
                      className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0"
                      aria-label="Marco"
                    />
                  )}
                  <p
                    className={`text-xs font-medium leading-snug line-clamp-2 ${
                      activity.status === "completed"
                        ? "line-through text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {activity.title}
                  </p>
                </div>

                {activity.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mb-1.5 leading-relaxed truncate">
                    {activity.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-1">
                  {isBlocked && (
                    <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30 text-[10px] px-1.5 py-0">
                      🚫 Bloqueada
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
                      👤 {activity.assigned_to}
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
                  {(activity as any).story_points > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold">
                      🎯 {(activity as any).story_points} SP
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
                  {activity.hours > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {formatHours(activity.hours)}
                    </Badge>
                  )}
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
              </div>
            </div>

            <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onToggle} title="Concluir">
                {activity.status === "completed" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onEdit} title="Editar">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onMoveToBacklog} title="Mover para Backlog">
                <Inbox className="w-3.5 h-3.5" />
              </Button>
              {onCreateStory && (
                <Button size="icon" variant="ghost" className="h-6 w-6 text-primary hover:text-primary" onClick={onCreateStory} title="Criar História">
                  <BookOpen className="w-3.5 h-3.5" />
                </Button>
              )}
              {isAdmin && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={onDelete}
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
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
  dependencyCounts,
  relationCounts,
  onOpenRelated,
  onRemoveRelation,
  isAdminOrGestor,
  onRenameStage,
  onDeleteStage,
  onChangeStageColor,
  onToggleStageFinal,
  onToggleStageBlocked,
  onToggleStageVisible,
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
  onToggleStageFinal: (id: string, current: boolean) => Promise<void>;
  onToggleStageBlocked: (id: string, current: boolean) => Promise<void>;
  onToggleStageVisible: (id: string, current: boolean) => Promise<void>;
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

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `col-${stage.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    flex: `1 1 ${widthPct}%`,
    marginRight: isLast ? 0 : 6,
    backgroundColor: stage.is_blocked ? undefined : `${stage.color}4D`,
    borderColor: stage.is_blocked ? undefined : `${stage.color}80`,
  };

  const phaseOrderMap: Record<string, number> = {};
  phases.forEach((p, i) => { phaseOrderMap[p.id] = i; });
  const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const stageActivityIds = useMemo(() => new Set(stageActivities.map((a) => a.id)), [stageActivities]);

  const sortedActivities = useMemo(() => {
    // Exibe como card toda atividade desta coluna, exceto subtarefas cujo pai também está nesta mesma coluna.
    // Essas continuam aparecendo inline apenas quando o pai é expandido.
    const sorted = stageActivities.filter((a) => !a.parent_id || !stageActivityIds.has(a.parent_id));
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
          return (priorityWeight[a.priority || "medium"] ?? 1) - (priorityWeight[b.priority || "medium"] ?? 1);
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
  }, [stageActivities, stageActivityIds, colSort, phases]);

  const visibleCardCount = useMemo(() => {
    return sortedActivities.reduce((total, activity) => {
      const inlineChildren = (childrenByParent.get(activity.id) || []).filter((child) => stageActivityIds.has(child.id));
      return total + 1 + (expandedIds.has(activity.id) ? inlineChildren.length : 0);
    }, 0);
  }, [sortedActivities, childrenByParent, stageActivityIds, expandedIds]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`relative min-w-0 rounded-xl border flex flex-col overflow-hidden ${
        stage.is_blocked ? "bg-orange-500/10 border-orange-500/40" : ""
      }`}
    >
      {/* Column Header - drag handle for column reordering */}
      <div
        className="p-2 border-b"
        style={{ borderColor: stage.is_blocked ? undefined : `${stage.color}40` }}
      >
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
                className="text-sm font-semibold text-foreground bg-transparent border-b border-border outline-none w-32"
              />
            ) : (
              <h3 className="text-sm font-semibold text-foreground truncate">
                {stage.title}
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
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
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
                    onSelect={(e) => {
                      e.preventDefault();
                      setRenameValue(stage.title);
                      setRenaming(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Renomear
                  </DropdownMenuItem>
                  <Popover>
                    <PopoverTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <div className="w-3.5 h-3.5 mr-2 rounded-full" style={{ backgroundColor: stage.color }} />
                        Alterar cor
                      </DropdownMenuItem>
                    </PopoverTrigger>
                    <PopoverContent side="left" className="w-auto p-2" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-4 gap-1.5">
                        {STAGE_PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            className="w-6 h-6 rounded-full ring-1 ring-border hover:ring-primary"
                            style={{ backgroundColor: c }}
                            onClick={() => onChangeStageColor(stage.id, c)}
                          />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      onToggleStageFinal(stage.id, stage.is_final);
                    }}
                  >
                    <Check className="w-3.5 h-3.5 mr-2 text-success" />
                    {stage.is_final ? "Remover marca de Final" : "Marcar como Final"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      onToggleStageBlocked(stage.id, stage.is_blocked);
                    }}
                  >
                    <AlertCircle className="w-3.5 h-3.5 mr-2 text-orange-500" />
                    {stage.is_blocked ? "Remover Bloqueio" : "Marcar como Bloqueio"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
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
                    className="text-destructive focus:text-destructive"
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
      <DroppableColumn stage={stage}>
        <SortableContext
          items={sortedActivities.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {sortedActivities.length === 0 ? (
            <div className="flex items-center justify-center h-16 border-2 border-dashed border-border/30 rounded-lg">
              <p className="text-[11px] text-muted-foreground/50">Arraste aqui</p>
            </div>
          ) : (
            sortedActivities.map((activity) => {
              const allChildren = childrenByParent.get(activity.id) || [];
              const inlineChildren = allChildren.filter((child) => stageActivityIds.has(child.id));
              const expanded = expandedIds.has(activity.id);
              return (
                <div key={activity.id} className="space-y-1.5">
                  <SortableKanbanCard
                    activity={activity}
                    phases={phases}
                    onEdit={() => onEditActivity(activity)}
                    onDelete={() => onDeleteActivity(activity.id)}
                    onToggle={() => onToggleActivity(activity.id, activity.status)}
                    onMoveToBacklog={() => onMoveToBacklog(activity.id)}
                    isAdmin={isAdmin}
                    isBlocked={stage.is_blocked}
                    hasStory={storyLinkedActivities.has(activity.id)}
                    storyCount={storyLinkedActivities.get(activity.id) || 0}
                    onStoryClick={() => onStoryClick(activity.id)}
                    onCreateStory={() => onCreateStory(activity)}
                    isQualityProject={isQualityProject}
                    stageColor={stage.color}
                    dependencyCount={dependencyCounts?.get(activity.id)}
                    relationItems={relationCounts?.get(activity.id) || []}
                    onOpenRelated={onOpenRelated}
                    onRemoveRelation={onRemoveRelation}
                    subActivityCount={allChildren.length}
                    isExpanded={expanded}
                    onToggleExpand={() => toggleExpanded(activity.id)}
                  />
                  {expanded && inlineChildren.length > 0 && (
                    <div className="ml-4 pl-2 border-l-2 border-primary/30 space-y-1.5">
                      {inlineChildren.map((child) => (
                        <KanbanCard
                          key={child.id}
                          activity={child}
                          phases={phases}
                          onEdit={() => onEditActivity(child)}
                          onDelete={() => onDeleteActivity(child.id)}
                          onToggle={() => onToggleActivity(child.id, child.status)}
                          onMoveToBacklog={() => onMoveToBacklog(child.id)}
                          isAdmin={isAdmin}
                          isBlocked={stage.is_blocked}
                          hasStory={storyLinkedActivities.has(child.id)}
                          storyCount={storyLinkedActivities.get(child.id) || 0}
                          onStoryClick={() => onStoryClick(child.id)}
                          onCreateStory={() => onCreateStory(child)}
                          isQualityProject={isQualityProject}
                          stageColor={stage.color}
                          dependencyCount={dependencyCounts?.get(child.id)}
                          relationItems={relationCounts?.get(child.id) || []}
                          onOpenRelated={onOpenRelated}
                          onRemoveRelation={onRemoveRelation}
                          subActivityCount={0}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
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
}: {
  stage: WorkflowStage;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}` });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 p-2 space-y-2 min-h-[120px] rounded-b-xl transition-colors ${
        isOver ? "bg-primary/5 ring-2 ring-primary/20 ring-inset" : ""
      }`}
    >
      {children}
    </div>
  );
}

function AddStageColumn({ projectId }: { projectId: string }) {
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[750px] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Configurar grupos do Kanban</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <WorkflowStageManager projectId={projectId} />
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
  isQualityProject = false,
  onOpenCreateTask,
}: ActivityKanbanProps) => {
  const { toast } = useToast();
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [stagesLoading, setStagesLoading] = useState(true);
  const [stagesError, setStagesError] = useState<string | null>(null);
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
  
  // Optimistic overrides: activityId -> new workflow_stage_id
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});
  
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

  

  const fetchStages = async () => {
    if (!projectId) {
      setStagesLoading(false);
      return;
    }
    setStagesError(null);
    const { data, error } = await supabase
      .from("workflow_stages")
      .select("*")
      .eq("project_id", projectId)
      .order("display_order");
    console.log("[Kanban] fetchStages:", { data, error, projectId });
    if (error) {
      setStagesError(error.message);
      setStagesLoading(false);
      return;
    }
    if (data && data.length > 0) {
      // Normalize: some self-hosted DBs use `name` instead of `title`.
      const normalized = data.map((s: any) => ({
        ...s,
        title: s.title ?? s.name ?? "",
        color: s.color ?? "hsl(220, 15%, 50%)",
      }));
      setStages(normalized);
      setStagesLoading(false);
      return;
    }
    // No stages found — try to create defaults (covers projects created before
    // the trigger existed, or whenever the trigger didn't fire).
    // Note: omit `color` so the DB DEFAULT applies — avoids PostgREST schema
    // cache mismatches in self-hosted Supabase. Stage colors can be edited
    // afterwards via the Kanban UI.
    const baseDefaults = [
      { display_order: 0, is_final: false, _label: "Backlog" },
      { display_order: 1, is_final: false, _label: "A Fazer" },
      { display_order: 2, is_final: false, _label: "Em Andamento" },
      { display_order: 3, is_final: false, _label: "Em Teste" },
      { display_order: 4, is_final: false, _label: "Aprovada" },
      { display_order: 5, is_final: true, _label: "Concluída" },
    ];
    const buildPayload = (key: "title" | "name") =>
      baseDefaults.map(({ _label, ...rest }) => ({
        ...rest,
        project_id: projectId,
        [key]: _label,
      })) as any[];

    const tryInsert = async (key: "title" | "name") =>
      (supabase.from("workflow_stages") as any)
        .insert(buildPayload(key))
        .select("*")
        .order("display_order");

    let { data: inserted, error: insertError } = await tryInsert("title");
    if (insertError) {
      const msg = `${insertError.message || ""} ${(insertError as any).hint || ""} ${(insertError as any).details || ""}`.toLowerCase();
      // Fallback: schema uses `name` instead of `title`.
      if (msg.includes("title") || msg.includes("name")) {
        const retry = await tryInsert("name");
        inserted = retry.data;
        insertError = retry.error;
      }
    }
    if (insertError) {
      const fullMsg =
        insertError.message ||
        (insertError as any).hint ||
        (insertError as any).details ||
        JSON.stringify(insertError);
      console.error("[Kanban] create default stages failed:", {
        message: insertError.message,
        details: (insertError as any).details,
        hint: (insertError as any).hint,
        code: (insertError as any).code,
      });
      setStagesError(fullMsg);
      setStagesLoading(false);
      return;
    }
    const normalizedNew = (inserted || []).map((s: any) => ({
      ...s,
      title: s.title ?? s.name ?? "",
      color: s.color ?? "hsl(220, 15%, 50%)",
    }));
    setStages(normalizedNew);
    setStagesLoading(false);
  };

  const handleMoveToBacklog = async (activityId: string) => {
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
    toast({ title: "Atividade movida para o Backlog" });
  };

  // Clear optimistic moves when activities prop changes (parent refetched)
  useEffect(() => {
    setOptimisticMoves({});
  }, [activities]);

  const subActivityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    activities.forEach((a) => {
      if (a.parent_id) {
        counts.set(a.parent_id, (counts.get(a.parent_id) || 0) + 1);
      }
    });
    return counts;
  }, [activities]);

  const activitiesByStage = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    stages.forEach((s) => (map[s.id] = []));

    activities.forEach((a) => {
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
  }, [activities, stages, phases, optimisticMoves]);

  const handleCreateStory = async () => {
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
      toast({ title: "História criada! Ela aparecerá na aba Histórias em Rascunho." });
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
    const currentStageId = draggedActivity?.workflow_stage_id || (stages.length > 0 ? stages[0].id : null);
    if (targetStageId === currentStageId) return;

    // Optimistic update — move card instantly in the UI
    setOptimisticMoves((prev) => ({ ...prev, [activityId]: targetStageId! }));

    const stage = stages.find((s) => s.id === targetStageId);
    const newStatus = stage?.is_final ? "completed" : "pending";
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
      supabase.from("notifications").insert({
        project_id: projectId,
        activity_id: activityId,
        type: "blocked",
        title: "🚫 Atividade bloqueada: " + draggedActivity.title,
        message: `A atividade "${draggedActivity.title}" foi movida para a etapa "${stage.title}" e está bloqueada.`,
      }).then(() => {});
    }
  };

  const handleCreateActivity = async (stageId: string, title: string, phaseId: string | null, displayOrder: number | null) => {
    const { error } = await supabase.from("activities").insert({
      project_id: projectId,
      title,
      phase_id: phaseId,
      workflow_stage_id: stageId,
      display_order: displayOrder,
      status: "pending",
    });
    if (error) {
      toast({ title: "Erro ao criar atividade", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Atividade criada com sucesso" });
      onDataChanged();
    }
  };


  const visibleStages = useMemo(() => stages.filter((s) => s.display_order > 0 && s.is_visible !== false), [stages]);

  // ===== Stage management handlers (admin/gestor only) =====
  const handleCreateStage = useCallback(async (title: string) => {
    const maxOrder = stages.reduce((max, s) => Math.max(max, s.display_order), -1);
    const colorIdx = stages.length % STAGE_PRESET_COLORS.length;
    const { error } = await supabase.from("workflow_stages").insert({
      project_id: projectId,
      title,
      color: STAGE_PRESET_COLORS[colorIdx],
      display_order: maxOrder + 1,
      is_final: false,
    });
    if (error) {
      toast({ title: "Erro ao criar grupo", variant: "destructive" });
    } else {
      toast({ title: "Grupo criado!" });
      fetchStages();
    }
  }, [stages, projectId, toast]);

  const handleRenameStage = useCallback(async (id: string, title: string) => {
    const { error } = await supabase.from("workflow_stages").update({ title }).eq("id", id);
    if (error) toast({ title: "Erro ao renomear", variant: "destructive" });
    else fetchStages();
  }, [toast]);

  const handleDeleteStage = useCallback(async (id: string) => {
    const stage = stages.find((s) => s.id === id);
    if (stage && stage.display_order === 0) {
      toast({ title: "A etapa Backlog não pode ser excluída", variant: "destructive" });
      return;
    }
    if (!confirm("Atividades nesta coluna perderão a associação. Continuar?")) return;
    const { error } = await supabase.from("workflow_stages").delete().eq("id", id);
    if (error) toast({ title: "Erro ao excluir", variant: "destructive" });
    else { toast({ title: "Coluna excluída!" }); fetchStages(); }
  }, [stages, toast]);

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
    return activities.filter((a) => {
      if (a.status === "completed") return false;
      const endMatch = a.end_date && a.end_date <= todayStr;
      const updateMatch = a.last_update_date && a.last_update_date <= todayStr;
      return endMatch || updateMatch;
    });
  }, [activities, isQualityProject]);


  if (stages.length === 0) {
    return (
      <Card className="p-8 text-center space-y-3">
        {stagesLoading ? (
          <p className="text-muted-foreground">Carregando etapas do workflow...</p>
        ) : stagesError ? (
          <>
            <p className="text-destructive font-medium">
              Erro ao carregar etapas do workflow
            </p>
            <p className="text-sm text-muted-foreground">{stagesError}</p>
            <button
              onClick={() => {
                setStagesLoading(true);
                fetchStages();
              }}
              className="text-sm underline text-primary"
            >
              Tentar novamente
            </button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              Nenhuma etapa de workflow encontrada para este projeto.
            </p>
            <button
              onClick={() => {
                setStagesLoading(true);
                fetchStages();
              }}
              className="text-sm underline text-primary"
            >
              Criar etapas padrão
            </button>
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-3 mt-[30px]">
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
          <div ref={containerRef} className="flex pb-4 w-full" style={{ minHeight: 400 }}>
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
                      isAdmin={isAdmin}
                      hasStory={storyLinkedActivities.has(activity.id)}
                      storyCount={storyLinkedActivities.get(activity.id) || 0}
                      onStoryClick={() => { setStoryDrawerActivityId(activity.id); setStoryDrawerOpen(true); }}
                      onCreateStory={() => { setCreateStoryActivity(activity); setCreateStoryTitle(""); setCreateStoryNarrative(""); }}
                      isQualityProject={isQualityProject}
                      subActivityCount={subActivityCounts.get(activity.id) || 0}
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
                onCreateActivity={handleCreateActivity}
                storyLinkedActivities={storyLinkedActivities}
                isAdmin={isAdmin}
                canCreate={canCreate}
                onResizeStart={handleResizeStart}
                onStoryClick={(activityId) => { setStoryDrawerActivityId(activityId); setStoryDrawerOpen(true); }}
                onCreateStory={(activity) => { setCreateStoryActivity(activity); setCreateStoryTitle(""); setCreateStoryNarrative(""); }}
                isQualityProject={isQualityProject}
                onOpenCreateTask={onOpenCreateTask}
                subActivityCounts={subActivityCounts}
                dependencyCounts={dependencyCounts}
                relationCounts={relationCounts}
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
                  toast({ title: "Vínculo removido" });
                }}
                isAdminOrGestor={isAdmin || canCreate}
                onRenameStage={handleRenameStage}
                onDeleteStage={handleDeleteStage}
                onChangeStageColor={handleChangeStageColor}
                onToggleStageFinal={handleToggleStageFinal}
                onToggleStageBlocked={handleToggleStageBlocked}
                onToggleStageVisible={handleToggleStageVisible}
              />
            );
          })}
          {(isAdmin || canCreate) && (
            <AddStageColumn projectId={projectId} />
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
            />
          </div>
        ) : activeColumn ? (
          <div className="opacity-70 w-[200px] rounded-xl border bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeColumn.color }} />
              <span className="text-sm font-semibold text-foreground">{activeColumn.title}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>
      <UserStoryDrawer
        activityId={storyDrawerActivityId}
        projectId={projectId}
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
