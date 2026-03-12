import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Layers,
  CheckCircle2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { SortableActivityCard } from "@/components/SortableActivityCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
}

interface PhaseManagerProps {
  projectId: string;
  phases: Phase[];
  activities: Activity[];
  onDataChanged: () => void;
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  onToggleActivity: (activityId: string, status: string) => void;
  isAdmin?: boolean;
}

export const PhaseManager = ({
  projectId,
  phases,
  activities,
  onDataChanged,
  onEditActivity,
  onDeleteActivity,
  onToggleActivity,
  isAdmin = false,
}: PhaseManagerProps) => {
  const { toast } = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(phases.map(p => p.id)));
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [newPhaseTitle, setNewPhaseTitle] = useState("");
  const [newPhaseDescription, setNewPhaseDescription] = useState("");
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [quickAddTitle, setQuickAddTitle] = useState<Record<string, string>>({});

  const togglePhase = (phaseId: string) => {
    const newExpanded = new Set(expandedPhases);
    if (newExpanded.has(phaseId)) {
      newExpanded.delete(phaseId);
    } else {
      newExpanded.add(phaseId);
    }
    setExpandedPhases(newExpanded);
  };

  const getActivitiesForPhase = (phaseId: string | null) => {
    return activities.filter((a) => a.phase_id === phaseId);
  };

  const calculatePhaseProgress = (phaseId: string) => {
    const phaseActivities = getActivitiesForPhase(phaseId);
    if (phaseActivities.length === 0) return 0;
    const completed = phaseActivities.filter((a) => a.status === "completed").length;
    return (completed / phaseActivities.length) * 100;
  };

  const handleAddPhase = async () => {
    if (!newPhaseTitle.trim()) return;

    try {
      const maxOrder = phases.reduce((max, p) => Math.max(max, p.display_order), 0);
      const { error } = await supabase.from("phases").insert({
        project_id: projectId,
        title: newPhaseTitle,
        description: newPhaseDescription || null,
        display_order: maxOrder + 1,
      });

      if (error) throw error;

      toast({
        title: "Fase criada!",
        description: "A fase foi adicionada ao projeto.",
      });

      setNewPhaseTitle("");
      setNewPhaseDescription("");
      setShowAddPhase(false);
      onDataChanged();
    } catch (error) {
      console.error("Erro ao criar fase:", error);
      toast({
        title: "Erro ao criar fase",
        variant: "destructive",
      });
    }
  };

  const handleUpdatePhase = async () => {
    if (!editingPhase || !editTitle.trim()) return;

    try {
      const { error } = await supabase
        .from("phases")
        .update({
          title: editTitle,
          description: editDescription || null,
        })
        .eq("id", editingPhase.id);

      if (error) throw error;

      toast({ title: "Fase atualizada!" });
      setEditingPhase(null);
      onDataChanged();
    } catch (error) {
      console.error("Erro ao atualizar fase:", error);
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  };

  const handleDeletePhase = async (phaseId: string) => {
    if (!confirm("Excluir esta fase? As tarefas serão desvinculadas.")) return;

    try {
      const { error } = await supabase.from("phases").delete().eq("id", phaseId);
      if (error) throw error;

      toast({ title: "Fase excluída!" });
      onDataChanged();
    } catch (error) {
      console.error("Erro ao excluir fase:", error);
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  };

  const handleMoveActivity = async (activityId: string, newPhaseId: string | null) => {
    try {
      const { error } = await supabase
        .from("activities")
        .update({ phase_id: newPhaseId })
        .eq("id", activityId);

      if (error) throw error;
      onDataChanged();
    } catch (error) {
      console.error("Erro ao mover atividade:", error);
      toast({ title: "Erro ao mover", variant: "destructive" });
    }
  };

  const handleActivityDragEnd = async (event: DragEndEvent, phaseId: string | null) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentActivities = getActivitiesForPhase(phaseId)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const oldIndex = currentActivities.findIndex((a) => a.id === active.id);
    const newIndex = currentActivities.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(currentActivities, oldIndex, newIndex);
    
    try {
      for (let i = 0; i < reordered.length; i++) {
        await supabase
          .from("activities")
          .update({ display_order: i })
          .eq("id", reordered[i].id);
      }
      onDataChanged();
    } catch (error) {
      console.error("Erro ao reordenar:", error);
      toast({ title: "Erro ao reordenar", variant: "destructive" });
    }
  };

  const handleQuickAddActivity = async (phaseId: string) => {
    const title = quickAddTitle[phaseId]?.trim();
    if (!title) return;
    try {
      const phaseActivities = getActivitiesForPhase(phaseId);
      const maxOrder = phaseActivities.reduce((max, a) => Math.max(max, a.display_order ?? 0), 0);
      const { error } = await supabase.from("activities").insert({
        project_id: projectId,
        title,
        phase_id: phaseId,
        display_order: maxOrder + 1,
      });
      if (error) throw error;
      setQuickAddTitle((prev) => ({ ...prev, [phaseId]: "" }));
      onDataChanged();
    } catch (error) {
      console.error("Erro ao criar atividade:", error);
      toast({ title: "Erro ao criar atividade", variant: "destructive" });
    }
  };

  const unassignedActivities = getActivitiesForPhase(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Fases do Projeto</h2>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowAddPhase(!showAddPhase)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nova Fase
          </Button>
        )}
      </div>

      {/* Add Phase Form */}
      {showAddPhase && (
        <Card className="p-4 space-y-3 border-primary/20 bg-primary/5">
          <Input
            placeholder="Nome da fase *"
            value={newPhaseTitle}
            onChange={(e) => setNewPhaseTitle(e.target.value)}
          />
          <Input
            placeholder="Descrição (opcional)"
            value={newPhaseDescription}
            onChange={(e) => setNewPhaseDescription(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddPhase}>
              Criar Fase
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowAddPhase(false);
                setNewPhaseTitle("");
                setNewPhaseDescription("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {/* Phases List */}
      <div className="space-y-3">
        {phases
          .sort((a, b) => a.display_order - b.display_order)
          .map((phase) => {
            const phaseActivities = getActivitiesForPhase(phase.id);
            const progress = calculatePhaseProgress(phase.id);
            const completedCount = phaseActivities.filter((a) => a.status === "completed").length;
            const isExpanded = expandedPhases.has(phase.id);

            return (
              <Card key={phase.id} className="overflow-hidden">
                <Collapsible open={isExpanded} onOpenChange={() => togglePhase(phase.id)}>
                  <CollapsibleTrigger asChild>
                    <div className="p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                      {editingPhase?.id === phase.id ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="h-8"
                          />
                          <Input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Descrição"
                            className="h-8"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleUpdatePhase}>
                              Salvar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingPhase(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-foreground">{phase.title}</h3>
                              {progress === 100 && (
                                <CheckCircle2 className="w-4 h-4 text-success" />
                              )}
                            </div>
                            {phase.description && (
                              <p className="text-sm text-muted-foreground">{phase.description}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {completedCount}/{phaseActivities.length} tarefas
                              </Badge>
                              <div className="flex-1 max-w-[200px]">
                                <Progress value={progress} className="h-2" />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">
                                {progress.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditingPhase(phase);
                                  setEditTitle(phase.title);
                                  setEditDescription(phase.description || "");
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CollapsibleTrigger>

                    <CollapsibleContent>
                    <div className="border-t border-border p-4 bg-accent/20 space-y-2">
                      {phaseActivities.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          Nenhuma tarefa nesta fase
                        </p>
                      ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleActivityDragEnd(e, phase.id)}>
                          <SortableContext items={phaseActivities.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map(a => a.id)} strategy={verticalListSortingStrategy}>
                            {phaseActivities.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map((activity) => (
                              <SortableActivityCard key={activity.id} id={activity.id}>
                  <ActivityCard
                    activity={activity}
                    phases={phases}
                    onEdit={onEditActivity}
                    onDelete={onDeleteActivity}
                    onToggle={onToggleActivity}
                    onMoveToPhase={handleMoveActivity}
                    isAdmin={isAdmin}
                  />
                              </SortableActivityCard>
                            ))}
                          </SortableContext>
                        </DndContext>
                      )}
                      {isAdmin && (
                        <div className="flex gap-2 pt-2">
                          <Input
                            placeholder="Adicionar tarefa rápida..."
                            value={quickAddTitle[phase.id] || ""}
                            onChange={(e) => setQuickAddTitle((prev) => ({ ...prev, [phase.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") handleQuickAddActivity(phase.id); }}
                            className="h-8 text-sm"
                          />
                          <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => handleQuickAddActivity(phase.id)}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
      </div>

      {/* Unassigned Activities */}
      {unassignedActivities.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-semibold text-muted-foreground">Tarefas sem fase</h3>
            <Badge variant="secondary">{unassignedActivities.length}</Badge>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleActivityDragEnd(e, null)}>
            <SortableContext items={unassignedActivities.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map(a => a.id)} strategy={verticalListSortingStrategy}>
              {unassignedActivities.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map((activity) => (
                <SortableActivityCard key={activity.id} id={activity.id}>
                  <ActivityCard
                    activity={activity}
                    phases={phases}
                    onEdit={onEditActivity}
                    onDelete={onDeleteActivity}
                    onToggle={onToggleActivity}
                    onMoveToPhase={handleMoveActivity}
                    isAdmin={isAdmin}
                  />
                </SortableActivityCard>
              ))}
            </SortableContext>
          </DndContext>
        </Card>
      )}
    </div>
  );
};

// Sub-component for activity cards within phases
interface ActivityCardProps {
  activity: Activity;
  phases: Phase[];
  onEdit: (activity: Activity) => void;
  onDelete: (activityId: string) => void;
  onToggle: (activityId: string, status: string) => void;
  onMoveToPhase: (activityId: string, phaseId: string | null) => void;
  isAdmin?: boolean;
}

const ActivityCard = ({
  activity,
  phases,
  onEdit,
  onDelete,
  onToggle,
  onMoveToPhase,
  isAdmin = false,
}: ActivityCardProps) => {
  const [showPhaseSelector, setShowPhaseSelector] = useState(false);

  return (
    <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border group">
      <input
        type="checkbox"
        checked={activity.status === "completed"}
        onChange={() => onToggle(activity.id, activity.status)}
        className="h-4 w-4 rounded border-input"
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            activity.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"
          }`}
        >
          {activity.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {activity.assigned_to && (
            <span className="text-xs text-muted-foreground">👤 {activity.assigned_to}</span>
          )}
          {activity.hours > 0 && (
            <span className="text-xs text-muted-foreground">⏱️ {activity.hours}h</span>
          )}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setShowPhaseSelector(!showPhaseSelector)}
            title="Mover para fase"
          >
            <Layers className="w-3 h-3" />
          </Button>
          {showPhaseSelector && (
            <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg z-10 min-w-[150px]">
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onMoveToPhase(activity.id, null);
                  setShowPhaseSelector(false);
                }}
              >
                Sem fase
              </button>
              {phases.map((phase) => (
                <button
                  key={phase.id}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-accent ${
                    activity.phase_id === phase.id ? "bg-accent" : ""
                  }`}
                  onClick={() => {
                    onMoveToPhase(activity.id, phase.id);
                    setShowPhaseSelector(false);
                  }}
                >
                  {phase.title}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => onEdit(activity)}
        >
          <Pencil className="w-3 h-3" />
        </Button>
        {isAdmin && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            onClick={() => onDelete(activity.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
};
