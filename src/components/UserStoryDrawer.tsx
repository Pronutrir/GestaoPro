import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, BookOpen, Link2 } from "lucide-react";
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
}

interface Props {
  activityId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const UserStoryDrawer = ({ activityId, projectId, open, onOpenChange }: Props) => {
  const [story, setStory] = useState<UserStory | null>(null);
  const [phaseName, setPhaseName] = useState("");
  const [activityName, setActivityName] = useState("");
  const [stageName, setStageName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !activityId) return;
    setLoading(true);
    supabase
      .from("user_stories")
      .select("*")
      .eq("activity_id", activityId)
      .eq("project_id", projectId)
      .limit(1)
      .then(async ({ data }) => {
        if (data && data.length > 0) {
          const s = data[0] as UserStory;
          setStory(s);
          // Fetch related names
          const [phaseRes, actRes, stageRes] = await Promise.all([
            s.phase_id ? supabase.from("phases").select("title").eq("id", s.phase_id).single() : null,
            s.activity_id ? supabase.from("activities").select("title").eq("id", s.activity_id).single() : null,
            s.stage_id ? supabase.from("user_story_stages").select("title").eq("id", s.stage_id).single() : null,
          ]);
          setPhaseName(phaseRes?.data?.title || "");
          setActivityName(actRes?.data?.title || "");
          setStageName(stageRes?.data?.title || "");
        } else {
          setStory(null);
        }
        setLoading(false);
      });
  }, [open, activityId, projectId]);

  const priorityLabel: Record<string, { label: string; class: string }> = {
    high: { label: "Alta", class: "bg-destructive/20 text-destructive" },
    medium: { label: "Média", class: "bg-warning/20 text-warning" },
    low: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            História de Usuário
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        ) : !story ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Nenhuma história encontrada para esta atividade.</p>
          </div>
        ) : (
          <div className="space-y-5 mt-4">
            {/* User Story Format */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
              <p className="text-sm">
                <span className="font-semibold text-foreground">Como</span>{" "}
                <span className="text-primary font-medium">{story.persona || "—"}</span>
              </p>
              <p className="text-sm">
                <span className="font-semibold text-foreground">Eu quero</span>{" "}
                <span className="text-foreground">{story.action || "—"}</span>
              </p>
              <p className="text-sm">
                <span className="font-semibold text-foreground">Para que</span>{" "}
                <span className="text-foreground">{story.benefit || "—"}</span>
              </p>
            </div>

            {/* Priority & Stage */}
            <div className="flex flex-wrap gap-2">
              <Badge className={priorityLabel[story.priority]?.class || ""}>
                {priorityLabel[story.priority]?.label || story.priority}
              </Badge>
              {stageName && (
                <Badge variant="outline" className="text-xs">
                  📌 {stageName}
                </Badge>
              )}
            </div>

            {/* Narrative */}
            {story.narrative && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Narrativa</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{story.narrative}</p>
              </div>
            )}

            {/* Linked items */}
            <div className="space-y-2">
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

            {/* Acceptance Criteria */}
            {story.acceptance_criteria && story.acceptance_criteria.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Critérios de Aceite ({story.acceptance_criteria.length})
                </p>
                <div className="space-y-1.5">
                  {story.acceptance_criteria.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-muted/30 rounded-md border border-border/50">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-success shrink-0" />
                      <p className="text-xs text-foreground">{c}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
