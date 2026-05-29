import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookMarked, Plus, Trash2, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { useAssigneeAvatarLookup } from "@/hooks/useAssigneeAvatarLookup";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";

interface LogEntry {
  id: string;
  activity_id: string;
  description: string;
  created_by: string | null;
  promoted_to_lesson_id: string | null;
  created_at: string;
}

interface ActivityLogbookProps {
  activityId: string;
  projectId: string;
}

export const ActivityLogbook = ({ activityId, projectId }: ActivityLogbookProps) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const createdByAvatarMap = useAssigneeAvatarLookup(entries.map((entry) => entry.created_by));

  useEffect(() => {
    fetchEntries();
  }, [activityId]);

  const fetchEntries = async () => {
    const { data } = await supabase
      .from("activity_log_entries")
      .select("*")
      .eq("activity_id", activityId)
      .order("created_at", { ascending: false });
    if (data) setEntries(data);
  };

  const handleAdd = async () => {
    if (!description.trim()) return;
    const { error } = await supabase.from("activity_log_entries").insert({
      activity_id: activityId,
      description: description.trim(),
      created_by: createdBy.trim() || null,
    });
    if (error) {
      toast({ title: "Erro ao registrar", variant: "destructive" });
      return;
    }
    toast({ title: "Registro adicionado!" });
    setDescription("");
    setCreatedBy("");
    setShowForm(false);
    fetchEntries();
  };

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: "Excluir registro",
      description: "Excluir este registro?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await supabase.from("activity_log_entries").delete().eq("id", id);
    fetchEntries();
  };

  const handlePromoteToLesson = async (entry: LogEntry) => {
    const { data, error } = await supabase
      .from("lessons_learned")
      .insert({
        project_id: projectId,
        category: "general",
        problem: entry.description,
        reported_by: entry.created_by,
      })
      .select("id")
      .single();

    if (error || !data) {
      toast({ title: "Erro ao promover", variant: "destructive" });
      return;
    }

    await supabase
      .from("activity_log_entries")
      .update({ promoted_to_lesson_id: data.id })
      .eq("id", entry.id);

    toast({ title: "Promovido a Lição Aprendida!" });
    fetchEntries();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <BookMarked className="w-4 h-4 text-primary" />
          Diário de Bordo
        </h4>
        <Button
          size="sm"
          variant={showForm ? "secondary" : "outline"}
          className="h-7 text-xs gap-1"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="w-3 h-3" />
          {showForm ? "Cancelar" : "Novo Registro"}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-2 p-3 bg-accent/30 rounded-lg border border-border">
          <Textarea
            placeholder="Descreva o que aconteceu..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Input
              placeholder="Registrado por"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              className="text-sm h-8"
            />
            <Button size="sm" className="h-8" onClick={handleAdd}>
              Registrar
            </Button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          Nenhum registro ainda
        </p>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="p-3 border border-border rounded-lg bg-card group text-sm"
            >
              <p className="text-foreground">{entry.description}</p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {entry.created_by && (
                    <span className="inline-flex items-center gap-1">
                      <Avatar className="h-4 w-4 shrink-0">
                        {(() => {
                          const avatar = resolveAvatarFromLookup(entry.created_by, entry.created_by, createdByAvatarMap);
                          return avatar ? <AvatarImage src={avatar} alt={entry.created_by} /> : null;
                        })()}
                        <AvatarFallback className="text-[8px]">{getAvatarInitials(entry.created_by)}</AvatarFallback>
                      </Avatar>
                      <span>{entry.created_by}</span>
                    </span>
                  )}
                  <span>{new Date(entry.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  {entry.promoted_to_lesson_id && (
                    <Badge variant="secondary" className="text-[10px]">
                      📘 Lição criada
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!entry.promoted_to_lesson_id && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Promover a Lição Aprendida"
                      onClick={() => handlePromoteToLesson(entry)}
                    >
                      <ArrowUpRight className="w-3 h-3 text-primary" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive"
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
