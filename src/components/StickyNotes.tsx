import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Plus, X, Trash2, Pencil, Check, GripVertical, PanelBottomClose, Minimize2, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const NOTE_COLORS = [
  { name: "yellow", bg: "bg-yellow-100 dark:bg-yellow-900/40", border: "border-yellow-300 dark:border-yellow-700", header: "bg-yellow-200/80 dark:bg-yellow-800/60" },
  { name: "blue", bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-300 dark:border-blue-700", header: "bg-blue-200/80 dark:bg-blue-800/60" },
  { name: "green", bg: "bg-green-100 dark:bg-green-900/40", border: "border-green-300 dark:border-green-700", header: "bg-green-200/80 dark:bg-green-800/60" },
  { name: "pink", bg: "bg-pink-100 dark:bg-pink-900/40", border: "border-pink-300 dark:border-pink-700", header: "bg-pink-200/80 dark:bg-pink-800/60" },
  { name: "purple", bg: "bg-purple-100 dark:bg-purple-900/40", border: "border-purple-300 dark:border-purple-700", header: "bg-purple-200/80 dark:bg-purple-800/60" },
];

interface Note {
  id: string;
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  created_at: string;
  updated_at: string;
}

interface DragState {
  noteId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
}

const DraggableNote = ({
  note,
  onUpdate,
  onUpdateColor,
  onUpdatePosition,
  onDelete,
  onMinimize,
}: {
  note: Note;
  onUpdate: (id: string, content: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onMinimize: (id: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const dragRef = useRef<DragState | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const colors = NOTE_COLORS.find((c) => c.name === note.color) || NOTE_COLORS[0];

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      noteId: note.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: note.position_x,
      origY: note.position_y,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current || !noteRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const newX = Math.max(0, Math.min(window.innerWidth - 200, dragRef.current.origX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.origY + dy));
      noteRef.current.style.left = `${newX}px`;
      noteRef.current.style.top = `${newY}px`;
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const newX = Math.max(0, Math.min(window.innerWidth - 200, dragRef.current.origX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.origY + dy));
      onUpdatePosition(note.id, newX, newY);
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [note.id, note.position_x, note.position_y, onUpdatePosition]);

  const handleSave = () => {
    onUpdate(note.id, editContent);
    setIsEditing(false);
  };

  return (
    <div
      ref={noteRef}
      className={cn(
        "fixed z-[60] w-52 rounded-lg border shadow-xl transition-shadow hover:shadow-2xl",
        colors.bg,
        colors.border
      )}
      style={{ left: note.position_x, top: note.position_y }}
    >
      {/* Drag header */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "flex items-center justify-between px-2 py-1.5 rounded-t-lg cursor-grab active:cursor-grabbing select-none",
          colors.header
        )}
      >
        <GripVertical className="h-3.5 w-3.5 text-foreground/50" />
        <div className="flex gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => onMinimize(note.id)}
            title="Minimizar"
          >
            <Minimize2 className="h-2.5 w-2.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => { setIsEditing(true); setEditContent(note.content); }}
          >
            <Pencil className="h-2.5 w-2.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 text-destructive hover:text-destructive"
            onClick={() => onDelete(note.id)}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-2.5">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[60px] text-xs bg-background/60 border-0 resize-none p-1.5"
              autoFocus
              placeholder="Escreva sua nota..."
              onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) handleSave(); }}
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => onUpdateColor(note.id, c.name)}
                    className={cn(
                      "h-3.5 w-3.5 rounded-full border transition-transform",
                      c.bg, c.border,
                      note.color === c.name && "scale-125 ring-2 ring-primary"
                    )}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setIsEditing(false)}>
                  <X className="h-2.5 w-2.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleSave}>
                  <Check className="h-2.5 w-2.5" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p
            className="text-xs whitespace-pre-wrap min-h-[30px] text-foreground cursor-default"
            onDoubleClick={() => { setIsEditing(true); setEditContent(note.content); }}
          >
            {note.content || <span className="text-muted-foreground italic text-[11px]">Duplo clique para editar...</span>}
          </p>
        )}
      </div>

      {/* Timestamp */}
      <div className="px-2.5 pb-1.5">
        <span className="text-[9px] text-muted-foreground">
          {new Date(note.updated_at).toLocaleDateString("pt-BR", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
};

export const StickyNotes = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [panelOpen, setPanelOpen] = useState(false);
  const [freeNotes, setFreeNotes] = useState<Note[]>([]);
  const [showFree, setShowFree] = useState(false);
  const [minimizedIds, setMinimizedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) fetchNotes();
  }, [user]);

  const fetchNotes = async () => {
    const { data, error } = await supabase
      .from("sticky_notes")
      .select("id, content, color, position_x, position_y, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (!error && data) setFreeNotes(data);
  };

  const addNote = async () => {
    if (!user) return;
    const x = Math.max(100, Math.min(window.innerWidth - 300, 200 + freeNotes.length * 30));
    const y = Math.max(80, Math.min(window.innerHeight - 200, 120 + freeNotes.length * 30));
    const { error } = await supabase.from("sticky_notes").insert({
      user_id: user.id,
      content: "",
      color: NOTE_COLORS[freeNotes.length % NOTE_COLORS.length].name,
      position_x: x,
      position_y: y,
    });
    if (error) {
      toast({ title: "Erro ao criar nota", variant: "destructive" });
    } else {
      fetchNotes();
      setShowFree(true);
    }
  };

  const updateNote = async (id: string, content: string) => {
    await supabase.from("sticky_notes").update({ content, updated_at: new Date().toISOString() }).eq("id", id);
    fetchNotes();
  };

  const updateColor = async (id: string, color: string) => {
    await supabase.from("sticky_notes").update({ color }).eq("id", id);
    fetchNotes();
  };

  const updatePosition = async (id: string, x: number, y: number) => {
    await supabase.from("sticky_notes").update({ position_x: x, position_y: y }).eq("id", id);
    setFreeNotes((prev) => prev.map((n) => (n.id === id ? { ...n, position_x: x, position_y: y } : n)));
  };

  const deleteNote = async (id: string) => {
    if (!confirm("Excluir esta nota?")) return;
    await supabase.from("sticky_notes").delete().eq("id", id);
    fetchNotes();
  };

  const minimizeNote = (id: string) => {
    setMinimizedIds((prev) => new Set(prev).add(id));
  };

  const restoreNote = (id: string) => {
    setMinimizedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  if (!user) return null;

  const visibleNotes = freeNotes.filter((n) => !minimizedIds.has(n.id));
  const minimizedNotes = freeNotes.filter((n) => minimizedIds.has(n.id));

  return (
    <>
      {/* Floating draggable notes */}
      {showFree && visibleNotes.map((note) => (
        <DraggableNote
          key={note.id}
          note={note}
          onUpdate={updateNote}
          onUpdateColor={updateColor}
          onUpdatePosition={updatePosition}
          onDelete={deleteNote}
          onMinimize={minimizeNote}
        />
      ))}

      {/* Floating action button */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-2">
        {/* Main button */}
        <div className="relative">
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className={cn(
              "h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110",
              "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            title="Notas adesivas"
          >
            <StickyNote className="h-5 w-5" />
            {freeNotes.length > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
                {freeNotes.length}
              </span>
            )}
          </button>

          {/* Mini menu */}
          {panelOpen && (
            <div className="absolute bottom-14 right-0 bg-card border rounded-lg shadow-xl p-2 flex flex-col gap-1 min-w-[160px] animate-in slide-in-from-bottom-2 fade-in duration-150">
              <button
                onClick={() => { addNote(); setPanelOpen(false); }}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground"
              >
                <Plus className="h-4 w-4" /> Nova nota
              </button>
              {freeNotes.length > 0 && (
                <button
                  onClick={() => { setShowFree(!showFree); setPanelOpen(false); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground"
                >
                  <PanelBottomClose className="h-4 w-4" />
                  {showFree ? "Ocultar notas" : "Mostrar notas"}
                </button>
              )}
              {minimizedNotes.length > 0 && (
                <>
                  <div className="border-t border-border my-1" />
                  <span className="px-3 py-1 text-[11px] text-muted-foreground font-medium">Minimizadas</span>
                  {minimizedNotes.map((note) => {
                    const colors = NOTE_COLORS.find((c) => c.name === note.color) || NOTE_COLORS[0];
                    return (
                      <button
                        key={note.id}
                        onClick={() => { restoreNote(note.id); setShowFree(true); setPanelOpen(false); }}
                        className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground"
                      >
                        <span className={cn("h-3 w-3 rounded-full border shrink-0", colors.bg, colors.border)} />
                        <span className="truncate text-xs">
                          {note.content?.slice(0, 20) || "Nota vazia"}
                          {note.content && note.content.length > 20 ? "…" : ""}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
