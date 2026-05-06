import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Pencil, Trash2, Send, Plus } from "lucide-react";
import { AIAssistButton } from "@/components/AIAssistButton";
import { useAppConfirm } from "@/components/AppConfirmProvider";

interface UserStory {
  id: string;
  title: string;
  narrative: string | null;
  priority: string;
  status: string;
  created_at: string;
}

interface Props {
  activityId: string;
  projectId: string;
}

/**
 * Painel inline (estilo aba) para listar/criar/editar histórias de usuário
 * vinculadas à atividade atual. Versão minimalista do UserStoryDrawer,
 * sem upload de imagem ou critérios — focado no fluxo dentro do diálogo
 * de edição da atividade.
 */
export const ActivityStoriesPanel = ({ activityId, projectId }: Props) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [stories, setStories] = useState<UserStory[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNarrative, setNewNarrative] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNarrative, setEditNarrative] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchStories = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_stories")
      .select("id,title,narrative,priority,status,created_at")
      .eq("activity_id", activityId)
      .eq("is_trashed", false)
      .order("created_at", { ascending: false });
    setStories((data as UserStory[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!activityId) return;
    fetchStories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("user_stories").insert({
      project_id: projectId,
      activity_id: activityId,
      title: newTitle.trim(),
      narrative: newNarrative.trim() || null,
      status: "draft",
    } as any);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao criar história", description: error.message, variant: "destructive" });
      return;
    }
    setNewTitle("");
    setNewNarrative("");
    toast({ title: "História criada!" });
    fetchStories();
  };

  const startEdit = (s: UserStory) => {
    setEditingId(s.id);
    setEditTitle(s.title || "");
    setEditNarrative(s.narrative || "");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editTitle.trim()) return;
    const { error } = await supabase
      .from("user_stories")
      .update({ title: editTitle.trim(), narrative: editNarrative.trim() || null })
      .eq("id", editingId);
    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
      return;
    }
    setEditingId(null);
    toast({ title: "História atualizada!" });
    fetchStories();
  };

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: "Excluir história",
      description: "Excluir esta história?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase
      .from("user_stories")
      .update({ is_trashed: true, trashed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
      return;
    }
    toast({ title: "História movida para a lixeira" });
    fetchStories();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BookOpen className="w-4 h-4 text-primary" />
        Histórias de Usuário
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{stories.length}</Badge>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-xs text-muted-foreground italic">Carregando...</p>
      ) : stories.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Nenhuma história vinculada. Crie a primeira abaixo.
        </p>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {stories.map((s) =>
            editingId === s.id ? (
              <div key={s.id} className="space-y-2 p-2 bg-accent/40 rounded-lg">
                <div className="flex items-center justify-end">
                  <AIAssistButton value={editTitle} onChange={setEditTitle} context="story_title" label="IA Título" />
                </div>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Título da história"
                  className="h-8 text-sm"
                />
                <div className="flex items-center justify-end">
                  <AIAssistButton value={editNarrative} onChange={setEditNarrative} context="story_narrative" />
                </div>
                <Textarea
                  value={editNarrative}
                  onChange={(e) => setEditNarrative(e.target.value)}
                  placeholder="Como [persona], quero [ação], para [benefício]..."
                  className="min-h-[60px] text-sm"
                />
                <div className="flex gap-1">
                  <Button size="sm" onClick={handleSaveEdit}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div key={s.id} className="p-3 bg-accent/30 rounded-lg group">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
                    {s.narrative && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1 line-clamp-3">
                        {s.narrative}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(s)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Criar nova */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Nova história</span>
          {newTitle.trim() && (
            <AIAssistButton value={newTitle} onChange={setNewTitle} context="story_title" label="IA Título" />
          )}
        </div>
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Título da história..."
          className="h-8 text-sm"
        />
        <div className="flex items-center justify-end">
          {newNarrative.trim() && (
            <AIAssistButton value={newNarrative} onChange={setNewNarrative} context="story_narrative" />
          )}
        </div>
        <div className="flex gap-2">
          <Textarea
            value={newNarrative}
            onChange={(e) => setNewNarrative(e.target.value)}
            placeholder="Como [persona], quero [ação], para [benefício]..."
            className="min-h-[36px] text-sm resize-none flex-1"
            rows={1}
          />
          <Button
            size="icon"
            className="h-9 w-9 flex-shrink-0"
            onClick={handleCreate}
            disabled={saving || !newTitle.trim()}
            title="Criar história"
          >
            {saving ? <Plus className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};