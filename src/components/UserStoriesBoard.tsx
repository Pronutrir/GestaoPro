import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  PointerSensor, useSensor, useSensors, useDroppable, rectIntersection,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Trash2, X, Image as ImageIcon,
  BookOpen, ChevronDown, GripVertical, Upload, Link2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
interface WorkflowStage {
  id: string;
  project_id: string;
  title: string;
  color: string;
  display_order: number;
  is_final: boolean;
  is_visible: boolean;
  is_blocked: boolean;
}

interface UserStory {
  id: string;
  project_id: string;
  activity_id: string | null;
  phase_id: string | null;
  stage_id: string | null;
  title: string;
  persona: string;
  action: string;
  benefit: string;
  narrative: string;
  image_url: string | null;
  acceptance_criteria: string[];
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Phase { id: string; title: string; display_order: number | null; }
interface Activity { id: string; title: string; phase_id: string | null; }

interface Props { projectId: string; }

export const UserStoriesBoard = ({ projectId }: Props) => {
  const { toast } = useToast();
  const [stories, setStories] = useState<UserStory[]>([]);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<UserStory | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showStageManager, setShowStageManager] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [form, setForm] = useState({
    title: "",
    narrative: "",
    image_url: null as string | null,
    phase_id: null as string | null, activity_id: null as string | null,
  });
  const [activeStory, setActiveStory] = useState<UserStory | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => { fetchStages(); fetchStories(); fetchPhasesAndActivities(); }, [projectId]);

  const fetchStages = async () => {
    const { data } = await supabase.from("workflow_stages").select("*").eq("project_id", projectId).eq("is_visible", true).order("display_order");
    if (data) setStages(data as WorkflowStage[]);
  };

  const fetchStories = async () => {
    const { data } = await supabase.from("user_stories").select("*").eq("project_id", projectId).order("created_at", { ascending: true });
    if (data) setStories(data as UserStory[]);
  };

  const fetchPhasesAndActivities = async () => {
    const [{ data: ph }, { data: act }] = await Promise.all([
      supabase.from("phases").select("id, title, display_order").eq("project_id", projectId).order("display_order"),
      supabase.from("activities").select("id, title, phase_id").eq("project_id", projectId).order("title"),
    ]);
    if (ph) setPhases(ph);
    if (act) setActivities(act);
  };

  const getStoriesByStage = (stageId: string) => stories.filter(s => s.stage_id === stageId);

  const openCreateDialog = () => {
    setEditingStory(null);
    setForm({ title: "", narrative: "", image_url: null, phase_id: null, activity_id: null });
    setDialogOpen(true);
  };

  const openEditDialog = (story: UserStory) => {
    setEditingStory(story);
    setForm({
      title: story.title || "",
      narrative: story.narrative || "", image_url: story.image_url,
      phase_id: story.phase_id || null, activity_id: story.activity_id || null,
    });
    setDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${projectId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("user-story-images").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("user-story-images").getPublicUrl(path);
      setForm(f => ({ ...f, image_url: urlData.publicUrl }));
      toast({ title: "Imagem carregada!" });
    } catch (err: any) {
      toast({ title: "Erro ao carregar imagem", description: err.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Preencha o título", variant: "destructive" });
      return;
    }
    const firstStage = stages[0];
    const payload = {
      project_id: projectId, persona: "", action: "",
      benefit: "", title: form.title, narrative: form.narrative, image_url: form.image_url,
      acceptance_criteria: [], priority: "medium",
      phase_id: form.phase_id, activity_id: form.activity_id,
    };

    if (editingStory) {
      await supabase.from("user_stories").update(payload).eq("id", editingStory.id);
      toast({ title: "História atualizada!" });
    } else {
      await supabase.from("user_stories").insert({ ...payload, status: "draft", stage_id: firstStage?.id || null });
      toast({ title: "História criada!" });
    }
    setDialogOpen(false);
    fetchStories();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta história?")) return;
    await supabase.from("user_stories").delete().eq("id", id);
    toast({ title: "História excluída!" });
    fetchStories();
  };

  const handleMoveStory = async (storyId: string, newStageId: string) => {
    setStories(prev => prev.map(s => s.id === storyId ? { ...s, stage_id: newStageId } : s));
    const { error } = await supabase.from("user_stories").update({ stage_id: newStageId }).eq("id", storyId);
    if (error) fetchStories();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveStory(stories.find(s => s.id === event.active.id) || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveStory(null);
    const { active, over } = event;
    if (!over) return;
    const storyId = String(active.id);
    const overId = String(over.id);
    const draggedStory = stories.find(s => s.id === storyId);
    if (!draggedStory) return;

    // Check if dropped over a column droppable
    const targetStage = stages.find(s => s.id === overId);
    if (targetStage) {
      if (draggedStory.stage_id !== targetStage.id) {
        handleMoveStory(storyId, targetStage.id);
      }
      return;
    }

    // Dropped over another story card — find its stage
    const targetStory = stories.find(s => s.id === overId);
    if (targetStory && targetStory.stage_id && draggedStory.stage_id !== targetStory.stage_id) {
      handleMoveStory(storyId, targetStory.stage_id);
    }
  };

  const gridCols = stages.length <= 3 ? "grid-cols-3" : stages.length === 4 ? "grid-cols-4" : stages.length === 5 ? "grid-cols-5" : stages.length === 6 ? "grid-cols-6" : "grid-cols-7";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Histórias de Usuário</h2>
          <Badge variant="secondary" className="text-xs">{stories.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openCreateDialog} className="gap-1.5">
            <Plus className="w-4 h-4" /> Nova História
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={`grid ${gridCols} gap-3`}>
          {stages.map(stage => {
            const stageStories = getStoriesByStage(stage.id);
            return (
              <DroppableColumn key={stage.id} stageId={stage.id} color={stage.color} label={stage.title} count={stageStories.length}>
                {stageStories.map(story => (
                  <DraggableStoryCard key={story.id} story={story} stages={stages} phases={phases} activities={activities}
                    onEdit={() => openEditDialog(story)} onDelete={() => handleDelete(story.id)}
                    onMove={(stageId) => handleMoveStory(story.id, stageId)} />
                ))}
              </DroppableColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeStory ? (
            <Card className="p-3 shadow-lg opacity-90 rotate-2 border-primary">
              <p className="text-xs font-semibold text-foreground">
              {activeStory.title || "Sem título"}
              </p>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingStory ? "Editar História" : "Nova História de Usuário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" /> Vínculo com EAP
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fase</Label>
                  <Select value={form.phase_id || "none"} onValueChange={v => setForm({ ...form, phase_id: v === "none" ? null : v, activity_id: null })}>
                    <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {phases.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Atividade</Label>
                  <Select value={form.activity_id || "none"} onValueChange={v => setForm({ ...form, activity_id: v === "none" ? null : v })}>
                    <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {activities.filter(a => !form.phase_id || a.phase_id === form.phase_id).map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Título *</Label>
              <Input placeholder="Título da história..." value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })} autoFocus />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Narrativa / Contexto</Label>
              <Textarea placeholder="Conte a história com mais detalhes..." value={form.narrative}
                onChange={e => setForm({ ...form, narrative: e.target.value })} rows={4} autoResize
                className="w-full min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Imagem / Evidência</Label>
              {form.image_url ? (
                <div className="relative group">
                  <img src={form.image_url} alt="Story" className="w-full max-h-48 object-cover rounded-lg border border-border" />
                  <Button size="icon" variant="destructive" className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setForm({ ...form, image_url: null })}><X className="w-4 h-4" /></Button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 hover:bg-accent/30 transition-colors" disabled={uploading}>
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{uploading ? "Carregando..." : "Clique para anexar uma imagem"}</p>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>

          </div>
          {editingStory && (
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground border-t border-border pt-3">
              <span>Criada em: {new Date(editingStory.created_at).toLocaleDateString("pt-BR")} {new Date(editingStory.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              {editingStory.created_at !== (editingStory as any).updated_at && (
                <span>Atualizada em: {new Date((editingStory as any).updated_at).toLocaleDateString("pt-BR")} {new Date((editingStory as any).updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingStory ? "Salvar" : "Criar História"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ── Droppable Column using useDroppable (NOT useSortable) ── */
const DroppableColumn = ({ stageId, color, label, count, children }: {
  stageId: string; color: string; label: string; count: number; children: React.ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div ref={setNodeRef} className={`space-y-2 min-w-0 transition-colors rounded-lg ${isOver ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: color.replace(")", ", 0.15)").replace("hsl", "hsla") }}>
        <span className="text-sm font-semibold" style={{ color }}>{label}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{count}</Badge>
      </div>
      <div className="space-y-2 min-h-[120px] min-w-0 p-1">
        {children}
      </div>
    </div>
  );
};

/* ── Draggable Story Card ── */
const DraggableStoryCard = ({ story, stages, phases, activities, onEdit, onDelete, onMove }: {
  story: UserStory; stages: WorkflowStage[]; phases: Phase[]; activities: Activity[];
  onEdit: () => void; onDelete: () => void; onMove: (stageId: string) => void;
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: story.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <Card ref={setNodeRef} style={style}
      className="p-3 space-y-2 cursor-pointer hover:shadow-md transition-shadow group border-border/60" onClick={onEdit}>
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div {...attributes} {...listeners} className="shrink-0 cursor-grab active:cursor-grabbing pt-0.5 touch-none">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground line-clamp-2 break-words [overflow-wrap:anywhere]">
            {story.title || <span className="italic text-muted-foreground">Sem título</span>}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive"
            onClick={e => { e.stopPropagation(); onDelete(); }}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>

      {story.narrative && <p className="text-[11px] text-muted-foreground line-clamp-2 break-words whitespace-pre-wrap [overflow-wrap:anywhere] min-w-0">{story.narrative}</p>}
      {story.image_url && <img src={story.image_url} alt="" className="w-full h-20 object-cover rounded-md border border-border/50" />}

      <div className="flex items-center gap-1.5 text-[10px] font-medium text-primary/80 bg-primary/5 rounded px-1.5 py-0.5 w-fit">
        <span>📅 {new Date(story.created_at).toLocaleDateString("pt-BR")} • {new Date(story.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {(story.phase_id || story.activity_id) && (
        <div className="flex items-center gap-1 flex-wrap">
          {story.phase_id && (() => { const phase = phases.find(p => p.id === story.phase_id); return phase ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">📁 {phase.title}</Badge> : null; })()}
          {story.activity_id && (() => { const act = activities.find(a => a.id === story.activity_id); return act ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">📋 {act.title}</Badge> : null; })()}
        </div>
      )}

      <div className="flex items-center justify-between gap-1">
        <div className="flex-1" />
        <div className="relative">
          <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}><ChevronDown className="w-3 h-3" /></Button>
          {showMenu && (
            <div className="absolute right-0 bottom-7 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[120px]"
              onClick={e => e.stopPropagation()}>
              {stages.filter(s => s.id !== story.stage_id).map(s => (
                <button key={s.id} className="w-full text-left text-xs px-3 py-1.5 rounded hover:bg-accent transition-colors"
                  onClick={() => { onMove(s.id); setShowMenu(false); }}>{s.title}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
