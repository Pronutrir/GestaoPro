import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Pencil, Trash2, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Phase {
  id: string;
  title: string;
}

interface Activity {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  cost: number;
  hours: number;
  phase_id: string | null;
  display_order?: number | null;
  priority?: string;
  tags?: string[];
  parent_id?: string | null;
  workflow_stage_id?: string | null;
}

interface BacklogSectionProps {
  projectId: string;
  activities: Activity[];
  phases: Phase[];
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  onToggleActivity: (activityId: string, currentStatus: string) => void;
  onDataChanged: () => void;
  isAdmin?: boolean;
}

export const BacklogSection = ({
  projectId,
  activities,
  phases,
  onEditActivity,
  onDeleteActivity,
  onToggleActivity,
  onDataChanged,
  isAdmin = false,
}: BacklogSectionProps) => {
  const { toast } = useToast();
  const [backlogStageId, setBacklogStageId] = useState<string | null>(null);

  useEffect(() => {
    const fetchBacklogStage = async () => {
      const { data } = await supabase
        .from("workflow_stages")
        .select("id")
        .eq("project_id", projectId)
        .eq("display_order", 0)
        .single();
      if (data) setBacklogStageId(data.id);
    };
    fetchBacklogStage();
  }, [projectId]);

  const backlogActivities = activities.filter((a) => {
    if (!backlogStageId) return false;
    return a.workflow_stage_id === backlogStageId || (!a.workflow_stage_id);
  });

  const handleMoveToBoard = async (activityId: string) => {
    // Move to "A Fazer" (display_order = 1)
    const { data: nextStage } = await supabase
      .from("workflow_stages")
      .select("id")
      .eq("project_id", projectId)
      .eq("display_order", 1)
      .single();

    if (!nextStage) {
      toast({ title: "Nenhuma etapa disponível para mover", variant: "destructive" });
      return;
    }

    await supabase
      .from("activities")
      .update({ workflow_stage_id: nextStage.id })
      .eq("id", activityId);

    onDataChanged();
    toast({ title: "Atividade movida para o quadro" });
  };

  if (backlogActivities.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground text-sm">Nenhuma atividade no backlog</p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          Atividades descartadas ou planejadas para o futuro aparecerão aqui
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        Atividades planejadas para o futuro ou temporariamente descartadas ({backlogActivities.length})
      </p>
      <div className="grid gap-2">
        {backlogActivities.map((activity) => {
          const phase = phases.find((p) => p.id === activity.phase_id);
          return (
            <div
              key={activity.id}
              className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 hover:shadow-sm transition-shadow cursor-pointer group"
              onClick={() => onEditActivity(activity)}
            >
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleActivity(activity.id, activity.status);
                }}
              >
                {activity.status === "completed" ? (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground" />
                )}
              </Button>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${activity.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {activity.title}
                </p>
                {activity.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{activity.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {phase && (
                  <Badge variant="outline" className="text-[10px]">
                    {phase.title}
                  </Badge>
                )}
                {activity.assigned_to && (
                  <Badge variant="secondary" className="text-[10px]">
                    👤 {activity.assigned_to}
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveToBoard(activity.id);
                  }}
                >
                  Mover para quadro
                </Button>
                {isAdmin && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteActivity(activity.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
