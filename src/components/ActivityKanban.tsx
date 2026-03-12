import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  GripVertical,
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
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
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
  isAdmin,
}: {
  activity: Activity;
  phases: Phase[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  isAdmin?: boolean;
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
        dragListeners={listeners}
        isAdmin={isAdmin}
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
  dragListeners,
  isAdmin,
}: {
  activity: Activity;
  phases: Phase[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  dragListeners?: any;
  isAdmin?: boolean;
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

  return (
    <div className="bg-card border border-border rounded-lg p-2.5 shadow-sm hover:shadow-md transition-shadow cursor-default group">
      <div className="flex items-start gap-2">
        <button
          className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
          {...dragListeners}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {getPriorityIndicator(activity.priority)}
            <p
              className={`text-xs font-medium truncate ${
                activity.status === "completed"
                  ? "line-through text-muted-foreground"
                  : "text-foreground"
              }`}
            >
              {activity.title}
            </p>
          </div>

          {activity.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-1 mb-1.5">
              {activity.description}
            </p>
          )}

          <div className="flex flex-wrap gap-1">
            {activity.phase_id && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {phases.find((p) => p.id === activity.phase_id)?.title || "Fase"}
              </Badge>
            )}
            {activity.assigned_to && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                👤 {activity.assigned_to}
              </Badge>
            )}
            {activity.end_date && (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${
                  new Date(activity.end_date) < new Date() && activity.status !== "completed"
                    ? "border-destructive/50 text-destructive"
                    : ""
                }`}
              >
                📅 {new Date(activity.end_date).toLocaleDateString("pt-BR")}
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

      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onToggle}>
          {activity.status === "completed" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          ) : (
            <Circle className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        {isAdmin && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
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

  const activitiesByStage = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    stages.forEach((s) => (map[s.id] = []));

    const parentActivities = activities.filter((a) => !a.parent_id);
    parentActivities.forEach((a) => {
      if (a.workflow_stage_id && map[a.workflow_stage_id]) {
        map[a.workflow_stage_id].push(a);
      } else if (stages.length > 0) {
        map[stages[0].id].push(a);
      }
    });

    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    });

    return map;
  }, [activities, stages]);

  const activeActivity = activeId ? activities.find((a) => a.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activityId = active.id as string;
    const overId = over.id as string;

    let targetStageId: string | null = null;

    // Dropped on a droppable column
    if (overId.startsWith("stage-")) {
      targetStageId = overId.replace("stage-", "");
    } else {
      // Dropped on another activity card — find which stage it belongs to
      const overActivity = activities.find((a) => a.id === overId);
      if (overActivity) {
        targetStageId = overActivity.workflow_stage_id || (stages.length > 0 ? stages[0].id : null);
      }
    }

    if (!targetStageId) return;

    // Check if it actually changed
    const draggedActivity = activities.find((a) => a.id === activityId);
    const currentStageId = draggedActivity?.workflow_stage_id || (stages.length > 0 ? stages[0].id : null);
    if (targetStageId === currentStageId) return;

    const stage = stages.find((s) => s.id === targetStageId);
    const newStatus = stage?.is_final ? "completed" : "pending";
    const completedAt = stage?.is_final ? new Date().toISOString() : null;

    try {
      await supabase
        .from("activities")
        .update({
          workflow_stage_id: targetStageId,
          status: newStatus,
          completed_at: completedAt,
        })
        .eq("id", activityId);
      onDataChanged();
    } catch {
      toast({ title: "Erro ao mover atividade", variant: "destructive" });
    }
  };

  if (stages.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Carregando etapas do workflow...</p>
      </Card>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
        {stages.map((stage) => {
          const stageActivities = activitiesByStage[stage.id] || [];
          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-[260px] bg-muted/30 rounded-xl border border-border/50 flex flex-col"
            >
              {/* Column Header */}
              <div className="p-3 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <h3 className="text-sm font-semibold text-foreground">{stage.title}</h3>
                  </div>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 min-w-[20px] text-center">
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
                        isAdmin={isAdmin}
                      />
                    ))
                  )}
                </SortableContext>
              </DroppableColumn>
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeActivity ? (
          <div className="rotate-2 opacity-90 w-[260px]">
            <KanbanCard
              activity={activeActivity}
              phases={phases}
              onEdit={() => {}}
              onDelete={() => {}}
              onToggle={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
