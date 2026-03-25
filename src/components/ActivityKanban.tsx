import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import {
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  GripVertical,
  AlertCircle,
  Inbox,
  ArrowUpDown,
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
}: {
  activity: Activity;
  phases: Phase[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onMoveToBacklog: () => void;
  isAdmin?: boolean;
  isBlocked?: boolean;
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

  const cardBorderClass = isBlocked
    ? "border-orange-500 border-l-[3px] border-l-orange-500 bg-orange-500/5"
    : isOverdue
      ? "border-destructive border-l-[3px] border-l-destructive animate-pulse-overdue"
      : "border-border";

  return (
    <div
      className={`bg-card border rounded-lg p-2.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer group ${cardBorderClass}`}
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
            {(activity as any).story_points > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold">
                🎯 {(activity as any).story_points} SP
              </Badge>
            )}
            {activity.hours > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {activity.hours}h
              </Badge>
            )}
          </div>
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
  isAdmin,
  onResizeStart,
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
  isAdmin?: boolean;
  onResizeStart: (e: React.MouseEvent, stageId: string, widthPct: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `col-${stage.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    flex: `1 1 ${widthPct}%`,
    marginRight: isLast ? 0 : 6,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`relative min-w-0 rounded-xl border flex flex-col overflow-hidden ${
        stage.is_blocked ? "bg-orange-500/5 border-orange-500/40" : "bg-muted/30 border-border/50"
      }`}
    >
      {/* Column Header - drag handle for column reordering */}
      <div className="p-3 border-b border-border/50 cursor-grab active:cursor-grabbing" {...listeners}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            <h3 className="text-sm font-semibold text-foreground truncate">{stage.title}</h3>
          </div>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 min-w-[20px] text-center shrink-0">
            {stageActivities.length}
          </Badge>
        </div>
      </div>

      {/* Droppable Column Body */}
      <DroppableColumn stage={stage}>
        <SortableContext
          items={stageActivities.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {stageActivities.length === 0 ? (
            <div className="flex items-center justify-center h-20 border-2 border-dashed border-border/40 rounded-lg">
              <p className="text-xs text-muted-foreground/50">Arraste aqui</p>
            </div>
          ) : (
            stageActivities.map((activity) => (
              <SortableKanbanCard
                key={activity.id}
                activity={activity}
                phases={phases}
                onEdit={() => onEditActivity(activity)}
                onDelete={() => onDeleteActivity(activity.id)}
                onToggle={() => onToggleActivity(activity.id, activity.status)}
                onMoveToBacklog={() => onMoveToBacklog(activity.id)}
                isAdmin={isAdmin}
                isBlocked={stage.is_blocked}
              />
            ))
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

export const ActivityKanban = ({
  projectId,
  activities,
  phases,
  onDataChanged,
  onEditActivity,
  onDeleteActivity,
  onToggleActivity,
  isAdmin = false,
}: ActivityKanbanProps) => {
  const { toast } = useToast();
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragType, setDragType] = useState<"card" | "column" | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [sortMode, setSortMode] = useState<string>("wbs_asc");
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
  }, [projectId]);

  

  const fetchStages = async () => {
    const { data } = await supabase
      .from("workflow_stages")
      .select("*")
      .eq("project_id", projectId)
      .order("display_order");
    if (data) setStages(data);
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
    onDataChanged();
    toast({ title: "Atividade movida para o Backlog" });
  };

  // Clear optimistic moves when activities prop changes (parent refetched)
  useEffect(() => {
    setOptimisticMoves({});
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

    const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };

    const sortFn = (a: Activity, b: Activity): number => {
      switch (sortMode) {
        case "wbs_asc": {
          const phaseA = a.phase_id ? (phaseOrderMap[a.phase_id] ?? 999) : 999;
          const phaseB = b.phase_id ? (phaseOrderMap[b.phase_id] ?? 999) : 999;
          if (phaseA !== phaseB) return phaseA - phaseB;
          return (a.display_order ?? 9999) - (b.display_order ?? 9999);
        }
        case "wbs_desc": {
          const phaseA = a.phase_id ? (phaseOrderMap[a.phase_id] ?? -1) : -1;
          const phaseB = b.phase_id ? (phaseOrderMap[b.phase_id] ?? -1) : -1;
          if (phaseA !== phaseB) return phaseB - phaseA;
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
    };

    Object.keys(map).forEach((key) => {
      map[key].sort(sortFn);
    });

    return map;
  }, [activities, stages, phases, optimisticMoves, sortMode]);

  

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
      supabase
        .from("activities")
        .update({
          workflow_stage_id: targetStageId,
          status: newStatus,
          completed_at: completedAt,
        })
        .eq("id", activityId)
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


  const visibleStages = useMemo(() => stages.filter((s) => s.display_order > 0 && s.is_visible !== false), [stages]);
  const activeActivity = dragType === "card" && activeId ? activities.find((a) => a.id === activeId) : null;
  const activeColumn = dragType === "column" && activeId ? visibleStages.find((s) => `col-${s.id}` === activeId) : null;


  if (stages.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Carregando etapas do workflow...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Sort Filter Bar */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
        <Select value={sortMode} onValueChange={setSortMode}>
          <SelectTrigger className="h-8 text-xs w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wbs_asc">EAP ↑ (crescente)</SelectItem>
            <SelectItem value="wbs_desc">EAP ↓ (decrescente)</SelectItem>
            <SelectItem value="updated_desc">Movimentação (recente)</SelectItem>
            <SelectItem value="updated_asc">Movimentação (antiga)</SelectItem>
            <SelectItem value="priority">Prioridade (alta primeiro)</SelectItem>
            <SelectItem value="due_date">Prazo (próximo primeiro)</SelectItem>
            <SelectItem value="assigned">Responsável (A-Z)</SelectItem>
          </SelectContent>
        </Select>
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
          <div ref={containerRef} className="flex pb-4 w-full" style={{ minHeight: 400 }}>
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
                isAdmin={isAdmin}
                onResizeStart={handleResizeStart}
              />
            );
          })}
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
    </div>
  );
};
