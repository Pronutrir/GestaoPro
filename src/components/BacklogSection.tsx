'use client';
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2, Circle, Trash2, Inbox, ArrowRight, RotateCcw,
  ChevronDown, ChevronUp, ChevronRight, Plus, Layers, FolderOpen,
  ChevronsUpDown, ChevronsDownUp, MousePointerSquareDashed,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppConfirm } from "@/components/AppConfirmProvider";

interface Phase { id: string; title: string; }
interface WorkflowStage { id: string; title: string; display_order: number; color: string; }
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
  item_type?: string | null;
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
  onCreateActivityInPhase?: (phaseId: string | null, parentId?: string | null) => void;
}

const priorityLabels: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };
const priorityColors: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  low: "bg-muted text-muted-foreground border-border",
};
const priorityDot: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-success",
};

export const BacklogSection = ({
  projectId, activities, phases,
  onEditActivity, onDeleteActivity, onToggleActivity,
  onDataChanged, isAdmin = false, onCreateActivityInPhase,
}: BacklogSectionProps) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [backlogStageId, setBacklogStageId] = useState<string | null>(null);
  const [allStageIds, setAllStageIds] = useState<Set<string>>(new Set());
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  // Todos os stages, incluindo o "Backlog" (display_order=0), para mostrar badge de status
  const [allStages, setAllStages] = useState<WorkflowStage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [targetStageId, setTargetStageId] = useState<string>("");
  const [assignee, setAssignee] = useState<string>("");
  const [isMoving, setIsMoving] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [trashedActivities, setTrashedActivities] = useState<any[]>([]);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [dependencyCounts, setDependencyCounts] = useState<Map<string, { pred: number; succ: number }>>(new Map());
  // Inline quick-add: key = `phase:<id|none>` or `parent:<id>`
  const [quickAddKey, setQuickAddKey] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  // Inline edit title
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  // Modo de seleção em lote: quando ativo, exibe checkboxes nas linhas
  const [selectMode, setSelectMode] = useState(false);

  useEffect(() => {
    const ids = activities.map((a) => a.id);
    if (ids.length === 0) {
      setDependencyCounts(new Map());
      return;
    }
    supabase
      .from("task_dependencies")
      .select("predecessor_id, successor_id")
      .or(`predecessor_id.in.(${ids.join(",")}),successor_id.in.(${ids.join(",")})`)
      .then(({ data }) => {
        const map = new Map<string, { pred: number; succ: number }>();
        (data || []).forEach((d: any) => {
          const p = map.get(d.successor_id) || { pred: 0, succ: 0 };
          p.pred += 1;
          map.set(d.successor_id, p);
          const s = map.get(d.predecessor_id) || { pred: 0, succ: 0 };
          s.succ += 1;
          map.set(d.predecessor_id, s);
        });
        setDependencyCounts(map);
      });
  }, [activities]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const [{ data: profilesData }, { data: adminRoles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);
      if (profilesData) {
        const adminIds = new Set((adminRoles || []).map((r: any) => r.user_id));
        setProfiles(profilesData.filter((p) => !adminIds.has(p.id)));
      }
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
        setAllStages(data);
      }
    };
    fetchStages();
  }, [projectId]);

  const fetchTrashedActivities = async () => {
    const { data } = await (supabase
      .from("activities").select("*").eq("project_id", projectId) as any).eq("is_trashed", true)
      .order("trashed_at", { ascending: false });
    setTrashedActivities(data || []);
  };

  useEffect(() => { if (showTrash) fetchTrashedActivities(); }, [showTrash, projectId]);

  const handleRestore = async (activityId: string) => {
    await (supabase.from("activities").update({ is_trashed: false, trashed_at: null } as any) as any).eq("id", activityId);
    toast({ title: "Atividade restaurada!" });
    fetchTrashedActivities();
    onDataChanged();
  };
  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    await supabase.from("activities").delete().eq("id", permanentDeleteId);
    toast({ title: "Atividade excluída permanentemente!" });
    setPermanentDeleteId(null);
    fetchTrashedActivities();
  };
  const handleRestoreAll = async () => {
    const ok = await appConfirm({
      title: "Restaurar atividades",
      description: `Restaurar todas as ${trashedActivities.length} atividades da lixeira?`,
      confirmText: "Restaurar",
    });
    if (!ok) return;
    await (supabase.from("activities").update({ is_trashed: false, trashed_at: null } as any).eq("project_id", projectId) as any).eq("is_trashed", true);
    toast({ title: "Todas as atividades restauradas!" });
    fetchTrashedActivities();
    onDataChanged();
  };
  const handleEmptyTrash = async () => {
    const ok = await appConfirm({
      title: "Esvaziar lixeira",
      description: `Excluir PERMANENTEMENTE todas as ${trashedActivities.length} atividades? Esta ação é irreversível.`,
      confirmText: "Excluir tudo",
      destructive: true,
    });
    if (!ok) return;
    await (supabase.from("activities").delete().eq("project_id", projectId) as any).eq("is_trashed", true);
    toast({ title: "Lixeira esvaziada!" });
    fetchTrashedActivities();
  };

  // Lista completa: TODAS as tarefas do projeto (modelo "uma coleção, várias visões").
  // O status é exibido como atributo (badge), não como filtro de tela.
  const backlogActs = activities;

  // Mapa de stage_id → {title, color} para badges
  const stageById = new Map<string, WorkflowStage>();
  allStages.forEach((s) => stageById.set(s.id, s));

  // Build hierarchy
  const childrenByParent = new Map<string, Activity[]>();
  const topLevelByPhase = new Map<string | "none", Activity[]>();
  backlogActs.forEach((a) => {
    if (a.parent_id) {
      const arr = childrenByParent.get(a.parent_id) || [];
      arr.push(a);
      childrenByParent.set(a.parent_id, arr);
    } else {
      const key = a.phase_id || "none";
      const arr = topLevelByPhase.get(key) || [];
      arr.push(a);
      topLevelByPhase.set(key, arr);
    }
  });
  // Sort children/top-level by display_order
  const sortByOrder = (arr: Activity[]) =>
    arr.sort((x, y) => (x.display_order ?? 9999) - (y.display_order ?? 9999));
  childrenByParent.forEach(sortByOrder);
  topLevelByPhase.forEach(sortByOrder);

  // Helper: uma atividade marcada como "É uma fase" vira card-fase virtual.
  const isPhaseLikeActivity = (a: Activity) => a.item_type === "fase";

  // Coleta TODAS as atividades-fase (item_type='fase') em qualquer nível top-level
  // (independente de phase_id) e as remove dos grupos normais para serem renderizadas
  // como cards-fase virtuais.
  const virtualPhaseActs: Activity[] = [];
  topLevelByPhase.forEach((arr, key) => {
    const filtered: Activity[] = [];
    for (const a of arr) {
      if (isPhaseLikeActivity(a)) virtualPhaseActs.push(a);
      else filtered.push(a);
    }
    topLevelByPhase.set(key, filtered);
  });
  sortByOrder(virtualPhaseActs);

  const togglePhase = (id: string) => {
    setCollapsedPhases((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleParent = (id: string) => {
    setCollapsedParents((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allBacklogIds = backlogActs.map((a) => a.id);
  const allSelected = allBacklogIds.length > 0 && selectedIds.size === allBacklogIds.length;
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allBacklogIds));
  };

  const handleMoveSelected = async () => {
    if (!targetStageId) {
      toast({ title: "Selecione uma etapa de destino", variant: "destructive" });
      return;
    }
    setIsMoving(true);
    const ids = Array.from(selectedIds);
    const updateData: Database['public']['Tables']['activities']['Update'] = { workflow_stage_id: targetStageId };
    if (assignee && assignee !== "__none__") updateData.assigned_to = assignee;
    await supabase.from("activities").update(updateData).in("id", ids);
    setSelectedIds(new Set());
    setMoveDialogOpen(false);
    setTargetStageId("");
    setAssignee("");
    setIsMoving(false);
    onDataChanged();
    toast({ title: `Status de ${ids.length} tarefa(s) atualizado` });
  };

  // Quick-add inline: cria tarefa direto na fase ou como filha de outra tarefa
  const handleQuickAddSubmit = async (phaseId: string | null, parentId: string | null) => {
    const title = quickAddTitle.trim();
    if (!title) {
      setQuickAddKey(null);
      setQuickAddTitle("");
      return;
    }
    const { error } = await supabase.from("activities").insert({
      project_id: projectId,
      title,
      phase_id: phaseId,
      parent_id: parentId,
      workflow_stage_id: backlogStageId,
      status: "pending",
      priority: "medium",
    });
    if (error) {
      toast({ title: "Erro ao criar tarefa", variant: "destructive" });
      return;
    }
    setQuickAddTitle("");
    // mantém o input aberto para criação contínua
    onDataChanged();
  };

  const handleSaveTitle = async (activityId: string) => {
    const newTitle = editingTitleValue.trim();
    if (!newTitle) { setEditingTitleId(null); return; }
    await supabase.from("activities").update({ title: newTitle }).eq("id", activityId);
    setEditingTitleId(null);
    onDataChanged();
  };

  const renderActivityRow = (activity: Activity, depth: number = 0) => {
    const isSelected = selectedIds.has(activity.id);
    const prio = activity.priority || "medium";
    const subs = childrenByParent.get(activity.id) || [];
    const hasChildren = subs.length > 0;
    const isCollapsed = collapsedParents.has(activity.id);
    const isEditingTitle = editingTitleId === activity.id;
    const quickAddOpen = quickAddKey === `parent:${activity.id}`;

    return (
      <div key={activity.id} className="space-y-1">
        <div
          className={`flex items-center gap-2 bg-card border rounded-lg px-3 py-2.5 hover:shadow-sm transition-all cursor-pointer group ${
            isSelected ? "border-primary/50 bg-primary/5" : "border-border"
          }`}
          style={{ marginLeft: depth * 24 }}
          onClick={() => { if (!isEditingTitle) onEditActivity(activity); }}
        >
          {hasChildren ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 shrink-0"
              onClick={(e) => { e.stopPropagation(); toggleParent(activity.id); }}
            >
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          ) : (
            <span className="w-5 shrink-0" />
          )}

          {selectMode ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleSelect(activity.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Selecionar ${activity.title}`}
            />
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={(e) => { e.stopPropagation(); onToggleActivity(activity.id, activity.status); }}
              title={activity.status === "completed" ? "Reabrir tarefa" : "Concluir tarefa"}
            >
              {activity.status === "completed" ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
          )}

          {/* Color dot for priority */}
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${priorityDot[prio] || priorityDot.medium}`}
            title={`Prioridade: ${priorityLabels[prio] || prio}`}
            aria-hidden
          />

          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <Input
                autoFocus
                value={editingTitleValue}
                onChange={(e) => setEditingTitleValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => handleSaveTitle(activity.id)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleSaveTitle(activity.id);
                  if (e.key === "Escape") setEditingTitleId(null);
                }}
                className="h-7 text-sm"
              />
            ) : (
              <p
                className={`text-sm font-medium truncate ${activity.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTitleId(activity.id);
                  setEditingTitleValue(activity.title);
                }}
                title="Duplo-clique para editar"
              >
                {activity.title}
                {hasChildren && <span className="ml-2 text-xs text-muted-foreground font-normal">({subs.length})</span>}
              </p>
            )}
            {activity.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{activity.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={`text-[10px] ${priorityColors[prio]}`}>
              {priorityLabels[prio] || prio}
            </Badge>
            {(() => {
              const stg = activity.workflow_stage_id ? stageById.get(activity.workflow_stage_id) : null;
              if (!stg) return null;
              return (
                <Badge
                  variant="outline"
                  className="text-[10px] font-medium"
                  style={{
                    borderColor: stg.color,
                    color: stg.color,
                    backgroundColor: `${stg.color}15`,
                  }}
                  title={`Status: ${stg.title}`}
                >
                  {stg.title}
                </Badge>
              );
            })()}
            {activity.assigned_to && (
              <Badge variant="secondary" className="text-[10px]">👤 {activity.assigned_to}</Badge>
            )}
            {(() => {
              const dc = dependencyCounts.get(activity.id);
              if (!dc || (dc.pred === 0 && dc.succ === 0)) return null;
              return (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-primary/10 text-primary border-primary/30 font-semibold"
                  title={`${dc.pred} predecessora(s) · ${dc.succ} sucessora(s)`}
                >
                  🔗 {dc.pred > 0 ? `←${dc.pred}` : ""}{dc.pred > 0 && dc.succ > 0 ? " " : ""}{dc.succ > 0 ? `→${dc.succ}` : ""}
                </Badge>
              );
            })()}
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Adicionar subtarefa"
              onClick={(e) => {
                e.stopPropagation();
                setQuickAddKey(`parent:${activity.id}`);
                setQuickAddTitle("");
                setCollapsedParents((prev) => { const n = new Set(prev); n.delete(activity.id); return n; });
              }}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            {isAdmin && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onDeleteActivity(activity.id); }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {hasChildren && !isCollapsed && (
          <div className="space-y-1">
            {subs.map((sub) => renderActivityRow(sub, depth + 1))}
          </div>
        )}

        {quickAddOpen && (
          <div style={{ marginLeft: (depth + 1) * 24 }} className="flex items-center gap-2 px-3 py-2 border border-dashed border-primary/40 rounded-lg bg-primary/5">
            <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
            <Input
              autoFocus
              placeholder="Nova subtarefa (Enter para salvar, Esc para fechar)"
              value={quickAddTitle}
              onChange={(e) => setQuickAddTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuickAddSubmit(activity.phase_id, activity.id);
                if (e.key === "Escape") { setQuickAddKey(null); setQuickAddTitle(""); }
              }}
              onBlur={() => { if (!quickAddTitle.trim()) { setQuickAddKey(null); } }}
              className="h-8 text-sm"
            />
          </div>
        )}
      </div>
    );
  };

  const renderPhaseGroup = (phaseId: string | null, phaseTitle: string) => {
    const key = phaseId || "none";
    const acts = topLevelByPhase.get(key) || [];
    const isCollapsed = phaseId ? collapsedPhases.has(phaseId) : false;
    const totalCount = acts.reduce(
      (acc, a) => acc + 1 + (childrenByParent.get(a.id)?.length || 0),
      0
    );
    const quickAddPhaseKey = `phase:${key}`;
    const quickAddOpen = quickAddKey === quickAddPhaseKey;

    return (
      <Card key={key} className="p-3 bg-muted/40 border-border">
        <div className="flex items-center gap-2 mb-2">
          {phaseId && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={() => togglePhase(phaseId)}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          )}
          {phaseId ? (
            <Layers className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <h4 className="text-sm font-semibold text-foreground flex-1">
            {phaseTitle}
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              {totalCount} {totalCount === 1 ? "item" : "itens"}
            </span>
          </h4>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={() => { setQuickAddKey(quickAddPhaseKey); setQuickAddTitle(""); }}
          >
            <Plus className="w-3.5 h-3.5" /> Tarefa
          </Button>
        </div>

        {!isCollapsed && (
          <div className="space-y-1">
            {acts.length === 0 && !quickAddOpen ? (
              <p className="text-xs text-muted-foreground/70 italic px-2 py-3 text-center">
                Nenhuma tarefa. Clique em "+ Tarefa" para começar.
              </p>
            ) : (
              acts.map((a) => renderActivityRow(a, 0))
            )}
            {quickAddOpen && (
              <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-primary/40 rounded-lg bg-primary/5">
                <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                <Input
                  autoFocus
                  placeholder="Nova tarefa (Enter para salvar, Esc para fechar)"
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleQuickAddSubmit(phaseId, null);
                    if (e.key === "Escape") { setQuickAddKey(null); setQuickAddTitle(""); }
                  }}
                  onBlur={() => { if (!quickAddTitle.trim()) { setQuickAddKey(null); } }}
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>
        )}
      </Card>
    );
  };

  // Renderiza uma activity-fase (item_type='fase' ou com filhas) como card de fase virtual
  const renderVirtualPhase = (phaseAct: Activity) => {
    const subs = childrenByParent.get(phaseAct.id) || [];
    const isCollapsed = collapsedParents.has(phaseAct.id);
    const totalCount = subs.length;
    const quickAddPhaseKey = `parent:${phaseAct.id}`;
    const quickAddOpen = quickAddKey === quickAddPhaseKey;
    const isEditingTitle = editingTitleId === phaseAct.id;

    return (
      <Card key={phaseAct.id} className="p-3 bg-muted/40 border-border">
        <div className="flex items-center gap-2 mb-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={() => toggleParent(phaseAct.id)}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <Layers className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <Input
                autoFocus
                value={editingTitleValue}
                onChange={(e) => setEditingTitleValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => handleSaveTitle(phaseAct.id)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleSaveTitle(phaseAct.id);
                  if (e.key === "Escape") setEditingTitleId(null);
                }}
                className="h-7 text-sm font-semibold"
              />
            ) : (
              <h4
                className="text-sm font-semibold text-foreground cursor-pointer"
                onClick={() => onEditActivity(phaseAct)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTitleId(phaseAct.id);
                  setEditingTitleValue(phaseAct.title);
                }}
                title="Clique para editar · duplo-clique para renomear"
              >
                {phaseAct.title}
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  {totalCount} {totalCount === 1 ? "tarefa" : "tarefas"}
                </span>
              </h4>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={() => {
              setQuickAddKey(quickAddPhaseKey);
              setQuickAddTitle("");
              setCollapsedParents((prev) => { const n = new Set(prev); n.delete(phaseAct.id); return n; });
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Tarefa
          </Button>
          {isAdmin && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive"
              title="Excluir fase"
              onClick={(e) => { e.stopPropagation(); onDeleteActivity(phaseAct.id); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {!isCollapsed && (
          <div className="space-y-1">
            {subs.length === 0 && !quickAddOpen ? (
              <p className="text-xs text-muted-foreground/70 italic px-2 py-3 text-center">
                Nenhuma tarefa nesta fase. Clique em "+ Tarefa" para começar.
              </p>
            ) : (
              subs.map((s) => renderActivityRow(s, 0))
            )}
            {quickAddOpen && (
              <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-primary/40 rounded-lg bg-primary/5">
                <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                <Input
                  autoFocus
                  placeholder="Nova tarefa (Enter para salvar, Esc para fechar)"
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleQuickAddSubmit(phaseAct.phase_id, phaseAct.id);
                    if (e.key === "Escape") { setQuickAddKey(null); setQuickAddTitle(""); }
                  }}
                  onBlur={() => { if (!quickAddTitle.trim()) { setQuickAddKey(null); } }}
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {backlogActs.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant={selectMode ? "default" : "outline"}
              className="h-7 px-2 text-xs gap-1.5"
              onClick={() => {
                setSelectMode((v) => {
                  if (v) setSelectedIds(new Set());
                  return !v;
                });
              }}
              title="Modo de seleção em lote"
            >
              <MousePointerSquareDashed className="w-3.5 h-3.5" />
              {selectMode ? "Sair da seleção" : "Selecionar"}
            </Button>
            {selectMode && (
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleSelectAll}
                aria-label="Selecionar todas"
              />
            )}
            <p className="text-sm text-muted-foreground">
              {selectMode && selectedIds.size > 0
                ? `${selectedIds.size} de ${backlogActs.length} selecionada(s)`
                : `${backlogActs.length} tarefa(s) no projeto`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => { setCollapsedPhases(new Set()); setCollapsedParents(new Set()); }}
              title="Expandir tudo"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" /> Expandir
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => {
                const allPhaseIds = phases.map(p => p.id);
                const parentIds = backlogActs.filter(a => (childrenByParent.get(a.id) || []).length > 0).map(a => a.id);
                setCollapsedPhases(new Set(allPhaseIds));
                setCollapsedParents(new Set(parentIds));
              }}
              title="Recolher tudo"
            >
              <ChevronsDownUp className="w-3.5 h-3.5" /> Recolher
            </Button>
            {selectMode && selectedIds.size > 0 && (
              <Button size="sm" className="h-7 text-xs gap-1.5 ml-1" onClick={() => setMoveDialogOpen(true)}>
                <ArrowRight className="w-3.5 h-3.5" />
                Mudar status ({selectedIds.size})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Phase groups */}
      <div className="space-y-3">
        {phases.length === 0 && backlogActs.length === 0 && (
          <Card className="p-8 text-center">
            <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma fase ou atividade ainda</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Crie uma fase para começar a organizar pacotes e atividades
            </p>
          </Card>
        )}

        {phases.map((p) => renderPhaseGroup(p.id, p.title))}

        {/* Atividades-fase (item_type='fase') em qualquer nível top-level viram cards de fase virtuais */}
        {virtualPhaseActs.map((vp) => renderVirtualPhase(vp))}

        {/* Atividades top-level sem phase_id que não são fases viram grupo "Sem fase" */}
        {(() => {
          const orphanTop = topLevelByPhase.get("none") || [];
          const looseTasks = orphanTop;
          return (
            <>
              {looseTasks.length > 0 && (
                <Card className="p-3 bg-muted/40 border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <h4 className="text-sm font-semibold text-foreground flex-1">
                      Sem fase
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        {looseTasks.length} {looseTasks.length === 1 ? "tarefa" : "tarefas"}
                      </span>
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1"
                      onClick={() => { setQuickAddKey(`phase:none`); setQuickAddTitle(""); }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Tarefa
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {looseTasks.map((a) => renderActivityRow(a, 0))}
                    {quickAddKey === "phase:none" && (
                      <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-primary/40 rounded-lg bg-primary/5">
                        <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                        <Input
                          autoFocus
                          placeholder="Nova tarefa (Enter para salvar, Esc para fechar)"
                          value={quickAddTitle}
                          onChange={(e) => setQuickAddTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleQuickAddSubmit(null, null);
                            if (e.key === "Escape") { setQuickAddKey(null); setQuickAddTitle(""); }
                          }}
                          onBlur={() => { if (!quickAddTitle.trim()) { setQuickAddKey(null); } }}
                          className="h-8 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </>
          );
        })()}
      </div>

      {/* Trash Section */}
      <div className="border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => { setShowTrash(!showTrash); if (!showTrash) fetchTrashedActivities(); }}
        >
          <Trash2 className="w-4 h-4" />
          Lixeira
          {showTrash ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </Button>

        {showTrash && (
          <div className="mt-3 space-y-2">
            {trashedActivities.length === 0 ? (
              <Card className="p-6 text-center">
                <Trash2 className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">Lixeira vazia</p>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">{trashedActivities.length} atividade(s) na lixeira</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleRestoreAll}>
                      <RotateCcw className="w-3.5 h-3.5" /> Restaurar todas
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive hover:bg-destructive/10" onClick={handleEmptyTrash}>
                        <Trash2 className="w-3.5 h-3.5" /> Esvaziar lixeira
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  {trashedActivities.map((activity: any) => {
                    const phase = phases.find((p) => p.id === activity.phase_id);
                    const trashedDate = activity.trashed_at
                      ? new Date(activity.trashed_at).toLocaleDateString("pt-BR") : "";
                    return (
                      <div key={activity.id} className="flex items-center gap-3 bg-muted/50 border border-dashed rounded-lg px-4 py-3 group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-muted-foreground line-through">{activity.title}</p>
                          {activity.description && (
                            <p className="text-xs text-muted-foreground/60 line-clamp-1 mt-0.5">{activity.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {phase && <Badge variant="outline" className="text-[10px] opacity-60">{phase.title}</Badge>}
                          {trashedDate && (
                            <span className="text-[10px] text-muted-foreground/60">Excluída em {trashedDate}</span>
                          )}
                          <Button size="sm" variant="outline" className="h-6 text-xs gap-1 px-2" onClick={() => handleRestore(activity.id)}>
                            <RotateCcw className="w-3 h-3" /> Restaurar
                          </Button>
                          {isAdmin && (
                            <Button
                              size="icon" variant="ghost"
                              className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => setPermanentDeleteId(activity.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Move Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-2xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Alterar status de {selectedIds.size} tarefa(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Novo status *</Label>
              <Select value={targetStageId} onValueChange={setTargetStageId}>
                <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                <SelectContent>
                  {allStages.map((s) => (<SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável (opcional)</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.full_name || p.id}>{p.full_name || "Sem nome"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleMoveSelected} disabled={!targetStageId || isMoving}>
              {isMoving ? "Movendo..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={!!permanentDeleteId} onOpenChange={(open) => !open && setPermanentDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. A atividade será excluída permanentemente e não poderá ser recuperada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};