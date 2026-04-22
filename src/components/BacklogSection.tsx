import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2, Circle, Trash2, Inbox, ArrowRight, RotateCcw,
  ChevronDown, ChevronUp, ChevronRight, Plus, Layers, Package, FolderOpen,
  ChevronsUpDown, ChevronsDownUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  const [backlogStageId, setBacklogStageId] = useState<string | null>(null);
  const [allStageIds, setAllStageIds] = useState<Set<string>>(new Set());
  const [stages, setStages] = useState<WorkflowStage[]>([]);
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
  const [collapsedPackages, setCollapsedPackages] = useState<Set<string>>(new Set());
  const [packageDialogPhaseId, setPackageDialogPhaseId] = useState<string | null>(null);
  const [newPackageTitle, setNewPackageTitle] = useState("");

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
    if (!confirm(`Restaurar todas as ${trashedActivities.length} atividades da lixeira?`)) return;
    await (supabase.from("activities").update({ is_trashed: false, trashed_at: null } as any).eq("project_id", projectId) as any).eq("is_trashed", true);
    toast({ title: "Todas as atividades restauradas!" });
    fetchTrashedActivities();
    onDataChanged();
  };
  const handleEmptyTrash = async () => {
    if (!confirm(`Excluir PERMANENTEMENTE todas as ${trashedActivities.length} atividades? Esta ação é irreversível.`)) return;
    await (supabase.from("activities").delete().eq("project_id", projectId) as any).eq("is_trashed", true);
    toast({ title: "Lixeira esvaziada!" });
    fetchTrashedActivities();
  };

  // Backlog filter: activities not yet in active workflow stages (or in 'Backlog' stage)
  const isBacklogActivity = (a: Activity) => {
    if (!a.workflow_stage_id) return true;
    if (backlogStageId && a.workflow_stage_id === backlogStageId) return true;
    if (!allStageIds.has(a.workflow_stage_id)) return true;
    return false;
  };

  const backlogActs = activities.filter(isBacklogActivity);

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

  const togglePhase = (id: string) => {
    setCollapsedPhases((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const togglePackage = (id: string) => {
    setCollapsedPackages((prev) => {
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
    const updateData: Record<string, unknown> = { workflow_stage_id: targetStageId };
    if (assignee && assignee !== "__none__") updateData.assigned_to = assignee;
    await supabase.from("activities").update(updateData).in("id", ids);
    setSelectedIds(new Set());
    setMoveDialogOpen(false);
    setTargetStageId("");
    setAssignee("");
    setIsMoving(false);
    onDataChanged();
    toast({ title: `${ids.length} atividade(s) movida(s) para o quadro` });
  };

  const handleCreatePackage = async () => {
    if (!newPackageTitle.trim()) return;
    const { error } = await supabase.from("activities").insert({
      project_id: projectId,
      title: newPackageTitle.trim(),
      phase_id: packageDialogPhaseId,
      parent_id: null,
      workflow_stage_id: backlogStageId,
      status: "pending",
      priority: "medium",
    });
    if (error) {
      toast({ title: "Erro ao criar pacote", variant: "destructive" });
      return;
    }
    toast({ title: "Pacote de atividades criado!" });
    setNewPackageTitle("");
    setPackageDialogPhaseId(null);
    onDataChanged();
  };

  const renderActivityRow = (activity: Activity, depth: number = 0) => {
    const isSelected = selectedIds.has(activity.id);
    const prio = activity.priority || "medium";
    const subs = childrenByParent.get(activity.id) || [];
    const hasChildren = subs.length > 0;
    const isPackage = hasChildren; // any activity with children = "pacote de atividades"
    const isCollapsed = collapsedPackages.has(activity.id);

    return (
      <div key={activity.id} className="space-y-1">
        <div
          className={`flex items-center gap-2 bg-card border rounded-lg px-3 py-2.5 hover:shadow-sm transition-all cursor-pointer group ${
            isSelected ? "border-primary/50 bg-primary/5" : "border-border"
          }`}
          style={{ marginLeft: depth * 24 }}
          onClick={() => onEditActivity(activity)}
        >
          {hasChildren ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 shrink-0"
              onClick={(e) => { e.stopPropagation(); togglePackage(activity.id); }}
            >
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          ) : (
            <span className="w-5 shrink-0" />
          )}

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
            onClick={(e) => { e.stopPropagation(); onToggleActivity(activity.id, activity.status); }}
          >
            {activity.status === "completed" ? (
              <CheckCircle2 className="w-4 h-4 text-success" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>

          {isPackage && <Package className="w-3.5 h-3.5 text-primary shrink-0" />}

          {/* Color dot for priority */}
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${priorityDot[prio] || priorityDot.medium}`}
            title={`Prioridade: ${priorityLabels[prio] || prio}`}
            aria-hidden
          />

          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${activity.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {activity.title}
              {hasChildren && <span className="ml-2 text-xs text-muted-foreground font-normal">({subs.length})</span>}
            </p>
            {activity.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{activity.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={`text-[10px] ${priorityColors[prio]}`}>
              {priorityLabels[prio] || prio}
            </Badge>
            {activity.assigned_to && (
              <Badge variant="secondary" className="text-[10px]">👤 {activity.assigned_to}</Badge>
            )}
            {onCreateActivityInPhase && depth === 0 && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Adicionar subatividade"
                onClick={(e) => { e.stopPropagation(); onCreateActivityInPhase(activity.phase_id, activity.id); }}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            )}
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
          {phaseId && onCreateActivityInPhase && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => onCreateActivityInPhase(phaseId, null)}
            >
              <Plus className="w-3.5 h-3.5" /> Atividade
            </Button>
          )}
        </div>

        {!isCollapsed && (
          <div className="space-y-1">
            {acts.length === 0 ? (
              <p className="text-xs text-muted-foreground/70 italic px-2 py-3 text-center">
                Nenhuma atividade nesta fase. Clique em "+ Atividade" para começar.
              </p>
            ) : (
              acts.map((a) => renderActivityRow(a, 0))
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
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Selecionar todas"
            />
            <p className="text-sm text-muted-foreground">
              {selectedIds.size > 0
                ? `${selectedIds.size} de ${backlogActs.length} selecionada(s)`
                : `${backlogActs.length} atividade(s) no backlog`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => { setCollapsedPhases(new Set()); setCollapsedPackages(new Set()); }}
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
                const packageIds = backlogActs.filter(a => (childrenByParent.get(a.id) || []).length > 0).map(a => a.id);
                setCollapsedPhases(new Set(allPhaseIds));
                setCollapsedPackages(new Set(packageIds));
              }}
              title="Recolher tudo"
            >
              <ChevronsDownUp className="w-3.5 h-3.5" /> Recolher
            </Button>
            {selectedIds.size > 0 && (
              <Button size="sm" className="h-7 text-xs gap-1.5 ml-1" onClick={() => setMoveDialogOpen(true)}>
                <ArrowRight className="w-3.5 h-3.5" />
                Mover para Kanban ({selectedIds.size})
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

        {(topLevelByPhase.get("none") || []).length > 0 &&
          renderPhaseGroup(null, "Sem fase")}
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
            <DialogTitle>Mover {selectedIds.size} atividade(s) para o Kanban</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Etapa de destino *</Label>
              <Select value={targetStageId} onValueChange={setTargetStageId}>
                <SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (<SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>))}
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

      {/* New Package Dialog */}
      <Dialog open={!!packageDialogPhaseId} onOpenChange={(o) => { if (!o) { setPackageDialogPhaseId(null); setNewPackageTitle(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" /> Novo Pacote de Atividades
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Título do pacote *</Label>
              <Input
                placeholder="Ex: Implementação Backend"
                value={newPackageTitle}
                onChange={(e) => setNewPackageTitle(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleCreatePackage(); }}
              />
              <p className="text-xs text-muted-foreground">
                Um pacote agrupa subatividades. Você poderá adicionar atividades dentro dele depois.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPackageDialogPhaseId(null); setNewPackageTitle(""); }}>Cancelar</Button>
            <Button onClick={handleCreatePackage} disabled={!newPackageTitle.trim()}>Criar Pacote</Button>
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