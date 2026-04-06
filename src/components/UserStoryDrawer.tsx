import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookOpen, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface UserStory {
  id: string;
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
}

export const UserStoryDrawer = ({ activityId, projectId, open, onOpenChange }: Props) => {
  const [stories, setStories] = useState<UserStory[]>([]);
  const [phaseName, setPhaseName] = useState("");
  const [activityName, setActivityName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !activityId) return;
    setLoading(true);
    supabase
      .from("user_stories")
      .select("*")
      .eq("activity_id", activityId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .then(async ({ data }) => {
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
      });
  }, [open, activityId, projectId]);

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
            {/* Linked items (shared) */}
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

            {/* Stories list */}
            {stories.map((story, idx) => (
              <div key={story.id} className="space-y-3 p-3 rounded-lg border border-border bg-muted/20">
                {stories.length > 1 && (
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    História {idx + 1}
                  </p>
                )}

                {/* Narrative */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Narrativa</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {story.narrative || <span className="italic text-muted-foreground">Sem narrativa</span>}
                  </p>
                </div>

                {/* Image */}
                {story.image_url && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Imagem</p>
                    <img
                      src={story.image_url}
                      alt="User Story"
                      className="rounded-lg border border-border max-h-48 w-full object-cover"
                    />
                  </div>
                )}

                {/* Timestamps */}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70 pt-1 border-t border-border/50">
                  <span>Criada: {new Date(story.created_at).toLocaleDateString("pt-BR")} {new Date(story.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  {story.updated_at !== story.created_at && (
                    <span>Atualizada: {new Date(story.updated_at).toLocaleDateString("pt-BR")} {new Date(story.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
