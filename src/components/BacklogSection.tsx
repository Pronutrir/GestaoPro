'use client';
import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2, Circle, Trash2, Inbox, ArrowRight, RotateCcw,
  ChevronDown, ChevronUp, ChevronRight, Plus, Layers, FolderOpen,
  ChevronsUpDown, ChevronsDownUp, MousePointerSquareDashed, Diamond,
  Rows3, MoreHorizontal, Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
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
import { resolveEapKind, eapTypeOptions, type EapKind } from "@/lib/eapModel";
import { GUT_META, normalizeGut, type GutLevel } from "@/lib/gutPriority";

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
  /** Código da EAP: define o papel (nível 1 = Fase, 2+ = Atividade). */
  wbs_code?: string | null;
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
  /** Por que arquivar está indisponível (projeto concluído, sem permissão…).
   *  Quando vem preenchido, o botão fica DESABILITADO com este texto no
   *  tooltip em vez de sumir — some sem explicação vira "não consigo excluir". */
  deleteBlockedReason?: string;
  hasActiveFilters?: boolean;
}

export const BacklogSection = ({
  projectId, activities, phases,
  onEditActivity, onDeleteActivity, onToggleActivity,
  onDataChanged, isAdmin = false, deleteBlockedReason, hasActiveFilters,
}: BacklogSectionProps) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [backlogStageId, setBacklogStageId] = useState<string | null>(null);
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
  // Agrupar em raias (como no Kanban). "phase" preserva a árvore EAP atual;
  // as demais exibem grupos planos por dimensão. Persistido por projeto.
  type GroupBy = "phase" | "assignee" | "priority" | "status" | "type";
  const groupByKey = `backlog-groupby:${projectId}`;
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    if (typeof window === "undefined") return "phase";
    try {
      const stored = localStorage.getItem(`backlog-groupby:${projectId}`);
      return (stored as GroupBy) || "phase";
    } catch { return "phase"; }
  });
  const changeGroupBy = (v: GroupBy) => {
    setGroupBy(v);
    try { localStorage.setItem(groupByKey, v); } catch { /* quota */ }
  };
  // Chaves de grupos colapsados no modo "raia" (plano), separado do da árvore.
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());
  const toggleLane = (id: string) =>
    setCollapsedLanes((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Colunas selecionáveis do backlog (o usuário escolhe o que ver). Persistido
  // por projeto, mesmo padrão da tabela de subatividades.
  // Largura elástica (minmax) em vez de fixa: com valores fixos a soma passava
  // de 760px e a última coluna — a de ações — saía da tela, exigindo rolagem
  // lateral para chegar ao botão de arquivar. Agora cada coluna encolhe até um
  // mínimo ainda legível e a tabela cabe na largura disponível.
  // Máximos mais enxutos: as colunas de dado não precisam crescer sem limite —
  // a folga vai para o título, que é o que a pessoa lê. Prazo e Horas seguram
  // conteúdo curto ("20/07/2026", "55h") e não justificam largura de sobra.
  const BACKLOG_COLS: { id: string; label: string; width: string; align?: "center" | "left" }[] = [
    { id: "priority", label: "Prioridade", width: "minmax(80px,108px)", align: "left" },
    { id: "status", label: "Status", width: "minmax(88px,124px)", align: "left" },
    { id: "assigned_to", label: "Responsável", width: "minmax(96px,168px)", align: "left" },
    { id: "end_date", label: "Prazo", width: "minmax(64px,96px)", align: "left" },
    { id: "hours", label: "Horas", width: "minmax(48px,68px)", align: "left" },
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
  // Largura real do container (não da janela): o backlog também aparece dentro
  // de painéis estreitos, onde uma media query da viewport erraria.
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  useEffect(() => {
    const el = tableRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setTableWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Quando o espaço aperta, some com as colunas menos essenciais em vez de
  // criar rolagem lateral. Ordem de descarte = da menos para a mais decisiva
  // na leitura do backlog; tarefa e ações nunca saem.
  const DROP_ORDER = ["hours", "end_date", "assigned_to", "status", "priority"];
  const chosenCols = BACKLOG_COLS.filter((c) => visibleCols.includes(c.id));
  const activeCols = (() => {
    // 0 = ainda não medido (primeiro render): mostra tudo e deixa o
    // ResizeObserver corrigir, em vez de piscar escondendo colunas.
    if (tableWidth === 0) return chosenCols;
    const FIXED = 20 + 26 + 32 + 120; // expand + check + ações + mínimo da Tarefa
    const minOf = (c: { width: string }) => Number(c.width.match(/minmax\((\d+)px/)?.[1] ?? 0);
    let cols = [...chosenCols];
    const fits = () => FIXED + cols.reduce((s, c) => s + minOf(c), 0) + 8 * (3 + cols.length) <= tableWidth;
    for (const id of DROP_ORDER) {
      if (fits()) break;
      cols = cols.filter((c) => c.id !== id);
    }
    return cols;
  })();

  // Grid: [expand 20][check 26][tarefa flex][...colunas][ações 32]
  // Ações agora é um único "⋯" (antes eram dois botões, daí os 60px): a folga
  // volta para o título, que é o que a pessoa lê.
  // O mínimo da coluna Tarefa é baixo de propósito: ela tem `truncate`, então
  // encolher corta o texto com reticências — o que é preferível a empurrar a
  // coluna de ações para fora da tela.
  const backlogGrid = `20px 26px minmax(120px,1fr) ${activeCols.map((c) => c.width).join(" ")} 32px`;

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

  // ------------------------------------------------------------------
  // Raias (modo "Agrupar por" ≠ fase): grupos PLANOS por dimensão.
  // Cada raia = { id, label, items[] }. Todos os itens (pais e filhos)
  // entram planos — sem árvore — para a dimensão escolhida.
  // ------------------------------------------------------------------
  const buildLanes = (): { id: string; label: string; items: Activity[] }[] => {
    const acts = backlogActs.filter((a) => !isPhaseLikeActivity(a));
    if (groupBy === "assignee") {
      const map = new Map<string, Activity[]>();
      acts.forEach((a) => {
        const who = a.assigned_to || "";
        (map.get(who) || map.set(who, []).get(who)!).push(a);
      });
      const named = Array.from(map.entries())
        .filter(([k]) => k)
        .map(([k, items]) => ({ id: k, label: profileNameMap[k] || k, items }))
        .sort((x, y) => x.label.localeCompare(y.label));
      if (map.has("")) named.push({ id: "__none__", label: "Sem responsável", items: map.get("")! });
      return named;
    }
    if (groupBy === "priority") {
      const order: GutLevel[] = ["urgente", "critica", "alta", "media", "baixa", "pendente"];
      return order
        .map((level) => ({ id: level, label: GUT_META[level].label, items: acts.filter((a) => normalizeGut(a.priority) === level) }))
        .filter((l) => l.items.length > 0);
    }
    if (groupBy === "status") {
      const lanes = allStages.map((s) => ({ id: s.id, label: s.title, items: acts.filter((a) => a.workflow_stage_id === s.id) }));
      const noStage = acts.filter((a) => !a.workflow_stage_id);
      if (noStage.length) lanes.push({ id: "__none__", label: "Sem status", items: noStage });
      return lanes.filter((l) => l.items.length > 0);
    }
    if (groupBy === "type") {
      const kindOf = (a: Activity) => resolveEapKind(a, (childrenByParent.get(a.id)?.length || 0) > 0);
      const order: { id: string; label: string; match: (a: Activity) => boolean }[] = [
        { id: "fase", label: "Fases/Entregas", match: (a) => kindOf(a) === "fase" },
        { id: "atividade", label: "Atividades", match: (a) => kindOf(a) === "atividade" },
        { id: "marco", label: "Marcos", match: (a) => kindOf(a) === "marco" },
      ];
      const used = new Set<string>();
      const lanes: { id: string; label: string; items: Activity[] }[] = [];
      order.forEach((o) => {
        const items = acts.filter((a) => !used.has(a.id) && o.match(a));
        items.forEach((a) => used.add(a.id));
        if (items.length) lanes.push({ id: o.id, label: o.label, items });
      });
      return lanes;
    }
    return [];
  };
  const lanes = groupBy === "phase" ? [] : buildLanes();

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
    const parent = parentId ? backlogActs.find((a) => a.id === parentId) : null;
    // EAP: se o pai é folha (atividade/marco), promove a agrupador (Fase/Entrega)
    // antes de inserir. Fase agrupa em qualquer nível. Erro ignorado de propósito:
    // o pai já funciona como agrupador por ter filhos.
    if (parentId && parent) {
      const parentType = parent.item_type || "atividade";
      const parentIsLeaf = parent.is_milestone || (parentType !== "fase" && parentType !== "pacote");
      if (parentIsLeaf) {
        await supabase
          .from("activities")
          .update({ item_type: "fase", is_milestone: false } as any)
          .eq("id", parentId);
      }
    }

    // Herda o stage do pai (fase) em vez do stage fixo "Backlog": uma tarefa
    // criada dentro de uma fase precisa nascer na MESMA coluna do quadro que a
    // fase, senão fica presa no stage 0 (que nunca vira coluna do Kanban) e
    // some visualmente, mesmo aparecendo corretamente aqui no Backlog.
    const inheritedStageId = parent?.workflow_stage_id ?? backlogStageId;

    const { error } = await supabase.from("activities").insert({
      project_id: projectId,
      title,
      phase_id: phaseId,
      parent_id: parentId,
      workflow_stage_id: inheritedStageId,
      status: "pending",
      priority: "pendente",
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

  // Papel EAP exibido (fonte única: lib/eapModel). Três papéis: Fase (agrupador,
  // qualquer nível), Atividade (folha), Marco. 'pacote' legado aparece como Fase.
  type Kind = EapKind;
  const resolveKind = (a: Activity, hasChildren: boolean): Kind => resolveEapKind(a, hasChildren);
  const KIND_META: Record<Kind, { label: string; icon: JSX.Element; cls: string }> = {
    fase: { label: "Fase", icon: <Layers className="w-3 h-3" />, cls: "text-primary bg-primary/10 border-primary/30" },
    atividade: { label: "Atividade", icon: <Circle className="w-3 h-3" />, cls: "text-muted-foreground bg-muted border-border" },
    marco: { label: "Marco", icon: <Diamond className="w-3 h-3 fill-amber-500 text-amber-500" />, cls: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/40" },
  };
  // Muda o tipo de um item.
  const handleChangeType = async (activity: Activity, kind: Kind, hasChildren: boolean) => {
    // Atividade agora pode agrupar (o nível é que define o rótulo). Só Marco
    // segue barrado com filhos: é folha de controle por definição.
    if (kind === "marco" && hasChildren) {
      toast({ title: "Não é possível", description: "Este item tem subitens; Marco não agrupa.", variant: "destructive" });
      return;
    }
    const patch = kind === "marco"
      ? { is_milestone: true, item_type: "atividade" }
      : { is_milestone: false, item_type: kind }; // 'fase' | 'atividade'
    const { error } = await supabase.from("activities").update(patch as any).eq("id", activity.id);
    if (error) {
      toast({ title: "Erro ao mudar tipo", variant: "destructive" });
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
      className="grid items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
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

  const renderActivityRow = (activity: Activity, depth: number = 0, flat: boolean = false) => {
    const isSelected = selectedIds.has(activity.id);
    const gutLevel = normalizeGut(activity.priority);
    const subs = flat ? [] : (childrenByParent.get(activity.id) || []);
    const hasChildren = subs.length > 0;
    const isCollapsed = collapsedParents.has(activity.id);
    const isEditingTitle = editingTitleId === activity.id;
    const quickAddOpen = quickAddKey === `parent:${activity.id}`;

    const kind = resolveKind(activity, hasChildren);
    const kindMeta = KIND_META[kind];
    // Item com filhos pode ser Fase ou Atividade (o nível é que define o
    // rótulo); só Marco fica de fora, por ser folha de controle.
    const typeOptions: Kind[] = eapTypeOptions({ hasChildren });
    const stg = activity.workflow_stage_id ? stageById.get(activity.workflow_stage_id) : null;
    const dc = dependencyCounts.get(activity.id);
    const hasDeps = !!dc && (dc.pred > 0 || dc.succ > 0);

    const renderCol = (colId: string) => {
      if (colId === "priority") {
        const meta = GUT_META[gutLevel];
        return (
          <span key="priority" className="min-w-0" title={`Prioridade: ${meta.label}`}>
            <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-md border text-xs font-medium ${meta.badgeClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`} aria-hidden />
              {meta.label}
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
          className={`grid items-center gap-2 border-b px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer group ${
            isSelected ? "bg-primary/5" : ""
          }`}
          // O recuo de profundidade NÃO vai aqui: padding na linha encolhe a
          // área do grid e empurra TODAS as colunas para a direita, tanto mais
          // quanto mais fundo o item — era o que desalinhava as linhas do
          // cabeçalho. O recuo é aplicado só na coluna do título, abaixo.
          style={{ gridTemplateColumns: backlogGrid }}
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
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-success/10 shrink-0"
              onClick={(e) => { e.stopPropagation(); onToggleActivity(activity.id, activity.status); }}
              title={activity.status === "completed" ? "Reabrir tarefa" : "Concluir tarefa"}
            >
              {activity.status === "completed" ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                // Traço mais forte que o ícone de TIPO ao lado: os dois eram
                // círculos cinza idênticos e pareciam checkbox duplicado.
                <Circle className="w-4 h-4 text-muted-foreground/70 [stroke-width:2.5]" />
              )}
            </button>
          )}

          {/* col: ícone de tipo (clicável) + título + código EAP + deps.
              O recuo por profundidade vive AQUI, dentro da coluna do título:
              assim a hierarquia continua legível sem deslocar as demais
              colunas, que permanecem alinhadas com o cabeçalho. */}
          <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: depth * 18 }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  title={`Tipo: ${kindMeta.label} — clique para mudar`}
                  className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md border bg-muted/60 transition-colors hover:brightness-95 ${kindMeta.cls}`}
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

          {/* col: ações — um "⋯" em vez de ícones soltos. Dois ícones por linha
              viravam ruído numa lista longa, e o menu acomoda ações novas sem
              alargar a coluna. O gatilho fica sempre visível (atenuado em
              repouso): escondê-lo no hover deixava a ação indescobrível. */}
          <span className="flex items-center justify-end shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-opacity opacity-45 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-muted"
                  title="Ações da tarefa"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onSelect={() => {
                    setQuickAddKey(`parent:${activity.id}`);
                    setQuickAddTitle("");
                    setCollapsedParents((prev) => { const n = new Set(prev); n.delete(activity.id); return n; });
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-2" /> Adicionar subitem
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEditActivity(activity)}>
                  <Pencil className="w-3.5 h-3.5 mr-2" /> Abrir detalhes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Desabilitado COM o motivo em vez de oculto: sumir levava a
                    "não consigo excluir" sem pista nenhuma do porquê. */}
                <DropdownMenuItem
                  disabled={!isAdmin}
                  className={isAdmin ? "text-destructive focus:text-destructive focus:bg-destructive/10" : ""}
                  title={isAdmin ? undefined : (deleteBlockedReason || "Você não tem permissão para arquivar esta atividade")}
                  // preventDefault: sem ele o menu fecha e leva o foco junto,
                  // brigando com o diálogo de confirmação que abre em seguida.
                  onSelect={(e) => { e.preventDefault(); if (isAdmin) onDeleteActivity(activity.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Arquivar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>

        {hasChildren && !isCollapsed && (
          <div>
            {subs.map((sub) => renderActivityRow(sub, depth + 1))}
          </div>
        )}

        {/* Recuo igual ao das linhas (12 + depth*22), um nível abaixo do pai:
            o campo cai sob os irmãos que vai criar, não deslocado deles. */}
        {quickAddOpen && (
          <div style={{ paddingLeft: 12 + (depth + 1) * 22 }} className="flex items-center gap-2 pr-3 py-1.5 border-b bg-primary/5">
            <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
            <Input
              autoFocus
              placeholder="Título do subitem — Enter cria · Esc fecha"
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

  /**
   * Arquiva UMA fase (soft-delete, igual ao resto do sistema).
   *
   * Faltava: o cabeçalho da fase real só tinha "+ Tarefa", enquanto a fase
   * virtual (atividade com item_type='fase') já tinha o botão de arquivar. Quem
   * criasse uma fase ficava sem saída — a única opção era "Arquivar todas as
   * fases", que é tudo ou nada.
   *
   * As atividades da fase NÃO são apagadas: perdem o vínculo e caem em
   * "Sem fase", que é reversível. Apagar tarefa junto com o agrupador seria
   * destrutivo demais para uma ação de um clique.
   */
  const handleDeletePhase = async (phaseId: string, phaseTitle: string) => {
    const acts = topLevelByPhase.get(phaseId) || [];
    const ok = await appConfirm({
      title: `Arquivar a fase "${phaseTitle}"?`,
      description: acts.length > 0
        ? `${acts.length} ${acts.length === 1 ? "tarefa vai" : "tarefas vão"} para "Sem fase". Nada é excluído — dá para restaurar em Arquivo.`
        : "A fase vai para o Arquivo e pode ser restaurada de lá.",
      confirmText: "Arquivar fase",
      destructive: true,
    });
    if (!ok) return;

    // Solta as tarefas antes de arquivar: se a fase sumir com elas ainda
    // apontando, elas somem da tela sem estarem arquivadas.
    if (acts.length > 0) {
      const { error: unlinkError } = await supabase
        .from("activities").update({ phase_id: null } as any).eq("phase_id", phaseId);
      if (unlinkError) {
        toast({ title: "Erro ao soltar as tarefas da fase", description: unlinkError.message, variant: "destructive" });
        return;
      }
    }

    const { error } = await supabase
      .from("phases")
      .update({ is_trashed: true, trashed_at: new Date().toISOString() } as any)
      .eq("id", phaseId);
    if (error) {
      toast({ title: "Erro ao arquivar a fase", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Fase arquivada", description: "Pode ser restaurada em Arquivo." });
    onDataChanged();
  };

  const renderPhaseGroup = (phaseId: string | null, phaseTitle: string) => {
    const key = phaseId || "none";
    const acts = topLevelByPhase.get(key) || [];
    const isCollapsed = phaseId ? collapsedPhases.has(phaseId) : false;
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
          <h4 className="text-[13px] font-semibold text-foreground truncate">{phaseTitle}</h4>
          {/* gap-2 (não 3) para o "⋯" cair sobre a coluna de ações das linhas. */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
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
            {/* Só na fase real: "Sem fase" é grupo virtual, não existe no banco
                e portanto não há o que arquivar. */}
            {phaseId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted data-[state=open]:bg-muted"
                    title="Ações da fase"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem
                    disabled={!isAdmin}
                    className={isAdmin ? "text-destructive focus:text-destructive focus:bg-destructive/10" : ""}
                    title={isAdmin ? undefined : (deleteBlockedReason || "Você não tem permissão para arquivar esta fase")}
                    onSelect={(e) => { e.preventDefault(); if (isAdmin) handleDeletePhase(phaseId, phaseTitle); }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Arquivar fase
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {!isCollapsed && (
          <div>
            {acts.length === 0 && !quickAddOpen ? (
              <p className="text-xs text-muted-foreground/70 italic px-2 py-3 text-center">
                {hasActiveFilters ? "Nenhuma tarefa visível com os filtros atuais." : "Nenhuma tarefa. Clique em \"+ Tarefa\" para começar."}
              </p>
            ) : (
              acts.map((a) => renderActivityRow(a, 0))
            )}
            {quickAddOpen && (
              // Mesmo grid das linhas de tarefa: o campo cai exatamente sob a
              // coluna "Tarefa". Antes era um flex com margem própria, então o
              // input começava num ponto e as tarefas em outro.
              <div
                className="grid items-center gap-2 border-b px-3 py-2 bg-primary/5"
                style={{ gridTemplateColumns: backlogGrid }}
              >
                <span />
                <Plus className="w-3.5 h-3.5 text-primary justify-self-center" />
                <Input
                  autoFocus
                  placeholder="Título — Enter cria · Esc fecha"
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleQuickAddSubmit(phaseId, null);
                    if (e.key === "Escape") { setQuickAddKey(null); setQuickAddTitle(""); }
                  }}
                  onBlur={() => { if (!quickAddTitle.trim()) { setQuickAddKey(null); } }}
                  className="h-7 text-sm"
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
          {/* gap-2: mesmo alinhamento do cabeçalho de fase real. */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
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
            {/* "+ Tarefa" continua exposto (é a ação principal da fase); o
                resto vai para o menu, como nas linhas. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted data-[state=open]:bg-muted"
                  title="Ações da fase"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={() => onEditActivity(phaseAct)}>
                  <Pencil className="w-3.5 h-3.5 mr-2" /> Abrir detalhes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!isAdmin}
                  className={isAdmin ? "text-destructive focus:text-destructive focus:bg-destructive/10" : ""}
                  title={isAdmin ? undefined : (deleteBlockedReason || "Você não tem permissão para arquivar esta fase")}
                  onSelect={(e) => { e.preventDefault(); if (isAdmin) onDeleteActivity(phaseAct.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Arquivar fase
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {!isCollapsed && (
          <div>
            {subs.length === 0 && !quickAddOpen ? (
              <p className="text-xs text-muted-foreground/70 italic px-2 py-3 text-center">
                {hasActiveFilters ? "Nenhuma tarefa visível com os filtros atuais." : "Nenhuma tarefa nesta fase. Clique em \"+ Tarefa\" para começar."}
              </p>
            ) : (
              subs.map((s) => renderActivityRow(s, 0))
            )}
            {quickAddOpen && (
              // Mesmo grid das linhas: o campo alinha com a coluna "Tarefa".
              <div
                className="grid items-center gap-2 border-b px-3 py-2 bg-primary/5"
                style={{ gridTemplateColumns: backlogGrid }}
              >
                <span />
                <Plus className="w-3.5 h-3.5 text-primary justify-self-center" />
                <Input
                  autoFocus
                  placeholder="Título — Enter cria · Esc fecha"
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

  // Contagem por tipo para a legenda de contexto (informação útil, não fantasma).
  const typeCounts = (() => {
    const real = backlogActs;
    let fase = 0, marco = 0, atividade = 0;
    real.forEach((a) => {
      const hasKids = (childrenByParent.get(a.id)?.length || 0) > 0;
      const k = resolveEapKind(a, hasKids);
      if (k === "fase") fase++;
      else if (k === "marco") marco++;
      else atividade++;
    });
    return { total: real.length, fase, marco, atividade };
  })();

  return (
    <div className="space-y-2.5">
      {/* Barra de visão: legenda de contexto (esq.) + controles (dir.) */}
      {backlogActs.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-0.5">
          {/* Legenda de contexto — total + quebra por tipo */}
          <p className="text-[13px] text-muted-foreground flex items-center gap-2 flex-wrap">
            {selectMode && selectedIds.size > 0 ? (
              <span className="text-foreground font-medium">{selectedIds.size} de {typeCounts.total} selecionada(s)</span>
            ) : (
              <>
                <span><span className="text-foreground font-semibold">{typeCounts.total}</span> tarefas</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground/90">
                  {[
                    typeCounts.fase && `${typeCounts.fase} fase${typeCounts.fase > 1 ? "s" : ""}`,
                    typeCounts.atividade && `${typeCounts.atividade} atividade${typeCounts.atividade > 1 ? "s" : ""}`,
                    typeCounts.marco && `${typeCounts.marco} marco${typeCounts.marco > 1 ? "s" : ""}`,
                  ].filter(Boolean).join(" · ")}
                </span>
              </>
            )}
          </p>

          {/* Controles de visão */}
          <div className="flex items-center gap-1.5">
            {selectMode && selectedIds.size > 0 && (
              <>
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Selecionar todas" className="ml-1" />
                <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setMoveDialogOpen(true)}>
                  <ArrowRight className="w-3.5 h-3.5" /> Mudar status ({selectedIds.size})
                </Button>
              </>
            )}
            {/* Agrupar em raias — mesmo modelo do Kanban */}
            <Select value={groupBy} onValueChange={(v) => changeGroupBy(v as GroupBy)}>
              <SelectTrigger className="h-7 w-[136px] text-[13px] gap-1.5">
                <Rows3 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phase">Fase</SelectItem>
                <SelectItem value="assignee">Responsável</SelectItem>
                <SelectItem value="priority">Prioridade</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="type">Tipo</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon" variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => {
                if (groupBy === "phase") { setCollapsedPhases(new Set()); setCollapsedParents(new Set()); }
                else setCollapsedLanes(new Set());
              }}
              title="Expandir tudo"
            >
              <ChevronsUpDown className="w-4 h-4" />
            </Button>
            <Button
              size="icon" variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => {
                if (groupBy === "phase") {
                  const allPhaseIds = phases.map(p => p.id);
                  const parentIds = backlogActs.filter(a => (childrenByParent.get(a.id) || []).length > 0).map(a => a.id);
                  setCollapsedPhases(new Set(allPhaseIds));
                  setCollapsedParents(new Set(parentIds));
                } else {
                  setCollapsedLanes(new Set(lanes.map((l) => l.id)));
                }
              }}
              title="Recolher tudo"
            >
              <ChevronsDownUp className="w-4 h-4" />
            </Button>
            {/* Menu de ações secundárias */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Mais ações">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSelectMode((v) => { if (v) setSelectedIds(new Set()); return !v; })}>
                  <MousePointerSquareDashed className="w-4 h-4 mr-2" />
                  {selectMode ? "Sair da seleção" : "Selecionar em lote"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Phase groups — tabela única com cabeçalho de colunas no topo */}
      {/* Sem rolagem lateral: as colunas são elásticas (minmax em BACKLOG_COLS)
          e encolhem até caber. Antes as larguras eram fixas e somavam ~760px,
          então a coluna de AÇÕES — a última — saía da tela e o botão de
          arquivar ficava inalcançável. */}
      <div ref={tableRef} className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Sem botão de criar fase aqui: a entrada do backlog é "Nova
            Atividade" (ou importar a EAP, que já cria as fases). Fase avulsa
            criada antes de existir qualquer tarefa só produzia um agrupador
            vazio que o usuário depois não sabia como remover. */}
        {phases.length === 0 && backlogActs.length === 0 && (
          <div className="p-8 text-center">
            <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma atividade ainda</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Use <span className="font-medium">Nova Atividade</span> para começar, ou <span className="font-medium">Importar EAP</span> para trazer a estrutura pronta.
            </p>
          </div>
        )}

        {backlogActs.length > 0 && <ColumnHeader />}

        {/* Modo raia (Agrupar por ≠ Fase): grupos planos por dimensão */}
        {groupBy !== "phase" && lanes.map((lane) => {
          const isCollapsed = collapsedLanes.has(lane.id);
          // Modo raia: itens já são planos — conta direto, sem recursão.
          const progTotal = lane.items.length;
          const progDone = lane.items.filter((a) => a.status === "completed").length;
          const progPct = progTotal > 0 ? Math.round((progDone / progTotal) * 100) : 0;
          return (
            <div key={lane.id}>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
                <button
                  type="button"
                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground shrink-0"
                  onClick={() => toggleLane(lane.id)}
                >
                  {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <h4 className="text-[13px] font-semibold text-foreground truncate">{lane.label}</h4>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{lane.items.length}</span>
                <div className="flex items-center gap-3 ml-auto">
                  {progTotal > 0 && (
                    <span className="flex items-center gap-1.5" title={`${progDone} de ${progTotal} concluída(s)`}>
                      <span className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
                        <span className="block h-full rounded-full bg-success transition-all" style={{ width: `${progPct}%` }} />
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{progDone}/{progTotal}</span>
                    </span>
                  )}
                </div>
              </div>
              {!isCollapsed && (
                <div>
                  {lane.items.map((a) => renderActivityRow(a, 0, true))}
                </div>
              )}
            </div>
          );
        })}
        {groupBy !== "phase" && lanes.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {hasActiveFilters ? "Nenhuma tarefa visível com os filtros atuais." : "Nenhuma tarefa para agrupar por esta dimensão."}
          </div>
        )}

        {/* Modo Fase (padrão): árvore EAP completa */}
        {groupBy === "phase" && phases.map((p) => renderPhaseGroup(p.id, p.title))}

        {/* Atividades-fase (item_type='fase') em qualquer nível top-level viram cards de fase virtuais */}
        {groupBy === "phase" && virtualPhaseActs.map((vp) => renderVirtualPhase(vp))}

        {/* "Sem fase" só aparece quando REALMENTE tem tarefa solta: um grupo
            vazio permanente é ruído, ainda mais num backlog organizado por fases.
            Ele existia sempre porque era o único "+ Tarefa" para criar item sem
            fase — mas isso já é coberto pelo "Nova Atividade" no topo, que
            cria no nível principal. */}
        {groupBy === "phase" && (topLevelByPhase.get("none") || []).length > 0 &&
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