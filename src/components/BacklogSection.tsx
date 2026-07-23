'use client';
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2, Circle, Trash2, Inbox, ArrowRight, RotateCcw,
  ChevronDown, ChevronUp, ChevronRight, Plus, Layers, FolderOpen,
  ChevronsUpDown, ChevronsDownUp, MousePointerSquareDashed, Package, Diamond,
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { buildAvatarLookupMap, getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";

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
  is_milestone?: boolean | null;
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
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null; email: string | null; avatar_url: string | null }[]>([]);
  const [profileNameMap, setProfileNameMap] = useState<Record<string, string>>({});
  const [profileAvatarMap, setProfileAvatarMap] = useState<Record<string, string>>({});
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

  // Colunas selecionáveis do backlog (o usuário escolhe o que ver). Persistido
  // por projeto, mesmo padrão da tabela de subatividades.
  const BACKLOG_COLS: { id: string; label: string; width: string; align?: "center" | "left" }[] = [
    { id: "priority", label: "Prioridade", width: "132px", align: "left" },
    { id: "status", label: "Status", width: "148px", align: "left" },
    { id: "assigned_to", label: "Responsável", width: "180px", align: "left" },
    { id: "end_date", label: "Prazo", width: "116px", align: "left" },
    { id: "hours", label: "Horas", width: "96px", align: "left" },
  ];
  const BACKLOG_COLS_DEFAULT = ["priority", "status", "assigned_to", "end_date"];
  const backlogColsKey = `backlog-cols:${projectId}`;
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    if (typeof window === "undefined") return BACKLOG_COLS_DEFAULT;
    try {
      const stored = localStorage.getItem(`backlog-cols:${projectId}`);
      if (!stored) return BACKLOG_COLS_DEFAULT;
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : BACKLOG_COLS_DEFAULT;
    } catch {
      return BACKLOG_COLS_DEFAULT;
    }
  });
  const toggleCol = (id: string) => {
    setVisibleCols((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      try { localStorage.setItem(backlogColsKey, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };
  const activeCols = BACKLOG_COLS.filter((c) => visibleCols.includes(c.id));
  // Grid: [expand 20][check 26][tarefa flex][...colunas][ações 68]
  const backlogGrid = `20px 26px minmax(220px,1fr) ${activeCols.map((c) => c.width).join(" ")} 68px`;

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
        supabase.from("profiles").select("id, full_name, email, avatar_url").eq("is_active", true).order("full_name"),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);
      if (profilesData) {
        const adminIds = new Set((adminRoles || []).map((r: any) => r.user_id));
        const filteredProfiles = profilesData.filter((p) => !adminIds.has(p.id));
        setProfiles(filteredProfiles);
        const nextNameMap: Record<string, string> = {};
        filteredProfiles.forEach((profile) => {
          const fullName = typeof profile.full_name === "string" ? profile.full_name.trim() : "";
          const email = typeof profile.email === "string" ? profile.email.trim() : "";
          if (fullName && profile.id) nextNameMap[profile.id] = fullName;
          if (fullName) nextNameMap[fullName] = fullName;
          if (email && fullName) nextNameMap[email] = fullName;
        });
        setProfileNameMap(nextNameMap);
        setProfileAvatarMap(buildAvatarLookupMap(filteredProfiles));
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

  // Build hierarchy. Quando filtros (busca/status/prioridade) escondem o PAI mas
  // mantêm um FILHO, o filho seria órfão (nem raiz, nem sob o pai) e sumiria da
  // tela. Para evitar isso, um item cujo parent_id não está no conjunto visível
  // é promovido a raiz.
  const visibleIds = new Set(backlogActs.map((a) => a.id));
  const childrenByParent = new Map<string, Activity[]>();
  const topLevelByPhase = new Map<string | "none", Activity[]>();
  backlogActs.forEach((a) => {
    const parentVisible = a.parent_id ? visibleIds.has(a.parent_id) : false;
    if (a.parent_id && parentVisible) {
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
    // EAP: se o pai é folha (atividade/marco), promove a "pacote" antes de
    // inserir. TOLERANTE: se o banco ainda não aceita 'pacote' (CHECK antigo,
    // migration mínima pendente), NÃO aborta — segue criando o subitem. O pai
    // continua funcionando como agrupador por ter filhos; o tipo é ajustado
    // quando a migration entrar.
    if (parentId) {
      const parent = backlogActs.find((a) => a.id === parentId);
      const parentType = parent?.item_type || "atividade";
      const parentIsLeaf = !parent || parent.is_milestone || (parentType !== "fase" && parentType !== "pacote");
      if (parentIsLeaf) {
        await supabase
          .from("activities")
          .update({ item_type: "pacote", is_milestone: false } as any)
          .eq("id", parentId); // erro ignorado de propósito (ver comentário acima)
      }
    }

    const { error } = await supabase.from("activities").insert({
      project_id: projectId,
      title,
      phase_id: phaseId,
      parent_id: parentId,
      workflow_stage_id: backlogStageId,
      status: "pending",
      priority: "medium",
      item_type: "atividade",
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

  // Papel EAP exibido: automático pela posição na árvore (marco > fase explícita
  // > pacote se tem filhos > atividade), a menos que o tipo esteja gravado.
  type Kind = "atividade" | "pacote" | "fase" | "marco";
  const resolveKind = (a: Activity, hasChildren: boolean): Kind => {
    if (a.is_milestone) return "marco";
    if (a.item_type === "fase") return "fase";
    if (a.item_type === "pacote" || hasChildren) return "pacote";
    return "atividade";
  };
  const KIND_META: Record<Kind, { label: string; icon: JSX.Element; cls: string }> = {
    fase: { label: "Fase", icon: <Layers className="w-3 h-3" />, cls: "text-primary bg-primary/10 border-primary/30" },
    pacote: { label: "Pacote", icon: <Package className="w-3 h-3" />, cls: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/40" },
    atividade: { label: "Atividade", icon: <Circle className="w-3 h-3" />, cls: "text-muted-foreground bg-muted border-border" },
    marco: { label: "Marco", icon: <Diamond className="w-3 h-3 fill-amber-500 text-amber-500" />, cls: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/40" },
  };
  // Muda o tipo de um item. Tolerante: se o banco ainda não aceita 'pacote'
  // (migration pendente), avisa mas não quebra.
  const handleChangeType = async (activity: Activity, kind: Kind, hasChildren: boolean) => {
    // Folha (atividade/marco) não pode ter filhos.
    if ((kind === "atividade" || kind === "marco") && hasChildren) {
      toast({ title: "Não é possível", description: "Este item tem subitens; só Pacote ou Fase agrupam.", variant: "destructive" });
      return;
    }
    const patch = kind === "marco"
      ? { is_milestone: true, item_type: "atividade" }
      : { is_milestone: false, item_type: kind };
    const { error } = await supabase.from("activities").update(patch as any).eq("id", activity.id);
    if (error) {
      if (kind === "pacote") {
        toast({ title: "Pacote indisponível", description: "Aplique a migration para gravar o tipo Pacote. O item já agrupa por ter subitens.", variant: "destructive" });
      } else {
        toast({ title: "Erro ao mudar tipo", variant: "destructive" });
      }
      return;
    }
    onDataChanged();
  };

  // Conta itens e concluídos de um grupo (raízes + toda a subárvore visível).
  const groupProgress = (roots: Activity[]): { total: number; done: number } => {
    let total = 0, done = 0;
    const walk = (a: Activity) => {
      total += 1;
      if (a.status === "completed") done += 1;
      (childrenByParent.get(a.id) || []).forEach(walk);
    };
    roots.forEach(walk);
    return { total, done };
  };

  // Cabeçalho de colunas alinhado com o grid das linhas.
  const ColumnHeader = () => (
    <div
      className="grid items-center gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      style={{ gridTemplateColumns: backlogGrid }}
    >
      <span /><span />
      <span>Tarefa</span>
      {activeCols.map((c) => (
        <span key={c.id}>{c.label}</span>
      ))}
      <span className="flex justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="h-5 w-5 inline-flex items-center justify-center rounded border border-muted-foreground/30 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
              title="Escolher colunas"
            >
              <Plus className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="end">
            <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 normal-case">
              Colunas visíveis
            </div>
            <div className="space-y-0.5">
              {BACKLOG_COLS.map((col) => (
                <label
                  key={col.id}
                  className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted cursor-pointer text-xs normal-case font-normal"
                >
                  <Checkbox checked={visibleCols.includes(col.id)} onCheckedChange={() => toggleCol(col.id)} />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </span>
    </div>
  );

  const renderActivityRow = (activity: Activity, depth: number = 0) => {
    const isSelected = selectedIds.has(activity.id);
    const prio = activity.priority || "medium";
    const subs = childrenByParent.get(activity.id) || [];
    const hasChildren = subs.length > 0;
    const isCollapsed = collapsedParents.has(activity.id);
    const isEditingTitle = editingTitleId === activity.id;
    const quickAddOpen = quickAddKey === `parent:${activity.id}`;

    const kind = resolveKind(activity, hasChildren);
    const kindMeta = KIND_META[kind];
    const isTopLevel = !activity.parent_id;
    const typeOptions: Kind[] = hasChildren ? ["pacote"] : ["atividade", "marco", "pacote"];
    if (isTopLevel) typeOptions.push("fase");
    const stg = activity.workflow_stage_id ? stageById.get(activity.workflow_stage_id) : null;
    const dc = dependencyCounts.get(activity.id);
    const hasDeps = !!dc && (dc.pred > 0 || dc.succ > 0);

    const renderCol = (colId: string) => {
      if (colId === "priority") {
        return (
          <span key="priority" className="min-w-0" title={`Prioridade: ${priorityLabels[prio] || prio}`}>
            <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-md border text-xs font-medium ${priorityColors[prio] || priorityColors.medium}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[prio] || priorityDot.medium}`} aria-hidden />
              {priorityLabels[prio] || prio}
            </span>
          </span>
        );
      }
      if (colId === "status") {
        return (
          <span key="status" className="min-w-0">
            {stg ? (
              <span
                className="inline-block max-w-full truncate text-xs font-medium px-2.5 py-1 rounded-md border"
                style={{ borderColor: stg.color, color: stg.color, backgroundColor: `${stg.color}18` }}
                title={`Status: ${stg.title}`}
              >
                {stg.title}
              </span>
            ) : <span className="text-xs text-muted-foreground/40">—</span>}
          </span>
        );
      }
      if (colId === "assigned_to") {
        return (
          <span key="assigned_to" className="flex items-center gap-2 min-w-0">
            {activity.assigned_to ? (() => {
              const rawAssignee = activity.assigned_to || "";
              const resolvedName = profileNameMap[rawAssignee] || rawAssignee;
              const avatar = resolveAvatarFromLookup(rawAssignee, resolvedName, profileAvatarMap);
              return (
                <>
                  <Avatar className="h-6 w-6 shrink-0">
                    {avatar ? <AvatarImage src={avatar} alt={resolvedName} /> : null}
                    <AvatarFallback className="text-[9px] font-semibold">{getAvatarInitials(resolvedName)}</AvatarFallback>
                  </Avatar>
                  <span className="text-[13px] text-foreground/90 truncate">{resolvedName}</span>
                </>
              );
            })() : (
              <span className="text-[13px] text-muted-foreground/40">Sem responsável</span>
            )}
          </span>
        );
      }
      if (colId === "end_date") {
        const overdue = activity.end_date && activity.status !== "completed" && new Date(activity.end_date) < new Date(new Date().toDateString());
        return (
          <span key="end_date" className={`text-[13px] tabular-nums ${overdue ? "text-destructive font-semibold" : "text-foreground/80"}`}>
            {activity.end_date ? new Date(activity.end_date).toLocaleDateString("pt-BR") : <span className="text-muted-foreground/40">—</span>}
          </span>
        );
      }
      if (colId === "hours") {
        const h = Number(activity.hours) || 0;
        return (
          <span key="hours" className="text-[13px] tabular-nums text-foreground/80">
            {h > 0 ? `${h % 1 === 0 ? h : h.toFixed(1)}h` : <span className="text-muted-foreground/40">—</span>}
          </span>
        );
      }
      return <span key={colId} />;
    };

    return (
      <div key={activity.id}>
        <div
          className={`grid items-center gap-3 border-b px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer group ${
            isSelected ? "bg-primary/5" : ""
          }`}
          style={{ gridTemplateColumns: backlogGrid, paddingLeft: 12 + depth * 22 }}
          onClick={() => { if (!isEditingTitle) onEditActivity(activity); }}
        >
          {/* col: expand */}
          {hasChildren ? (
            <button
              type="button"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground shrink-0"
              onClick={(e) => { e.stopPropagation(); toggleParent(activity.id); }}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {/* col: checkbox (modo seleção) ou concluir */}
          {selectMode ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleSelect(activity.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Selecionar ${activity.title}`}
            />
          ) : (
            <button
              type="button"
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted shrink-0"
              onClick={(e) => { e.stopPropagation(); onToggleActivity(activity.id, activity.status); }}
              title={activity.status === "completed" ? "Reabrir tarefa" : "Concluir tarefa"}
            >
              {activity.status === "completed" ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}

          {/* col: ícone de tipo (clicável) + título + código EAP + deps */}
          <div className="flex items-center gap-2 min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  title={`${kindMeta.label} — clique para mudar o tipo`}
                  className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors hover:brightness-95 ${kindMeta.cls}`}
                >
                  {kindMeta.icon}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                {typeOptions.map((k) => (
                  <DropdownMenuItem
                    key={k}
                    onClick={(e) => { e.stopPropagation(); if (k !== kind) handleChangeType(activity, k, hasChildren); }}
                    className={k === kind ? "font-semibold" : ""}
                  >
                    <span className="mr-2 inline-flex">{KIND_META[k].icon}</span>
                    {KIND_META[k].label}
                    {k === kind && <span className="ml-auto text-[10px] text-muted-foreground">atual</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

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
              <span className="min-w-0 flex items-center gap-2">
                {!!(activity as any).wbs_code && (
                  <span className="inline-flex items-center h-5 px-1.5 rounded border border-border bg-muted/50 text-[11px] font-mono text-muted-foreground shrink-0" title="Código EAP">
                    {(activity as any).wbs_code}
                  </span>
                )}
                <span
                  className={`text-sm font-normal truncate ${activity.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingTitleId(activity.id);
                    setEditingTitleValue(activity.title);
                  }}
                  title={activity.description || "Duplo-clique para editar"}
                >
                  {activity.title}
                </span>
                {hasChildren && <span className="text-xs text-muted-foreground font-normal shrink-0">({subs.length})</span>}
                {hasDeps && (
                  <span
                    className="shrink-0 text-[11px] text-primary/80"
                    title={`${dc!.pred} predecessora(s) · ${dc!.succ} sucessora(s)`}
                  >
                    🔗{dc!.pred > 0 ? `←${dc!.pred}` : ""}{dc!.succ > 0 ? `→${dc!.succ}` : ""}
                  </span>
                )}
              </span>
            )}
          </div>

          {/* colunas selecionáveis, na ordem de BACKLOG_COLS */}
          {activeCols.map((c) => renderCol(c.id))}

          {/* col: ações (aparecem no hover) */}
          <span className="flex items-center gap-0.5 justify-end shrink-0">
            <button
              type="button"
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
              title="Adicionar subitem (torna-o um Pacote)"
              onClick={(e) => {
                e.stopPropagation();
                setQuickAddKey(`parent:${activity.id}`);
                setQuickAddTitle("");
                setCollapsedParents((prev) => { const n = new Set(prev); n.delete(activity.id); return n; });
              }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {isAdmin && (
              <button
                type="button"
                className="h-6 w-6 flex items-center justify-center rounded text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onDeleteActivity(activity.id); }}
                title="Excluir"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        </div>

        {hasChildren && !isCollapsed && (
          <div>
            {subs.map((sub) => renderActivityRow(sub, depth + 1))}
          </div>
        )}

        {quickAddOpen && (
          <div style={{ marginLeft: 8 + (depth + 1) * 20 }} className="flex items-center gap-2 px-3 py-2 my-1 border border-dashed border-primary/40 rounded-lg bg-primary/5">
            <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
            <Input
              autoFocus
              placeholder="Título do subitem — Enter cria e continua · Esc fecha"
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
    const { total: progTotal, done: progDone } = groupProgress(acts);
    const progPct = progTotal > 0 ? Math.round((progDone / progTotal) * 100) : 0;

    return (
      <div key={key}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
          {phaseId ? (
            <button
              type="button"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground shrink-0"
              onClick={() => togglePhase(phaseId)}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary shrink-0">
            {phaseId ? <Layers className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />}
          </span>
          <h4 className="text-[13px] font-semibold text-foreground">{phaseTitle}</h4>
          <div className="flex items-center gap-3 ml-auto">
            {progTotal > 0 && (
              <span className="flex items-center gap-1.5" title={`${progDone} de ${progTotal} concluída(s)`}>
                <span className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
                  <span className="block h-full rounded-full bg-success transition-all" style={{ width: `${progPct}%` }} />
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{progDone}/{progTotal}</span>
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => { setQuickAddKey(quickAddPhaseKey); setQuickAddTitle(""); }}
            >
              <Plus className="w-3.5 h-3.5" /> Tarefa
            </Button>
          </div>
        </div>

        {!isCollapsed && (
          <div>
            {acts.length === 0 && !quickAddOpen ? (
              <p className="text-xs text-muted-foreground/70 italic px-2 py-3 text-center">
                Nenhuma tarefa. Clique em "+ Tarefa" para começar.
              </p>
            ) : (
              acts.map((a) => renderActivityRow(a, 0))
            )}
            {quickAddOpen && (
              <div className="flex items-center gap-2 mx-2 my-2 px-3 py-2 border border-dashed border-primary/40 rounded-lg bg-primary/5">
                <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                <Input
                  autoFocus
                  placeholder="Título — Enter cria e continua · Esc fecha"
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
      </div>
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
    const { total: progTotal, done: progDone } = groupProgress(subs);
    const progPct = progTotal > 0 ? Math.round((progDone / progTotal) * 100) : 0;

    return (
      <div key={phaseAct.id}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
          <button
            type="button"
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground shrink-0"
            onClick={() => toggleParent(phaseAct.id)}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary shrink-0">
            <Layers className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
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
                className="text-[13px] font-semibold text-foreground cursor-pointer truncate"
                onClick={() => onEditActivity(phaseAct)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTitleId(phaseAct.id);
                  setEditingTitleValue(phaseAct.title);
                }}
                title="Clique para editar · duplo-clique para renomear"
              >
                {phaseAct.title}
              </h4>
            )}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            {progTotal > 0 && (
              <span className="flex items-center gap-1.5" title={`${progDone} de ${progTotal} concluída(s)`}>
                <span className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
                  <span className="block h-full rounded-full bg-success transition-all" style={{ width: `${progPct}%` }} />
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{progDone}/{progTotal}</span>
              </span>
            )}
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
              <button
                type="button"
                className="h-7 w-7 flex items-center justify-center rounded text-destructive hover:bg-destructive/10"
                title="Excluir fase"
                onClick={(e) => { e.stopPropagation(); onDeleteActivity(phaseAct.id); }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {!isCollapsed && (
          <div>
            {subs.length === 0 && !quickAddOpen ? (
              <p className="text-xs text-muted-foreground/70 italic px-2 py-3 text-center">
                Nenhuma tarefa nesta fase. Clique em "+ Tarefa" para começar.
              </p>
            ) : (
              subs.map((s) => renderActivityRow(s, 0))
            )}
            {quickAddOpen && (
              <div className="flex items-center gap-2 mx-2 my-2 px-3 py-2 border border-dashed border-primary/40 rounded-lg bg-primary/5">
                <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                <Input
                  autoFocus
                  placeholder="Título — Enter cria e continua · Esc fecha"
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
      </div>
    );
  };

  return (
    <div className="space-y-3">
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
            {selectMode && selectedIds.size > 0 && (
              <Button size="sm" className="h-7 text-xs gap-1.5 mr-1" onClick={() => setMoveDialogOpen(true)}>
                <ArrowRight className="w-3.5 h-3.5" />
                Mudar status ({selectedIds.size})
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => { setCollapsedPhases(new Set()); setCollapsedParents(new Set()); }}
              title="Expandir tudo"
            >
              <ChevronsUpDown className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => {
                const allPhaseIds = phases.map(p => p.id);
                const parentIds = backlogActs.filter(a => (childrenByParent.get(a.id) || []).length > 0).map(a => a.id);
                setCollapsedPhases(new Set(allPhaseIds));
                setCollapsedParents(new Set(parentIds));
              }}
              title="Recolher tudo"
            >
              <ChevronsDownUp className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Phase groups — tabela única com cabeçalho de colunas no topo */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {phases.length === 0 && backlogActs.length === 0 && (
          <div className="p-8 text-center">
            <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma fase ou atividade ainda</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Crie uma fase para começar a organizar pacotes e atividades
            </p>
          </div>
        )}

        {backlogActs.length > 0 && <ColumnHeader />}

        {phases.map((p) => renderPhaseGroup(p.id, p.title))}

        {/* Atividades-fase (item_type='fase') em qualquer nível top-level viram cards de fase virtuais */}
        {virtualPhaseActs.map((vp) => renderVirtualPhase(vp))}

        {/* Atividades top-level sem phase_id que não são fases viram grupo "Sem fase" */}
        {(() => {
          const orphanTop = topLevelByPhase.get("none") || [];
          const looseTasks = orphanTop;
          const { total: progTotal, done: progDone } = groupProgress(looseTasks);
          const progPct = progTotal > 0 ? Math.round((progDone / progTotal) * 100) : 0;
          return (
            <>
              {looseTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
                    <span className="w-5 shrink-0" />
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-muted text-muted-foreground shrink-0">
                      <FolderOpen className="w-3.5 h-3.5" />
                    </span>
                    <h4 className="text-[13px] font-semibold text-muted-foreground">Sem fase</h4>
                    <div className="flex items-center gap-3 ml-auto">
                      {progTotal > 0 && (
                        <span className="flex items-center gap-1.5" title={`${progDone} de ${progTotal} concluída(s)`}>
                          <span className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
                            <span className="block h-full rounded-full bg-success transition-all" style={{ width: `${progPct}%` }} />
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{progDone}/{progTotal}</span>
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={() => { setQuickAddKey(`phase:none`); setQuickAddTitle(""); }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Tarefa
                      </Button>
                    </div>
                  </div>
                  <div>
                    {looseTasks.map((a) => renderActivityRow(a, 0))}
                    {quickAddKey === "phase:none" && (
                      <div className="flex items-center gap-2 mx-2 my-2 px-3 py-2 border border-dashed border-primary/40 rounded-lg bg-primary/5">
                        <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                        <Input
                          autoFocus
                          placeholder="Título — Enter cria e continua · Esc fecha"
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
                </div>
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
                    <SelectItem key={p.id} value={p.full_name || p.id}>
                      <span className="inline-flex items-center gap-2 min-w-0 w-full">
                        <Avatar className="h-5 w-5 shrink-0">
                          {(() => {
                            const avatar = resolveAvatarFromLookup(p.id, p.full_name || p.email || p.id, profileAvatarMap);
                            return avatar ? <AvatarImage src={avatar} alt={p.full_name || "Usuário"} /> : null;
                          })()}
                          <AvatarFallback className="text-[9px]">{getAvatarInitials(p.full_name || p.email || "Sem nome")}</AvatarFallback>
                        </Avatar>
                        <span className="truncate">{p.full_name || "Sem nome"}</span>
                      </span>
                    </SelectItem>
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