import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";

interface ActivityState {
  id: string;
  title: string;
  status: string;
  workflow_stage_id: string | null;
  stage_title?: string | null;
  stage_color?: string | null;
}

function TaskRefView({ node, deleteNode }: any) {
  const activityId: string = node.attrs.activityId;
  const projectId: string = node.attrs.projectId;
  const cachedTitle: string = node.attrs.title || "Atividade";
  const [act, setAct] = useState<ActivityState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("activities")
        .select("id, title, status, workflow_stage_id, workflow_stages(title, color)")
        .eq("id", activityId)
        .maybeSingle();
      if (!alive) return;
      if (data) {
        setAct({
          id: data.id,
          title: data.title,
          status: data.status,
          workflow_stage_id: data.workflow_stage_id,
          stage_title: (data as any).workflow_stages?.title ?? null,
          stage_color: (data as any).workflow_stages?.color ?? null,
        });
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [activityId]);

  const isDone = act?.status === "completed";
  const title = act?.title ?? cachedTitle;

  return (
    <NodeViewWrapper
      as="div"
      className="my-2 not-prose"
      data-task-ref={activityId}
      contentEditable={false}
    >
      <div
        className={cn(
          "group flex items-center gap-3 rounded-lg border bg-card px-3 py-2 shadow-sm transition-all",
          "hover:border-primary/40 hover:shadow-md",
          isDone && "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
        ) : isDone ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        ) : (
          <Circle className="h-5 w-5 text-primary shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className={cn(
            "text-sm font-medium leading-tight truncate",
            isDone && "line-through text-muted-foreground"
          )}>
            {title}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {!loading && !act && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-destructive border-destructive/40">
                Removida
              </Badge>
            )}
            {act?.stage_title && (
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[10px] font-normal"
                style={act.stage_color ? {
                  borderColor: act.stage_color,
                  color: act.stage_color,
                } : undefined}
              >
                {act.stage_title}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">Atividade vinculada ao Kanban</span>
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("open-activity", { detail: { activityId, projectId } }));
          }}
        >
          <ExternalLink className="h-3 w-3 mr-1" /> Abrir
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          onClick={() => deleteNode()}
          title="Remover referência"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </NodeViewWrapper>
  );
}

export const TaskReferenceNode = Node.create({
  name: "taskReference",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      activityId: { default: null },
      projectId: { default: null },
      title: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-task-reference]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-task-reference": "true" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskRefView);
  },
});