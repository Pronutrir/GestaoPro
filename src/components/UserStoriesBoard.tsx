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
  DndContext, closestCenter, DragEndEvent, DragOverEvent, DragStartEvent, DragOverlay,
  PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Trash2, CheckCircle2, Circle, X, Image as ImageIcon,
  BookOpen, ChevronDown, GripVertical, Upload,
} from "lucide-react";

interface UserStory {
  id: string;
  project_id: string;
  activity_id: string | null;
  persona: string;
  action: string;
  benefit: string;
  narrative: string;
  image_url: string | null;
  acceptance_criteria: string[];
  priority: string;
  status: string;
  created_at: string;
}

const KANBAN_COLUMNS = [
  { key: "draft", label: "Rascunho", color: "bg-muted", textColor: "text-muted-foreground" },
  { key: "analysis", label: "Análise", color: "bg-info/15", textColor: "text-info" },
  { key: "validated", label: "Validada", color: "bg-warning/15", textColor: "text-warning" },
  { key: "done", label: "Concluída", color: "bg-success/15", textColor: "text-success" },
];

interface Props {
  projectId: string;
}

export const UserStoriesBoard = ({ projectId }: Props) => {
  const { toast } = useToast();
  const [stories, setStories] = useState<UserStory[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<UserStory | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    persona: "", action: "", benefit: "", narrative: "",
    priority: "medium", image_url: null as string | null,
  });
  const [criteria, setCriteria] = useState<string[]>([]);
  const [newCriterion, setNewCriterion] = useState("");

  useEffect(() => {
    fetchStories();
  }, [projectId]);

  const fetchStories = async () => {
    const { data } = await supabase
      .from("user_stories")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (data) setStories(data as UserStory[]);
  };

  const openCreateDialog = (status = "draft") => {
    setEditingStory(null);
    setForm({ persona: "", action: "", benefit: "", narrative: "", priority: "medium", image_url: null });
    setCriteria([]);
    setDialogOpen(true);
  };

  const openEditDialog = (story: UserStory) => {
    setEditingStory(story);
    setForm({
      persona: story.persona, action: story.action, benefit: story.benefit,
      narrative: story.narrative || "", priority: story.priority,
      image_url: story.image_url,
    });
    setCriteria(story.acceptance_criteria || []);
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
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.persona.trim() || !form.action.trim()) {
      toast({ title: "Preencha pelo menos persona e ação", variant: "destructive" });
      return;
    }
    const payload = {
      project_id: projectId,
      persona: form.persona,
      action: form.action,
      benefit: form.benefit,
      narrative: form.narrative,
      image_url: form.image_url,
      acceptance_criteria: criteria,
      priority: form.priority,
    };

    if (editingStory) {
      await supabase.from("user_stories").update(payload).eq("id", editingStory.id);
      toast({ title: "História atualizada!" });
    } else {
      await supabase.from("user_stories").insert({ ...payload, status: "draft" });
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

  const handleMoveStory = async (story: UserStory, newStatus: string) => {
    // Optimistic update
    setStories(prev => prev.map(s => s.id === story.id ? { ...s, status: newStatus } : s));
    const { error } = await supabase.from("user_stories").update({ status: newStatus }).eq("id", story.id);
    if (error) fetchStories(); // rollback on error
  };

  const getStoriesByStatus = (status: string) => stories.filter(s => s.status === status);

  const [activeStory, setActiveStory] = useState<UserStory | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const story = stories.find(s => s.id === event.active.id);
    setActiveStory(story || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveStory(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    const storyId = String(active.id);

    // Check if dropped over a column
    const targetColumn = KANBAN_COLUMNS.find(c => c.key === overId);
    if (targetColumn) {
      const story = stories.find(s => s.id === storyId);
      if (story && story.status !== targetColumn.key) {
        handleMoveStory(story, targetColumn.key);
      }
      return;
    }

    // Dropped over another story card — find its column
    const targetStory = stories.find(s => s.id === overId);
    if (targetStory) {
      const story = stories.find(s => s.id === storyId);
      if (story && story.status !== targetStory.status) {
        handleMoveStory(story, targetStory.status);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Histórias de Usuário</h2>
          <Badge variant="secondary" className="text-xs">{stories.length}</Badge>
        </div>
        <Button size="sm" onClick={() => openCreateDialog()} className="gap-1.5">
          <Plus className="w-4 h-4" /> Nova História
        </Button>
      </div>

      {/* Kanban Board with DnD */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-4 gap-3">
          {KANBAN_COLUMNS.map(col => {
            const colStories = getStoriesByStatus(col.key);
            return (
              <DroppableColumn key={col.key} columnKey={col.key} color={col.color} textColor={col.textColor} label={col.label} count={colStories.length}>
                <SortableContext items={colStories.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {colStories.map(story => (
                    <DraggableStoryCard
                      key={story.id}
                      story={story}
                      columns={KANBAN_COLUMNS}
                      onEdit={() => openEditDialog(story)}
                      onDelete={() => handleDelete(story.id)}
                      onMove={(status) => handleMoveStory(story, status)}
                    />
                  ))}
                </SortableContext>
              </DroppableColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeStory ? (
            <Card className="p-3 shadow-lg opacity-90 rotate-2 border-primary">
              <p className="text-xs text-foreground">
                <span className="font-semibold text-primary">Como</span> {activeStory.persona},{" "}
                <span className="font-semibold text-primary">eu quero</span> {activeStory.action}
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
            {/* User Story Format */}
            <div className="space-y-3 p-4 bg-accent/20 rounded-lg border border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Formato Ágil</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-sm font-semibold text-muted-foreground w-20 shrink-0">Como</span>
                  <Textarea
                    placeholder="persona (ex: gestor de projetos)"
                    value={form.persona}
                    onChange={(e) => setForm({ ...form, persona: e.target.value })}
                    rows={1}
                    autoResize
                    className="min-h-[44px] flex-1 min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
                  />
                </div>
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-sm font-semibold text-muted-foreground w-20 shrink-0">Eu quero</span>
                  <Textarea
                    placeholder="ação desejada"
                    value={form.action}
                    onChange={(e) => setForm({ ...form, action: e.target.value })}
                    rows={1}
                    autoResize
                    className="min-h-[44px] flex-1 min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
                  />
                </div>
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-sm font-semibold text-muted-foreground w-20 shrink-0">Para que</span>
                  <Textarea
                    placeholder="benefício esperado"
                    value={form.benefit}
                    onChange={(e) => setForm({ ...form, benefit: e.target.value })}
                    rows={1}
                    autoResize
                    className="min-h-[44px] flex-1 min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
                  />
                </div>
              </div>
            </div>

            {/* Narrative */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Narrativa / Contexto</Label>
              <Textarea
                placeholder="Conte a história com mais detalhes... O que aconteceu? Qual o contexto?"
                value={form.narrative}
                onChange={(e) => setForm({ ...form, narrative: e.target.value })}
                rows={4}
                autoResize
                className="w-full min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
              />
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> Imagem / Evidência
              </Label>
              {form.image_url ? (
                <div className="relative group">
                  <img src={form.image_url} alt="Story" className="w-full max-h-48 object-cover rounded-lg border border-border" />
                  <Button size="icon" variant="destructive" className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setForm({ ...form, image_url: null })}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 hover:bg-accent/30 transition-colors"
                  disabled={uploading}
                >
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {uploading ? "Carregando..." : "Clique para anexar uma imagem"}
                  </p>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3">
              <Label className="text-sm font-semibold">Prioridade:</Label>
              {(["low", "medium", "high"] as const).map(p => (
                <button key={p} type="button"
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${form.priority === p ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                  onClick={() => setForm({ ...form, priority: p })}
                >
                  {p === "high" ? "Alta" : p === "medium" ? "Média" : "Baixa"}
                </button>
              ))}
            </div>

            {/* Acceptance Criteria */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Critérios de Aceite</Label>
              {criteria.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                  <span className="text-sm text-foreground flex-1 break-words">{c}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                    onClick={() => setCriteria(criteria.filter((_, i) => i !== idx))}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="Adicionar critério..." value={newCriterion}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCriterion.trim()) {
                      e.preventDefault();
                      setCriteria([...criteria, newCriterion.trim()]);
                      setNewCriterion("");
                    }
                  }} className="text-sm" />
                <Button type="button" size="sm" variant="outline"
                  onClick={() => { if (newCriterion.trim()) { setCriteria([...criteria, newCriterion.trim()]); setNewCriterion(""); } }}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingStory ? "Salvar" : "Criar História"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ── Droppable Column ── */
const DroppableColumn = ({ columnKey, color, textColor, label, count, children }: {
  columnKey: string; color: string; textColor: string; label: string; count: number; children: React.ReactNode;
}) => {
  const { setNodeRef, isOver } = useSortable({ id: columnKey, data: { type: "column" } });
  return (
    <div ref={setNodeRef} className={`space-y-2 min-w-0 transition-colors rounded-lg ${isOver ? "bg-primary/5" : ""}`}>
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${color}`}>
        <span className={`text-sm font-semibold ${textColor}`}>{label}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{count}</Badge>
      </div>
      <div className="space-y-2 min-h-[120px] min-w-0 p-1">
        {children}
      </div>
    </div>
  );
};

/* ── Draggable Story Card ── */
interface StoryCardProps {
  story: UserStory;
  columns: typeof KANBAN_COLUMNS;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (status: string) => void;
}

const DraggableStoryCard = ({ story, columns, onEdit, onDelete, onMove }: StoryCardProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: story.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="p-3 space-y-2 cursor-pointer hover:shadow-md transition-shadow group border-border/60"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div {...attributes} {...listeners} className="shrink-0 cursor-grab active:cursor-grabbing pt-0.5 touch-none">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
        </div>
        <p className="text-xs leading-relaxed text-foreground break-words whitespace-pre-wrap [overflow-wrap:anywhere] flex-1 min-w-0">
          <span className="font-semibold text-primary">Como</span> {story.persona},{" "}
          <span className="font-semibold text-primary">eu quero</span> {story.action}
          {story.benefit && (
            <>, <span className="font-semibold text-primary">para que</span> {story.benefit}</>
          )}
        </p>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {story.image_url && (
        <img src={story.image_url} alt="" className="w-full h-20 object-cover rounded-md border border-border/50" />
      )}

      {story.narrative && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 break-words whitespace-pre-wrap [overflow-wrap:anywhere] min-w-0">{story.narrative}</p>
      )}

      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${story.priority === "high" ? "border-destructive text-destructive" : story.priority === "medium" ? "border-warning text-warning" : "border-border"}`}>
            {story.priority === "high" ? "Alta" : story.priority === "medium" ? "Média" : "Baixa"}
          </Badge>
          {story.acceptance_criteria?.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              ✓ {story.acceptance_criteria.length}
            </Badge>
          )}
        </div>

        {/* Move dropdown */}
        <div className="relative">
          <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}>
            <ChevronDown className="w-3 h-3" />
          </Button>
          {showMenu && (
            <div className="absolute right-0 bottom-7 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[120px]"
              onClick={(e) => e.stopPropagation()}>
              {columns.filter(c => c.key !== story.status).map(col => (
                <button key={col.key}
                  className="w-full text-left text-xs px-3 py-1.5 rounded hover:bg-accent transition-colors"
                  onClick={() => { onMove(col.key); setShowMenu(false); }}>
                  {col.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
