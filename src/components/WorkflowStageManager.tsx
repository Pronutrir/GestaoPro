'use client';
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, GripVertical, Pencil, Check, X, Eye, EyeOff, Users, MoreHorizontal } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorkflowStage {
  id: string;
  project_id: string;
  title: string;
  color: string;
  display_order: number;
  is_final: boolean;
  is_blocked: boolean;
  is_visible: boolean;
  is_exception?: boolean;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
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
  onToggleException,
  onToggleVisible,
  onColorChange,
  projectMembers,
  stageMembers,
  onToggleMember,
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
  onToggleException: (id: string, current: boolean) => void;
  onToggleVisible: (id: string, current: boolean) => void;
  onColorChange: (id: string, color: string) => void;
  projectMembers: Profile[];
  stageMembers: string[];
  onToggleMember: (stageId: string, userId: string, isAssigned: boolean) => void;
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
      className={`flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50 ${isDragging ? "ring-2 ring-primary" : ""} ${!stage.is_visible ? "opacity-50" : ""}`}
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
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{stage.title}</span>
            {stage.is_final && (
              <Badge className="bg-success/20 text-success text-[10px]">Final</Badge>
            )}
            {stage.is_blocked && (
              <Badge className="bg-destructive/20 text-destructive text-[10px]">Bloqueio</Badge>
            )}
            {stage.is_exception && (
              <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px]">Exceção</Badge>
            )}
            {stageMembers.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                <Users className="w-2.5 h-2.5 mr-1" />{stageMembers.length}
              </Badge>
            )}
          </div>

          {/* Visibility toggle */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            title={stage.is_visible ? "Ocultar do Kanban" : "Mostrar no Kanban"}
            onClick={() => onToggleVisible(stage.id, stage.is_visible)}
          >
            {stage.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
          </Button>

          {/* Members popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Membros da etapa">
                <Users className="w-3.5 h-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <p className="text-xs font-semibold text-foreground mb-2">Participantes desta etapa</p>
              {projectMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum membro no projeto.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {projectMembers.map((member) => {
                    const isAssigned = stageMembers.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={isAssigned}
                          onCheckedChange={() => onToggleMember(stage.id, member.id, isAssigned)}
                        />
                        <span className="text-xs text-foreground truncate">
                          {member.full_name || member.email || "Sem nome"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            title="Renomear"
            onClick={() => onStartEdit(stage.id, stage.title)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>

          {/* Consolidated actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Mais ações">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => onToggleFinal(stage.id, stage.is_final)}>
                {stage.is_final ? "Remover final" : "Marcar como final"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleBlocked(stage.id, stage.is_blocked)}>
                {stage.is_blocked ? "Remover bloqueio" : "Marcar como bloqueio"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onToggleException(stage.id, !!stage.is_exception)}
                title="Colunas de exceção (ex.: Atrasado) não contam como avanço."
              >
                {stage.is_exception ? "Remover exceção" : "Marcar como exceção"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(stage.id)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir etapa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
  const [projectMembers, setProjectMembers] = useState<Profile[]>([]);
  const [stageMembersMap, setStageMembersMap] = useState<Record<string, string[]>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchStages();
    fetchProjectMembers();
  }, [projectId]);

  useEffect(() => {
    if (stages.length > 0) fetchStageMembers();
  }, [stages.length]);

  const fetchStages = async () => {
    const { data } = await supabase
      .from("workflow_stages")
      .select("*")
      .eq("project_id", projectId)
      .order("display_order");
    if (data) setStages(data);
  };

  const fetchProjectMembers = async () => {
    // Get project member user_ids, then fetch their profiles
    const { data: members } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);
    if (!members || members.length === 0) {
      setProjectMembers([]);
      return;
    }
    const userIds = members.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    if (profiles) setProjectMembers(profiles);
  };

  const fetchStageMembers = async () => {
    const stageIds = stages.map((s) => s.id);
    const { data } = await supabase
      .from("workflow_stage_members")
      .select("stage_id, user_id")
      .in("stage_id", stageIds);
    if (data) {
      const map: Record<string, string[]> = {};
      stageIds.forEach((id) => (map[id] = []));
      data.forEach((row) => {
        if (map[row.stage_id]) map[row.stage_id].push(row.user_id);
      });
      setStageMembersMap(map);
    }
  };

  const handleToggleMember = async (stageId: string, userId: string, isAssigned: boolean) => {
    if (isAssigned) {
      await supabase
        .from("workflow_stage_members")
        .delete()
        .eq("stage_id", stageId)
        .eq("user_id", userId);
    } else {
      await supabase
        .from("workflow_stage_members")
        .insert({ stage_id: stageId, user_id: userId });
    }
    fetchStageMembers();
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
    await supabase.from("workflow_stages").update({ is_final: !current, ...(current ? {} : { is_blocked: false }) }).eq("id", id);
    fetchStages();
  };

  const handleToggleBlocked = async (id: string, current: boolean) => {
    await supabase.from("workflow_stages").update({ is_blocked: !current, ...(current ? {} : { is_final: false }) }).eq("id", id);
    fetchStages();
  };

  const handleToggleException = async (id: string, current: boolean) => {
    await supabase
      .from("workflow_stages")
      .update({ is_exception: !current, ...(current ? {} : { is_final: false }) })
      .eq("id", id);
    fetchStages();
  };

  const handleToggleVisible = async (id: string, current: boolean) => {
    await supabase.from("workflow_stages").update({ is_visible: !current }).eq("id", id);
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
          Arraste para reordenar. Use o ícone 👁 para mostrar/ocultar no Kanban e 👥 para atribuir participantes.
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
                onToggleBlocked={handleToggleBlocked}
                onToggleException={handleToggleException}
                onToggleVisible={handleToggleVisible}
                onColorChange={handleColorChange}
                projectMembers={projectMembers}
                stageMembers={stageMembersMap[stage.id] || []}
                onToggleMember={handleToggleMember}
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
