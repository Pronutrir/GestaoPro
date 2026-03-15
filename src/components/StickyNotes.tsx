import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Plus, X, Trash2, Pencil, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const NOTE_COLORS = [
  { name: "yellow", bg: "bg-yellow-100 dark:bg-yellow-900/40", border: "border-yellow-300 dark:border-yellow-700" },
  { name: "blue", bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-300 dark:border-blue-700" },
  { name: "green", bg: "bg-green-100 dark:bg-green-900/40", border: "border-green-300 dark:border-green-700" },
  { name: "pink", bg: "bg-pink-100 dark:bg-pink-900/40", border: "border-pink-300 dark:border-pink-700" },
  { name: "purple", bg: "bg-purple-100 dark:bg-purple-900/40", border: "border-purple-300 dark:border-purple-700" },
];

interface Note {
  id: string;
  content: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export const StickyNotes = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    if (user) fetchNotes();
  }, [user]);

  const fetchNotes = async () => {
    const { data, error } = await supabase
      .from("sticky_notes")
      .select("id, content, color, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (!error && data) setNotes(data);
  };

  const addNote = async () => {
    if (!user) return;
    const { error } = await supabase.from("sticky_notes").insert({
      user_id: user.id,
      content: "",
      color: NOTE_COLORS[notes.length % NOTE_COLORS.length].name,
    });
    if (error) {
      toast({ title: "Erro ao criar nota", variant: "destructive" });
    } else {
      fetchNotes();
    }
  };

  const updateNote = async (id: string, content: string) => {
    const { error } = await supabase
      .from("sticky_notes")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setEditingId(null);
      fetchNotes();
    }
  };

  const updateColor = async (id: string, color: string) => {
    await supabase.from("sticky_notes").update({ color }).eq("id", id);
    fetchNotes();
  };

  const deleteNote = async (id: string) => {
    if (!confirm("Excluir esta nota?")) return;
    const { error } = await supabase.from("sticky_notes").delete().eq("id", id);
    if (!error) fetchNotes();
  };

  const getColorClasses = (color: string) =>
    NOTE_COLORS.find((c) => c.name === color) || NOTE_COLORS[0];

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110",
          "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        title="Notas adesivas"
      >
        <StickyNote className="h-5 w-5" />
        {notes.length > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
            {notes.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 max-h-[70vh] rounded-xl border bg-card text-card-foreground shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Notas Adesivas</span>
              <span className="text-xs text-muted-foreground">({notes.length})</span>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={addNote} title="Nova nota">
                <Plus className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Notes list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {notes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <StickyNote className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma nota ainda.</p>
                <p className="text-xs mt-1">Clique em + para criar uma.</p>
              </div>
            ) : (
              notes.map((note) => {
                const colors = getColorClasses(note.color);
                const isEditing = editingId === note.id;

                return (
                  <div
                    key={note.id}
                    className={cn(
                      "rounded-lg border p-3 transition-all",
                      colors.bg,
                      colors.border
                    )}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-[60px] text-sm bg-background/80 border-0 resize-none"
                          autoFocus
                          placeholder="Escreva sua nota..."
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex gap-1">
                            {NOTE_COLORS.map((c) => (
                              <button
                                key={c.name}
                                onClick={() => updateColor(note.id, c.name)}
                                className={cn(
                                  "h-4 w-4 rounded-full border transition-transform",
                                  c.bg,
                                  c.border,
                                  note.color === c.name && "scale-125 ring-2 ring-primary"
                                )}
                              />
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => updateNote(note.id, editContent)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="group">
                        <p className="text-sm whitespace-pre-wrap min-h-[24px] text-foreground">
                          {note.content || <span className="text-muted-foreground italic">Nota vazia...</span>}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(note.updated_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                setEditingId(note.id);
                                setEditContent(note.content);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive"
                              onClick={() => deleteNote(note.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
};
