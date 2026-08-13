'use client';
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { DateField } from "@/components/ui/date-field";
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
  List,
  Lock,
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

import { compararData } from "@/lib/dataLocal";
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
  getStageDisplayTitle,
  STAGE_PRESET_COLORS,
  SORT_CRITERIA,
  DEFAULT_BOARD_SORT,
  isValidSortValue,
  sortTravaArrasto,
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
              <DateField value={filter.dueRange.from} onChange={(v) => set({ dueRange: { ...filter.dueRange, from: v } })} className="h-8 text-xs flex-1" /></div>
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">Até</label>
              <DateField value={filter.dueRange.to} onChange={(v) => set({ dueRange: { ...filter.dueRange, to: v } })} className="h-8 text-xs flex-1" /></div>
          </div>
        </Section>

        <Section id="start" label="Início" summary={filter.startRange.from || filter.startRange.to ? "Definido" : "Qualquer"} on={!!(filter.startRange.from || filter.startRange.to)}>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">De</label>
              <DateField value={filter.startRange.from} onChange={(v) => set({ startRange: { ...filter.startRange, from: v } })} className="h-8 text-xs flex-1" /></div>
            <div className="flex items-center gap-2"><label className="w-8 text-xs text-muted-foreground shrink-0">Até</label>
              <DateField value={filter.startRange.to} onChange={(v) => set({ startRange: { ...filter.startRange, to: v } })} className="h-8 text-xs flex-1" /></div>
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
  colSort: colSortProp,
  onChangeColSort,
}: {
  stage: WorkflowStage;
  stageActivities: Activity[];
  laneId?: string;
  collapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  columnFilterSlot?: React.ReactNode;
  activities: Activity[];
  phases: Phase[];
  widthPct: number;
  isLast: boolean;
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  onToggleActivity: (activityId: string, currentStatus: string) => void;
  onMoveToStage: (activityId: string, stageId: string) => void;
  moveTargets?: { id: string; title: string; color: string; hidden?: boolean }[];
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
  /** Ordenação desta coluna, vinda das preferências do usuário (banco). */
  colSort?: string;
  onChangeColSort?: (stageId: string, value: string) => void;
}) {
  // Ordenação por coluna, independente das demais. PERSISTE: antes voltava ao
  // padrão a cada recarregamento — quem escolhia "por prazo" reencontrava a
  // coluna na ordem antiga no dia seguinte, sem entender por quê.
  //
  // Desde 12/08/2026 quem guarda é o pai (preferências do usuário no banco,
  // lib/kanbanPrefs). O estado local sobrevive como fallback para uso sem as
  // props — sem ele, a coluna perderia a ordenação em qualquer chamada que
  // ainda não passe o par colSort/onChangeColSort.
  const colSortKey = `kanban-col-sort:${stage.id}`;
  const [colSortLocal, setColSortLocal] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_BOARD_SORT;
    const saved = window.localStorage.getItem(colSortKey);
    return isValidSortValue(saved) ? saved : DEFAULT_BOARD_SORT;
  });
  const controlado = colSortProp !== undefined && onChangeColSort !== undefined;
  const colSort = controlado ? colSortProp : colSortLocal;
  const setColSort = useCallback((v: string) => {
    if (controlado) onChangeColSort!(stage.id, v);
    else {
      setColSortLocal(v);
      try { window.localStorage.setItem(colSortKey, v); } catch { /* quota */ }
    }
  }, [controlado, onChangeColSort, stage.id, colSortKey]);
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

  // (Removido: descendantProgressById — média recursiva do % dos descendentes.
  //  Era uma SEGUNDA fórmula de progresso, que dava número diferente do card
  //  no fluxo principal e nunca sinalizava divergência. O cálculo agora é um
  //  só, em computeActivityProgress.)

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
        // Ordem definida por quem arrasta — gravada em display_order e
        // compartilhada com o projeto inteiro (como no Linear). Card sem
        // posição vai para o fim, não para o topo.
        //
        // 760 das 1.317 atividades ainda não têm posição definida (nunca foram
        // arrastadas). Todas empatariam, então o desempate é explícito por data
        // de criação — mais antigo primeiro. Sem isso a ordem dependeria da
        // estabilidade do sort, que é garantida mas não óbvia para quem lê.
        case "manual": {
          const oa = a.display_order ?? 999999;
          const ob = b.display_order ?? 999999;
          if (oa !== ob) return oa - ob;
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        }
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
        // compararData ordena "YYYY-MM-DD" como texto, sem construir Date: a
        // ordem já saía certa (o desvio de fuso era igual nos dois lados), mas
        // virar instante para comparar dia com dia é o hábito que produziu o
        // bug de exibição em toda parte.
        case "due":
          return compararData(a.end_date, b.end_date);
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
    // Progresso do pai: uma fonte só (computeActivityProgress), passando os
    // filhos diretos. Antes aqui havia um cálculo próprio — média do % dos
    // descendentes — que dava número diferente do card no fluxo principal e
    // nunca sinalizava "concluída com subatividade aberta".
    const parentProgress = computeActivityProgress(
      activity.workflow_stage_id,
      allStages,
      activity.last_progress_stage_id,
      (childrenByParent.get(activity.id) || []).map((c: any) => ({
        status: c.status,
        workflow_stage_id: c.workflow_stage_id,
      })),
    );
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
                    // Manual não tem direção: inverter uma ordem que a pessoa
                    // montou à mão não significa nada.
                    const nextDir = c.id === "manual"
                      ? "asc"
                      : isActive ? (activeDir === "asc" ? "desc" : "asc") : c.defaultDir;
                    return (
                      <DropdownMenuItem
                        key={c.id}
                        onSelect={() => setColSort(`${c.id}:${nextDir}`)}
                        className="gap-2 text-xs"
                        // Avisa ANTES de escolher: com critério automático a
                        // ordem se recalcula e arrastar deixa de valer. Jira
                        // documenta a mesma limitação, mas sem avisar.
                        title={c.travaArrasto ? "Enquanto ativo, arrastar cards não altera a ordem" : undefined}
                      >
                        <span className={cn("flex-1", isActive && "font-medium text-primary")}>{c.label}</span>
                        {c.travaArrasto && (
                          <Lock className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                        )}
                        {isActive && c.id !== "manual" && (activeDir === "asc"
                          ? <ArrowUp className="w-3.5 h-3.5 text-primary shrink-0" />
                          : <ArrowDown className="w-3.5 h-3.5 text-primary shrink-0" />)}
                        {isActive && c.id === "manual" && (
                          <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                        )}
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
                // "só para você": recolher é preferência pessoal (segue a
                // pessoa entre computadores, mas só a dela), ao contrário do
                // "Ocultar para todos" do menu, que muda o quadro da equipe.
                title="Recolher coluna (só para você)"
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
                  // Abre a tela de edição de sempre. Houve uma tentativa de
                  // trocar por um formulário inline na coluna; na prática o
                  // inline só cobria título/fase/EAP e escondia o resto atrás
                  // de mais um clique, então voltou a abrir a tela completa.
                  // O inline segue disponível como fallback se a tela não for
                  // passada por quem usa a coluna.
                  if (onOpenCreateTask) onOpenCreateTask(stage.id);
                  else setShowQuickAdd((v) => !v);
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
                  {/* Os itens vêm de StageMenuItems: o MESMO menu que a lista
                      "Colunas" usa. Antes ele vivia só aqui, e por isso a
                      coluna oculta ficava sem nenhuma forma de ser editada.
                      "Marcar como Bloqueio" saiu em rodada anterior: bloqueio é
                      do ITEM, não da coluna. */}
                  <StageMenuItems
                    stage={stage}
                    quantidade={stageActivities.length}
                    onPedirRenomear={() => {
                      // No cabeçalho o título vira campo no lugar — a coluna
                      // está à vista, não precisa de diálogo.
                      setRenameValue(stage.title);
                      setRenaming(true);
                    }}
                    acoes={{
                      onRename: onRenameStage,
                      onDelete: onDeleteStage,
                      onChangeColor: onChangeStageColor,
                      onSetProgress: onSetStageProgress,
                      onSetWipLimit: onSetStageWipLimit,
                      onToggleWipStrict: onToggleStageWipStrict,
                      onToggleContributes: onToggleStageContributes,
                      onToggleFinal: onToggleStageFinal,
                      onToggleVisible: onToggleStageVisible,
                    }}
                  />
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

/** As ações de administrar uma coluna, sem depender de onde elas aparecem. */
export type StageActions = {
  onRename: (id: string, title: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onChangeColor: (id: string, color: string) => void | Promise<void>;
  onSetProgress: (id: string, current: number | null | undefined) => void | Promise<void>;
  onSetWipLimit: (id: string, current: number | null | undefined) => void | Promise<void>;
  onToggleWipStrict?: (id: string, current: boolean) => void | Promise<void>;
  onToggleContributes: (id: string, current: boolean | undefined) => void | Promise<void>;
  onToggleFinal: (id: string, current: boolean) => void | Promise<void>;
  onToggleVisible: (id: string, current: boolean) => void | Promise<void>;
};

/** O que o menu precisa saber da coluna. Subconjunto de WorkflowStage. */
export type StageMenuData = {
  id: string;
  title: string;
  color: string;
  is_final: boolean;
  is_visible: boolean;
  progress_percent?: number | null;
  wip_limit?: number | null;
  wip_strict?: boolean;
  contributes_to_progress?: boolean;
};

/**
 * O MIOLO do menu ⋯ da coluna — as 8 ações, num lugar só.
 *
 * Extraído do cabeçalho em 12/08/2026 porque ele era o ÚNICO caminho para
 * administrar uma coluna: some a coluna do quadro (ocultar) e as ações somem
 * junto. Quem ocultasse "Em Teste" não tinha como renomeá-la, mudar a cor ou
 * excluí-la sem antes reexibir. Agora o mesmo menu serve o cabeçalho e a lista
 * "Colunas", e a coluna oculta deixa de ser inalcançável.
 *
 * Só os itens; quem chama põe o DropdownMenu em volta e decide o gatilho.
 */
export function StageMenuItems({
  stage, acoes, quantidade = 0, onPedirRenomear, fecharAoRenomear = false,
}: {
  stage: StageMenuData;
  acoes: StageActions;
  /** Cards na coluna — usado no aviso de ocultar. */
  quantidade?: number;
  /** Renomear: o cabeçalho edita no lugar, a lista abre um campo próprio. */
  onPedirRenomear: () => void;
  /**
   * Deixa o menu FECHAR ao escolher Renomear.
   *
   * No cabeçalho o campo fica atrás do menu aberto, e o `preventDefault` é
   * proposital — o título continua à vista enquanto o menu se fecha sozinho.
   * Na lista o campo nasce DENTRO da mesma linha do gatilho: com o menu aberto
   * por cima, ele fica coberto e o foco preso no menu, então digitar não
   * chegava ao campo. (Visto em teste no navegador, não deduzido.)
   */
  fecharAoRenomear?: boolean;
}) {
  return (
    <>
      <DropdownMenuLabel className="text-xs">Gerenciar coluna</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="focus:bg-muted/60 focus:text-foreground"
        onSelect={(e) => {
          if (!fecharAoRenomear) e.preventDefault();
          onPedirRenomear();
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
                onClick={(e) => { e.stopPropagation(); acoes.onChangeColor(stage.id, c); }}
              />
            ))}
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem
        className="focus:bg-muted/60 focus:text-foreground"
        onSelect={(e) => { e.preventDefault(); acoes.onToggleFinal(stage.id, stage.is_final); }}
        title="Final: atividades nesta coluna passam a representar 100% do fluxo."
      >
        <Check className="w-3.5 h-3.5 mr-2 text-success" />
        {stage.is_final ? "Remover marca de Final" : "Marcar como Final"}
      </DropdownMenuItem>
      <DropdownMenuItem
        className="focus:bg-muted/60 focus:text-foreground"
        onSelect={(e) => { e.preventDefault(); acoes.onSetProgress(stage.id, stage.progress_percent ?? null); }}
        title="Define um percentual fixo para esta coluna. Em branco = automático por posição."
      >
        <LayoutGrid className="w-3.5 h-3.5 mr-2" />
        {stage.progress_percent == null
          ? "Definir progresso (%)"
          : `Editar progresso (${stage.progress_percent}%)`}
      </DropdownMenuItem>
      <DropdownMenuItem
        className="focus:bg-muted/60 focus:text-foreground"
        onSelect={(e) => { e.preventDefault(); acoes.onSetWipLimit(stage.id, stage.wip_limit ?? null); }}
        title="Limite de cards em andamento (WIP). Em branco = sem limite."
      >
        <Layers className="w-3.5 h-3.5 mr-2" />
        {stage.wip_limit == null ? "Definir limite (WIP)" : `Editar limite WIP (${stage.wip_limit})`}
      </DropdownMenuItem>
      {/* Só faz sentido oferecer o modo rígido quando existe limite. */}
      {stage.wip_limit != null && stage.wip_limit > 0 && acoes.onToggleWipStrict && (
        <DropdownMenuItem
          className="focus:bg-muted/60 focus:text-foreground"
          onSelect={(e) => { e.preventDefault(); acoes.onToggleWipStrict!(stage.id, !!stage.wip_strict); }}
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
        onSelect={(e) => { e.preventDefault(); acoes.onToggleContributes(stage.id, stage.contributes_to_progress); }}
        title="Quando desativado, esta coluna não avança o progresso do fluxo."
      >
        <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
        {stage.contributes_to_progress === false ? "Incluir no progresso" : "Remover do progresso"}
      </DropdownMenuItem>
      {/* "para todos" no rótulo: ocultar grava em workflow_stages, que é do
          PROJETO — some do quadro da equipe inteira. Fica a um clique do
          "Recolher", que é preferência só sua, e os dois soavam iguais. */}
      <DropdownMenuItem
        className="focus:bg-muted/60 focus:text-foreground"
        onSelect={(e) => {
          e.preventDefault();
          // Com cartões dentro, confirma: some do quadro de todo mundo sem
          // deixar rastro, e as tarefas continuam lá.
          if (stage.is_visible && quantidade > 0) {
            const ok = window.confirm(
              `"${stage.title}" tem ${quantidade} ${quantidade === 1 ? "tarefa" : "tarefas"} e vai sumir do quadro de TODOS do projeto.\n\n` +
              `As tarefas continuam existindo e mantêm o status — só deixam de aparecer aqui.\n\n` +
              `Para limpar apenas a sua visão, use "Recolher coluna".`
            );
            if (!ok) return;
          }
          acoes.onToggleVisible(stage.id, stage.is_visible);
        }}
      >
        {stage.is_visible ? <EyeOff className="w-3.5 h-3.5 mr-2" /> : <Eye className="w-3.5 h-3.5 mr-2" />}
        {stage.is_visible ? "Ocultar para todos" : "Mostrar para todos"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        onSelect={(e) => { e.preventDefault(); acoes.onDelete(stage.id); }}
      >
        <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir coluna
      </DropdownMenuItem>
    </>
  );
}

/**
 * "Colunas" — a lista completa do quadro, no fim da fila de colunas.
 *
 * Substitui o par "＋ Nova coluna" + "👁 N ocultas", que eram duas entradas
 * separadas para o mesmo assunto. Pior: a coluna oculta ficava pendurada no
 * botão de CRIAR, que é lugar de criação, não de administração.
 *
 * O padrão veio do Notion: coluna oculta não tem marcador próprio — ela mora
 * na mesma lista das visíveis, apagada e com o olho cortado, cada uma com seu
 * toggle. "Nova coluna" passa a ser a última linha da lista.
 */
export function StageListButton({
  projectId, onChanged, stages = [], countByStage, canManage = false, onToggleVisible, acoes,
}: {
  projectId: string;
  onChanged?: () => void;
  /** TODAS as colunas do projeto, visíveis e ocultas, em display_order. */
  stages?: WorkflowStage[];
  countByStage?: Map<string, number>;
  canManage?: boolean;
  onToggleVisible?: (id: string, isVisible: boolean) => void;
  /** As mesmas ações do menu do cabeçalho. Sem elas, a lista só mostra. */
  acoes?: StageActions;
}) {
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // Renomear a partir da lista: a coluna oculta não tem cabeçalho onde editar
  // no lugar, então o campo aparece NA PRÓPRIA LINHA. Guarda o id em edição.
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");

  const contagem = countByStage ?? new Map<string, number>();
  const ocultas = stages.filter((s) => s.is_visible === false);
  // Coluna oculta VAZIA é só arrumação; com tarefa dentro é problema — tem
  // gente com status que ninguém enxerga no quadro. Só esse caso ganha cor.
  const presas = ocultas.filter((s) => (contagem.get(s.id) ?? 0) > 0).length;

  const confirmarRenome = (s: WorkflowStage) => {
    const limpo = novoNome.trim();
    if (limpo && limpo !== s.title) acoes?.onRename(s.id, limpo);
    setRenomeando(null);
  };

  return (
    <div className="shrink-0 self-start pt-3 pl-2 flex flex-col items-start gap-1">
      <Popover open={listOpen} onOpenChange={setListOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Colunas do quadro"
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap",
              presas > 0
                ? "text-warning hover:bg-warning/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <List className="w-3 h-3 shrink-0" />
            Colunas
            {presas > 0 && <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1.5">
          <div className="flex flex-col gap-0.5">
            <span className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Colunas do quadro
            </span>

            {stages.map((s) => {
              const n = contagem.get(s.id) ?? 0;
              const oculta = s.is_visible === false;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center gap-1.5 text-[12px] rounded px-1.5 py-1 min-w-0",
                    oculta && "text-muted-foreground",
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                  {/* Renomear acontece AQUI, na linha: a coluna oculta não tem
                      cabeçalho onde o título vire campo, e mandar para outra
                      tela só para trocar um nome seria desvio. */}
                  {renomeando === s.id ? (
                    <input
                      // `autoFocus` sozinho não basta: ao fechar, o Radix
                      // devolve o foco ao gatilho do menu e o tira do campo.
                      // O foco no rAF acontece DEPOIS dessa devolução.
                      ref={(el) => { if (el) requestAnimationFrame(() => el.focus()); }}
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      onBlur={() => confirmarRenome(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmarRenome(s);
                        else if (e.key === "Escape") setRenomeando(null);
                      }}
                      className="flex-1 min-w-0 bg-transparent border-b border-border outline-none text-[12px] text-foreground"
                      aria-label={`Novo nome para "${s.title}"`}
                    />
                  ) : (
                    <span className="truncate flex-1">{s.title}</span>
                  )}
                  {/* A contagem só aparece na oculta: numa coluna visível ela
                      já está no cabeçalho, aqui seria repetição. */}
                  {oculta && n > 0 && renomeando !== s.id && (
                    <span className="shrink-0 tabular-nums text-warning font-medium text-[11px]">{n}</span>
                  )}
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => canManage && onToggleVisible?.(s.id, !oculta)}
                    title={
                      !canManage
                        ? "Só quem gerencia o projeto pode mostrar ou ocultar colunas"
                        : oculta
                          ? `Mostrar "${s.title}" para todos do projeto`
                          : `Ocultar "${s.title}" para todos do projeto`
                    }
                    className={cn(
                      "shrink-0 rounded p-0.5 transition-colors",
                      canManage ? "hover:bg-muted cursor-pointer" : "cursor-default opacity-50",
                      oculta && "text-warning",
                    )}
                  >
                    {oculta ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 opacity-60" />}
                  </button>
                  {/* O ⋯ que faltava: as MESMAS ações do cabeçalho, agora
                      alcançáveis também na coluna oculta — que não tem
                      cabeçalho nenhum e por isso ficava sem edição. */}
                  {canManage && acoes && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title={`Ações de "${s.title}"`}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="right"
                        sideOffset={4}
                        className="w-56"
                        // Ao fechar, o Radix devolve o foco ao gatilho ⋯. Como o
                        // campo de renomear nasce na MESMA linha, essa devolução
                        // tirava o foco dele, o blur disparava e o renome se
                        // cancelava ~150ms depois de aparecer. Medido no
                        // navegador: t=50ms campo com foco, t=150ms campo some.
                        onCloseAutoFocus={(e) => e.preventDefault()}
                      >
                        <StageMenuItems
                          stage={s}
                          quantidade={n}
                          fecharAoRenomear
                          onPedirRenomear={() => { setNovoNome(s.title); setRenomeando(s.id); }}
                          acoes={acoes}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}

            {presas > 0 && (
              <span className="px-1.5 pt-1 text-[10px] text-warning leading-snug">
                Há tarefa em coluna oculta — ninguém a vê no quadro.
              </span>
            )}

            {canManage && (
              <>
                <div className="h-px bg-border my-1" />
                <button
                  type="button"
                  onClick={() => { setListOpen(false); setOpen(true); }}
                  className="flex items-center gap-1.5 text-[12px] rounded px-1.5 py-1 text-left hover:bg-muted transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  Nova coluna
                </button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

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
