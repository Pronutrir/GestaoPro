import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
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
}

interface WorkflowStageManagerProps {
  projectId: string;
}

const PRESET_COLORS = [
  "hsl(220, 15%, 50%)",
  "hsl(38, 92%, 50%)",
  "hsl(220, 90%, 56%)",
  "hsl(199, 89%, 48%)",
  "hsl(270, 70%, 55%)",
  "hsl(142, 76%, 36%)",
  "hsl(0, 84%, 60%)",
  "hsl(340, 82%, 52%)",
];

function SortableStageItem({
  stage,
  editingId,
  editingTitle,
  setEditingTitle,
  onStartEdit,
  onCancelEdit,
  onRename,
  onDelete,
  onToggleFinal,
  onToggleBlocked,
  onColorChange,
}: {
  stage: WorkflowStage;
  editingId: string | null;
  editingTitle: string;
  setEditingTitle: (v: string) => void;
  onStartEdit: (id: string, title: string) => void;
  onCancelEdit: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFinal: (id: string, current: boolean) => void;
  onToggleBlocked: (id: string, current: boolean) => void;
  onColorChange: (id: string, color: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50 ${isDragging ? "ring-2 ring-primary" : ""}`}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Color dot + picker */}
      <div className="relative group">
        <div
          className="w-4 h-4 rounded-full cursor-pointer ring-2 ring-border"
          style={{ backgroundColor: stage.color }}
        />
        <div className="absolute left-0 top-6 z-20 hidden group-hover:flex gap-1 bg-popover border border-border rounded-lg p-2 shadow-lg">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              className="w-5 h-5 rounded-full ring-1 ring-border hover:ring-primary transition-all"
              style={{ backgroundColor: c }}
              onClick={() => onColorChange(stage.id, c)}
            />
          ))}
        </div>
      </div>

      {editingId === stage.id ? (
        <div className="flex-1 flex items-center gap-2">
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && onRename(stage.id)}
          />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRename(stage.id)}>
            <Check className="w-3.5 h-3.5 text-success" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancelEdit}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <span className="flex-1 text-sm font-medium text-foreground">{stage.title}</span>
          {stage.is_final && (
            <Badge className="bg-success/20 text-success text-[10px]">Final</Badge>
          )}
          {stage.is_blocked && (
            <Badge className="bg-destructive/20 text-destructive text-[10px]">Bloqueio</Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => onToggleFinal(stage.id, stage.is_final)}
          >
            {stage.is_final ? "Remover final" : "Marcar final"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => onToggleBlocked(stage.id, stage.is_blocked)}
          >
            {stage.is_blocked ? "Remover bloqueio" : "Marcar bloqueio"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onStartEdit(stage.id, stage.title)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(stage.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

export const WorkflowStageManager = ({ projectId }: WorkflowStageManagerProps) => {
  const { toast } = useToast();
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(stages, oldIndex, newIndex);
    setStages(reordered.map((s, i) => ({ ...s, display_order: i })));

    try {
      for (let i = 0; i < reordered.length; i++) {
        await supabase.from("workflow_stages").update({ display_order: i }).eq("id", reordered[i].id);
      }
      toast({ title: "Ordem atualizada!" });
    } catch {
      toast({ title: "Erro ao reordenar", variant: "destructive" });
      fetchStages();
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    const maxOrder = stages.reduce((max, s) => Math.max(max, s.display_order), -1);
    const colorIndex = stages.length % PRESET_COLORS.length;
    const { error } = await supabase.from("workflow_stages").insert({
      project_id: projectId,
      title: newTitle.trim(),
      color: PRESET_COLORS[colorIndex],
      display_order: maxOrder + 1,
      is_final: false,
    });
    if (error) {
      toast({ title: "Erro ao criar etapa", variant: "destructive" });
    } else {
      setNewTitle("");
      fetchStages();
      toast({ title: "Etapa criada!" });
    }
  };

  const handleRename = async (id: string) => {
    if (!editingTitle.trim()) return;
    const { error } = await supabase
      .from("workflow_stages")
      .update({ title: editingTitle.trim() })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao renomear", variant: "destructive" });
    } else {
      setEditingId(null);
      fetchStages();
    }
  };

  const handleDelete = async (id: string) => {
    const stage = stages.find((s) => s.id === id);
    if (stage && stage.display_order === 0) {
      toast({ title: "A etapa Backlog não pode ser excluída", description: "Ela é reservada para atividades ainda não iniciadas.", variant: "destructive" });
      return;
    }
    if (!confirm("Atividades nesta etapa perderão a associação. Continuar?")) return;
    const { error } = await supabase.from("workflow_stages").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir etapa", variant: "destructive" });
    } else {
      fetchStages();
      toast({ title: "Etapa excluída!" });
    }
  };

  const handleToggleFinal = async (id: string, current: boolean) => {
    await supabase.from("workflow_stages").update({ is_final: !current }).eq("id", id);
    fetchStages();
  };

  const handleColorChange = async (id: string, color: string) => {
    await supabase.from("workflow_stages").update({ color }).eq("id", id);
    fetchStages();
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-1">Etapas do Workflow</h3>
        <p className="text-sm text-muted-foreground">
          Arraste para reordenar as colunas do Kanban deste projeto.
        </p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {stages.map((stage) => (
              <SortableStageItem
                key={stage.id}
                stage={stage}
                editingId={editingId}
                editingTitle={editingTitle}
                setEditingTitle={setEditingTitle}
                onStartEdit={(id, title) => { setEditingId(id); setEditingTitle(title); }}
                onCancelEdit={() => setEditingId(null)}
                onRename={handleRename}
                onDelete={handleDelete}
                onToggleFinal={handleToggleFinal}
                onColorChange={handleColorChange}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add new stage */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Input
          placeholder="Nome da nova etapa..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="h-9"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button size="sm" onClick={handleAdd} className="gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </Button>
      </div>
    </Card>
  );
};
