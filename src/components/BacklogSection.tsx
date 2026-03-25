import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Circle, Trash2, Inbox, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Phase {
  id: string;
  title: string;
}

interface WorkflowStage {
  id: string;
  title: string;
  display_order: number;
  color: string;
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

const priorityLabels: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};
const priorityColors: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  low: "bg-muted text-muted-foreground border-border",
};

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
  const [allStageIds, setAllStageIds] = useState<Set<string>>(new Set());
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [targetStageId, setTargetStageId] = useState<string>("");
  const [assignee, setAssignee] = useState<string>("");
  const [isMoving, setIsMoving] = useState(false);
  const [filterPhaseId, setFilterPhaseId] = useState<string>("all");
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name");
      if (data) setProfiles(data);
    };
    fetchProfiles();
  }, []);

  useEffect(() => {
    const fetchStages = async () => {
      const { data } = await supabase
        .from("workflow_stages")
        .select("id, display_order, title, color")
        .eq("project_id", projectId)
        .order("display_order");
      if (data) {
        const backlog = data.find((s) => s.display_order === 0);
        setBacklogStageId(backlog?.id ?? null);
        setAllStageIds(new Set(data.filter((s) => s.display_order > 0).map((s) => s.id)));
        setStages(data.filter((s) => s.display_order > 0));
      }
    };
    fetchStages();
  }, [projectId]);

  const phaseOrderMap: Record<string, number> = {};
  phases.forEach((p, i) => { phaseOrderMap[p.id] = i; });

  const backlogActivities = activities
    .filter((a) => {
      if (!a.workflow_stage_id) return true;
      if (backlogStageId && a.workflow_stage_id === backlogStageId) return true;
      if (!allStageIds.has(a.workflow_stage_id)) return true;
      return false;
    })
    .filter((a) => filterPhaseId === "all" || a.phase_id === filterPhaseId)
    .sort((a, b) => {
      const phaseA = a.phase_id ? (phaseOrderMap[a.phase_id] ?? 999) : 999;
      const phaseB = b.phase_id ? (phaseOrderMap[b.phase_id] ?? 999) : 999;
      if (phaseA !== phaseB) return phaseA - phaseB;
      const orderA = a.display_order ?? 9999;
      const orderB = b.display_order ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      if (a.parent_id === null && b.parent_id !== null) return -1;
      if (a.parent_id !== null && b.parent_id === null) return 1;
      return 0;
    });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === backlogActivities.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(backlogActivities.map((a) => a.id)));
    }
  };

  const handleMoveSelected = async () => {
    if (!targetStageId) {
      toast({ title: "Selecione uma etapa de destino", variant: "destructive" });
      return;
    }
    setIsMoving(true);
    const ids = Array.from(selectedIds);
    const updateData: Record<string, unknown> = { workflow_stage_id: targetStageId };
    if (assignee.trim()) updateData.assigned_to = assignee.trim();

    await supabase
      .from("activities")
      .update(updateData)
      .in("id", ids);

    setSelectedIds(new Set());
    setMoveDialogOpen(false);
    setTargetStageId("");
    setAssignee("");
    setIsMoving(false);
    onDataChanged();
    toast({ title: `${ids.length} atividade(s) movida(s) para o quadro` });
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

  const allSelected = selectedIds.size === backlogActivities.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
            aria-label="Selecionar todas"
          />
          <p className="text-sm text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} de ${backlogActivities.length} selecionada(s)`
              : `${backlogActivities.length} atividade(s) no backlog`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterPhaseId} onValueChange={setFilterPhaseId}>
            <SelectTrigger className="h-7 text-xs w-[180px]">
              <SelectValue placeholder="Filtrar por fase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fases</SelectItem>
              {phases.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setMoveDialogOpen(true)}
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Mover para Kanban ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        {backlogActivities.map((activity) => {
          const phase = phases.find((p) => p.id === activity.phase_id);
          const isSelected = selectedIds.has(activity.id);
          const prio = activity.priority || "medium";
          return (
            <div
              key={activity.id}
              className={`flex items-center gap-3 bg-card border rounded-lg px-4 py-3 hover:shadow-sm transition-all cursor-pointer group ${
                isSelected ? "border-primary/50 bg-primary/5" : "border-border"
              }`}
              onClick={() => onEditActivity(activity)}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleSelect(activity.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Selecionar ${activity.title}`}
              />

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
                <Badge variant="outline" className={`text-[10px] ${priorityColors[prio]}`}>
                  {priorityLabels[prio] || prio}
                </Badge>
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

      {/* Modal de configuração para mover */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-2xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Mover {selectedIds.size} atividade(s) para o Kanban</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Etapa de destino *</Label>
              <Select value={targetStageId} onValueChange={setTargetStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável (opcional)</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.full_name || p.id}>
                      {p.full_name || "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
              <p className="text-xs text-muted-foreground mb-1">Atividades selecionadas:</p>
              {backlogActivities
                .filter((a) => selectedIds.has(a.id))
                .map((a) => {
                  const prio = a.priority || "medium";
                  return (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <span className="truncate flex-1">{a.title}</span>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${priorityColors[prio]}`}>
                        {priorityLabels[prio] || prio}
                      </Badge>
                    </div>
                  );
                })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleMoveSelected} disabled={!targetStageId || isMoving}>
              {isMoving ? "Movendo..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
