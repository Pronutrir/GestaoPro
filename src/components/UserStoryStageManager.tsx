import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  arrayMove, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAppConfirm } from "@/components/AppConfirmProvider";

export interface UserStoryStage {
  id: string;
  project_id: string;
  title: string;
  color: string;
  display_order: number;
  is_final: boolean;
}

const PRESET_COLORS = [
  "hsl(220, 15%, 50%)", "hsl(38, 92%, 50%)", "hsl(220, 90%, 56%)",
  "hsl(199, 89%, 48%)", "hsl(270, 70%, 55%)", "hsl(142, 76%, 36%)",
  "hsl(0, 84%, 60%)", "hsl(340, 82%, 52%)",
];

interface Props {
  projectId: string;
  stages: UserStoryStage[];
  onStagesChange: () => void;
}

function SortableStageItem({ stage, editingId, editingTitle, setEditingTitle, onStartEdit, onCancelEdit, onRename, onDelete, onToggleFinal, onColorChange }: {
  stage: UserStoryStage; editingId: string | null; editingTitle: string;
  setEditingTitle: (v: string) => void; onStartEdit: (id: string, title: string) => void;
  onCancelEdit: () => void; onRename: (id: string) => void; onDelete: (id: string) => void;
  onToggleFinal: (id: string, current: boolean) => void; onColorChange: (id: string, color: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50 ${isDragging ? "ring-2 ring-primary" : ""}`}>
      <button className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="relative group">
        <div className="w-4 h-4 rounded-full cursor-pointer ring-2 ring-border" style={{ backgroundColor: stage.color }} />
        <div className="absolute left-0 top-6 z-20 hidden group-hover:flex gap-1 bg-popover border border-border rounded-lg p-2 shadow-lg">
          {PRESET_COLORS.map(c => (
            <button key={c} className="w-5 h-5 rounded-full ring-1 ring-border hover:ring-primary transition-all" style={{ backgroundColor: c }} onClick={() => onColorChange(stage.id, c)} />
          ))}
        </div>
      </div>
      {editingId === stage.id ? (
        <div className="flex-1 flex items-center gap-2">
          <Input value={editingTitle} onChange={e => setEditingTitle(e.target.value)} className="h-8 text-sm" onKeyDown={e => e.key === "Enter" && onRename(stage.id)} />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRename(stage.id)}><Check className="w-3.5 h-3.5 text-success" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancelEdit}><X className="w-3.5 h-3.5" /></Button>
        </div>
      ) : (
        <>
          <span className="flex-1 text-sm font-medium text-foreground">{stage.title}</span>
          {stage.is_final && <Badge className="bg-success/20 text-success text-[10px]">Final</Badge>}
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => onToggleFinal(stage.id, stage.is_final)}>
            {stage.is_final ? "Remover final" : "Marcar final"}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onStartEdit(stage.id, stage.title)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(stage.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </>
      )}
    </div>
  );
}

export const UserStoryStageManager = ({ projectId, stages, onStagesChange }: Props) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = stages.findIndex(s => s.id === active.id);
    const newIdx = stages.findIndex(s => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(stages, oldIdx, newIdx);
    try {
      for (let i = 0; i < reordered.length; i++) {
        await supabase.from("user_story_stages").update({ display_order: i }).eq("id", reordered[i].id);
      }
      onStagesChange();
      toast({ title: "Ordem atualizada!" });
    } catch {
      toast({ title: "Erro ao reordenar", variant: "destructive" });
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    const maxOrder = stages.reduce((max, s) => Math.max(max, s.display_order), -1);
    const colorIdx = stages.length % PRESET_COLORS.length;
    const { error } = await supabase.from("user_story_stages").insert({
      project_id: projectId, title: newTitle.trim(), color: PRESET_COLORS[colorIdx],
      display_order: maxOrder + 1, is_final: false,
    });
    if (error) { toast({ title: "Erro ao criar etapa", variant: "destructive" }); }
    else { setNewTitle(""); onStagesChange(); toast({ title: "Etapa criada!" }); }
  };

  const handleRename = async (id: string) => {
    if (!editingTitle.trim()) return;
    await supabase.from("user_story_stages").update({ title: editingTitle.trim() }).eq("id", id);
    setEditingId(null);
    onStagesChange();
  };

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: "Excluir etapa",
      description: "Histórias nesta etapa perderão a associação. Continuar?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await supabase.from("user_story_stages").delete().eq("id", id);
    onStagesChange();
    toast({ title: "Etapa excluída!" });
  };

  const handleToggleFinal = async (id: string, current: boolean) => {
    await supabase.from("user_story_stages").update({ is_final: !current }).eq("id", id);
    onStagesChange();
  };

  const handleColorChange = async (id: string, color: string) => {
    await supabase.from("user_story_stages").update({ color }).eq("id", id);
    onStagesChange();
  };

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Etapas das Histórias</h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {stages.map(stage => (
              <SortableStageItem key={stage.id} stage={stage} editingId={editingId} editingTitle={editingTitle}
                setEditingTitle={setEditingTitle} onStartEdit={(id, title) => { setEditingId(id); setEditingTitle(title); }}
                onCancelEdit={() => setEditingId(null)} onRename={handleRename} onDelete={handleDelete}
                onToggleFinal={handleToggleFinal} onColorChange={handleColorChange} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Input placeholder="Nome da nova etapa..." value={newTitle} onChange={e => setNewTitle(e.target.value)}
          className="h-9" onKeyDown={e => e.key === "Enter" && handleAdd()} />
        <Button size="sm" onClick={handleAdd} className="gap-1.5 shrink-0"><Plus className="w-3.5 h-3.5" /> Adicionar</Button>
      </div>
    </Card>
  );
};
