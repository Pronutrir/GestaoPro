import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
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

export const WorkflowStageManager = ({ projectId }: WorkflowStageManagerProps) => {
  const { toast } = useToast();
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

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

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    const maxOrder = stages.reduce((max, s) => Math.max(max, s.display_order), -1);
    const colorIndex = (stages.length) % PRESET_COLORS.length;
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
          Configure as colunas do Kanban de atividades deste projeto.
        </p>
      </div>

      <div className="space-y-2">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50"
          >
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
                    onClick={() => handleColorChange(stage.id, c)}
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
                  onKeyDown={(e) => e.key === "Enter" && handleRename(stage.id)}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRename(stage.id)}>
                  <Check className="w-3.5 h-3.5 text-success" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-foreground">{stage.title}</span>
                {stage.is_final && (
                  <Badge className="bg-success/20 text-success text-[10px]">Final</Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => handleToggleFinal(stage.id, stage.is_final)}
                >
                  {stage.is_final ? "Remover final" : "Marcar final"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingId(stage.id);
                    setEditingTitle(stage.title);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(stage.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

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
