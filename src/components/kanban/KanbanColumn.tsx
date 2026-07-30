'use client';
import { useState, useMemo, useCallback } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Pencil,
  Trash2,
  CheckCircle2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  MoreHorizontal,
  Check,
  X as XIcon,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronsRight,
  ChevronsLeft,
  LayoutGrid,
  Layers,
  Search,
  Filter,
} from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkflowStageManager } from "@/components/WorkflowStageManager";
import { getBlockedDays, formatBlockedDays } from "@/lib/blockedTime";
import { KANBAN_TOKENS } from "@/lib/kanbanTokens";
import { computeActivityProgress, type ActivityProgress } from "@/lib/activityProgress";

import { normalizeGut, type GutLevel } from "@/lib/gutPriority";

import {
  suggestCategoryFromTitle,
  categoryFromLegacyFlags,
  parseWorkflowCategory,
  type WorkflowCategory,
} from "@/lib/workflowCategory";

import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";

import { computeCardAging, CARD_AGING_CLASSES } from "@/lib/cardAging";
import { cn } from "@/lib/utils";
import {
  progressLabelFromPercent,
  getStageDisplayTitle,
  STAGE_PRESET_COLORS,
  SORT_CRITERIA,
  DEFAULT_BOARD_SORT,
  MIN_COLUMN_WIDTH,
  EMPTY_COLUMN_FILTER,
  columnFilterActive,
  type CardFields,
  type WorkflowStage,
  type Phase,
  type Activity,
  type ColumnFilter,
  type HoursStat,
} from "./shared";
import { KanbanCard, SortableKanbanCard } from "./KanbanCard";

// Peso de cada nível GUT para ordenação por prioridade (menor = mais urgente).
const PRIORITY_WEIGHT: Record<GutLevel, number> = { urgente: 0, critica: 1, alta: 2, media: 3, baixa: 4, pendente: 5 };

// Lista de opções em linhas compactas com checkbox (padrão Linear/Notion).
// Substitui os chips grandes; mostra busca quando há muitas opções.
export function FilterOptionList({
  options, selected, onToggle, dot, searchable, searchPlaceholder = "Buscar...",
}: {
  options: { value: string; label: string }[];
  selected: (v: string) => boolean;
  onToggle: (v: string) => void;
  dot?: (v: string) => string | undefined;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const showSearch = searchable ?? options.length > 8;
  const filtered = q.trim() ? options.filter((o) => norm(o.label).includes(norm(q.trim()))) : options;
  return (
    <div className="space-y-1">
      {showSearch && (
        <div className="relative mb-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="h-8 pl-8 text-xs" />
        </div>
      )}
      <div className="max-h-[200px] overflow-y-auto -mx-1 px-1">
        {filtered.length === 0 && <div className="px-2 py-4 text-center text-xs text-muted-foreground">Nada encontrado</div>}
        {filtered.map((o) => {
          const on = selected(o.value);
          const d = dot?.(o.value);
          return (
            <button key={o.value} type="button" onClick={() => onToggle(o.value)}
              className={cn("w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                on ? "bg-primary/10 text-primary" : "hover:bg-muted/60")}>
              <span className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                on ? "bg-primary border-primary" : "border-input")}>
                {on && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
              </span>
              {d && <span className={cn("w-2 h-2 rounded-full shrink-0", d)} />}
              <span className="truncate flex-1">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Painel de filtro POR COLUNA (Frente B). Reaproveita o mesmo layout accordion
// do filtro geral, sem "Coluna/Status". Estado vem por props (do pai).
export function ColumnFilterPanel({
  stageId, filter, onChange,
  assigneeOptions, sectorOptions, participantOptions, tagOptions,
  profilesMap,
}: {
  stageId: string;
  filter: ColumnFilter;
  onChange: (stageId: string, next: ColumnFilter) => void;
  assigneeOptions: string[];
  sectorOptions: string[];
  participantOptions: string[];
  tagOptions: string[];
  profilesMap: Record<string, string>;
}) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const active = columnFilterActive(filter);
  const activeCount =
    filter.assignees.length + filter.priorities.length + filter.sectors.length +
    filter.types.length + filter.participants.length + filter.tags.length +
    (filter.dueRange.from || filter.dueRange.to ? 1 : 0) +
    (filter.startRange.from || filter.startRange.to ? 1 : 0) +
    (filter.hoursRange.min || filter.hoursRange.max ? 1 : 0) +
    (filter.blocked ? 1 : 0);

  const toggleArr = (arr: string[], v: string) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  const set = (patch: Partial<ColumnFilter>) => onChange(stageId, { ...filter, ...patch });

  const PRIORITIES: [string, string, string][] = [
    ["urgente", "Urgente", "bg-red-500"], ["critica", "Crítica", "bg-orange-500"],
    ["alta", "Alta", "bg-amber-500"], ["media", "Média", "bg-sky-500"], ["baixa", "Baixa", "bg-emerald-500"],
  ];
  const EAP: [string, string][] = [["fase", "Fase / Entrega"], ["atividade", "Atividade"], ["marco", "Marco"]];

  const Section = ({ id, label, summary, on, children }: { id: string; label: string; summary: string; on: boolean; children: React.ReactNode }) => {
    const open = openSection === id;
    return (
      <div className="border-b last:border-b-0">
        <button type="button" onClick={() => setOpenSection(open ? null : id)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors">
          <span className="text-[13px] font-medium text-foreground">{label}</span>
          <span className={cn("ml-auto text-xs truncate max-w-[120px]", on ? "text-primary font-medium" : "text-muted-foreground")}>{summary}</span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        {open && <div className="px-4 pb-3 pt-0.5">{children}</div>}
      </div>
    );
  };
  const sumSet = (a: string[], all = "Todos") => a.length === 0 ? all : a.length === 1 ? a[0] : `${a.length} selecionados`;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setOpenSection(null); }}>
      <PopoverTrigger asChild>
        <button type="button"
          className={cn("h-5 w-5 flex items-center justify-center rounded hover:bg-accent transition-colors",
            active ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          // dnd-kit sequestra o pointerdown do header: paramos só na fase de
          // captura para o drag não iniciar, mas deixamos o Radix (via onClick do
          // PopoverTrigger) alternar a abertura normalmente.
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          title="Filtrar apenas esta coluna">
          <Filter className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[290px] p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Filtros</span>
          <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent-soft text-primary bg-primary/10">só esta coluna</span>
          {active && (
            <button type="button" onClick={() => onChange(stageId, EMPTY_COLUMN_FILTER)}
              className="ml-auto text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1">
              <XIcon className="w-3.5 h-3.5" /> Limpar
            </button>
          )}
        </div>

        <Section id="assignee" label="Responsável" summary={filter.assignees.length === 0 ? "Todos" : filter.assignees.length === 1 ? (profilesMap[filter.assignees[0]] ?? filter.assignees[0]) : `${filter.assignees.length} selecionados`} on={filter.assignees.length > 0}>
          <FilterOptionList
            options={assigneeOptions.map((n) => ({ value: n, label: profilesMap[n] ?? n }))}
            selected={(v) => filter.assignees.includes(v)}
            onToggle={(v) => set({ assignees: toggleArr(filter.assignees, v) })}
            searchPlaceholder="Buscar pessoa..."
          />
        </Section>

        <Section id="priority" label="Prioridade" summary={sumSet(filter.priorities, "Todas")} on={filter.priorities.length > 0}>
          <FilterOptionList
            options={PRIORITIES.map(([v, label]) => ({ value: v, label }))}
            selected={(v) => filter.priorities.includes(v)}
            onToggle={(v) => set({ priorities: toggleArr(filter.priorities, v) })}
            dot={(v) => PRIORITIES.find((p) => p[0] === v)?.[2]}
          />
        </Section>

        {sectorOptions.length > 0 && (
          <Section id="sector" label="Setor" summary={sumSet(filter.sectors)} on={filter.sectors.length > 0}>
            <FilterOptionList
              options={[...sectorOptions.map((s) => ({ value: s, label: s })), { value: "__none__", label: "Sem setor" }]}
              selected={(v) => filter.sectors.includes(v)}
              onToggle={(v) => set({ sectors: toggleArr(filter.sectors, v) })}
            />
          </Section>
        )}

        <Section id="type" label="Tipo (EAP)" summary={sumSet(filter.types)} on={filter.types.length > 0}>
          <FilterOptionList
            options={EAP.map(([v, label]) => ({ value: v, label }))}
            selected={(v) => filter.types.includes(v)}
            onToggle={(v) => set({ types: toggleArr(filter.types, v) })}
          />
        </Section>

        {participantOptions.length > 0 && (
          <Section id="participant" label="Participante" summary={sumSet(filter.participants)} on={filter.participants.length > 0}>
            <FilterOptionList
              options={participantOptions.map((p) => ({ value: p, label: profilesMap[p] ?? p }))}
              selected={(v) => filter.participants.includes(v)}
              onToggle={(v) => set({ participants: toggleArr(filter.participants, v) })}
              searchPlaceholder="Buscar participante..."
            />
          </Section>
        )}

        {tagOptions.length > 0 && (
          <Section id="tags" label="Etiquetas" summary={sumSet(filter.tags, "Todas")} on={filter.tags.length > 0}>
            <FilterOptionList
              options={tagOptions.map((t) => ({ value: t, label: t }))}
              selected={(v) => filter.tags.includes(v)}
              onToggle={(v) => set({ tags: toggleArr(filter.tags, v) })}
              searchPlaceholder="Buscar etiqueta..."
            />
          </Section>
        )}

        <Section id="due" label="Prazo" summary={filter.dueRange.from || filter.dueRange.to ? "Definido" : "Qualquer"} on={!!(filter.dueRange.from || filter.dueRange.to)}>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">De</label>
              <Input type="date" value={filter.dueRange.from} onChange={(e) => set({ dueRange: { ...filter.dueRange, from: e.target.value } })} className="h-8 text-xs flex-1" /></div>
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">Até</label>
              <Input type="date" value={filter.dueRange.to} onChange={(e) => set({ dueRange: { ...filter.dueRange, to: e.target.value } })} className="h-8 text-xs flex-1" /></div>
          </div>
        </Section>

        <Section id="start" label="Início" summary={filter.startRange.from || filter.startRange.to ? "Definido" : "Qualquer"} on={!!(filter.startRange.from || filter.startRange.to)}>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">De</label>
              <Input type="date" value={filter.startRange.from} onChange={(e) => set({ startRange: { ...filter.startRange, from: e.target.value } })} className="h-8 text-xs flex-1" /></div>
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">Até</label>
              <Input type="date" value={filter.startRange.to} onChange={(e) => set({ startRange: { ...filter.startRange, to: e.target.value } })} className="h-8 text-xs flex-1" /></div>
          </div>
        </Section>

        <Section id="hours" label="Horas" summary={filter.hoursRange.min || filter.hoursRange.max ? "Definido" : "Qualquer"} on={!!(filter.hoursRange.min || filter.hoursRange.max)}>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><label className="w-10 text-xs text-muted-foreground shrink-0">Mín</label>
              <Input type="number" min="0" value={filter.hoursRange.min} onChange={(e) => set({ hoursRange: { ...filter.hoursRange, min: e.target.value } })} className="h-8 text-xs flex-1" /></div>
            <div className="flex items-center gap-2"><label className="w-10 text-xs text-muted-foreground shrink-0">Máx</label>
              <Input type="number" min="0" value={filter.hoursRange.max} onChange={(e) => set({ hoursRange: { ...filter.hoursRange, max: e.target.value } })} className="h-8 text-xs flex-1" /></div>
          </div>
        </Section>

        <div className="border-b last:border-b-0">
          <button type="button" onClick={() => set({ blocked: !filter.blocked })}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors">
            <span className="text-[13px] font-medium text-foreground">Apenas bloqueadas</span>
            <span className={cn("ml-auto w-9 h-5 rounded-full relative transition-colors shrink-0", filter.blocked ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform", filter.blocked && "translate-x-4")} />
            </span>
          </button>
        </div>

        {active && (
          <div className="px-4 py-2 border-t bg-muted/30 text-[11px] text-muted-foreground">
            {activeCount} filtro{activeCount > 1 ? "s" : ""} nesta coluna
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function SortableColumn({
  stage,
  stageActivities,
  activities,
  phases,
  widthPct,
  isLast,
  onEditActivity,
  onDeleteActivity,
  onToggleActivity,
  onMoveToStage,
  moveTargets,
  onDuplicateActivity,
  onToggleBlocked,
  onLinkParent,
  onCreateActivity,
  storyLinkedActivities,
  isAdmin,
  canCreate,
  onResizeStart,
  onStoryClick,
  onCreateStory,
  isQualityProject,
  onOpenCreateTask,
  subActivityCounts,
  hoursStatsByActivity,
  dependencyCounts,
  waitingOnCounts,
  commentCounts,
  attachmentCounts,
  relationCounts,
  onOpenRelated,
  onRemoveRelation,
  isAdminOrGestor,
  onRenameStage,
  onDeleteStage,
  onChangeStageColor,
  onSetStageProgress,
  onSetStageWipLimit,
  onToggleStageWipStrict,
  onToggleStageContributes,
  onToggleStageFinal,
  onToggleStageBlocked,
  onToggleStageVisible,
  allStages,
  cardFields,
  profilesMap = {},
  profileAvatarMap = {},
  laneId,
  collapsed = false,
  onToggleCollapse,
  columnFilterSlot,
  selectedIds,
  onToggleSelect,
}: {
  stage: WorkflowStage;
  stageActivities: Activity[];
  laneId?: string;
  collapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  columnFilterSlot?: React.ReactNode;
  /** Seleção para ação em lote (Set compartilhado do quadro). */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  activities: Activity[];
  phases: Phase[];
  widthPct: number;
  isLast: boolean;
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  onToggleActivity: (activityId: string, currentStatus: string) => void;
  onMoveToStage: (activityId: string, stageId: string) => void;
  moveTargets?: { id: string; title: string; color: string }[];
  onDuplicateActivity?: (activityId: string) => void;
  onToggleBlocked: (activityId: string) => void;
  onLinkParent?: (activityId: string, currentParentId: string | null) => void;
  onCreateActivity: (stageId: string, title: string, phaseId: string | null, displayOrder: number | null) => Promise<void>;
  storyLinkedActivities: Map<string, number>;
  isAdmin?: boolean;
  canCreate?: boolean;
  onResizeStart: (e: React.MouseEvent, stageId: string, widthPct: number) => void;
  onStoryClick: (activityId: string) => void;
  onCreateStory: (activity: Activity) => void;
  isQualityProject?: boolean;
  onOpenCreateTask?: (stageId: string) => void;
  subActivityCounts: Map<string, number>;
  dependencyCounts?: Map<string, { pred: number; succ: number }>;
  waitingOnCounts?: Map<string, number>;
  commentCounts?: Map<string, number>;
  attachmentCounts?: Map<string, number>;
  relationCounts?: Map<string, { id: string; title: string; relationId: string; relationType: string }[]>;
  onOpenRelated?: (activityId: string) => void;
  onRemoveRelation?: (relationId: string) => void;
  isAdminOrGestor?: boolean;
  onRenameStage: (id: string, title: string) => Promise<void>;
  onDeleteStage: (id: string) => Promise<void>;
  onChangeStageColor: (id: string, color: string) => Promise<void>;
  onSetStageProgress: (id: string, current: number | null | undefined) => Promise<void>;
  onSetStageWipLimit: (id: string, current: number | null | undefined) => Promise<void>;
  onToggleStageWipStrict?: (id: string, current: boolean) => Promise<void>;
  onToggleStageContributes: (id: string, current: boolean | undefined) => Promise<void>;
  onToggleStageFinal: (id: string, current: boolean) => Promise<void>;
  onToggleStageBlocked: (id: string, current: boolean) => Promise<void>;
  onToggleStageVisible: (id: string, current: boolean) => Promise<void>;
  allStages: WorkflowStage[];
  cardFields: CardFields;
  hoursStatsByActivity?: Map<string, HoursStat>;
  profilesMap?: Record<string, string>;
  profileAvatarMap?: Record<string, string>;
}) {
  // Ordenação por coluna, independente das demais (comportamento original).
  const [colSort, setColSort] = useState<string>(DEFAULT_BOARD_SORT);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPhase, setQuickPhase] = useState("");
  const [quickOrder, setQuickOrder] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(stage.title);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Map: parentId -> list of children, ordered by display_order
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Activity[]>();
    activities.forEach((a) => {
      if (a.parent_id) {
        if (!map.has(a.parent_id)) map.set(a.parent_id, []);
        map.get(a.parent_id)!.push(a);
      }
    });
    map.forEach((arr) =>
      arr.sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999)),
    );
    return map;
  }, [activities]);

  const descendantSummaryById = useMemo(() => {
    const memo = new Map<string, { completed: number; pending: number }>();

    const walk = (id: string, seen = new Set<string>()): { completed: number; pending: number } => {
      if (memo.has(id)) return memo.get(id)!;
      if (seen.has(id)) return { completed: 0, pending: 0 };

      const nextSeen = new Set(seen);
      nextSeen.add(id);

      const children = childrenByParent.get(id) || [];
      let completed = 0;
      let pending = 0;

      children.forEach((child) => {
        if (child.status === "completed") completed += 1;
        else pending += 1;

        const deep = walk(child.id, nextSeen);
        completed += deep.completed;
        pending += deep.pending;
      });

      const summary = { completed, pending };
      memo.set(id, summary);
      return summary;
    };

    activities.forEach((a) => {
      memo.set(a.id, walk(a.id));
    });

    return memo;
  }, [activities, childrenByParent]);

  const descendantProgressById = useMemo(() => {
    const memo = new Map<string, { sum: number; count: number }>();

    const walk = (id: string, seen = new Set<string>()): { sum: number; count: number } => {
      if (memo.has(id)) return memo.get(id)!;
      if (seen.has(id)) return { sum: 0, count: 0 };

      const nextSeen = new Set(seen);
      nextSeen.add(id);

      const children = childrenByParent.get(id) || [];
      let sum = 0;
      let count = 0;

      children.forEach((child) => {
        const info = computeActivityProgress(child.workflow_stage_id, allStages, child.last_progress_stage_id);
        const pct = info.paused ? 0 : (info.percent ?? 0);
        sum += pct;
        count += 1;

        const deep = walk(child.id, nextSeen);
        sum += deep.sum;
        count += deep.count;
      });

      const result = { sum, count };
      memo.set(id, result);
      return result;
    };

    activities.forEach((a) => {
      memo.set(a.id, walk(a.id));
    });

    return memo;
  }, [activities, childrenByParent, allStages]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    // Em raias (laneId presente) a coluna nao e reordenavel — evita ids de dnd
    // duplicados no mesmo contexto (a mesma coluna aparece em cada raia).
    useSortable({ id: `col-${stage.id}`, disabled: !!laneId });

  // Visual ClickUp-like: colunas com fundo claro neutro e uma fina faixa colorida no topo
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    // `1 1 X%` sozinho deixava as colunas se comprimirem sem limite: com 7
    // colunas cada uma ficava com ~14% e o card virava uma tira, com título
    // quebrando em três linhas. minWidth trava o encolhimento e o quadro passa
    // a rolar na horizontal — é assim que Trello, Jira e ClickUp se comportam.
    flex: `1 1 ${widthPct}%`,
    minWidth: MIN_COLUMN_WIDTH,
    marginRight: isLast ? 0 : 8,
    borderTop: `3px solid ${stage.color}`,
    // Fundo cinza neutro (token dedicado, sem o matiz azul do --muted).
    backgroundColor: "hsl(var(--kanban-col-bg))",
  };

  const stageActivityIds = useMemo(() => new Set(stageActivities.map((a) => a.id)), [stageActivities]);

  const sortStageItems = useCallback((list: Activity[]) => {
    const phaseOrderMap: Record<string, number> = {};
    phases.forEach((p, i) => { phaseOrderMap[p.id] = i; });
    // colSort = "criterio:dir" (ex.: "due:asc"). Cada critério define uma ordem
    // base ascendente; a direção só inverte o resultado.
    const [criterion, dir = "asc"] = colSort.split(":");
    const cmp = (a: Activity, b: Activity): number => {
      switch (criterion) {
        case "wbs": {
          const pA = a.phase_id ? (phaseOrderMap[a.phase_id] ?? 999) : 999;
          const pB = b.phase_id ? (phaseOrderMap[b.phase_id] ?? 999) : 999;
          if (pA !== pB) return pA - pB;
          return (a.display_order ?? 9999) - (b.display_order ?? 9999);
        }
        case "updated":
          return new Date(a.updated_at || a.created_at).getTime() - new Date(b.updated_at || b.created_at).getTime();
        case "priority":
          return (PRIORITY_WEIGHT[normalizeGut(a.priority)] ?? 5) - (PRIORITY_WEIGHT[normalizeGut(b.priority)] ?? 5);
        case "due": {
          const da = a.end_date ? new Date(a.end_date).getTime() : Infinity;
          const db = b.end_date ? new Date(b.end_date).getTime() : Infinity;
          return da - db;
        }
        case "assigned":
          return (a.assigned_to || "zzz").localeCompare(b.assigned_to || "zzz");
        case "hours":
          return (Number(a.hours) || 0) - (Number(b.hours) || 0);
        case "title":
          return (a.title || "").localeCompare(b.title || "");
        default:
          return 0;
      }
    };
    const sorted = [...list].sort((a, b) => (dir === "desc" ? -cmp(a, b) : cmp(a, b)));
    return sorted;
  }, [colSort, phases]);

  const rootStageActivities = useMemo(() => {
    return sortStageItems(
      stageActivities.filter((a) => {
        if (!a.parent_id) return true;
        // Subtarefa: só esconde da raiz se o PAI também estiver nesta coluna
        // (nesse caso ela aparece aninhada sob o pai). Caso contrário, aparece
        // como card independente com breadcrumb do pai.
        return !stageActivityIds.has(a.parent_id);
      })
    );
  }, [stageActivities, stageActivityIds, sortStageItems]);

  const sortedActivities = rootStageActivities;

  const visibleCardCount = useMemo(() => {
    return sortedActivities.reduce((total, activity) => {
      const inlineChildren = (childrenByParent.get(activity.id) || []).filter((child) => stageActivityIds.has(child.id));
      return total + 1 + (expandedIds.has(activity.id) ? inlineChildren.length : 0);
    }, 0);
  }, [sortedActivities, childrenByParent, stageActivityIds, expandedIds]);

  const dCol = KANBAN_TOKENS;

  // Renderiza um card e, se expandido, seus filhos — RECURSIVAMENTE, de modo que
  // fase → pacote → atividade (netos e além) apareçam ao expandir. Cada filho
  // recebe sua contagem real e seu próprio controle de expansão.
  // `ancestors` protege contra ciclos em parent_id (dado corrompido) — sem isso
  // um ciclo A↔B travaria a aba num loop infinito de render.
  const renderActivityNode = (
    activity: Activity,
    depth: number,
    ancestors: Set<string> = new Set(),
  ): React.ReactNode => {
    if (ancestors.has(activity.id)) return null;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(activity.id);
    const allChildren = childrenByParent.get(activity.id) || [];
    const inlineChildren = allChildren.filter((child) => stageActivityIds.has(child.id));
    const externalChildren = allChildren.filter((child) => !stageActivityIds.has(child.id));
    const subActivityStatusSummary =
      descendantSummaryById.get(activity.id) || { completed: 0, pending: 0 };
    const parentProgress = (() => {
      const deepProgress = descendantProgressById.get(activity.id);
      const totalSubs = deepProgress?.count || 0;
      if (totalSubs === 0) {
        return computeActivityProgress(activity.workflow_stage_id, allStages, activity.last_progress_stage_id);
      }
      const percent = Math.max(0, Math.min(100, Math.round((deepProgress!.sum / totalSubs))));
      return { percent, paused: false, label: progressLabelFromPercent(percent) } as ActivityProgress;
    })();
    const expanded = expandedIds.has(activity.id);
    const isMirrorParent = !stageActivityIds.has(activity.id) && inlineChildren.length > 0;
    const parentAct = activity.parent_id ? activities.find((p) => p.id === activity.parent_id) : null;
    const parentBreadcrumb = parentAct && parentAct.workflow_stage_id !== activity.workflow_stage_id
      ? { id: parentAct.id, title: parentAct.title, wbsCode: parentAct.wbs_code }
      : null;
    // Subtarefas impedidas: agora pela flag da própria atividade, não por
    // estarem numa coluna de bloqueio.
    const blockedSubsCount = allChildren.filter((c) => c.is_blocked).length;

    const commonCardProps = {
      activity,
      phases,
      onEdit: () => onEditActivity(activity),
      onDelete: () => onDeleteActivity(activity.id),
      onToggle: () => onToggleActivity(activity.id, activity.status),
      onMoveToStage: (stageId: string) => onMoveToStage(activity.id, stageId),
      moveTargets,
      onDuplicate: onDuplicateActivity ? () => onDuplicateActivity(activity.id) : undefined,
      onLinkParent: () => onLinkParent?.(activity.id, activity.parent_id ?? null),
      isAdmin,
      // "block in place": o bloqueio é da ATIVIDADE, não da coluna — o card
      // fica onde o trabalho está e segue contando no limite de WIP.
      isBlocked: !!activity.is_blocked,
      onToggleBlocked: () => onToggleBlocked(activity.id),
      hasStory: storyLinkedActivities.has(activity.id),
      storyCount: storyLinkedActivities.get(activity.id) || 0,
      onStoryClick: () => onStoryClick(activity.id),
      onCreateStory: () => onCreateStory(activity),
      isQualityProject,
      stageColor: stage.color,
      dependencyCount: dependencyCounts?.get(activity.id),
      waitingOnCount: waitingOnCounts?.get(activity.id),
      commentCount: commentCounts?.get(activity.id),
      attachmentCount: attachmentCounts?.get(activity.id),
      relationItems: relationCounts?.get(activity.id) || [],
      onOpenRelated,
      onRemoveRelation,
      subActivityCount: allChildren.length,
      isExpanded: expanded,
      onToggleExpand: () => toggleExpanded(activity.id),
      progress: parentProgress,
      cardFields,
      parentBreadcrumb,
      blockedSubsCount,
      subActivityStatusSummary,
      hoursStat: hoursStatsByActivity?.get(activity.id),
      selected: selectedIds?.has(activity.id) ?? false,
      onToggleSelect: onToggleSelect ? () => onToggleSelect(activity.id) : undefined,
      profilesMap,
      profileAvatarMap,
    };

    return (
      <div key={activity.id} className={dCol.colBodyGap}>
        {isMirrorParent ? (
          <KanbanCard {...commonCardProps} readOnlyPreview />
        ) : depth === 0 ||
          (stageActivityIds.has(activity.id) &&
            activity.parent_id &&
            stageActivityIds.has(activity.parent_id)) ? (
          // Raiz OU filho aninhado cuja cadeia está NESTA coluna: arrastável.
          // A SortableContext da coluna já lista todos os ids do stage, então o
          // filho só precisa montar o useSortable. A condição do pai evita id
          // duplicado: filho de pai em OUTRA coluna já aparece como card raiz
          // aqui (com breadcrumb), e duas instâncias sortable do mesmo id
          // quebram o dnd-kit.
          <SortableKanbanCard {...commonCardProps} />
        ) : (
          <KanbanCard {...commonCardProps} />
        )}
        {expanded && (inlineChildren.length > 0 || externalChildren.length > 0) && (
          <div className="ml-4 pl-2 border-l-2 border-primary/30 space-y-1.5">
            {isMirrorParent && (
              <div className="px-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5 text-primary border-primary/20">
                  Pai agrupador
                </Badge>
              </div>
            )}
            {inlineChildren.map((child) => renderActivityNode(child, depth + 1, nextAncestors))}
            {externalChildren.map((child) => {
              const childStage = allStages.find((s) => s.id === child.workflow_stage_id);
              return (
                <div key={child.id} className="space-y-1">
                  {childStage && (
                    <div className="flex items-center gap-1.5 px-1">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide text-white"
                        style={{ backgroundColor: childStage.color }}
                        title={`Esta subtarefa está em "${getStageDisplayTitle(childStage.title)}"`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                        {getStageDisplayTitle(childStage.title)}
                      </span>
                    </div>
                  )}
                  {renderActivityNode(child, depth + 1, nextAncestors)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        // minWidth precisa ser anulado: o spread traz MIN_COLUMN_WIDTH e a
        // coluna recolhida tem largura fixa de 44px.
        style={{ ...style, flex: "0 0 auto", width: 44, minWidth: 44 }}
        {...attributes}
        className="relative rounded-lg border bg-card border-border flex flex-col items-center overflow-hidden shadow-sm cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => onToggleCollapse?.(stage.id)}
        title={`${getStageDisplayTitle(stage.title)} · ${visibleCardCount} card(s) — clique para expandir`}
      >
        <div className="flex flex-col items-center gap-2 py-2 h-full w-full">
          <ChevronsRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <Badge variant="secondary" className="text-[10px] px-1 py-0 min-w-[18px] text-center shrink-0">
            {visibleCardCount}
          </Badge>
          <div
            className="text-[11px] font-semibold text-muted-foreground mt-1 whitespace-nowrap"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {getStageDisplayTitle(stage.title)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="group/col relative min-w-0 rounded-lg border border-border flex flex-col overflow-hidden shadow-sm"
    >
      {/* Column Header - drag handle for column reordering */}
      <div className={`${dCol.colHeaderPad} border-b border-border/60`} style={{ backgroundColor: "hsl(var(--kanban-col-head))" }}>
        <div className="flex items-center justify-between cursor-grab active:cursor-grabbing" {...listeners}>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={() => {
                  if (renameValue.trim() && renameValue.trim() !== stage.title) {
                    onRenameStage(stage.id, renameValue.trim());
                  }
                  setRenaming(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (renameValue.trim() && renameValue.trim() !== stage.title) {
                      onRenameStage(stage.id, renameValue.trim());
                    }
                    setRenaming(false);
                  } else if (e.key === "Escape") {
                    setRenameValue(stage.title);
                    setRenaming(false);
                  }
                }}
                className={`${dCol.colHeaderTitle} font-semibold text-foreground bg-transparent border-b border-border outline-none w-32`}
              />
            ) : (
              <h3 className={`${dCol.colHeaderTitle} font-semibold text-foreground truncate`}>
                {getStageDisplayTitle(stage.title)}
              </h3>
            )}
            {/* A categoria NÃO é exibida ao lado do título: com várias colunas
                classificadas como "andamento", o cabeçalho passava a repetir
                "EM ANDAMENTO" quadro afora e dava a impressão de que os nomes
                das colunas tinham mudado. Ela vive no menu da coluna, onde é
                escolhida — e é lá que se confere. */}
            {stage.wip_limit != null && stage.wip_limit > 0 ? (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 min-w-[20px] text-center shrink-0 font-semibold ${
                  visibleCardCount > stage.wip_limit
                    ? "bg-destructive/15 text-destructive border-destructive/40"
                    : visibleCardCount === stage.wip_limit
                    ? "bg-orange-500/15 text-orange-600 border-orange-500/40"
                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
                }`}
                title={
                  visibleCardCount > stage.wip_limit
                    ? `Limite de WIP excedido: ${visibleCardCount} de ${stage.wip_limit}`
                    : `${visibleCardCount} de ${stage.wip_limit} (limite de WIP)`
                }
              >
                {visibleCardCount} / {stage.wip_limit}
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 min-w-[20px] text-center shrink-0"
                title={`${visibleCardCount} card(s) visível(is) nesta coluna`}
              >
                {visibleCardCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Controles secundários (filtro, ordenar, recolher) só no hover:
                cinco ícones fixos competiam com o próprio nome da coluna, que
                em coluna estreita chegava a truncar. Criar e o menu ficam
                sempre visíveis, por serem as ações do dia a dia. */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover/col:opacity-100 focus-within:opacity-100 transition-opacity">
            {/* Filtro por coluna (Frente B) — construído no pai, injetado aqui */}
            {columnFilterSlot}
            {/* Ordenar cards desta coluna — ícone discreto (era um select de largura total) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "h-5 w-5 flex items-center justify-center rounded hover:bg-accent transition-colors",
                    colSort === DEFAULT_BOARD_SORT ? "text-muted-foreground hover:text-foreground" : "text-primary",
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Ordenar cards desta coluna"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Ordenar por</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(() => {
                  const [activeCrit, activeDir = "asc"] = colSort.split(":");
                  // Padrão Linear/Notion: lista enxuta só com nomes; a direção é a
                  // seta no item ativo — clicar no ativo inverte.
                  return SORT_CRITERIA.map((c) => {
                    const isActive = activeCrit === c.id;
                    const nextDir = isActive ? (activeDir === "asc" ? "desc" : "asc") : c.defaultDir;
                    return (
                      <DropdownMenuItem
                        key={c.id}
                        onSelect={() => setColSort(`${c.id}:${nextDir}`)}
                        className="gap-2 text-xs"
                      >
                        <span className={cn("flex-1", isActive && "font-medium text-primary")}>{c.label}</span>
                        {isActive && (activeDir === "asc"
                          ? <ArrowUp className="w-3.5 h-3.5 text-primary shrink-0" />
                          : <ArrowDown className="w-3.5 h-3.5 text-primary shrink-0" />)}
                      </DropdownMenuItem>
                    );
                  });
                })()}
              </DropdownMenuContent>
            </DropdownMenu>
            {onToggleCollapse && (
              <button
                type="button"
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse(stage.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Recolher coluna"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
            )}
            </div>
            {canCreate && (
              <button
                type="button"
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  // Criação INLINE na coluna, não diálogo: digitar o título e dar
                  // Enter é o gesto padrão (Trello/Linear/Notion) e o form inline
                  // já existia aqui — só estava inalcançável, porque
                  // onOpenCreateTask sempre vinha preenchido e abria o modal.
                  // O formulário completo continua a um clique, dentro do inline.
                  setShowQuickAdd((v) => !v);
                }}
                title="Criar atividade nesta coluna"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            {isAdminOrGestor && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Opções da coluna"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <DropdownMenuLabel className="text-xs">Gerenciar coluna</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      setRenameValue(stage.title);
                      setRenaming(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Renomear
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="focus:bg-muted/60 focus:text-foreground data-[state=open]:bg-muted/60 data-[state=open]:text-foreground">
                      <div className="w-3.5 h-3.5 mr-2 rounded-full" style={{ backgroundColor: stage.color }} />
                      Alterar cor
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent sideOffset={6} className="p-2">
                      <div className="grid grid-cols-4 gap-1.5">
                        {STAGE_PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="w-6 h-6 rounded-full ring-1 ring-border hover:ring-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/40"
                            style={{ backgroundColor: c }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onChangeStageColor(stage.id, c);
                            }}
                          />
                        ))}
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onToggleStageFinal(stage.id, stage.is_final);
                    }}
                    title="Final: atividades nesta coluna passam a representar 100% do fluxo."
                  >
                    <Check className="w-3.5 h-3.5 mr-2 text-success" />
                    {stage.is_final ? "Remover marca de Final" : "Marcar como Final"}
                  </DropdownMenuItem>
                  {/* "Marcar como Bloqueio" saiu daqui: bloqueio é do ITEM, não
                      da coluna. Uma coluna de bloqueio tira o card do fluxo,
                      escapa do limite de WIP e distorce o tempo por etapa —
                      agora se bloqueia pelo próprio card, que fica no lugar. */}
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onSetStageProgress(stage.id, stage.progress_percent ?? null);
                    }}
                    title="Define um percentual fixo para esta coluna. Em branco = automático por posição."
                  >
                    <LayoutGrid className="w-3.5 h-3.5 mr-2" />
                    {stage.progress_percent == null
                      ? "Definir progresso (%)"
                      : `Editar progresso (${stage.progress_percent}%)`}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onSetStageWipLimit(stage.id, stage.wip_limit ?? null);
                    }}
                    title="Limite de cards em andamento (WIP). Em branco = sem limite."
                  >
                    <Layers className="w-3.5 h-3.5 mr-2" />
                    {stage.wip_limit == null
                      ? "Definir limite (WIP)"
                      : `Editar limite WIP (${stage.wip_limit})`}
                  </DropdownMenuItem>
                  {/* Só faz sentido oferecer o modo rígido quando existe limite. */}
                  {stage.wip_limit != null && stage.wip_limit > 0 && onToggleStageWipStrict && (
                    <DropdownMenuItem
                      className="focus:bg-muted/60 focus:text-foreground"
                      onSelect={(e) => {
                        e.preventDefault();
                        onToggleStageWipStrict(stage.id, !!stage.wip_strict);
                      }}
                      title="Rígido: o quadro IMPEDE trazer mais cards ao atingir o limite. Flexível: apenas avisa."
                    >
                      {stage.wip_strict
                        ? <Check className="w-3.5 h-3.5 mr-2 text-success" />
                        : <span className="w-3.5 h-3.5 mr-2" />}
                      {stage.wip_strict ? "Limite rígido (impede)" : "Tornar limite rígido"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onToggleStageContributes(stage.id, stage.contributes_to_progress);
                    }}
                    title="Quando desativado, esta coluna não avança o progresso do fluxo."
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                    {stage.contributes_to_progress === false
                      ? "Incluir no progresso"
                      : "Remover do progresso"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="focus:bg-muted/60 focus:text-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      onToggleStageVisible(stage.id, stage.is_visible);
                    }}
                  >
                    {stage.is_visible ? <EyeOff className="w-3.5 h-3.5 mr-2" /> : <Eye className="w-3.5 h-3.5 mr-2" />}
                    {stage.is_visible ? "Ocultar coluna" : "Mostrar coluna"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      onDeleteStage(stage.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir coluna
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Quick Add Form */}
      {showQuickAdd && canCreate && (
        <div className="px-2 pb-2 space-y-2 border-b border-border/50" onClick={(e) => e.stopPropagation()}>
          <Input
            placeholder="Título da atividade..."
            className="h-8 text-xs"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && quickTitle.trim()) {
                setQuickLoading(true);
                onCreateActivity(stage.id, quickTitle.trim(), quickPhase || null, quickOrder ? parseInt(quickOrder) : null)
                  // Enter cria e MANTÉM o campo aberto (só limpa o título): ao
                  // planejar, criam-se várias tarefas em sequência. Fase e nº EAP
                  // persistem de propósito — costumam repetir entre itens irmãos.
                  // Esc fecha.
                  .then(() => { setQuickTitle(""); })
                  .finally(() => setQuickLoading(false));
              }
              if (e.key === "Escape") setShowQuickAdd(false);
            }}
          />
          {phases.length > 0 && (
            <select
              className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              value={quickPhase}
              onChange={(e) => setQuickPhase(e.target.value)}
            >
              <option value="">Sem fase (EAP)</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          )}
          <Input
            placeholder="Nº EAP (opcional, ex: 1.2.3)"
            className="h-7 text-xs"
            value={quickOrder}
            onChange={(e) => setQuickOrder(e.target.value)}
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              disabled={!quickTitle.trim() || quickLoading}
              onClick={() => {
                setQuickLoading(true);
                onCreateActivity(stage.id, quickTitle.trim(), quickPhase || null, quickOrder ? parseInt(quickOrder) : null)
                  .then(() => { setQuickTitle(""); setQuickPhase(""); setQuickOrder(""); setShowQuickAdd(false); })
                  .finally(() => setQuickLoading(false));
              }}
            >
              {quickLoading ? "Criando..." : "Criar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowQuickAdd(false)}>
              Cancelar
            </Button>
          </div>
          {/* Porta para o formulário completo: o inline cobre o caso comum
              (título, fase, EAP); responsável, prazo, horas e o resto continuam
              a um clique daqui, sem virar pedágio de toda criação. */}
          {onOpenCreateTask && (
            <button
              type="button"
              className="w-full text-[11px] text-muted-foreground hover:text-primary transition-colors text-left"
              onClick={() => { setShowQuickAdd(false); onOpenCreateTask(stage.id); }}
            >
              Mais campos (prazo, responsável…)
            </button>
          )}
        </div>
      )}

      {/* Droppable Column Body */}
      <DroppableColumn stage={stage} laneId={laneId}>
        <SortableContext
          items={stageActivities.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {sortedActivities.length === 0 ? (
            <div className="flex items-center justify-center h-16 border-2 border-dashed border-border/30 rounded-lg">
              <p className="text-[11px] text-muted-foreground/50">Arraste aqui</p>
            </div>
          ) : (
            sortedActivities.map((activity) => renderActivityNode(activity, 0))
          )}
        </SortableContext>
      </DroppableColumn>

      {/* Resize Handle */}
      {!isLast && (
        <div
          className="absolute top-0 -right-[5px] w-[10px] h-full cursor-col-resize z-10 group flex items-center justify-center"
          onMouseDown={(e) => onResizeStart(e, stage.id, widthPct)}
        >
          <div className="w-[3px] h-8 rounded-full bg-border/50 group-hover:bg-primary/60 transition-colors" />
        </div>
      )}
    </div>
  );
}

export function DroppableColumn({
  stage,
  children,
  laneId,
}: {
  stage: WorkflowStage;
  children: React.ReactNode;
  laneId?: string;
}) {
  // Em raias, o id do droppable inclui a raia p/ nao colidir entre raias; o
  // handleDragEnd extrai o stageId (parte antes de "--").
  const { setNodeRef, isOver } = useDroppable({ id: laneId ? `stage-${stage.id}--${laneId}` : `stage-${stage.id}` });
  const d = KANBAN_TOKENS;
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 ${d.colBodyPad} min-h-[120px] rounded-b-xl transition-colors ${
        isOver ? "bg-primary/5 ring-2 ring-primary/20 ring-inset" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function AddStageColumn({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="shrink-0 self-start pt-3 pl-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Adicionar uma coluna ao quadro"
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors whitespace-nowrap"
      >
        <Plus className="w-3 h-3" />
        Nova coluna
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onChanged?.();
        }}
      >
        <DialogContent className="max-w-[750px] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Configurar colunas do quadro</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <WorkflowStageManager projectId={projectId} onChanged={onChanged} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
