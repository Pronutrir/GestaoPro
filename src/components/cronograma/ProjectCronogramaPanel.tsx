'use client';
import { useEffect, useMemo, useState, useCallback, Fragment, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { resolveEapKind } from "@/lib/eapModel";
import { supabase } from "@/integrations/supabase/client";
import { computeActivityProgress } from "@/lib/activityProgress";
import {
  resolveActivityState, isActivityOverdue, ACTIVITY_STATE_LABEL, type ActivityState,
} from "@/lib/activityState";
import { endVariance, varianceTone, varianceClasses, formatVariance } from "@/lib/dateVariance";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table2, GanttChart, ExternalLink, AlertTriangle, AlertCircle, CalendarOff,
  CalendarDays, Settings2, Filter, FolderKanban, Search, X,
  ArrowUp, ArrowDown, ArrowUpDown, ChevronRight, ChevronDown, Layers, Diamond, GripVertical,
  Info,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  format, parseISO, differenceInBusinessDays, addDays, eachDayOfInterval,
  isWeekend, isSameMonth, min as dateMin, max as dateMax, differenceInDays,
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, addMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { calculateCriticalPath } from "@/lib/criticalPath";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { buildAvatarLookupMap, getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { isHoliday, isOnVacation, type Holiday, type WorkSchedule } from "@/lib/workCalendar";

/**
 * Painel de Cronograma reutilizável (Tabela MS-Project + Gantt CPM).
 *
 * - projectIds = null  → consolida TODAS as atividades (cronograma geral)
 * - projectIds = [id]  → escopo de UM projeto
 * - projectIds = [...] → multi-projeto
 */

export type CronogramaMode = "table" | "gantt";
export type GanttZoom = "day" | "week" | "month" | "quarter" | "year";

interface Props {
  projectIds: string[] | null;
  defaultMode?: CronogramaMode;
  showProjectColumn?: boolean;
  onEditActivity?: (activity: any) => void;
}

const LINK_TYPES: Record<string, { short: string; label: string; desc: string }> = {
  finish_to_start:  { short: "TI", label: "Término-Início (FS)",  desc: "A sucessora só inicia quando a predecessora termina." },
  start_to_start:   { short: "II", label: "Início-Início (SS)",   desc: "A sucessora inicia quando a predecessora inicia." },
  finish_to_finish: { short: "TT", label: "Término-Término (FF)", desc: "A sucessora só termina quando a predecessora termina." },
  start_to_finish:  { short: "IT", label: "Início-Término (SF)",  desc: "A sucessora só termina quando a predecessora inicia." },
};

/** Cada zoom controla a largura em pixels de UM DIA na régua do Gantt. */
const ZOOM_PX_PER_DAY: Record<GanttZoom, number> = {
  day: 44,
  week: 20,
  month: 9,
  quarter: 5.5,
  year: 3,
};

const ZOOM_LABEL: Record<GanttZoom, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
  quarter: "Trimestre",
  year: "Ano",
};

/** Uma linha do painel de legenda: amostra visual real + nome + explicação curta. */
function LegendRow({ sample, title, desc }: { sample: ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex w-9 items-center justify-center pt-0.5 shrink-0">{sample}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium leading-tight text-foreground">{title}</div>
        <div className="text-[10px] leading-tight text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}

/** Colunas opcionais da tabela (controladas pelo usuário, persistidas em localStorage). */
type ColKey =
  | "id" | "eap" | "title" | "preds" | "responsible" | "column" | "status" | "duration"
  | "plannedStart" | "plannedEnd" | "actualStart" | "actualEnd"
  | "variance" | "progress" | "slack" | "slackFree" | "mainResource" | "effort" | "compression"
  | "observation" | "project" | "blockedDays";

const COL_LABELS: Record<ColKey, string> = {
  id: "ID", eap: "EAP", title: "Atividade", preds: "Predecessoras",
  responsible: "Responsável", column: "Coluna", status: "Status", duration: "Duração (d)",
  plannedStart: "Início Previsto", plannedEnd: "Térm. Previsto",
  actualStart: "Início Real", actualEnd: "Térm. Real",
  variance: "Desvio (d)",
  progress: "% Concluído", slack: "Folga Total", slackFree: "Folga Livre",
  mainResource: "Recurso Principal", effort: "Esforço (h)",
  compression: "Compressão", observation: "Observações",
  project: "Projeto", blockedDays: "Dias Bloqueada",
};

const DEFAULT_VISIBLE: ColKey[] = [
  "id", "eap", "title", "preds", "responsible", "column",
  "duration", "plannedStart", "plannedEnd", "progress", "slack", "slackFree",
];

function formatDateBR(iso: string | null) {
  if (!iso) return "—";
  try { return format(parseISO(iso.slice(0, 10) + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }); } catch { return "—"; }
}

function workDays(startISO: string | null, endISO: string | null) {
  if (!startISO || !endISO) return null;
  try {
    const d = differenceInBusinessDays(parseISO(endISO), parseISO(startISO)) + 1;
    return d > 0 ? d : 1;
  } catch { return null; }
}

function SortableHeaderCell({
  col,
  sortable,
  active,
  cycleSort,
  label,
}: {
  col: ColKey;
  sortable: boolean;
  active: boolean;
  cycleSort: (col: ColKey) => void;
  label: string;
}) {
  const {
    setNodeRef,
    transform,
    transition,
    attributes,
    listeners,
    isDragging,
  } = useSortable({ id: col });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  } as React.CSSProperties;

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        col === "title" && "text-left min-w-[320px]",
        col === "observation" && "text-left min-w-[180px]",
        col === "column" && "min-w-[140px]",
        col === "status" && "min-w-[140px]",
        isDragging && "opacity-60",
      )}
    >
      <div className="inline-flex items-center gap-1.5" title="Segure e arraste para reordenar a coluna">
        <span
          {...attributes}
          {...listeners}
          className={cn(
            "inline-flex items-center rounded-sm p-0.5 cursor-grab active:cursor-grabbing select-none",
            isDragging && "cursor-grabbing bg-primary-foreground/15"
          )}
          aria-label="Arrastar coluna"
        >
          <GripVertical className="h-3.5 w-3.5 opacity-70" />
        </span>
        {sortable ? (
          <button
            type="button"
            onClick={() => cycleSort(col)}
            className={cn(
              "inline-flex items-center gap-1 hover:text-primary-foreground/90 transition-colors",
              active && "text-amber-300"
            )}
            title={
              active
                ? `Ordenando por ${label}. Clique para inverter/limpar.`
                : `Ordenar por ${label}`
            }
          >
            <span>{label}</span>
            {active ? <ArrowUp className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
          </button>
        ) : (
          <span>{label}</span>
        )}
      </div>
    </th>
  );
}

export function ProjectCronogramaPanel({
  projectIds,
  defaultMode = "gantt",
  showProjectColumn = false,
  onEditActivity,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { filterProjects, loading: accessLoading } = useProjectAccess();
  // Feriados + férias do usuário: absorvidos do antigo Calendário para sombrear o Gantt.
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule | undefined>();
  useEffect(() => {
    Promise.all([
      supabase.from("holidays").select("date,name").order("date"),
      profile?.id
        ? supabase.from("user_work_schedules").select("*").eq("user_id", profile.id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]).then(([hols, sched]) => {
      setHolidays((hols.data || []) as Holiday[]);
      if (sched && (sched as any).data) setWorkSchedule((sched as any).data as WorkSchedule);
    });
  }, [profile?.id]);
  const [activities, setActivities] = useState<any[]>([]);
  const [phases, setPhases] = useState<any[]>([]);
  const [deps, setDeps] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; sector: string; avatar?: string }>>({});
  const [projectsMap, setProjectsMap] = useState<Record<string, string>>({});
  const [projectDeadlines, setProjectDeadlines] = useState<Record<string, string | null>>({});
  const [mode, setMode] = useState<CronogramaMode>(defaultMode);
  const [stages, setStages] = useState<Array<{ id: string; title: string; color: string; is_final: boolean; is_blocked: boolean; display_order: number; project_id: string; categoria?: string | null }>>([]);
  const [stageFilter, setStageFilter] = useState<Set<string> | null>(null); // null = todas
  // Filtro interno de projetos (usado principalmente no Cronograma Geral).
  // null = todos os projetos carregados
  const [projectFilter, setProjectFilter] = useState<Set<string> | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  // Isola os itens sem início/fim — o resumo do Gantt liga/desliga este filtro,
  // para que "N sem datas" deixe de ser texto morto e vire uma ação.
  const [onlyUndated, setOnlyUndated] = useState(false);

  // ===== Toolbar Gantt =====
  const [zoom, setZoom] = useState<GanttZoom>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("cronograma:zoom") : null;
    return (stored as GanttZoom) || "day";
  });
  useEffect(() => {
    localStorage.setItem("cronograma:zoom", zoom);
  }, [zoom]);

  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const [ganttContainerWidth, setGanttContainerWidth] = useState(0);
  const [ganttLabelWidth, setGanttLabelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 340;
    const stored = window.localStorage.getItem("cronograma:gantt:labelWidth");
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return 340;
    return Math.min(560, Math.max(240, parsed));
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("cronograma:gantt:labelWidth", String(ganttLabelWidth));
  }, [ganttLabelWidth]);
  useEffect(() => {
    if (mode !== "gantt") return;
    const el = ganttScrollRef.current;
    if (!el) return;
    setGanttContainerWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setGanttContainerWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const [visibleCols, setVisibleCols] = useState<ColKey[]>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("cronograma:cols") : null;
    const baseDefaults = showProjectColumn ? (["project", ...DEFAULT_VISIBLE] as ColKey[]) : [...DEFAULT_VISIBLE];
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ColKey[];
        const valid = parsed
          .filter((k) => Object.prototype.hasOwnProperty.call(COL_LABELS, k))
          .filter((k) => showProjectColumn || k !== "project");
        if (valid.length > 0) return valid;
      } catch {}
    }
    return baseDefaults;
  });
  useEffect(() => {
    localStorage.setItem("cronograma:cols", JSON.stringify(visibleCols));
  }, [visibleCols]);

  const moveVisibleCol = useCallback((from: ColKey, to: ColKey, position: "before" | "after" = "before") => {
    if (from === to) return;
    setVisibleCols((prev) => {
      const fromIdx = prev.indexOf(from);
      const toIdx = prev.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [picked] = next.splice(fromIdx, 1);
      const targetIdx = next.indexOf(to);
      if (targetIdx < 0) return prev;
      const insertAt = position === "after" ? targetIdx + 1 : targetIdx;
      next.splice(insertAt, 0, picked);
      return next;
    });
  }, []);

  // ===== Ordenação por coluna =====
  type SortDir = "asc" | "desc";
  type SortState = { col: ColKey; dir: SortDir } | null;
  const sortStorageKey = useMemo(() => {
    if (projectIds && projectIds.length === 1) return `cronograma:sort:${projectIds[0]}`;
    return "cronograma:sort:geral";
  }, [projectIds]);
  const [sort, setSort] = useState<SortState>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(sortStorageKey);
      return raw ? (JSON.parse(raw) as SortState) : null;
    } catch { return null; }
  });
  useEffect(() => {
    if (sort) localStorage.setItem(sortStorageKey, JSON.stringify(sort));
    else localStorage.removeItem(sortStorageKey);
  }, [sort, sortStorageKey]);

  /** Colunas que podem ser ordenadas via clique no cabeçalho. */
  const SORTABLE_COLS = new Set<ColKey>([
    "id", "eap", "title", "plannedStart", "plannedEnd",
    "actualStart", "actualEnd", "variance", "duration", "progress", "slack", "slackFree",
    "mainResource", "responsible", "blockedDays",
  ]);

  const cycleSort = (col: ColKey) => {
    if (!SORTABLE_COLS.has(col)) return;
    setSort(prev => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  };

  /** Compara EAP segmento a segmento (1.2 antes de 1.10). */
  const compareWbs = (a: string, b: string) => {
    const pa = a.split(".").map(n => parseInt(n, 10));
    const pb = b.split(".").map(n => parseInt(n, 10));
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const x = pa[i] ?? 0;
      const y = pb[i] ?? 0;
      if (x !== y) return x - y;
    }
    return 0;
  };

  /** Vazios sempre no fim, independente da direção. Devolve diferença. */
  const nullsLast = (av: any, bv: any): number | null => {
    const ae = av === null || av === undefined || av === "";
    const be = bv === null || bv === undefined || bv === "";
    if (ae && be) return 0;
    if (ae) return 1;   // a vai pro fim
    if (be) return -1;  // b vai pro fim
    return null;
  };

  const colVisible = (k: ColKey) => visibleCols.includes(k);
  const toggleCol = (k: ColKey) => {
    setVisibleCols(v => v.includes(k) ? v.filter(x => x !== k) : [...v, k]);
  };

  const [draggingCol, setDraggingCol] = useState<ColKey | null>(null);
  const [draggingHeaderCol, setDraggingHeaderCol] = useState<ColKey | null>(null);
  const headerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleHeaderDragStart = useCallback((event: DragStartEvent) => {
    setDraggingHeaderCol(String(event.active.id) as ColKey);
  }, []);

  const handleHeaderDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingHeaderCol(null);
    if (!over || active.id === over.id) return;
    setVisibleCols((prev) => {
      const oldIndex = prev.indexOf(active.id as ColKey);
      const newIndex = prev.indexOf(over.id as ColKey);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  // ===== Fetch =====
  const fetchData = useCallback(async () => {
    if (accessLoading) return;

    if (projectIds && projectIds.length === 0) {
      setActivities([]); setDeps([]); setPhases([]); setStages([]);
      return;
    }

    const { data: allProjects } = await supabase
      .from("projects")
      .select("id, title, due_date")
      .eq("is_trashed", false);

    const visibleProjects = await filterProjects((allProjects || []) as Array<{ id: string; title: string; due_date: string | null }>);
    const visibleProjectIds = new Set(visibleProjects.map((p) => p.id));

    const scopedProjectIds = projectIds
      ? projectIds.filter((id) => visibleProjectIds.has(id))
      : Array.from(visibleProjectIds);

    if (scopedProjectIds.length === 0) {
      setActivities([]); setDeps([]); setPhases([]); setStages([]);
      setProjectsMap({});
      setProjectDeadlines({});
      return;
    }

    const actsQ = supabase
      .from("activities")
      .select("*")
      .eq("is_trashed", false)
      .in("project_id", scopedProjectIds)
      .order("display_order", { ascending: true });

    // `*` em vez da lista explícita: traz `categoria` onde a migration já
    // rodou e continua funcionando onde ainda não rodou.
    const stagesQ = supabase
      .from("workflow_stages")
      .select("*")
      .in("project_id", scopedProjectIds);

    const [{ data: acts }, { data: phs }, { data: profs }, { data: stgs }] = await Promise.all([
      actsQ,
      supabase.from("phases").select("*").in("project_id", scopedProjectIds).eq("is_trashed", false).order("display_order", { ascending: true }),
      supabase.from("profiles").select("id, full_name, sector, avatar_url"),
      stagesQ,
    ]);
    setActivities(acts || []);
    setPhases(phs || []);
    setStages(stgs || []);
    const map: Record<string, { name: string; sector: string; avatar?: string }> = {};
    (profs || []).forEach((p: any) => {
      map[p.id] = {
        name: p.full_name,
        sector: p.sector || "—",
        avatar: typeof p.avatar_url === "string" ? p.avatar_url : undefined,
      };
    });
    setProfiles(map);
    const pm: Record<string, string> = {};
    const pdl: Record<string, string | null> = {};
    visibleProjects.forEach((p) => {
      pm[p.id] = p.title;
      pdl[p.id] = p.due_date || null;
    });
    setProjectsMap(pm);
    setProjectDeadlines(pdl);

    const ids = (acts || []).map((a: any) => a.id);
    if (ids.length) {
      const { data: d } = await supabase.from("task_dependencies").select("*")
        .or(`predecessor_id.in.(${ids.join(",")}),successor_id.in.(${ids.join(",")})`);
      setDeps(d || []);
    } else setDeps([]);
  }, [projectIds, accessLoading, filterProjects]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ===== Mock estável (para colunas ainda não persistidas) =====
  const mockFor = (id: string, idx: number) => {
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
    return {
      effortHours: 4 + (h % 36),
      compression: ["Baixa", "Média", "Alta", "Nenhuma"][h % 4],
      observation: ["", "Aguardando aprovação do PO", "Risco de overlap com sprint", "Depende de fornecedor externo"][h % 4],
      mainResource: profiles[activities[idx]?.assigned_to || ""]?.sector || "—",
    };
  };

  // ===== CPM real =====
  const criticalSet = useMemo(
    () => calculateCriticalPath(
      activities.map(a => ({ id: a.id, start_date: a.start_date, end_date: a.end_date })),
      deps.map(d => ({
        predecessor_id: d.predecessor_id,
        successor_id: d.successor_id,
        lag_days: d.lag_days,
        dependency_type: d.dependency_type,
      }))
    ),
    [activities, deps]
  );

  // ===== Folgas CPM (Total e Livre) =====
  const slackMetricsById = useMemo(() => {
    const map = new Map<string, { total: number; free: number }>();
    const valid = activities.filter(a => a.start_date && a.end_date);
    if (valid.length === 0) return map;

    const byId = new Map(valid.map(a => [a.id, a]));
    const succ = new Map<string, { id: string; lag: number; type: string }[]>();
    const pred = new Map<string, { id: string; lag: number; type: string }[]>();
    valid.forEach(a => { succ.set(a.id, []); pred.set(a.id, []); });
    deps.forEach(d => {
      if (byId.has(d.predecessor_id) && byId.has(d.successor_id)) {
        const type = d.dependency_type || "finish_to_start";
        succ.get(d.predecessor_id)!.push({ id: d.successor_id, lag: d.lag_days ?? 0, type });
        pred.get(d.successor_id)!.push({ id: d.predecessor_id, lag: d.lag_days ?? 0, type });
      }
    });
    const dur = new Map<string, number>();
    valid.forEach(a => {
      const days = Math.max(differenceInDays(parseISO(a.end_date!), parseISO(a.start_date!)), 1);
      dur.set(a.id, days);
    });
    const minDate = valid.reduce((m, a) => {
      const d = parseISO(a.start_date!);
      return d < m ? d : m;
    }, parseISO(valid[0].start_date!));
    const inDeg = new Map<string, number>();
    valid.forEach(a => inDeg.set(a.id, pred.get(a.id)!.length));
    const queue = valid.filter(a => inDeg.get(a.id) === 0).map(a => a.id);
    const order: string[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      order.push(id);
      succ.get(id)!.forEach(s => {
        inDeg.set(s.id, (inDeg.get(s.id) ?? 0) - 1);
        if (inDeg.get(s.id) === 0) queue.push(s.id);
      });
    }

    // Se houver ciclo, mantém ordem fallback para evitar buracos no cálculo.
    if (order.length < valid.length) {
      valid.forEach((a) => {
        if (!order.includes(a.id)) order.push(a.id);
      });
    }

    const ef = new Map<string, number>();
    const es = new Map<string, number>();

    const forwardConstraint = (type: string, esPred: number, durPred: number, durCur: number, lag: number) => {
      switch (type) {
        case "start_to_start":
          return esPred + lag;
        case "finish_to_finish":
          return esPred + durPred + lag - durCur;
        case "start_to_finish":
          return esPred + lag - durCur;
        case "finish_to_start":
        default:
          return esPred + durPred + lag;
      }
    };

    order.forEach(id => {
      const a = byId.get(id)!;
      const durCur = dur.get(id)!;
      const baseEs = differenceInDays(parseISO(a.start_date!), minDate);
      let earliest = baseEs;
      pred.get(id)!.forEach(p => {
        const esPred = es.get(p.id);
        if (esPred === undefined) return;
        const durPred = dur.get(p.id) ?? 1;
        const candidate = forwardConstraint(p.type, esPred, durPred, durCur, p.lag);
        earliest = Math.max(earliest, candidate);
      });
      es.set(id, earliest);
      ef.set(id, earliest + durCur);
    });
    const projectEnd = ef.size ? Math.max(...Array.from(ef.values())) : 0;
    const ls = new Map<string, number>();
    const lf = new Map<string, number>();

    const backwardConstraint = (type: string, lsSucc: number, durPred: number, durSucc: number, lag: number) => {
      switch (type) {
        case "start_to_start":
          return lsSucc - lag;
        case "finish_to_finish":
          return lsSucc + durSucc - durPred - lag;
        case "start_to_finish":
          return lsSucc + durSucc - lag;
        case "finish_to_start":
        default:
          return lsSucc - durPred - lag;
      }
    };

    [...order].reverse().forEach(id => {
      const succs = succ.get(id)!;
      const durPred = dur.get(id)!;
      let latestStart = projectEnd - durPred;
      if (succs.length > 0) {
        latestStart = Math.min(...succs.map(s => {
          const lsSucc = ls.get(s.id) ?? (projectEnd - (dur.get(s.id) ?? 1));
          const durSucc = dur.get(s.id) ?? 1;
          return backwardConstraint(s.type, lsSucc, durPred, durSucc, s.lag);
        }));
      }
      ls.set(id, latestStart);
      lf.set(id, latestStart + durPred);
    });

    valid.forEach(a => {
      // FT = LS - ES (equivale a LF - EF)
      const ft = Math.max(0, (ls.get(a.id) ?? 0) - (es.get(a.id) ?? 0));

      // FL (folga livre) considera o tipo da dependência.
      const successors = succ.get(a.id) || [];
      let fl = ft;
      if (successors.length > 0) {
        let minFree = Number.POSITIVE_INFINITY;
        successors.forEach((s) => {
          const esSucc = es.get(s.id);
          const efCur = ef.get(a.id);
          const esCur = es.get(a.id);
          if (esSucc === undefined || efCur === undefined || esCur === undefined) return;
          const durCur = dur.get(a.id) ?? 1;
          const durSucc = dur.get(s.id) ?? 1;
          let freeCandidate = 0;
          switch (s.type) {
            case "start_to_start":
              freeCandidate = esSucc - (esCur + s.lag);
              break;
            case "finish_to_finish":
              freeCandidate = (esSucc + durSucc) - (esCur + durCur + s.lag);
              break;
            case "start_to_finish":
              freeCandidate = (esSucc + durSucc) - (esCur + s.lag);
              break;
            case "finish_to_start":
            default:
              freeCandidate = esSucc - efCur - s.lag;
              break;
          }
          minFree = Math.min(minFree, freeCandidate);
        });
        if (Number.isFinite(minFree)) fl = Math.max(0, minFree);
      }

      map.set(a.id, { total: ft, free: fl });
    });

    return map;
  }, [activities, deps]);

  const slackMap = useMemo(() => {
    const map = new Map<string, number>();
    slackMetricsById.forEach((v, id) => map.set(id, v.total));
    return map;
  }, [slackMetricsById]);

  const baseRows = useMemo(
    () => {
      let filtered = activities;
      if (projectFilter !== null) {
        filtered = filtered.filter(a => a.project_id && projectFilter.has(a.project_id));
      }
      if (stageFilter !== null) {
        filtered = filtered.filter(a => a.workflow_stage_id && stageFilter.has(a.workflow_stage_id));
      }
      if (onlyUndated) {
        // Só itens sem par início/fim. Fases ficam de fora: suas datas derivam
        // dos filhos, então "sem datas" numa fase não é algo que se preencha.
        filtered = filtered.filter(a => !(a.start_date && a.end_date));
      }
      // FASES COMO LINHA: elas vivem na tabela `phases`, não em `activities`,
      // então nunca apareciam no cronograma — e as atividades que pendem delas
      // ficavam soltas na raiz. Aqui viram linhas sintéticas (item_type='fase')
      // para agrupar e indentar, com as datas derivando dos filhos como no
      // resto do sistema.
      const usadas = new Set(filtered.map((a: any) => a.phase_id).filter(Boolean));
      const linhasFase = (phases || [])
        .filter((p: any) => usadas.has(p.id))
        .map((p: any) => ({
          id: `phase:${p.id}`,
          title: p.title,
          item_type: "fase",
          is_milestone: false,
          parent_id: null,
          phase_id: null,
          project_id: p.project_id,
          wbs_code: p.wbs_code ?? null,
          start_date: p.start_date ?? null,
          end_date: p.end_date ?? null,
          actual_start_date: p.actual_start_date ?? null,
          actual_end_date: p.actual_end_date ?? null,
          status: "pending",
          __isPhaseRow: true,
        }));

      return [...linhasFase, ...filtered].map((a, idx) => ({ a, idx, mock: mockFor(a.id, idx) }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, phases, profiles, stageFilter, projectFilter, onlyUndated]
  );

  const stageById = useMemo(() => {
    // `categoria` viaja junto: é a fonte da verdade do estado (ver
    // lib/workflowCategory) e precisa chegar a resolveActivityState.
    const m = new Map<string, { title: string; color: string; is_final: boolean; categoria?: string | null }>();
    stages.forEach(s => m.set(s.id, {
      title: s.title, color: s.color, is_final: s.is_final, categoria: s.categoria ?? null,
    }));
    return m;
  }, [stages]);

  const profileAvatarMap = useMemo(
    () => buildAvatarLookupMap(
      Object.entries(profiles).map(([id, profile]) => ({
        id,
        full_name: profile.name,
        avatar_url: profile.avatar || null,
      }))
    ),
    [profiles]
  );

  const resolveResponsible = useCallback((assignedTo: string | null | undefined) => {
    const raw = (assignedTo || "").trim();
    if (!raw) return "—";
    const mapped = profiles[raw]?.name;
    if (mapped) return mapped;
    // Compatibilidade com registros antigos onde assigned_to foi salvo como nome.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) return "—";
    return raw;
  }, [profiles]);

  /**
   * Pai efetivo de uma atividade: `parent_id` quando existe, senão a FASE.
   *
   * A hierarquia do sistema tem dois vínculos: `parent_id` liga atividade a
   * atividade, e `phase_id` liga atividade à fase (tabela `phases`, que não é
   * uma activity). O cronograma só olhava `parent_id`, então tudo o que vinha
   * da importação — que grava `phase_id` e deixa `parent_id` nulo — caía na
   * raiz: sem indentação, sem agrupamento e fora de ordem.
   */
  const parentKeyOf = useCallback(
    (a: any): string | null => a?.parent_id || (a?.phase_id ? `phase:${a.phase_id}` : null),
    [],
  );

  const childrenByParent = useMemo(() => {
    const m = new Map<string, any[]>();
    activities.forEach((a) => {
      const key = parentKeyOf(a);
      if (!key) return;
      const arr = m.get(key) || [];
      arr.push(a);
      m.set(key, arr);
    });
    return m;
  }, [activities, parentKeyOf]);

  /**
   * Agrupa? Passa pela fonte única (lib/eapModel) em vez de testar item_type
   * na mão.
   *
   * O teste direto `item_type === "fase" || "pacote"` ignorava a regra por
   * nível: itens de nível 1 gravados como 'atividade' não eram reconhecidos
   * como fase (9 no banco) e itens de nível 2+ gravados como 'fase' agrupavam
   * indevidamente (17). Era por isso que o cronograma mostrava só marcos e
   * atividades, sem as fases.
   */
  const isGroupRow = useCallback(
    (a: any) => resolveEapKind(a, (childrenByParent.get(a?.id) || []).length > 0) === "fase",
    [childrenByParent],
  );

  const activityById = useMemo(() => {
    const m = new Map<string, any>();
    activities.forEach((a) => m.set(a.id, a));
    // As linhas de fase entram aqui também: o cálculo de profundidade sobe pelo
    // pai e precisa achar a fase para parar nela.
    (phases || []).forEach((p: any) => m.set(`phase:${p.id}`, {
      id: `phase:${p.id}`, title: p.title, parent_id: null, phase_id: null, item_type: "fase",
    }));
    return m;
  }, [activities, phases]);

  const depthById = useMemo(() => {
    const m = new Map<string, number>();
    const computeDepth = (id: string, seen = new Set<string>()): number => {
      if (m.has(id)) return m.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const item = activityById.get(id);
      if (!item) { m.set(id, 0); return 0; }
      // Sem parent_id mas com fase: está um nível abaixo da fase, que ocupa a
      // raiz. Antes essas atividades ficavam em depth 0, coladas na margem
      // como se fossem itens de topo.
      if (!item.parent_id) {
        const d = item.phase_id ? 1 : 0;
        m.set(id, d);
        return d;
      }
      const depth = computeDepth(item.parent_id, seen) + 1;
      m.set(id, depth);
      return depth;
    };
    activities.forEach((a) => computeDepth(a.id));
    return m;
  }, [activities, activityById]);

  const descendantProgressById = useMemo(() => {
    const memo = new Map<string, { sum: number; count: number }>();
    const stagesByProjectLocal = new Map<string, typeof stages>();
    stages.forEach((s) => {
      if (!stagesByProjectLocal.has(s.project_id)) stagesByProjectLocal.set(s.project_id, [] as any);
      (stagesByProjectLocal.get(s.project_id) as any).push(s);
    });

    const walk = (id: string, seen = new Set<string>()): { sum: number; count: number } => {
      if (memo.has(id)) return memo.get(id)!;
      if (seen.has(id)) return { sum: 0, count: 0 };

      const nextSeen = new Set(seen);
      nextSeen.add(id);

      const children = childrenByParent.get(id) || [];
      let sum = 0;
      let count = 0;

      children.forEach((child) => {
        const projStages = stagesByProjectLocal.get(child.project_id) || [];
        const info = computeActivityProgress(child.workflow_stage_id, projStages as any, child.last_progress_stage_id);
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
  }, [activities, childrenByParent, stages]);

  const phaseDerivedDates = useMemo(() => {
    const m = new Map<string, { start: Date | null; end: Date | null }>();
    const collectDescendants = (id: string, out: any[] = [], seen = new Set<string>()): any[] => {
      if (seen.has(id)) return out;
      seen.add(id);
      const children = childrenByParent.get(id) || [];
      children.forEach((child) => {
        out.push(child);
        collectDescendants(child.id, out, seen);
      });
      return out;
    };

    activities.forEach((a) => {
      // Fase E pacote de trabalho são agrupadores: datas derivadas dos filhos.
      if (!isGroupRow(a)) return;
      const descendants = collectDescendants(a.id);
      const starts = descendants
        .filter((d) => d.start_date)
        .map((d) => parseISO(d.start_date.slice(0, 10) + "T12:00:00"));
      const ends = descendants
        .filter((d) => d.end_date || d.start_date)
        .map((d) => parseISO((d.end_date || d.start_date).slice(0, 10) + "T12:00:00"));

      m.set(a.id, {
        start: starts.length ? dateMin(starts) : null,
        end: ends.length ? dateMax(ends) : null,
      });
    });
    return m;
  }, [activities, childrenByParent]);

  const collapseKey = useMemo(() => {
    if (projectIds && projectIds.length === 1) return `cronograma:collapsed:${projectIds[0]}`;
    return "cronograma:collapsed:geral";
  }, [projectIds]);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(collapseKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    localStorage.setItem(collapseKey, JSON.stringify(Array.from(collapsedPhases)));
  }, [collapsedPhases, collapseKey]);
  const togglePhase = (id: string) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isHiddenByCollapse = useCallback((a: any): boolean => {
    let current = a.parent_id ? activityById.get(a.parent_id) : null;
    while (current) {
      if (isGroupRow(current) && collapsedPhases.has(current.id)) return true;
      current = current.parent_id ? activityById.get(current.parent_id) : null;
    }
    return false;
  }, [activityById, collapsedPhases]);

  /** Stages agrupadas por projeto, para cálculo de andamento por contexto. */
  const stagesByProject = useMemo(() => {
    const m = new Map<string, typeof stages>();
    stages.forEach((s) => {
      if (!m.has(s.project_id)) m.set(s.project_id, [] as any);
      (m.get(s.project_id) as any).push(s);
    });
    return m;
  }, [stages]);

  const progressFor = useCallback((a: any): number => {
    const deep = descendantProgressById.get(a.id);
    const totalSubs = deep?.count || 0;
    if (totalSubs > 0) {
      return Math.max(0, Math.min(100, Math.round((deep!.sum / totalSubs))));
    }
    const projStages = stagesByProject.get(a.project_id) || [];
    const info = computeActivityProgress(a.workflow_stage_id, projStages as any, a.last_progress_stage_id);
    if (info.paused) return 0;
    return info.percent ?? 0;
  }, [stagesByProject, descendantProgressById]);

  /**
   * Linhas finais aplicadas ao Cronograma (tabela e Gantt).
   * Mantém a ordem original quando `sort` é nulo; senão aplica o
   * comparador da coluna selecionada e usa `idx` como desempate estável.
   */
  /** Opções de status/coluna do Kanban (todas as colunas do projeto, sem agrupar). */
  const stageOptions = useMemo(() => {
    const hasManyProjects = new Set(stages.map((s) => s.project_id)).size > 1;
    return [...stages]
      .sort((a, b) => {
        const po = (a.display_order ?? 0) - (b.display_order ?? 0);
        if (po !== 0) return po;
        return a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" });
      })
      .map((s) => ({
        id: s.id,
        title: s.title,
        color: s.color,
        is_final: s.is_final,
        projectLabel: hasManyProjects ? (projectsMap[s.project_id] || "Projeto") : null,
      }));
  }, [stages, projectsMap]);

  /** Lista ordenada de projetos com pelo menos uma atividade carregada (alimenta o filtro de projetos). */
  const projectOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; title: string }[] = [];
    activities.forEach(a => {
      if (a.project_id && !seen.has(a.project_id)) {
        seen.add(a.project_id);
        out.push({ id: a.project_id, title: projectsMap[a.project_id] || "(sem nome)" });
      }
    });
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }, [activities, projectsMap]);

  const showProjectFilter = projectOptions.length > 1;

  /**
   * EAP/WBS por atividade — vem do campo `wbs_code` editado pelo usuário
   * (formatos suportados: X.0, X.Y, X.Y.Z, X.Y.Z.W). Estável e independente
   * de ordem/filtro.
   */
  const wbsById = useMemo(() => {
    const m = new Map<string, string>();
    activities.forEach(a => {
      if (a.wbs_code) m.set(a.id, String(a.wbs_code));
    });
    return m;
  }, [activities]);

  /**
   * ID curto da atividade — primeiros 7 caracteres do UUID (estável,
   * funciona como "máscara" única). Exibido na coluna ID e nas referências
   * de predecessoras.
   */
  const shortIdOf = (uuid: string) => (uuid || "").replace(/-/g, "").slice(0, 7);
  const indexById = useMemo(() => {
    const m = new Map<string, string>();
    activities.forEach(a => m.set(a.id, shortIdOf(a.id)));
    return m;
  }, [activities]);

  /**
   * Linhas finais aplicadas ao Cronograma (tabela e Gantt).
   * Mantém a ordem original quando `sort` é nulo; senão aplica o
   * comparador da coluna selecionada e usa `idx` como desempate estável.
   */
  const rows = useMemo(() => {
    const valueOf = (a: any): any => {
      switch (sort.col) {
        case "id": return shortIdOf(a.id);
        case "eap": return wbsById.get(a.id) || "";
        case "title": return (a.title || "").toString();
        case "plannedStart": return a.start_date || null;
        case "plannedEnd": return a.end_date || null;
        case "actualStart": return a.actual_start_date || null;
        case "actualEnd": return a.actual_end_date || null;
        case "variance": {
          const ref = a.baseline_end_date || a.end_date;
          const real = a.actual_end_date || null;
          if (!ref || !real) return null;
          return endVariance(real, a.baseline_end_date, a.end_date);
        }
        case "duration": return workDays(a.start_date, a.end_date);
        case "progress": return progressFor(a);
        case "slack": {
          const s = slackMap.get(a.id);
          return s === undefined ? null : s;
        }
        case "slackFree": {
          const s = slackMetricsById.get(a.id)?.free;
          return s === undefined ? null : s;
        }
        case "mainResource":
        case "responsible":
          return profiles[a.assigned_to || ""]?.name || "";
        case "blockedDays": return Number(a.blocked_days_total || 0);
        default: return "";
      }
    };

    const compareRows = (x: { a: any; idx: number; mock: any }, y: { a: any; idx: number; mock: any }) => {
      const av = valueOf(x.a);
      const bv = valueOf(y.a);
      const ne = nullsLast(av, bv);
      let r = 0;
      if (ne !== null) {
        r = ne;
      } else if (sort.col === "eap") {
        r = compareWbs(String(av), String(bv));
      } else if (typeof av === "number" && typeof bv === "number") {
        r = av - bv;
      } else if (sort.col === "plannedStart" || sort.col === "plannedEnd"
              || sort.col === "actualStart" || sort.col === "actualEnd") {
        r = String(av).localeCompare(String(bv));
      } else {
        r = String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
      }
      if (ne === null) r = r * (sort.dir === "asc" ? 1 : -1);
      if (r !== 0) return r;
      return x.idx - y.idx;
    };

    const visibleIds = new Set(baseRows.map((row) => row.a.id));
    // Raiz = sem pai visível. Um item com phase_id pendura na fase, então só é
    // raiz se a fase não estiver na lista (projeto sem fases, ou item solto).
    const fasesVisiveis = new Set((phases || []).map((p: any) => `phase:${p.id}`));
    const temPaiVisivel = (a: any) => {
      if (a.parent_id) return visibleIds.has(a.parent_id);
      return a.phase_id ? fasesVisiveis.has(`phase:${a.phase_id}`) : false;
    };
    const roots = baseRows.filter((row) => !temPaiVisivel(row.a));
    if (!sort) {
      // Ordem natural da EAP: 1, 1.1, 1.2, 2, 2.1… Ordenar por `idx` (ordem de
      // chegada do banco) espalhava os itens de uma mesma fase pela lista.
      // Sem código, cai para a ordem original — não inventa posição.
      const porWbs = (x: any, y: any) => {
        const cx = String(x.a.wbs_code ?? "").trim();
        const cy = String(y.a.wbs_code ?? "").trim();
        if (cx && cy) return compareWbs(cx, cy) || x.idx - y.idx;
        if (cx) return -1;
        if (cy) return 1;
        return x.idx - y.idx;
      };
      const byOriginalOrder = [...roots].sort(porWbs);
      const ordered: typeof baseRows = [];
      const visit = (node: { a: any; idx: number; mock: any }) => {
        ordered.push(node);
        const children = (childrenByParent.get(node.a.id) || [])
          .filter((child) => visibleIds.has(child.id))
          .map((child) => baseRows.find((row) => row.a.id === child.id))
          .filter((row): row is (typeof baseRows)[number] => !!row)
          .sort(porWbs);
        children.forEach(visit);
      };
      byOriginalOrder.forEach(visit);
      return ordered;
    }

    const ordered: typeof baseRows = [];
    const visit = (node: { a: any; idx: number; mock: any }) => {
      ordered.push(node);
      const children = (childrenByParent.get(node.a.id) || [])
        .filter((child) => visibleIds.has(child.id))
        .map((child) => baseRows.find((row) => row.a.id === child.id))
        .filter((row): row is (typeof baseRows)[number] => !!row)
        .sort(compareRows);
      children.forEach(visit);
    };

    [...roots].sort(compareRows).forEach(visit);
    return ordered;
  }, [baseRows, childrenByParent, sort, slackMap, profiles, wbsById, progressFor]);

  const predsOf = (actId: string) => deps.filter((d) => d.successor_id === actId);

  const goToDependencies = (projectId?: string) => {
    const pid = projectId || (projectIds && projectIds[0]);
    if (!pid) return;
    router.push(`/project/${pid}?tab=dependencies`);
  };

  const openFromCronograma = useCallback((activity: any) => {
    onEditActivity?.(activity);
  }, [onEditActivity]);

  // ===== Redimensionar a coluna "Atividade" arrastando a divisória =====
  // Substitui o antigo slider da toolbar: o usuário puxa a borda direita da
  // coluna de rótulos, como numa planilha. Persiste em localStorage.
  const [resizingLabel, setResizingLabel] = useState(false);
  const startLabelResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = ganttLabelWidth;
    setResizingLabel(true);
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(560, Math.max(240, startW + (ev.clientX - startX)));
      setGanttLabelWidth(next);
    };
    const onUp = () => {
      setResizingLabel(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [ganttLabelWidth]);

  // ===== Arrastar / redimensionar barras do Gantt (reprograma datas) =====
  // dayShift = deslocamento em dias enquanto arrasta (preview otimista);
  // mode: "move" desloca início+fim juntos, "start"/"end" ajusta uma ponta.
  const [barDrag, setBarDrag] = useState<{ id: string; mode: "move" | "start" | "end"; dayShift: number } | null>(null);

  /** Grava start_date/end_date de uma atividade e recarrega. */
  const saveBarDates = useCallback(async (id: string, startISO: string, endISO: string) => {
    const { error } = await supabase
      .from("activities")
      .update({ start_date: startISO, end_date: endISO })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao reprogramar", description: error.message, variant: "destructive" });
      return;
    }
    // Atualização otimista local + refetch para recalcular fases/CPM.
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, start_date: startISO, end_date: endISO } : a)));
    fetchData();
    toast({ title: "Datas atualizadas", description: `${format(parseISO(startISO), "dd/MM/yy")} → ${format(parseISO(endISO), "dd/MM/yy")}` });
  }, [toast, fetchData]);

  /** Inicia o arraste de uma barra (folha, não-marco). DAY_W converte px→dias. */
  const startBarDrag = useCallback((
    e: React.MouseEvent, activity: any, mode: "move" | "start" | "end", dayW: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const s0 = activity.start_date ? parseISO(activity.start_date) : null;
    const e0 = activity.end_date ? parseISO(activity.end_date) : s0;
    if (!s0 || !e0) return;
    let lastShift = 0;
    const onMove = (ev: MouseEvent) => {
      const shift = Math.round((ev.clientX - startX) / dayW);
      lastShift = shift;
      setBarDrag({ id: activity.id, mode, dayShift: shift });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setBarDrag(null);
      if (lastShift === 0) return; // clique sem arrasto → deixa o onClick abrir a edição
      let ns = s0, ne = e0;
      if (mode === "move") { ns = addDays(s0, lastShift); ne = addDays(e0, lastShift); }
      else if (mode === "start") { ns = addDays(s0, lastShift); if (ns > ne) ns = ne; }
      else if (mode === "end") { ne = addDays(e0, lastShift); if (ne < ns) ne = ns; }
      // Avisa (sem bloquear) se o novo início cai em feriado — herda o alerta
      // que o antigo Calendário fazia, agora absorvido aqui.
      const hol = isHoliday(ns, holidays);
      if (hol) toast({ title: "⚠️ Início em feriado", description: `${format(ns, "dd/MM")} é ${hol.name}. Reagendado mesmo assim.` });
      saveBarDates(activity.id, format(ns, "yyyy-MM-dd"), format(ne, "yyyy-MM-dd"));
    };
    document.body.style.cursor = mode === "move" ? "grabbing" : "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [saveBarDates, holidays, toast]);

  const parseYmdDate = useCallback((d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day);
  }, []);

  // Delega à fonte única (lib/activityState) para que Cronograma, healthScore e
  // demais telas nunca divirjam sobre o que é "atrasada".
  const isOverdueByRule = useCallback((activity: any, isCompletedByStage: boolean) => {
    if (!activity) return false;
    return isActivityOverdue(activity, { is_final: isCompletedByStage });
  }, []);

  // ===== Gantt data =====
  // Linha compacta: as datas moram DENTRO da barra (ou coladas nela), não numa
  // faixa própria abaixo — por isso a linha não precisa mais de altura extra.
  const ROW_H = 36;
  const BAR_H = 18;
  const BAR_TOP = (ROW_H - BAR_H) / 2;   // barra centralizada na linha
  // Largura mínima da barra para caber "dd/MM" nas duas pontas, dentro dela.
  const BAR_W_FOR_INNER_DATES = 110;
  const LABEL_W = ganttLabelWidth;

  const ganttData = useMemo(() => {
    const visibleRows = rows.filter((r) => !isHiddenByCollapse(r.a));

    const withDates = visibleRows
      .map(r => {
        let s: Date | null = null;
        let e: Date | null = null;
        const isGroup = isGroupRow(r.a);
        const derived = isGroup ? phaseDerivedDates.get(r.a.id) : null;
        if (isGroup && (derived?.start || derived?.end)) {
          // Agrupador (fase/pacote) com filhos datados: deriva do intervalo deles.
          s = derived?.start ?? null;
          e = derived?.end ?? (s ? addDays(s, 1) : null);
        } else {
          // Atividade, ou agrupador sem filhos datados: usa datas próprias.
          s = r.a.start_date ? parseISO(r.a.start_date) : null;
          e = r.a.end_date ? parseISO(r.a.end_date) : (s ? addDays(s, 1) : null);
        }
        return s && e ? { ...r, s, e } : null;
      })
      .filter(Boolean) as Array<{ a: any; idx: number; mock: any; s: Date; e: Date }>;

    const undated = visibleRows
      .filter(r => {
        const isGroup = isGroupRow(r.a);
        if (isGroup) {
          const d = phaseDerivedDates.get(r.a.id);
          // Agrupador só é "sem data" se nem os filhos nem ele próprio têm datas.
          if (d?.start && d?.end) return false;
          return !(r.a.start_date && r.a.end_date);
        }
        return !(r.a.start_date && r.a.end_date);
      })
      .map(r => ({ ...r, s: null as Date | null, e: null as Date | null }));

    if (!withDates.length && !undated.length) return null;

    const today = new Date();
    let minDate = withDates.length
      ? addDays(dateMin(withDates.map(d => d.s)), -3)
      : addDays(today, -7);
    let maxDate = withDates.length
      ? addDays(dateMax(withDates.map(d => d.e)), 5)
      : addDays(today, 21);

    // Garante uma janela mínima coerente com o zoom selecionado, para que
    // a régua e as barras tenham densidade visual adequada (sem "achatar"
    // quando há poucas atividades datadas em um intervalo curto).
    const includeToday = (a: Date, b: Date) => {
      if (today < a) a = today;
      if (today > b) b = today;
      return [a, b] as const;
    };
    if (zoom === "day") {
      // Dia → expande para meses completos (mostra todos os dias do mês)
      minDate = startOfMonth(minDate);
      maxDate = endOfMonth(maxDate);
      [minDate, maxDate] = includeToday(minDate, maxDate);
    } else if (zoom === "week") {
      // Semana → arredonda para meses completos e garante ao menos ~6 semanas
      minDate = startOfMonth(minDate);
      maxDate = endOfMonth(maxDate);
      const span = differenceInDays(maxDate, minDate);
      if (span < 42) {
        maxDate = endOfMonth(addMonths(maxDate, 1));
      }
      [minDate, maxDate] = includeToday(minDate, maxDate);
    } else if (zoom === "month") {
      // Mês → arredonda para meses cheios e garante ao menos 3 meses
      minDate = startOfMonth(minDate);
      maxDate = endOfMonth(maxDate);
      while (differenceInDays(maxDate, minDate) < 90) {
        maxDate = endOfMonth(addMonths(maxDate, 1));
      }
      [minDate, maxDate] = includeToday(minDate, maxDate);
    } else if (zoom === "quarter") {
      // Trimestre → arredonda para trimestres cheios e garante ao menos 2 trimestres
      minDate = startOfQuarter(minDate);
      maxDate = endOfQuarter(maxDate);
      while (differenceInDays(maxDate, minDate) < 180) {
        maxDate = endOfQuarter(addMonths(maxDate, 3));
      }
      [minDate, maxDate] = includeToday(minDate, maxDate);
    } else if (zoom === "year") {
      // Ano → arredonda para anos cheios (mín. 1 ano) e inclui hoje
      minDate = startOfYear(minDate);
      maxDate = endOfYear(maxDate);
      if (differenceInDays(maxDate, minDate) < 365) {
        maxDate = endOfYear(addMonths(maxDate, 12));
      }
      [minDate, maxDate] = includeToday(minDate, maxDate);
    }

    const days = eachDayOfInterval({ start: minDate, end: maxDate });
    const all = [...withDates, ...undated];
    return { dated: withDates, undated, all, minDate, maxDate, days };
  }, [rows, zoom, isHiddenByCollapse, phaseDerivedDates]);

  /** Largura de um dia: divide o espaço disponível igualmente entre todos os dias. */
  const DAY_W = useMemo(() => {
    const base = ZOOM_PX_PER_DAY[zoom];
    if (!ganttData || ganttContainerWidth <= LABEL_W) return base;
    const dynamic = (ganttContainerWidth - LABEL_W) / ganttData.days.length;
    return Math.max(base, dynamic);
  }, [zoom, ganttData, ganttContainerWidth, LABEL_W]);

  /** Botão "Hoje" — rola o Gantt até a coluna de hoje. */
  const handleScrollToToday = () => {
    if (!ganttData) return;
    const container = document.getElementById("gantt-scroll-container");
    if (!container) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const idx = ganttData.days.findIndex(d => d.toDateString() === today.toDateString());
    if (idx < 0) return;
    container.scrollTo({ left: Math.max(0, idx * DAY_W - 200), behavior: "smooth" });
  };

  /** Renderiza UMA célula da tabela conforme a coluna. */
  const renderCell = (k: ColKey, ctx: any) => {
    const { a, idx, mock, id, dur, progress, preds, responsible, depth, isOverdue } = ctx;
    switch (k) {
      case "id": return (
        <td className="px-2 py-1.5 text-center">
          <span
            title={a.id}
            className="inline-block px-1.5 py-0.5 rounded bg-muted/60 border border-border font-mono text-[10px] text-muted-foreground"
          >
            {id}
          </span>
        </td>
      );
      case "eap": return <td className="px-2 py-1.5 text-center font-mono">{wbsById.get(a.id) ?? "—"}</td>;
      case "project": return <td className="px-2 py-1.5 truncate max-w-[180px] text-muted-foreground" title={projectsMap[a.project_id] || "—"}>{projectsMap[a.project_id] || "—"}</td>;
      case "title": return (
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: depth > 0 ? depth * 12 : 0 }}>
            {a.is_milestone ? (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-orange-500/15 text-orange-700 border-orange-500/40 shrink-0 gap-1">
                <Diamond className="h-2.5 w-2.5 fill-orange-500 text-orange-500" />
                Marco
              </Badge>
            ) : isGroupRow(a) ? (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-primary/10 text-primary border-primary/30 shrink-0 gap-1">
                <Layers className="h-2.5 w-2.5" />
                Fase / Entrega
              </Badge>
            ) : a.parent_id ? (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-500/10 text-amber-700 border-amber-500/30 shrink-0">
                Subatividade
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-700 border-emerald-500/30 shrink-0">
                Atividade
              </Badge>
            )}
            <button
              type="button"
              onClick={() => openFromCronograma(a)}
              className="font-medium truncate max-w-[480px] text-left hover:underline cursor-pointer"
              title="Abrir edição da atividade"
            >
              {a.title}
            </button>
          </div>
        </td>
      );
      case "preds": return (
        <td className="px-2 py-1.5 text-center">
          {preds.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[11px]">
                    {preds.map((p: any, i: number) => {
                      const lt = LINK_TYPES[p.dependency_type] || LINK_TYPES.finish_to_start;
                      const pact = activityById.get(p.predecessor_id);
                      const predecessorRef = (pact && wbsById.get(pact.id))
                        ? (wbsById.get(pact.id) as string)
                        : (pact?.project_id ? shortIdOf(pact.project_id) : (indexById.get(p.predecessor_id) ?? "?"));
                      const lag = (p.lag_days ?? 0);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="inline-flex items-center gap-0.5 hover:underline hover:text-primary/80 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (pact) openFromCronograma(pact);
                          }}
                          title={pact ? `Abrir predecessora: ${pact.title}` : "Predecessora indisponível"}
                        >
                          {i > 0 && ";"}
                          {predecessorRef}{lt.short !== "TI" ? lt.short : ""}{lag ? (lag > 0 ? `+${lag}d` : `${lag}d`) : ""}
                        </button>
                      );
                    })}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold">Predecessoras</div>
                    {preds.map((p: any) => {
                      const lt = LINK_TYPES[p.dependency_type] || LINK_TYPES.finish_to_start;
                      const pact = activityById.get(p.predecessor_id);
                      const eap = pact ? wbsById.get(pact.id) : undefined;
                      const projectRef = pact?.project_id ? shortIdOf(pact.project_id) : "?";
                      const predecessorRef = eap || projectRef;
                      const predecessorRefTitle = eap
                        ? `EAP ${eap}`
                        : (pact?.project_id ? `ID Projeto ${pact.project_id}` : "Sem referência");
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left rounded px-1 py-1 hover:bg-muted/60 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (pact) openFromCronograma(pact);
                          }}
                          title={pact ? `Abrir predecessora: ${pact.title}` : predecessorRefTitle}
                        >
                          <div className="font-mono">{predecessorRef} • {lt.label}</div>
                          <div className="text-muted-foreground">{pact?.title || "—"}</div>
                          <div className="text-muted-foreground">{lt.desc}</div>
                          {p.lag_days != null && p.lag_days !== 0 && (
                            <div className="text-muted-foreground">Lag: {p.lag_days}d</div>
                          )}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToDependencies(a.project_id);
                      }}
                      className="w-full pt-1.5 mt-1.5 border-t flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 text-left"
                    >
                      <ExternalLink className="h-3 w-3" /> Clique para abrir Dependências
                    </button>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </td>
      );
      case "responsible": return <td className="px-2 py-1.5 truncate max-w-[160px]" title={responsible}>{responsible}</td>;
      case "column": return (() => {
        const stageInfo = a.workflow_stage_id ? stageById.get(a.workflow_stage_id) : undefined;
        if (!stageInfo) return <td className="px-2 py-1.5 text-center text-muted-foreground">—</td>;
        return (
          <td className="px-2 py-1.5 text-center">
            <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: stageInfo.color, color: stageInfo.color }}>
              {stageInfo.title}
            </Badge>
          </td>
        );
      })();
      case "status": return (() => {
        const stageInfo = a.workflow_stage_id ? stageById.get(a.workflow_stage_id) : undefined;
        const projStages = stagesByProject.get(a.project_id) || [];
        const progressInfo = computeActivityProgress(a.workflow_stage_id, projStages as any, a.last_progress_stage_id);
        const label = stageInfo?.is_final
          ? "Concluída"
          : progressInfo.paused
            ? "Pausada"
            : stageInfo?.title || "Sem status";
        const cls = stageInfo?.is_final
          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/40"
          : progressInfo.paused
            ? "bg-amber-500/10 text-amber-700 border-amber-500/40"
            : "bg-primary/10 text-primary border-primary/30";
        return (
          <td className="px-2 py-1.5 text-center">
            <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5", cls)}>
              {label}
            </Badge>
          </td>
        );
      })();
      case "duration": return <td className="px-2 py-1.5 text-center">{dur ?? "—"}</td>;
      case "plannedStart": return <td className="px-2 py-1.5 text-center">{formatDateBR(a.start_date)}</td>;
      case "plannedEnd": return (
        <td className="px-2 py-1.5 text-center">
          {isOverdue ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive bg-destructive/10 text-destructive animate-pulse-overdue">
              <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
              {formatDateBR(a.end_date)}
            </Badge>
          ) : (
            formatDateBR(a.end_date)
          )}
        </td>
      );
      case "actualStart": return <td className="px-2 py-1.5 text-center text-muted-foreground">{formatDateBR(a.actual_start_date || null)}</td>;
      case "actualEnd": return <td className="px-2 py-1.5 text-center text-muted-foreground">{formatDateBR(a.actual_end_date || null)}</td>;
      case "variance": {
        const real = a.actual_end_date || null;
        const v = endVariance(real, a.baseline_end_date, a.end_date);
        if (v === null) return <td className="px-2 py-1.5 text-center text-muted-foreground">—</td>;
        const tone = varianceTone(v);
        return (
          <td className="px-2 py-1.5 text-center">
            <Badge
              variant="outline"
              className={cn("text-[10px] py-0 px-1.5 font-mono", varianceClasses(tone))}
              title={a.baseline_end_date ? "Real − Linha de Base" : "Real − Previsto (sem linha de base congelada)"}
            >
              {formatVariance(v)}
            </Badge>
          </td>
        );
      }
      case "blockedDays": return (() => {
        const accumulated = Number((a as any).blocked_days_total || 0);
        const since = (a as any).blocked_since as string | null | undefined;
        let days = accumulated;
        if (since) {
          const t = new Date(since).getTime();
          if (!Number.isNaN(t)) days += Math.max(0, (Date.now() - t) / 86400000);
        }
        const whole = Math.floor(days);
        if (days <= 0) return <td className="px-2 py-1.5 text-center text-muted-foreground">—</td>;
        const cls = since
          ? "bg-orange-500/15 text-orange-700 border-orange-500/40"
          : "bg-muted text-muted-foreground border-border";
        return (
          <td className="px-2 py-1.5 text-center">
            <Badge
              variant="outline"
              className={cn("text-[10px] py-0 px-1.5 font-mono", cls)}
              title={since ? `Bloqueada agora desde ${new Date(since).toLocaleString("pt-BR")}` : "Tempo total acumulado em colunas de bloqueio"}
            >
              {whole}d{since ? " (em curso)" : ""}
            </Badge>
          </td>
        );
      })();
      case "progress": return (
        <td className="px-2 py-1.5 text-center">
          <div className="flex items-center justify-center gap-1">
            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[10px]">{progress}%</span>
          </div>
        </td>
      );
      case "slack": return (
        <td className="px-2 py-1.5 text-center">
          {(() => {
            if (!a.start_date || !a.end_date) return <span className="text-muted-foreground text-[11px]">—</span>;
            const metrics = slackMetricsById.get(a.id);
            if (!metrics) return <span className="text-muted-foreground text-[11px]">—</span>;
            const slack = metrics.total;
            const cls =
              slack === 0 ? "bg-red-500/10 text-red-600 border-red-500/40"
              : slack <= 3 ? "bg-amber-500/10 text-amber-700 border-amber-500/40"
              : "bg-emerald-500/10 text-emerald-700 border-emerald-500/40";
            return (
              <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 gap-1 font-mono", cls)} title={`Folga total: ${metrics.total}d`}>
                {slack === 0 && <AlertTriangle className="h-3 w-3" />}
                {slack}d
              </Badge>
            );
          })()}
        </td>
      );
      case "slackFree": return (
        <td className="px-2 py-1.5 text-center">
          {(() => {
            if (!a.start_date || !a.end_date) return <span className="text-muted-foreground text-[11px]">—</span>;
            const metrics = slackMetricsById.get(a.id);
            if (!metrics) return <span className="text-muted-foreground text-[11px]">—</span>;
            const fl = metrics.free;
            const cls =
              fl === 0 ? "bg-red-500/10 text-red-600 border-red-500/40"
              : fl <= 3 ? "bg-amber-500/10 text-amber-700 border-amber-500/40"
              : "bg-emerald-500/10 text-emerald-700 border-emerald-500/40";
            return (
              <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 font-mono", cls)} title={`Folga livre: ${fl}d`}>
                {fl}d
              </Badge>
            );
          })()}
        </td>
      );
      case "mainResource": return <td className="px-2 py-1.5 truncate max-w-[140px]" title={mock.mainResource}>{mock.mainResource}</td>;
      case "effort": return <td className="px-2 py-1.5 text-center font-mono">{mock.effortHours}</td>;
      case "compression": return (
        <td className="px-2 py-1.5 text-center">
          <Badge variant="outline" className={cn(
            "text-[10px] py-0 px-1.5",
            mock.compression === "Alta" && "border-emerald-500/40 text-emerald-700",
            mock.compression === "Média" && "border-amber-500/40 text-amber-700",
            mock.compression === "Baixa" && "border-orange-500/40 text-orange-700",
            mock.compression === "Nenhuma" && "text-muted-foreground",
          )}>{mock.compression}</Badge>
        </td>
      );
      case "observation": return (
        <td className="px-2 py-1.5 text-muted-foreground italic truncate max-w-[220px]" title={mock.observation}>
          {mock.observation || "—"}
        </td>
      );
    }
  };

  const TableView = (
    <div className="border rounded-lg overflow-auto bg-card">
      <DndContext
        sensors={headerSensors}
        collisionDetection={closestCenter}
        onDragStart={handleHeaderDragStart}
        onDragEnd={handleHeaderDragEnd}
      >
        <table className="w-full text-xs">
          <thead className="bg-primary/95 text-primary-foreground sticky top-0 z-10">
            <SortableContext items={visibleCols} strategy={horizontalListSortingStrategy}>
              <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold [&>th]:text-center [&>th]:border-r [&>th]:border-primary-foreground/20 [&>th:last-child]:border-r-0">
                {visibleCols.map((k) => (
                  <SortableHeaderCell
                    key={k}
                    col={k}
                    sortable={SORTABLE_COLS.has(k)}
                    active={sort?.col === k}
                    cycleSort={cycleSort}
                    label={COL_LABELS[k]}
                  />
                ))}
              </tr>
            </SortableContext>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={visibleCols.length} className="text-center py-10 text-muted-foreground">Nenhuma atividade encontrada.</td></tr>
            )}
            {rows.map(({ a, idx, mock }, rowIdx) => {
              const id = indexById.get(a.id) ?? shortIdOf(a.id);
              const dur = workDays(a.start_date, a.end_date);
              const progress = progressFor(a);
              const preds = predsOf(a.id);
              const responsible = resolveResponsible(a.assigned_to);
              const depth = depthById.get(a.id) ?? 0;
              const stageInfo = a.workflow_stage_id ? stageById.get(a.workflow_stage_id) : undefined;
              const stageColor = stageInfo?.color;
              const isStageFinal = stageInfo?.is_final;
              const isOverdue = isOverdueByRule(a, !!isStageFinal);
              const ctx = { a, idx, mock, id, dur, progress, preds, responsible, depth, isOverdue };
              return (
                <tr
                  key={`${a.project_id}:${a.item_type ?? "atividade"}:${a.id}:${rowIdx}`}
                  className={cn(
                    "border-b hover:bg-muted/40 transition-colors",
                    isStageFinal && "opacity-90",
                    isOverdue && "bg-destructive/5"
                  )}
                  style={stageColor ? { borderLeft: `3px solid ${stageColor}` } : undefined}
                >
                  {visibleCols.map((k) => (
                    <Fragment key={k}>{renderCell(k, ctx)}</Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <DragOverlay>
          {draggingHeaderCol ? (
            <div className="px-3 py-2 rounded-md border border-primary/30 bg-card/90 shadow-lg text-xs font-semibold text-foreground">
              {COL_LABELS[draggingHeaderCol]}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <div className="px-3 py-2 text-[10px] text-muted-foreground border-t flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/40 text-[10px] py-0 px-1.5 font-mono">0d</Badge>
          crítica
        </span>
        <span className="inline-flex items-center gap-1">
          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/40 text-[10px] py-0 px-1.5 font-mono">1-3d</Badge>
          atenção
        </span>
        <span className="inline-flex items-center gap-1">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/40 text-[10px] py-0 px-1.5 font-mono">≥4d</Badge>
          folga confortável
        </span>
        <span className="ml-auto">Esforço, Compressão e Observações são <strong>mock</strong> nesta prova de conceito.</span>
      </div>
    </div>
  );

  /** Decide quando rotular dias x meses na régua, baseado no zoom. */
  const showDayLabels = zoom === "day" || zoom === "week";

  /**
   * Presença real de cada elemento na janela visível — a legenda só lista o que
   * existe na tela (menos ruído). Feriado/férias são checados nos dias visíveis.
   */
  const legendPresence = useMemo(() => {
    const days = ganttData?.days ?? [];
    let hasHoliday = false;
    let hasVacation = false;
    for (const d of days) {
      if (!hasHoliday && isHoliday(d, holidays)) hasHoliday = true;
      else if (!hasVacation && isOnVacation(d, workSchedule)) hasVacation = true;
      if (hasHoliday && hasVacation) break;
    }
    return {
      hasCritical: criticalSet.size > 0,
      hasUndated: (ganttData?.undated.length ?? 0) > 0,
      hasHoliday,
      hasVacation,
      hasWeekendShading: showDayLabels, // sombreamento de fim de semana só nos zooms dia/semana
    };
  }, [ganttData, holidays, workSchedule, criticalSet, showDayLabels]);

  /**
   * Saúde do cronograma: responde "como o projeto está", não "quantas linhas há".
   * Conta apenas trabalho real — fases são agrupadores e seriam dupla contagem,
   * já que o estado delas deriva dos filhos.
   */
  const ganttHealth = useMemo(() => {
    const count: Record<ActivityState, number> = {
      concluida: 0, cancelada: 0, atrasada: 0, bloqueada: 0, andamento: 0, a_iniciar: 0,
    };
    let undated = 0;

    for (const { a } of rows) {
      const isGroup =
        !a.is_milestone &&
        isGroupRow(a);
      if (isGroup) continue;

      if (!(a.start_date && a.end_date)) undated++;

      // Colunas do projeto DA atividade: no Cronograma Geral cada projeto tem
      // o seu workflow, e usar a lista errada classificaria o andamento errado.
      const stage = a.workflow_stage_id ? stageById.get(a.workflow_stage_id) : undefined;
      const projStages = stagesByProject.get(a.project_id) || [];
      count[resolveActivityState(a, stage, projStages as any)]++;
    }
    return { ...count, undated };
  }, [rows, childrenByParent, stageById, stagesByProject]);

  const GanttBlock = (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Barra de resumo: estado do cronograma (não contagem de linhas) e a
          pendência acionável. O vocabulário visual mora no painel "Legenda" —
          repeti-lo aqui só criava duplicação que envelhece mal. */}
      <div className="flex items-center px-3 py-2 border-b bg-muted/20 gap-x-3 gap-y-1.5 flex-wrap">
        {onlyUndated ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-500">
            <CalendarOff className="h-3.5 w-3.5" />
            Mostrando apenas itens sem datas
          </span>
        ) : (
          <div className="inline-flex items-center gap-3 text-[11px] text-muted-foreground whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-emerald-600 shrink-0" />
              <span className="font-semibold text-foreground tabular-nums">{ganttHealth.concluida}</span> concluída(s)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-destructive shrink-0" />
              <span className="font-semibold text-foreground tabular-nums">{ganttHealth.atrasada}</span> atrasada(s)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-primary shrink-0" />
              <span className="font-semibold text-foreground tabular-nums">{ganttHealth.andamento}</span> em andamento
            </span>
            {ganttHealth.bloqueada > 0 && (
              <span className="inline-flex items-center gap-1.5" title="Em coluna de bloqueio ou exceção no Kanban">
                <span className="h-[7px] w-[7px] rounded-full bg-amber-500 shrink-0" />
                <span className="font-semibold text-foreground tabular-nums">{ganttHealth.bloqueada}</span> bloqueada(s)
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full border-[1.5px] border-muted-foreground/45 shrink-0" />
              <span className="font-semibold text-foreground tabular-nums">{ganttHealth.a_iniciar}</span> a iniciar
            </span>
          </div>
        )}

        {/* Empurra a pendência e a Legenda para a direita, exista ou não o botão. */}
        <span className="ml-auto" />

        {/* Pendência acionável: filtra o cronograma para os itens sem datas. */}
        {(ganttHealth.undated > 0 || onlyUndated) && (
          <Button
            variant={onlyUndated ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setOnlyUndated(v => !v)}
            className={cn(
              "h-6 gap-1.5 px-2 text-[11px]",
              !onlyUndated && "text-amber-700 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-400",
            )}
            title={onlyUndated ? "Voltar ao cronograma completo" : "Ver só os itens que ainda precisam de datas"}
          >
            {onlyUndated ? (
              <><X className="h-3.5 w-3.5" /> Limpar filtro</>
            ) : (
              <><CalendarOff className="h-3.5 w-3.5" /> {ganttHealth.undated} sem datas</>
            )}
          </Button>
        )}

        {/* Painel de legenda completo, agrupado por significado */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground">
              <Info className="h-3.5 w-3.5" /> Legenda
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="px-3 py-2 border-b">
              <div className="text-xs font-semibold">Como ler o cronograma</div>
              <div className="text-[11px] text-muted-foreground">O que cada elemento representa no gráfico.</div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-3 space-y-3">
              {/* ── O QUE É: três formas ── */}
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">O que é — a forma</div>
                <LegendRow
                  sample={
                    <span className="relative block w-9 h-3.5 rounded-sm bg-muted-foreground/25 border border-border overflow-hidden">
                      <span className="absolute inset-y-0 left-0 w-3/5 bg-primary" />
                    </span>
                  }
                  title="Tarefa"
                  desc="Barra-trilho; a parte preenchida é o quanto já avançou."
                />
                <LegendRow
                  sample={
                    <span className="relative block w-9 h-3">
                      <span className="absolute inset-x-0 top-0 h-1.5 rounded-sm bg-foreground/55" />
                      <span className="absolute left-0 top-1.5" style={{ width: 0, height: 0, borderLeft: "3px solid transparent", borderRight: "3px solid transparent", borderTop: "5px solid hsl(var(--foreground) / 0.55)" }} />
                      <span className="absolute right-0 top-1.5" style={{ width: 0, height: 0, borderLeft: "3px solid transparent", borderRight: "3px solid transparent", borderTop: "5px solid hsl(var(--foreground) / 0.55)" }} />
                    </span>
                  }
                  title="Fase / Entrega"
                  desc="Barra-resumo cinza com abas nas pontas; datas derivadas das tarefas filhas."
                />
                <LegendRow
                  sample={<span className="block w-3 h-3 rotate-45 bg-card border-[2px] border-foreground mx-auto" />}
                  title="Marco"
                  desc="Losango vazado. Data única (entrega ou decisão), sem duração."
                />
              </div>

              {/* ── COMO ESTÁ: o ponto ── */}
              <div className="space-y-2 pt-1 border-t">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Como está — o ponto</div>
                <LegendRow
                  sample={<span className="block h-[7px] w-[7px] rounded-full bg-primary mx-auto" />}
                  title="Em andamento"
                  desc="Começou e ainda não terminou."
                />
                <LegendRow
                  sample={<span className="block h-[7px] w-[7px] rounded-full bg-emerald-600 mx-auto" />}
                  title="Concluída"
                  desc="Barra totalmente preenchida."
                />
                <LegendRow
                  sample={<span className="block h-[7px] w-[7px] rounded-full bg-destructive mx-auto" />}
                  title="Atrasada"
                  desc="Passou da data de fim sem concluir."
                />
                <LegendRow
                  sample={<span className="block h-[7px] w-[7px] rounded-full bg-amber-500 mx-auto" />}
                  title="Bloqueada"
                  desc="Em coluna de bloqueio ou exceção no Kanban."
                />
                <LegendRow
                  sample={<span className="block h-[7px] w-[7px] rounded-full border-[1.5px] border-muted-foreground/45 mx-auto" />}
                  title="Não iniciada"
                  desc="Sem progresso registrado."
                />
              </div>

              {/* ── DESTAQUES ── */}
              {(legendPresence.hasCritical || legendPresence.hasUndated) && (
                <div className="space-y-2 pt-1 border-t">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Destaques</div>
                  {legendPresence.hasCritical && (
                    <LegendRow
                      sample={<AlertTriangle className="h-3.5 w-3.5 text-red-500 mx-auto" />}
                      title="Caminho crítico"
                      desc="Atividades que, se atrasarem, atrasam a entrega do projeto."
                    />
                  )}
                  {legendPresence.hasUndated && (
                    <LegendRow
                      sample={<CalendarOff className="h-3.5 w-3.5 text-muted-foreground mx-auto" />}
                      title="Sem datas"
                      desc="Item ainda não agendado (sem início/fim definidos)."
                    />
                  )}
                </div>
              )}

              {/* ── CALENDÁRIO (fundo) ── */}
              <div className="space-y-2 pt-1 border-t">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Calendário (fundo)</div>
                <LegendRow
                  sample={<span className="block w-0.5 h-3.5 bg-primary/80 mx-auto" />}
                  title="Hoje"
                  desc="Linha vertical marcando a data atual."
                />
                {legendPresence.hasHoliday && (
                  <LegendRow
                    sample={<span className="block w-9 h-3 rounded-sm bg-destructive/20 border border-destructive/40" />}
                    title="Feriado"
                    desc="Dia não útil, vindo do calendário da organização."
                  />
                )}
                {legendPresence.hasVacation && (
                  <LegendRow
                    sample={<span className="block w-9 h-3 rounded-sm bg-sky-500/20 border border-sky-500/40" />}
                    title="Férias"
                    desc="Período de férias do responsável pela atividade."
                  />
                )}
                {legendPresence.hasWeekendShading && (
                  <LegendRow
                    sample={<span className="block w-9 h-3 rounded-sm bg-muted/60 border border-border" />}
                    title="Fim de semana"
                    desc="Sábado e domingo sombreados (visível nos zooms Dia e Semana)."
                  />
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {!ganttData ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma atividade para exibir no Gantt.
        </div>
      ) : (
        <div id="gantt-scroll-container" ref={ganttScrollRef} className="overflow-auto max-h-[calc(100vh-230px)] min-h-[420px]">
          <div className="flex" style={{ width: LABEL_W + ganttData.days.length * DAY_W, minWidth: "100%" }}>
            {/* Coluna fixa de rótulos */}
            <div className="sticky left-0 z-20 bg-card border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] relative" style={{ width: LABEL_W }}>
              {/* Alça de redimensionamento: arraste a borda direita (como planilha) */}
              <div
                onMouseDown={startLabelResize}
                className={cn(
                  "absolute top-0 right-0 bottom-0 w-1.5 translate-x-1/2 z-30 cursor-col-resize group",
                  "hover:bg-primary/20 transition-colors",
                  resizingLabel && "bg-primary/30",
                )}
                title="Arraste para ajustar a largura da coluna"
              >
                <div className={cn(
                  "absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border group-hover:bg-primary/60",
                  resizingLabel && "bg-primary",
                )} />
              </div>
              {/* Cabeçalho da coluna: fundo OPACO e z alto — senão as linhas de
                  atividade vazam por cima ao rolar (o texto ficava sobreposto). */}
              <div className="border-b sticky top-0 z-30 flex items-end bg-card" style={{ height: showDayLabels ? 56 : 28 }}>
                <div className="absolute inset-0 bg-muted/40" />
                <div className="relative px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Atividade
                </div>
              </div>
              {ganttData.all.map(({ a }, rowIdx) => {
                const id = indexById.get(a.id);
                const isCritical = criticalSet.has(a.id);
                const noDates = !a.start_date || !a.end_date;
                const responsible = resolveResponsible(a.assigned_to);
                const projTitle = projectsMap[a.project_id];
                const depth = depthById.get(a.id) ?? 0;
                // Agrupador = Fase/Entrega (cobre 'fase', 'pacote' legado e itens
                // com filhos). Modelo unificado (lib/eapModel).
                const isPhase =
                  !a.is_milestone &&
                  isGroupRow(a);
                const isGroup = isPhase;
                const isSubactivity = !isGroup && !!a.parent_id;
                const isMilestone = !!a.is_milestone;
                const stageInfo = a.workflow_stage_id ? stageById.get(a.workflow_stage_id) : undefined;
                const isCompleted = stageInfo?.is_final || a.status === "completed";
                const isOverdue = isOverdueByRule(a, !!isCompleted);
                // Estado pela fonte única — inclui "bloqueada", que antes se
                // escondia entre as "a iniciar".
                const rowState = resolveActivityState(
                  a, stageInfo, (stagesByProject.get(a.project_id) || []) as any,
                );
                const hasChildren = (childrenByParent.get(a.id) || []).length > 0;
                const collapsed = collapsedPhases.has(a.id);
                return (
                  <div key={`${a.project_id}:${a.item_type ?? "atividade"}:${a.id}:${rowIdx}`}
                    className={cn(
                      "border-b px-3 flex items-center gap-2 hover:bg-muted/40",
                      isOverdue && "bg-destructive/5 border-l-2 border-l-destructive"
                    )}
                    style={{ height: ROW_H, paddingLeft: 12 + depth * 14 }}>
                    {isGroup && hasChildren ? (
                      <button
                        type="button"
                        onClick={() => togglePhase(a.id)}
                        className="shrink-0 p-0.5 -ml-1 rounded hover:bg-muted"
                        title={collapsed ? "Expandir" : "Recolher"}
                      >
                        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    ) : isPhase ? (
                      <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : null}
                    {/* Ponto de estado: único lugar onde o andamento é codificado por cor.
                        Fica sempre imediatamente antes do código, para ser escaneado
                        verticalmente. Não iniciada = círculo vazado. */}
                    <span
                      className={cn(
                        "h-[7px] w-[7px] rounded-full shrink-0",
                        rowState === "atrasada" ? "bg-destructive"
                          : rowState === "concluida" ? "bg-emerald-600"
                          : rowState === "cancelada" ? "bg-muted-foreground/35"
                          : rowState === "bloqueada" ? "bg-amber-500"
                          : rowState === "andamento" ? "bg-primary"
                          : "border-[1.5px] border-muted-foreground/45",
                      )}
                      title={ACTIVITY_STATE_LABEL[rowState]}
                    />
                    <span className="text-[10px] font-mono text-muted-foreground w-[52px] shrink-0">#{id}</span>
                    <div className="flex-1 min-w-0">
                      {/* Tipo por tipografia/indentação: Fase = primária semibold caixa-alta,
                          Sub = muted, Tarefa = padrão. Marco recebe o mesmo losango vazado
                          que o usa no gráfico — a forma é a mesma nos dois lugares.
                          "Atrasada" já é dito pelo ponto de estado; aqui não se repete. */}
                      <div className={cn(
                        "text-[13px] flex items-center gap-1.5",
                        isGroup && "font-semibold",
                        isPhase && "text-primary uppercase tracking-wide",
                        isSubactivity && !isMilestone && "text-muted-foreground",
                      )}>
                        {isMilestone && (
                          <span
                            className="h-2 w-2 rotate-45 bg-card border-[1.5px] border-foreground shrink-0"
                            title="Marco"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => openFromCronograma(a)}
                          className="truncate text-left hover:underline cursor-pointer"
                          title="Abrir edição da atividade"
                        >
                          {a.title}
                        </button>
                        {isCritical && (
                          <span title="Caminho crítico" className="shrink-0 inline-flex">
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                          </span>
                        )}
                        {noDates && <CalendarOff className="h-3 w-3 text-muted-foreground shrink-0" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Área do gráfico */}
            <div
              className="relative flex-1"
              style={{ minWidth: ganttData.days.length * DAY_W }}
            >
              {/* Cabeçalho meses + dias */}
              <div className="border-b sticky top-0 z-10 bg-card shadow-[0_2px_4px_-2px_rgba(0,0,0,0.08)]">
                <div className="flex" style={{ height: 28 }}>
                  {(() => {
                    // Meses por extenso quando cabe (>= 90px de largura); senão abreviado.
                    const segments: { label: string; width: number }[] = [];
                    let i = 0;
                    while (i < ganttData.days.length) {
                      const monthStart = ganttData.days[i];
                      let j = i;
                      while (j < ganttData.days.length && isSameMonth(ganttData.days[j], monthStart)) j++;
                      const width = (j - i) * DAY_W;
                      segments.push({
                        label: format(monthStart, width >= 90 ? "MMMM yyyy" : "MMM yyyy", { locale: ptBR }),
                        width,
                      });
                      i = j;
                    }
                    return [
                      ...segments.map((s, k) => (
                        <div key={k} className="border-r text-[12px] font-semibold text-center bg-muted/40 capitalize overflow-hidden whitespace-nowrap flex items-center justify-center text-foreground/80"
                          style={{ width: s.width }}>
                          {s.label}
                        </div>
                      )),
                      <div key="filler" className="flex-1 bg-muted/40" />,
                    ];
                  })()}
                </div>
                {showDayLabels && (
                  <div className="flex border-t border-border/60" style={{ height: 28 }}>
                    {ganttData.days.map((d, k) => {
                      const isToday = d.toDateString() === new Date().toDateString();
                      const hol = isHoliday(d, holidays);
                      const vac = !hol && isOnVacation(d, workSchedule);
                      return (
                        <div key={k}
                          title={hol ? `Feriado: ${hol.name}` : vac ? "Férias do responsável" : undefined}
                          className={cn(
                            "border-r border-border/40 text-[11px] text-center flex items-center justify-center tabular-nums relative",
                            hol ? "bg-destructive/10 text-destructive font-medium"
                              : vac ? "bg-sky-500/10 text-sky-600"
                              : isWeekend(d) ? "bg-muted/40 text-muted-foreground/70" : "text-muted-foreground",
                            isToday && "bg-primary/10 text-primary font-semibold",
                          )}
                          style={{ width: DAY_W }}>
                          {zoom === "day" ? format(d, "d") : (d.getDay() === 1 ? format(d, "d/MM") : "")}
                          {hol && DAY_W >= 14 && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-destructive" />}
                        </div>
                      );
                    })}
                    <div className="flex-1" />
                  </div>
                )}
              </div>

              <div className="relative">
                {/* fundo: faixas de dias não úteis — feriado (vermelho), férias
                    (azul) e fim de semana (cinza). Feriado/férias vêm do antigo
                    Calendário, agora absorvidos aqui. Só em day/week (dia visível). */}
                {(zoom === "day" || zoom === "week") && (
                  <div className="absolute inset-0 flex pointer-events-none">
                    {ganttData.days.map((d, k) => {
                      const hol = isHoliday(d, holidays);
                      const vac = !hol && isOnVacation(d, workSchedule);
                      return (
                        <div key={k}
                          className={cn(
                            "border-r border-border/30",
                            hol ? "bg-destructive/10" : vac ? "bg-sky-500/10" : isWeekend(d) && "bg-muted/30",
                          )}
                          style={{ width: DAY_W }} />
                      );
                    })}
                    <div className="flex-1" />
                  </div>
                )}

                {/* linha de hoje */}
                {(() => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  if (today < ganttData.minDate || today > ganttData.maxDate) return null;
                  const idxDay = ganttData.days.findIndex(d => d.toDateString() === today.toDateString());
                  if (idxDay < 0) return null;
                  return (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-primary/80 pointer-events-none z-10"
                      style={{ left: idxDay * DAY_W + DAY_W / 2 }}>
                      <div className="absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                        Hoje
                      </div>
                    </div>
                  );
                })()}

                {ganttData.all.map(({ a, s, e }, rowIdx) => {
                  const depth = depthById.get(a.id) ?? 0;
                  const hierarchyOffset = Math.min(24, depth * 6);
                  if (!s || !e) {
                    const todayIdx = ganttData.days.findIndex(
                      d => d.toDateString() === new Date(new Date().setHours(0,0,0,0)).toDateString()
                    );
                    const left = (todayIdx >= 0 ? todayIdx : 0) * DAY_W + hierarchyOffset;
                    return (
                      <div key={`${a.project_id}:${a.item_type ?? "atividade"}:${a.id}:${rowIdx}`} className="relative border-b bg-muted/10" style={{ height: ROW_H }}>
                        <div className="absolute inline-flex items-center gap-1 px-2 rounded border border-dashed border-muted-foreground/40 bg-card text-[10px] text-muted-foreground"
                          style={{ left: Math.max(0, left - 60), top: BAR_TOP, height: BAR_H }}>
                          <CalendarOff className="h-3 w-3" />
                          Sem datas
                        </div>
                      </div>
                    );
                  }
                  const startIdx = ganttData.days.findIndex(d => d.toDateString() === s.toDateString());
                  const endIdx = ganttData.days.findIndex(d => d.toDateString() === e.toDateString());
                  let left = Math.max(0, startIdx) * DAY_W + hierarchyOffset;
                  let width = Math.max(2, Math.max(2, (endIdx - startIdx + 1)) * DAY_W - 2 - hierarchyOffset);
                  // Preview otimista do arraste: desloca left/width em px enquanto arrasta.
                  const drag = barDrag && barDrag.id === a.id ? barDrag : null;
                  if (drag) {
                    const px = drag.dayShift * DAY_W;
                    if (drag.mode === "move") left += px;
                    else if (drag.mode === "start") { left += px; width -= px; }
                    else if (drag.mode === "end") { width += px; }
                    width = Math.max(DAY_W, width);
                    left = Math.max(0, left);
                  }
                  const isCritical = criticalSet.has(a.id);
                  const stageInfo = a.workflow_stage_id ? stageById.get(a.workflow_stage_id) : undefined;
                  const isCompleted = stageInfo?.is_final || a.status === "completed";
                  const isOverdue = isOverdueByRule(a, !!isCompleted);
                  const progress = progressFor(a);
                  const responsible = resolveResponsible(a.assigned_to);
                  // Agrupador = Fase/Entrega (cobre 'fase', 'pacote' legado, filhos).
                  const isPhase =
                    !a.is_milestone &&
                    isGroupRow(a);
                  const isGroup = isPhase;
                  const isSubactivity = !isGroup && !!a.parent_id;

                  // Datas em contraste pleno, sem depender de hover.
                  // Cabendo na barra, vão dentro dela (branco sobre a cor); senão,
                  // viram uma etiqueta única colada à direita, em text-foreground.
                  const startLabel = format(s, "dd/MM");
                  const endLabel = format(e, "dd/MM");
                  const datesFitInsideBar =
                    !a.is_milestone && !isGroup && width >= BAR_W_FOR_INNER_DATES;

                  return (
                    <div key={`${a.project_id}:${a.item_type ?? "atividade"}:${a.id}:${rowIdx}`} className="relative border-b" style={{ height: ROW_H }}>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {a.is_milestone ? (
                              <div className="absolute cursor-pointer z-10"
                                style={{ left: left + DAY_W / 2 - 9, top: BAR_TOP + BAR_H / 2 - 9 }}
                                onClick={() => openFromCronograma(a)}
                                title="Abrir edição da atividade"
                              >
                                {/* Marco: losango VAZADO. A forma diz "marco"; o estado
                                    fica no ponto da coluna da esquerda, como em todo item. */}
                                <div className="w-[14px] h-[14px] rotate-45 bg-card border-[2.5px] border-foreground shadow-sm transition-transform hover:scale-110" />
                              </div>
                            ) : isGroup ? (
                              // Fase/Entrega: barra-resumo CINZA (neutra), mais fina, com
                              // "abas" nas pontas. Neutra de propósito: a cor pertence ao
                              // preenchimento de progresso das tarefas, não ao agrupador.
                              <div
                                className="absolute cursor-pointer z-10"
                                style={{ left, width, height: 12, top: BAR_TOP + (BAR_H - 12) / 2 }}
                                onClick={() => openFromCronograma(a)}
                                title="Abrir edição da atividade"
                              >
                                <div className="absolute inset-x-0 top-0 h-1.5 rounded-sm bg-foreground/55" />
                                <div className="absolute left-0 top-1.5"
                                  style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid hsl(var(--foreground) / 0.55)" }} />
                                <div className="absolute right-0 top-1.5"
                                  style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid hsl(var(--foreground) / 0.55)" }} />
                              </div>
                            ) : (
                              // Tarefa: BARRA-TRILHO. O trilho é neutro e o progresso o
                              // preenche da esquerda — a extensão do preenchimento é a
                              // informação principal, legível sem depender de matiz.
                              <div className={cn(
                                "group absolute rounded-md overflow-visible transition-all hover:brightness-105",
                                // z-10: a barra sempre cobre uma etiqueta de datas que
                                // porventura invada seu espaço vindo da linha ao lado.
                                drag ? "cursor-grabbing ring-2 ring-primary/60 z-20" : "cursor-grab z-10",
                                "bg-muted-foreground/25 border border-border",
                              )}
                                onMouseDown={(ev) => startBarDrag(ev, a, "move", DAY_W)}
                                onClick={() => { if (!barDrag) openFromCronograma(a); }}
                                title="Arraste para mover · puxe as bordas para redimensionar · clique para abrir"
                                style={{ left, width, top: BAR_TOP, height: BAR_H }}>
                                <div className="absolute inset-0 rounded-md overflow-hidden">
                                  {/* Preenchimento = progresso. A cor é o estado. */}
                                  {progress > 0 && (
                                    <div
                                      className={cn(
                                        "absolute inset-y-0 left-0",
                                        isOverdue ? "bg-destructive"
                                          : isCompleted ? "bg-emerald-600"
                                          : "bg-primary",
                                      )}
                                      style={{ width: `${progress}%` }}
                                    />
                                  )}

                                  {/* Datas sobre o trilho, em texto escuro. Tamanho e cor
                                      únicos em todo o Gantt — nada de branco aqui. */}
                                  {datesFitInsideBar && (
                                    <div className="absolute inset-0 flex items-center justify-between px-2 text-[11px] font-semibold text-foreground tabular-nums pointer-events-none">
                                      <span>{startLabel}</span>
                                      <span>{endLabel}</span>
                                    </div>
                                  )}
                                </div>
                                {/* Alças de redimensionamento (aparecem no hover) */}
                                <div
                                  onMouseDown={(ev) => startBarDrag(ev, a, "start", DAY_W)}
                                  className="absolute left-0 inset-y-0 w-2 -translate-x-1/2 cursor-col-resize opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                >
                                  <div className="w-1 h-1/2 rounded-full bg-foreground/70 shadow" />
                                </div>
                                <div
                                  onMouseDown={(ev) => startBarDrag(ev, a, "end", DAY_W)}
                                  className="absolute right-0 inset-y-0 w-2 translate-x-1/2 cursor-col-resize opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                >
                                  <div className="w-1 h-1/2 rounded-full bg-foreground/70 shadow" />
                                </div>
                                {/* Dica de datas durante o arraste */}
                                {drag && (
                                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded bg-foreground text-background text-[10px] font-medium shadow z-30">
                                    {format(addDays(s, drag.mode === "end" ? 0 : drag.dayShift), "dd/MM")} → {format(addDays(e, drag.mode === "start" ? 0 : drag.dayShift), "dd/MM")}
                                  </div>
                                )}
                              </div>
                            )}
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="space-y-0.5 text-[11px]">
                              <div className="font-semibold">{a.title}</div>
                              <div>📅 {format(s, "dd/MM/yy")} → {format(e, "dd/MM/yy")} ({workDays(a.start_date, a.end_date)}d)</div>
                              <div className="inline-flex items-center gap-1">
                                <Avatar className="h-4 w-4 shrink-0">
                                  {(() => {
                                    const avatar = resolveAvatarFromLookup(a.assigned_to, responsible, profileAvatarMap);
                                    return avatar ? <AvatarImage src={avatar} alt={responsible} /> : null;
                                  })()}
                                  <AvatarFallback className="text-[8px]">{getAvatarInitials(responsible)}</AvatarFallback>
                                </Avatar>
                                <span>{responsible}</span>
                              </div>
                              <div>📊 {progress}% {isCritical && <span className="text-red-400 font-semibold ml-1">• Caminho crítico</span>}</div>
                              {a.is_milestone && <div>🎯 Marco</div>}
                              {isPhase && <div>📚 Fase / Entrega — datas derivadas dos filhos</div>}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {/* Etiqueta de datas colada à direita — para Marco, Fase/Entrega e
                          barras estreitas demais para o texto caber dentro. Mesmo tamanho e
                          mesma cor das datas de dentro da barra: um único tratamento no
                          Gantt inteiro. Fica atrás das barras (z-0) e sem eventos. */}
                      {!datesFitInsideBar && (
                        <div
                          className="absolute z-0 flex items-center text-[11px] font-semibold text-foreground leading-none tabular-nums whitespace-nowrap pointer-events-none"
                          style={{
                            left: a.is_milestone ? left + DAY_W / 2 + 14 : left + width + 8,
                            top: BAR_TOP,
                            height: BAR_H,
                          }}
                        >
                          {a.is_milestone ? startLabel : `${startLabel} → ${endLabel}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ===== Toolbar =====
  const Toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Toggle Tabela / Gantt — estilo tab com underline */}
      <div className="inline-flex border-b">
        {([
          { id: "table" as const, label: "Tabela detalhada", icon: Table2 },
          { id: "gantt" as const, label: "Gantt", icon: GanttChart },
        ]).map(opt => {
          const Icon = opt.icon;
          const active = mode === opt.id;
          return (
            <Button key={opt.id} variant="ghost" size="sm" onClick={() => setMode(opt.id)}
              className={cn(
                "rounded-none gap-2 h-9 border-b-2 -mb-px transition-colors",
                active
                  ? "border-b-primary font-semibold text-foreground"
                  : "border-b-transparent text-muted-foreground hover:text-foreground"
              )}>
              <Icon className="h-4 w-4" /> {opt.label}
            </Button>
          );
        })}
      </div>

      {mode === "gantt" && (
        <>
          {/* Botão Hoje */}
          <Button variant="default" size="sm" className="h-9 gap-1.5" onClick={handleScrollToToday}>
            <CalendarDays className="h-4 w-4" /> Hoje
          </Button>

          {/* Presets de zoom */}
          <div className="inline-flex border rounded-lg overflow-hidden bg-card">
            {(["day","week","month","quarter","year"] as GanttZoom[]).map(z => {
              const active = zoom === z;
              return (
                <Button key={z} variant="ghost" size="sm"
                  onClick={() => setZoom(z)}
                  className={cn("rounded-none h-9 px-2.5 text-xs",
                    active && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>
                  {ZOOM_LABEL[z]}
                </Button>
              );
            })}
          </div>

          {/* A largura da coluna "Atividade" é ajustada arrastando a própria
              borda da coluna no Gantt (alça na divisória), não mais por slider. */}
        </>
      )}

      {mode === "table" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Settings2 className="h-4 w-4" /> Colunas
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{visibleCols.length}</Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3">
            <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Colunas visíveis</div>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
              {(Object.keys(COL_LABELS) as ColKey[]).map(k => {
                if (k === "project" && !showProjectColumn) return null;
                const checked = colVisible(k);
                return (
                  <label key={k}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={checked} onCheckedChange={() => toggleCol(k)} />
                    <Label className="text-xs cursor-pointer flex-1">{COL_LABELS[k]}</Label>
                  </label>
                );
              })}
            </div>
            {visibleCols.length > 1 && (
              <>
                <div className="text-xs font-semibold mt-3 mb-2 text-muted-foreground uppercase">Ordem das colunas (arraste)</div>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {visibleCols.map((k) => (
                    <button
                      key={`reorder-${k}`}
                      type="button"
                      draggable
                      onDragStart={() => setDraggingCol(k)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggingCol && draggingCol !== k) moveVisibleCol(draggingCol, k);
                      }}
                      onDragEnd={() => setDraggingCol(null)}
                      className={cn(
                        "w-full flex items-center gap-2 rounded border px-2 py-1 text-left text-xs bg-card",
                        draggingCol === k ? "opacity-60 border-primary" : "border-border hover:bg-muted/40"
                      )}
                      title="Arraste para reordenar"
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{COL_LABELS[k]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="mt-3 pt-2 border-t flex items-center justify-between">
              <Button variant="ghost" size="sm" className="text-xs h-7"
                onClick={() => setVisibleCols(showProjectColumn ? ["project", ...DEFAULT_VISIBLE] : DEFAULT_VISIBLE)}>
                Restaurar padrão
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7"
                onClick={() => setVisibleCols(Object.keys(COL_LABELS) as ColKey[])}>
                Mostrar todas
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Filtro por status do Kanban (workflow_stages) */}
      {stageOptions.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Filter className="h-4 w-4" /> Status
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {stageFilter === null ? `Todas (${stageOptions.length})` : `${stageFilter.size}/${stageOptions.length}`}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Filtrar por coluna do Kanban</div>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
              {stageOptions.map(s => {
                const allActive = stageFilter === null;
                const checked = allActive ? true : stageFilter.has(s.id);
                return (
                  <label key={s.id}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        setStageFilter(prev => {
                          const base = prev === null
                            ? new Set(stageOptions.map(x => x.id)) // partir de todas
                            : new Set(prev);
                          if (base.has(s.id)) base.delete(s.id);
                          else base.add(s.id);
                          return base;
                        });
                      }}
                    />
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <Label className="text-xs cursor-pointer flex-1 truncate" title={s.title}>
                      {s.title}{s.projectLabel ? ` • ${s.projectLabel}` : ""}{s.is_final ? " ✓" : ""}
                    </Label>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 pt-2 border-t flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-7"
                onClick={() => setStageFilter(null)}>
                Mostrar todas
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7"
                onClick={() => {
                  // Apenas não-concluídas (oculta is_final)
                  const ids = stageOptions.filter(s => !s.is_final).map(s => s.id);
                  setStageFilter(new Set(ids));
                }}>
                Ocultar concluídas
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Spacer → empurra filtros para a direita */}
      <div className="flex-1" />

      {/* Filtro por Projeto (apenas no Cronograma Geral / quando há mais de 1 projeto) */}
      {showProjectFilter && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <FolderKanban className="h-4 w-4" /> Projetos
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {projectFilter === null ? `Todos (${projectOptions.length})` : `${projectFilter.size}/${projectOptions.length}`}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-3">
            <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase">
              Filtrar por projeto
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Buscar projeto..."
                className="h-8 pl-7 pr-7 text-xs"
              />
              {projectSearch && (
                <button
                  onClick={() => setProjectSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
              {projectOptions
                .filter(p => p.title.toLowerCase().includes(projectSearch.toLowerCase()))
                .map(p => {
                  const checked = projectFilter === null ? true : projectFilter.has(p.id);
                  return (
                    <label key={p.id}
                      className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          setProjectFilter(prev => {
                            const base = prev === null
                              ? new Set(projectOptions.map(x => x.id))
                              : new Set(prev);
                            if (base.has(p.id)) base.delete(p.id);
                            else base.add(p.id);
                            return base;
                          });
                        }}
                      />
                      <Label className="text-xs cursor-pointer flex-1 truncate" title={p.title}>
                        {p.title}
                      </Label>
                    </label>
                  );
                })}
            </div>
            <div className="mt-3 pt-2 border-t flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-7"
                onClick={() => setProjectFilter(null)}>
                Selecionar todos
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7"
                onClick={() => setProjectFilter(new Set())}>
                Limpar seleção
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {Toolbar}
      {mode === "table" && TableView}
      {mode === "gantt" && GanttBlock}
    </div>
  );
}