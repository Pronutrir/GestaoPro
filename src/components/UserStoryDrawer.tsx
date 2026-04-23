import { useEffect, useState, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookOpen, Link2, Pencil, Trash2, X, Check, Upload, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { AIAssistButton } from "@/components/AIAssistButton";
import { useToast } from "@/hooks/use-toast";

interface UserStory {
  id: string;
  title: string;
  persona: string;
  action: string;
  benefit: string;
  narrative: string | null;
  image_url: string | null;
  acceptance_criteria: string[];
  priority: string;
  status: string;
  phase_id: string | null;
  activity_id: string | null;
  stage_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  activityId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStoriesChanged?: () => void;
}

export const UserStoryDrawer = ({ activityId, projectId, open, onOpenChange, onStoriesChanged }: Props) => {
  const { toast } = useToast();
  const [stories, setStories] = useState<UserStory[]>([]);
  const [phaseName, setPhaseName] = useState("");
  const [activityName, setActivityName] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", narrative: "", image_url: null as string | null });
  const [uploading, setUploading] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStories = async () => {
    if (!activityId) return;
    setLoading(true);
    const { data } = await supabase
      .from("user_stories")
      .select("*")
      .eq("activity_id", activityId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (data && data.length > 0) {
      setStories(data as UserStory[]);
      const first = data[0];
      const [phaseRes, actRes] = await Promise.all([
        first.phase_id ? supabase.from("phases").select("title").eq("id", first.phase_id).single() : null,
        first.activity_id ? supabase.from("activities").select("title").eq("id", first.activity_id).single() : null,
      ]);
      setPhaseName(phaseRes?.data?.title || "");
      setActivityName(actRes?.data?.title || "");
    } else {
      setStories([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open || !activityId) return;
    setEditingId(null);
    fetchStories();
  }, [open, activityId, projectId]);

  const startEdit = (story: UserStory) => {
    setEditingId(story.id);
    setEditForm({ title: story.title || "", narrative: story.narrative || "", image_url: story.image_url });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.title.trim()) return;
    const { error } = await supabase.from("user_stories").update({
      title: editForm.title.trim(),
      narrative: editForm.narrative.trim(),
      image_url: editForm.image_url,
    }).eq("id", editingId);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "História atualizada!" });
      setEditingId(null);
      fetchStories();
      onStoriesChanged?.();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta história?")) return;
    const { error } = await supabase.from("user_stories").update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "História movida para a lixeira" });
      setStories(prev => prev.filter(s => s.id !== id));
      onStoriesChanged?.();
    }
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
      setEditForm(f => ({ ...f, image_url: urlData.publicUrl }));
      toast({ title: "Imagem carregada!" });
    } catch (err: any) {
      toast({ title: "Erro ao carregar imagem", description: err.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Histórias de Usuário
            {stories.length > 0 && (
              <Badge variant="secondary" className="text-xs">{stories.length}</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        ) : stories.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Nenhuma história encontrada para esta atividade.</p>
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {/* Sort filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Ordenar:</span>
              <div className="flex gap-1">
                {[
                  { value: "desc", label: "Recente" },
                  { value: "asc", label: "Antiga" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`px-2 py-0.5 rounded text-xs font-medium border transition-all ${sortOrder === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground/30"}`}
                    onClick={() => setSortOrder(opt.value as "asc" | "desc")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {(phaseName || activityName) && (
              <div className="space-y-2 pb-3 border-b border-border">
                {phaseName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Fase:</span>
                    <span className="font-medium">{phaseName}</span>
                  </div>
                )}
                {activityName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Atividade:</span>
                    <span className="font-medium">{activityName}</span>
                  </div>
                )}
              </div>
            )}

            {[...stories].sort((a, b) => {
              const dateA = new Date(a.created_at).getTime();
              const dateB = new Date(b.created_at).getTime();
              return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
            }).map((story, idx) => (
              <div key={story.id} className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                {editingId === story.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Título</Label>
                      <Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Narrativa</Label>
                        <AIAssistButton value={editForm.narrative} onChange={(v) => setEditForm({ ...editForm, narrative: v })} context="story_narrative" />
                      </div>
                      <Textarea value={editForm.narrative} onChange={e => setEditForm({ ...editForm, narrative: e.target.value })} rows={3} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Imagem</Label>
                      {editForm.image_url ? (
                        <div className="relative">
                          <img src={editForm.image_url} alt="Preview" className="rounded-lg border border-border max-h-32 w-full object-cover" />
                          <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-5 w-5" onClick={() => setEditForm({ ...editForm, image_url: "" })}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full border border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
                        >
                          <Upload className="w-4 h-4 mx-auto mb-1" />
                          {uploading ? "Carregando..." : "Anexar imagem"}
                        </button>
                      )}
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={cancelEdit} className="h-7 text-xs">
                        <X className="w-3 h-3 mr-1" /> Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} disabled={!editForm.title.trim()} className="h-7 text-xs">
                        <Check className="w-3 h-3 mr-1" /> Salvar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground flex-1 min-w-0">{story.title || "Sem título"}</p>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(story)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDelete(story.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {story.narrative && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Narrativa</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                          {story.narrative}
                        </p>
                      </div>
                    )}

                    {story.image_url && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Imagem</p>
                        <img src={story.image_url} alt="User Story" className="rounded-lg border border-border max-h-48 w-full object-cover" />
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-primary/80 bg-primary/5 rounded px-1.5 py-0.5 w-fit">
                      <span>📅 {new Date(story.created_at).toLocaleDateString("pt-BR")} • {new Date(story.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {story.updated_at !== story.created_at && (
                      <div className="text-[10px] text-muted-foreground/70">
                        Atualizada: {new Date(story.updated_at).toLocaleDateString("pt-BR")} {new Date(story.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
