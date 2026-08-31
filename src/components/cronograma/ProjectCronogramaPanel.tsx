'use client';
import { useEffect, useMemo, useState, useCallback, Fragment, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { resolveEapKind, eapCanGroup, phaseIdFromSyntheticRow, isSyntheticPhaseRow, EAP_LABELS } from "@/lib/eapModel";
import { EditPhaseDialog } from "@/components/EditPhaseDialog";
import { supabase } from "@/integrations/supabase/client";
import { computeActivityProgress, progressoDoPai } from "@/lib/activityProgress";
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
  ArrowUp, ArrowDown, ArrowUpDown, ChevronRight, ChevronDown, Layers, Diamond, GripVertical, Package,
  Info, Flag, Link2Off, GitBranch,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PersonCombobox } from "@/components/PersonCombobox";
import { DateField } from "@/components/ui/date-field";
import { CelulaEditavel } from "@/components/cronograma/CelulaEditavel";
import { mensagemDeErro } from "@/lib/erroDoBanco";
import { cn } from "@/lib/utils";
import {
  format, parseISO, differenceInBusinessDays, addDays, eachDayOfInterval,
  isWeekend, isSameMonth, min as dateMin, max as dateMax, differenceInDays,
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, addMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { calculateScheduleSlack } from "@/lib/criticalPath";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { buildAvatarLookupMap, getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  | "variance" | "progress" | "slack" | "slackFree" | "mainResource" | "effort"
  | "observation" | "project" | "blockedDays";

const COL_LABELS: Record<ColKey, string> = {
  id: "ID", eap: "EAP", title: "Atividade", preds: "Predecessoras",
  responsible: "Responsável", column: "Coluna", status: "Status", duration: "Duração (d)",
  plannedStart: "Início Previsto", plannedEnd: "Térm. Previsto",
  actualStart: "Início Real", actualEnd: "Térm. Real",
  variance: "Desvio (d)",
  progress: "% Concluído", slack: "Folga Total", slackFree: "Folga Livre",
  mainResource: "Recurso Principal", effort: "Esforço (h)",
  observation: "Observações",
  project: "Projeto", blockedDays: "Dias Bloqueada",
};

/**
 * O mínimo que a EDIÇÃO NA CÉLULA precisa saber de uma linha.
 *
 * O estado `activities` é `any[]` — herdado, e trocar isso é outra conversa.
 * Este alias cobre só o caminho novo, para as funções de edição não propagarem
 * `any` por assinaturas que eu mesma escrevi.
 */
type LinhaEditavel = {
  id: string;
  assigned_to?: string | null;
  workflow_stage_id?: string | null;
  project_id?: string;
  start_date?: string | null;
  end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  hours?: number | null;
  description?: string | null;
  wbs_code?: string | null;
  is_milestone?: boolean | null;
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
  /**
   * POR QUE O CRONOGRAMA PRECISA DE UM ESTADO DE ERRO (31/08/2026)
   *
   * Relatado: "o cronograma não aparece informação alguma." Sem tela de erro,
   * QUALQUER falha no carregamento resulta no mesmo quadro em branco do estado
   * inicial — e uma tela vazia é indistinguível de "este projeto não tem
   * atividades". O usuário fica sem saber se o dado não existe, se a permissão
   * recusou ou se a consulta quebrou.
   *
   * Vazio e falha são coisas diferentes e passam a ser ditas de formas
   * diferentes. Mesma decisão de `docs/` sobre zero vazio não ser zero.
   */
  const [erroAoCarregar, setErroAoCarregar] = useState<string | null>(null);
  const [phases, setPhases] = useState<any[]>([]);
  const [deps, setDeps] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; sector: string; avatar?: string }>>({});
  /** A mesma gente, em lista — é o formato que `PersonCombobox` consome. */
  const [pessoas, setPessoas] = useState<{ id: string; full_name: string; sector?: string | null; role_title?: string | null; avatar_url?: string | null; email?: string | null }[]>([]);
  const [projectsMap, setProjectsMap] = useState<Record<string, string>>({});
  const [projectDeadlines, setProjectDeadlines] = useState<Record<string, string | null>>({});
  const [mode, setMode] = useState<CronogramaMode>(defaultMode);
  const [stages, setStages] = useState<Array<{ id: string; title: string; color: string; is_final: boolean; is_blocked: boolean; display_order: number; project_id: string; categoria?: string | null }>>([]);
  /** activity_id -> user_id do responsavel, de activity_assignees. */
  const [responsavelPorAtividade, setResponsavelPorAtividade] = useState<Map<string, string>>(new Map());
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
  const carregarDados = useCallback(async () => {
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
      /**
       * ESTE É O CAMINHO MAIS SILENCIOSO DOS TRÊS.
       *
       * Zerava tudo e voltava — tela em branco, sem uma palavra. E as duas
       * causas possíveis pedem ações opostas:
       *
       *   `allProjects` veio vazio  → não há projeto ativo: não há o que ver.
       *   `filterProjects` filtrou  → os projetos EXISTEM e a permissão é que
       *                               não alcança; a saída é pedir acesso, e
       *                               ninguém pede o que não sabe que existe.
       *
       * Não é erro de banco, então não usa o tradutor: é uma frase de estado.
       */
      const havia = (allProjects || []).length;
      setErroAoCarregar(
        havia > 0
          ? `Você não tem acesso a nenhum dos ${havia} ${havia === 1 ? "projeto ativo" : "projetos ativos"}. Peça acesso ao gestor do projeto.`
          : null,
      );
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

    /**
     * QUEM É O RESPONSÁVEL — POR IDENTIFICADOR.
     *
     * `assigned_to` guarda NOME em 657 das 667 atividades (medido em 26/08), e
     * há dois perfis ativos chamados "Williame Correia de Lima". Pelo texto os
     * dois são a mesma pessoa; por `user_id`, não.
     *
     * O cast existe porque `activity_assignees` é mais nova que os tipos
     * gerados — mesmo padrão já usado para `categoria` acima.
     */
    const respQ = (supabase
      .from("activity_assignees" as never)
      .select("activity_id, user_id, papel")
      .eq("papel" as never, "responsavel" as never)) as unknown as
      Promise<{ data: { activity_id: string; user_id: string }[] | null }>;

    /**
     * `allSettled`, NÃO `all` — a consulta acessória não derruba a tela.
     *
     * A CAUSA MEDIDA DO CRONOGRAMA EM BRANCO (31/08/2026):
     *
     * Com `Promise.all`, UMA consulta que rejeita rejeita a promise inteira. A
     * exceção escapava de `fetchData`, nenhum `setActivities` chegava a rodar,
     * e a tela ficava com o `useState([])` inicial — cronograma vazio, sem
     * erro, sem log, sem nada. As cinco consultas eram um bloco só: qualquer
     * uma levava as outras quatro junto.
     *
     * E elas NÃO têm o mesmo peso. `activities` é a tela; `activity_assignees`
     * é uma coluna dentro dela. Um cronograma sem a coluna "responsável" ainda
     * é um cronograma. Um cronograma sem atividades é uma página em branco.
     *
     * Então: a essencial que falha VIRA MENSAGEM (a faixa acima da tabela); a
     * acessória que falha vira ausência daquele pedaço, e nada mais.
     *
     * `error` também passa a ser lido. `{ data }` sozinho descartava a recusa:
     * `data` vem null, `|| []` transforma em lista vazia, e a RLS recusando
     * ficava indistinguível de projeto sem atividade — a mesma família de
     * "erro do banco chega como silêncio".
     */
    const [rActs, rPhs, rProfs, rStgs, rResps] = await Promise.allSettled([
      actsQ,
      supabase.from("phases").select("*").in("project_id", scopedProjectIds).eq("is_trashed", false).order("display_order", { ascending: true }),
      supabase.from("profiles").select("id, full_name, sector, role_title, avatar_url, email"),
      stagesQ,
      respQ,
    ]);

    /** O que a consulta trouxe, ou null se ela falhou — de qualquer das duas
     *  formas de falhar: a promise rejeitar, ou o PostgREST devolver `error`. */
    const colher = <T,>(r: PromiseSettledResult<any>): { data: T[] | null; erro: unknown } => {
      if (r.status === "rejected") return { data: null, erro: r.reason };
      const v = r.value as { data?: T[] | null; error?: unknown };
      if (v?.error) return { data: null, erro: v.error };
      return { data: v?.data ?? null, erro: null };
    };

    const acts_ = colher<any>(rActs);
    const phs_ = colher<any>(rPhs);
    const profs_ = colher<any>(rProfs);
    const stgs_ = colher<any>(rStgs);
    const resps_ = colher<{ activity_id: string; user_id: string }>(rResps);

    // A ESSENCIAL. Sem atividades não há cronograma: diz o que houve e para.
    // Não sobrescreve o que já estava na tela com uma lista vazia — dado velho
    // com aviso é melhor que branco sem explicação.
    if (acts_.erro) {
      setErroAoCarregar(mensagemDeErro(acts_.erro, { projetos: projectsMap }));
      return;
    }
    setErroAoCarregar(null);

    const acts = acts_.data;
    const phs = phs_.data;
    const profs = profs_.data;
    const stgs = stgs_.data;
    const resps = resps_.data;
    setActivities(acts || []);
    setPhases(phs || []);
    setStages(stgs || []);
    setResponsavelPorAtividade(
      new Map((resps || []).map((l) => [l.activity_id, l.user_id])),
    );
    const map: Record<string, { name: string; sector: string; avatar?: string }> = {};
    (profs || []).forEach((p: any) => {
      map[p.id] = {
        name: p.full_name,
        sector: p.sector || "—",
        avatar: typeof p.avatar_url === "string" ? p.avatar_url : undefined,
      };
    });
    setProfiles(map);
    // Mesma lista, no formato que `PersonCombobox` espera — `profiles` é um
    // mapa por id, montado para a busca por responsável nas linhas.
    setPessoas((profs || []).map((p: {
      id: string; full_name: string; sector?: string | null;
      role_title?: string | null; avatar_url?: unknown; email?: string | null;
    }) => ({
      id: p.id,
      full_name: p.full_name,
      sector: p.sector ?? null,
      role_title: p.role_title ?? null,
      avatar_url: typeof p.avatar_url === "string" ? p.avatar_url : null,
      // O e-mail é o que distingue dois homônimos — e os dois "Williame
      // Correia de Lima" são do MESMO setor, então sem ele o diferenciador
      // cairia em "TI" nos dois e a lista continuaria ambígua.
      email: p.email ?? null,
    })));
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

  /**
   * A ÚLTIMA VIA DE SILÊNCIO: o que o `allSettled` não alcança.
   *
   * Dentro de `carregarDados` ainda há dois pontos que rodam ANTES das cinco
   * consultas — a leitura de `projects` e a chamada de `filterProjects`. Se um
   * deles lançar, a exceção sai da função async como uma promise rejeitada que
   * ninguém aguarda: o React não a mostra, o `useEffect` a ignora, e o efeito
   * visível é de novo a tela em branco.
   *
   * Nenhuma falha de carregamento deste painel pode terminar sem uma frase na
   * tela. Este `catch` é o que garante isso — não importa por onde ela venha.
   */
  const fetchData = useCallback(async () => {
    try {
      await carregarDados();
    } catch (e) {
      setErroAoCarregar(mensagemDeErro(e));
    }
  }, [carregarDados]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ===== Mock estável (para colunas ainda não persistidas) =====
  /**
   * O que sobrou do "mock": só `mainResource`, que NUNCA foi inventado — é o
   * setor do responsável, derivado de dado real.
   *
   * As outras três eram sorteio por hash do id, e a tabela as exibia como se
   * fossem informação: "12h", "Aguardando aprovação do PO", "Alta". Esforço e
   * Observações passaram a ler `hours` e `description`; Compressão foi
   * removida — não havia campo no banco, e comprimir cronograma é nivelamento
   * de recursos, que o sistema não faz.
   *
   * O nome fica por ora para não espalhar renomeação por todo o arquivo, mas
   * o conteúdo já não é falso.
   */
  const mockFor = (idx: number) => ({
    mainResource: profiles[activities[idx]?.assigned_to || ""]?.sector || "—",
  });

  // ===== CPM real =====
  // Traz junto o que o cálculo teve de descartar (ciclo, sem data) e as
  // ligações que as datas desrespeitam. Sem isso a tela não distingue
  // "sem folga" de "não foi possível calcular".
  const schedule = useMemo(
    () => calculateScheduleSlack(
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
  const criticalSet = schedule.critical;

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

      /**
       * A FASE NÃO APARECE DUAS VEZES (27/08/2026).
       *
       * Relatado com captura: "1.1 · 1ª. Fase - Planejamento e Lançamento"
       * aparecia em duas linhas seguidas — uma sem ID (a sintética, daqui) e
       * outra com id de verdade.
       *
       * A causa é dado: em 10 projetos a mesma fase existe nas DUAS tabelas —
       * 60 pares, 16 só em "Revitalização Tasy". Ver
       * docs/medicoes/fase-duplicada-no-cronograma-27-08-2026.md.
       *
       * Consertar o DADO é decisão de quem cuida de cada projeto: qual das
       * duas é "a de verdade" muda caso a caso, e apagar a errada quebra ou o
       * `phase_id` de quem aponta para ela, ou as filhas da atividade.
       *
       * Mas a TELA não precisa esperar por isso. Duplicar na exibição é
       * defeito de tela, e a regra de desempate é clara: **a atividade vence**.
       * Ela tem id, EAP, responsável, histórico — a linha sintética é só um
       * agrupador desenhado em memória. Some a que não existe, fica a que é.
       *
       * O TÍTULO PRECISA SER NORMALIZADO para casar. Na `phases` o código foi
       * digitado dentro do nome ("1.1 1ª. Fase…"); na `activities` ele mora em
       * `wbs_code` ("1ª. Fase…"). Comparando texto cru, nunca batem — foi o que
       * escondeu isto até agora.
       *
       * O regex só remove código seguido de ESPAÇO: `1ª` não é código EAP, e
       * um `[\d.]+` guloso comeria o "1" e faria a comparação falhar de novo
       * (aconteceu na primeira medição, e subestimou 60 para 34).
       */
      const semCodigo = (t: string) =>
        String(t || "").replace(/^\s*\d+(\.\d+)*\s+/, "").trim().toLowerCase();

      const fasesJaComoAtividade = new Set(
        filtered
          // Tipado em vez de `any`: são dois campos, e declará-los custa uma
          // linha. O `any` do resto do arquivo é dívida antiga — não vale
          // aumentá-la por preguiça de escrever duas propriedades.
          .filter((a: { item_type?: string | null }) => String(a.item_type || "").toLowerCase() === "fase")
          .map((a: { title?: string | null }) => semCodigo(a.title ?? "")),
      );

      const linhasFase = (phases || [])
        .filter((p: any) => usadas.has(p.id))
        .filter((p: { title?: string | null }) => !fasesJaComoAtividade.has(semCodigo(p.title ?? "")))
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

      return [...linhasFase, ...filtered].map((a, idx) => ({ a, idx, mock: mockFor(idx) }));
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

  /**
   * O nome do responsável.
   *
   * `activityId` é opcional e vem SEGUNDO de propósito: os pontos que já
   * passavam só o texto continuam compilando, e quem passa o id ganha a via do
   * identificador — `activity_assignees`, que tem `user_id` com FK.
   *
   * Por que importa: `assigned_to` guarda NOME em 657 das 667 atividades, e
   * existem dois perfis ativos chamados "Williame Correia de Lima". Pelo texto
   * os dois são a mesma pessoa; pela tabela, não.
   */
  const resolveResponsible = useCallback((
    assignedTo: string | null | undefined,
    activityId?: string,
  ) => {
    const doTabela = activityId ? responsavelPorAtividade.get(activityId) : undefined;
    if (doTabela) {
      const p = profiles[doTabela]?.name;
      if (p) return p;
    }
    const raw = (assignedTo || "").trim();
    if (!raw) return "—";
    const mapped = profiles[raw]?.name;
    if (mapped) return mapped;
    // Compatibilidade com registros antigos onde assigned_to foi salvo como nome.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) return "—";
    return raw;
  }, [profiles, responsavelPorAtividade]);

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
    (a: any) => {
      // A LINHA DE FASE JÁ SABE O QUE É. Ela é sintética, montada a partir da
      // tabela `phases` — perguntar seu papel a `resolveEapKind` era dar chance
      // de a resposta ser "não".
      //
      // E era: a linha recebe `wbs_code: p.wbs_code ?? null`, e a coluna
      // `phases.wbs_code` não existe em toda base (migration de maio ainda
      // pendente em algumas VMs). Sem código, `resolveEapKind` cai no fallback
      // por função e devolve "entrega" — então a fase importada aparecia como
      // atividade no cronograma, sem agrupar nada. O `__isPhaseRow` é a
      // resposta direta, sem depender de uma coluna que pode não existir.
      if (a?.__isPhaseRow) return true;
      return resolveEapKind(a, (childrenByParent.get(a?.id) || []).length > 0) === "fase";
    },
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

  /**
   * PROGRESSO DO PAI — a mesma régua do Kanban, e só ela.
   *
   * Esta função era uma QUARTA fórmula de progresso, e discordava das outras
   * em dois pontos:
   *
   *  1. **Achatava a árvore.** Somava todo descendente no mesmo saco — neto
   *     pesava igual a filho. Uma fase com um ramo fundo era dominada por
   *     aquele ramo: 1 filha com 9 netos dava à filha 10% do peso, não 100%.
   *     O Kanban sempre mediu pelas filhas DIRETAS, cada uma respondendo pela
   *     própria subárvore.
   *
   *  2. **Não passava as subatividades** para `computeActivityProgress`, então
   *     cada filha era pontuada só pela coluna dela, ignorando o próprio
   *     avanço interno — justamente o que o parâmetro `subActivities` existe
   *     para corrigir (medido em 03/08: 703 de 1.317 atividades são filhas, e
   *     o cálculo as ignorava).
   *
   * Resultado: o mesmo pai exibia percentuais diferentes no Cronograma e no
   * Kanban, e nenhuma tela estava "errada" — eram réguas distintas.
   *
   * Agora as duas chamam `computeActivityProgress` com as filhas diretas. A
   * fonte é uma só; quando a régua mudar, muda nos dois lugares.
   *
   * NÃO usa `derived_progress` do servidor: medido em 26/08, a régua do banco
   * é binária (completed ? 100 : 0) e derrubaria 74 das 581 barras em até 66
   * pontos. Ver docs/medicoes/progresso-tela-x-servidor-26-08-2026.md.
   */
  const progressoDoPaiById = useMemo(() => {
    const memo = new Map<string, number | null>();
    const stagesByProjectLocal = new Map<string, typeof stages>();
    stages.forEach((s) => {
      if (!stagesByProjectLocal.has(s.project_id)) stagesByProjectLocal.set(s.project_id, [] as any);
      (stagesByProjectLocal.get(s.project_id) as any).push(s);
    });

    activities.forEach((a) => {
      const filhas = childrenByParent.get(a.id) || [];
      if (filhas.length === 0) {
        memo.set(a.id, null);
        return;
      }
      const projStages = stagesByProjectLocal.get(a.project_id) || [];
      // `progressoDoPai` roda a régua de sempre e TROCA SÓ O NÚMERO por
      // `derived_progress` quando o servidor o derivou — o mesmo valor, mas
      // calculado sobre TODAS as filhas, não sobre a fatia que a RLS deixou
      // passar. Conferido em 582 pais: zero barra muda para quem enxerga o
      // projeto inteiro; a correção aparece só para quem enxerga uma fatia.
      const info = progressoDoPai(
        a as any,
        projStages as any,
        filhas as any,
        // Agrupador (Fase/Entrega/Pacote): a coluna onde a caixa está é
        // ignorada — ela vale a média das filhas. Mesma fonte que o Kanban usa
        // (lib/eapModel), para as duas telas não divergirem na classificação.
        eapCanGroup(resolveEapKind(a as any, filhas.length > 0)),
      );
      memo.set(a.id, info.paused ? null : info.percent);
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
    // Pai: a régua já foi aplicada em `progressoDoPaiById`, com as filhas
    // diretas e a mesma fórmula do Kanban. `null` ali é pai pausado — devolve
    // 0 na barra por falta de representação para "pausado" neste retorno, mas
    // sem recalcular por baixo (era o que achatava a árvore).
    const doPai = progressoDoPaiById.get(a.id);
    if (doPai !== undefined && doPai !== null) {
      return Math.max(0, Math.min(100, Math.round(doPai)));
    }
    if (doPai === null && (childrenByParent.get(a.id) || []).length > 0) return 0;

    const projStages = stagesByProject.get(a.project_id) || [];
    const info = computeActivityProgress(a.workflow_stage_id, projStages as any, a.last_progress_stage_id);
    if (info.paused) return 0;
    return info.percent ?? 0;
  }, [stagesByProject, progressoDoPaiById, childrenByParent]);

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
    // AS FASES TAMBÉM. Elas vivem na tabela `phases` e entram no cronograma
    // como linhas sintéticas com id "phase:<uuid>" — ausentes de `activities`,
    // então a coluna EAP mostrava "—" justamente na linha que ancora a
    // numeração. O código aparecia só grudado no título, como texto.
    //
    // O fallback pelo TÍTULO não é enfeite: `phases.wbs_code` não existe em
    // toda base (migration de maio ainda pendente em algumas VMs), e nesse caso
    // a importação grava o código no título — "1.1 Iniciação e Planejamento".
    // Ler dali é o que faz a coluna funcionar onde a coluna do banco falta.
    (phases || []).forEach((p: any) => {
      const doCampo = (p?.wbs_code ?? "").toString().trim();
      const doTitulo = (p?.title ?? "").toString().match(/^\s*(\d+(?:\.\d+)*)\b/)?.[1];
      const code = doCampo || doTitulo;
      if (code) m.set(`phase:${p.id}`, code);
    });
    return m;
  }, [activities, phases]);

  /**
   * ID curto da atividade — primeiros 7 caracteres do UUID (estável,
   * funciona como "máscara" única). Exibido na coluna ID e nas referências
   * de predecessoras.
   */
  const shortIdOf = (uuid: string) => (uuid || "").replace(/-/g, "").slice(0, 7);
  const indexById = useMemo(() => {
    const m = new Map<string, string>();
    activities.forEach(a => m.set(a.id, shortIdOf(a.id)));
    // A fase não tem id de atividade. Sem esta entrada, o fallback rodava
    // `shortIdOf("phase:d4f2-…")` e imprimia "phase:d" na coluna ID — o
    // "# phase:d4" que apareceu na tela. Fase não tem código de tarefa: o
    // traço diz isso, o lixo não dizia nada.
    (phases || []).forEach((p: any) => m.set(`phase:${p.id}`, "—"));
    return m;
  }, [activities, phases]);

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

  /** Fase aberta para edição — vem da linha sintética do cronograma. */
  const [editingPhase, setEditingPhase] = useState<any | null>(null);

  /**
   * Abre o editor certo para a linha clicada.
   *
   * A linha de fase é sintética (id "phase:<uuid>", montada a partir de
   * `phases`) e NÃO existe em `activities`. Mandá-la ao editor de atividade
   * abria "# phase:d4 · Criada em Invalid Date" — e salvar não gravava nada:
   * o update casava zero linhas, o PostgREST não devolvia erro e o diálogo
   * anunciava sucesso. Agora a fase vai para o editor de fase.
   */
  const openFromCronograma = useCallback((row: any) => {
    const phaseId = phaseIdFromSyntheticRow(row);
    if (phaseId) {
      const real = (phases || []).find((p: any) => p.id === phaseId);
      if (real) setEditingPhase(real);
      return;
    }
    onEditActivity?.(row);
  }, [onEditActivity, phases]);

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
    // Fase não se arrasta: as datas dela derivam dos filhos. Hoje a barra da
    // fase nem é arrastável, então isto não é alcançável — mas um `update`
    // com id "phase:…" casaria zero linhas SEM erro, e a barra voltaria
    // sozinha ao lugar sem explicação. A guarda mantém isso verdadeiro se
    // alguém tornar a barra de grupo arrastável depois.
    if (String(id).startsWith("phase:")) return;
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

  /**
   * Grava um campo direto da célula — a base da edição na linha.
   *
   * OTIMISTA COM REVERSÃO: o valor entra na tela antes da resposta, porque
   * esperar o banco a cada tecla tornaria a tabela lenta justamente no uso que
   * ela ganha (preencher 40 prazos seguidos). Se o banco recusar, o valor
   * antigo volta e o aviso diz por quê — a tela nunca mostra o que não gravou.
   *
   * `fetchData` depois: duração, folga e CPM saem das datas, então mudar um
   * campo muda números de outras colunas e de outras linhas.
   */
  const gravarCampo = useCallback(async (
    id: string,
    patch: Record<string, unknown>,
    descricao: string,
  ): Promise<boolean> => {
    // Linha sintética de fase não é `activity` — não tem o que gravar aqui.
    if (String(id).startsWith("phase:")) return false;
    const anterior = activities.find((a) => a.id === id);
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

    const { error } = await supabase.from("activities").update(patch as never).eq("id", id);
    if (error) {
      if (anterior) setActivities((prev) => prev.map((a) => (a.id === id ? anterior : a)));
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
      return false;
    }
    fetchData();
    toast({ title: descricao });
    return true;
  }, [activities, fetchData, toast]);

  /**
   * Atingir / desfazer um marco.
   *
   * Ele não passa por colunas — não tem estágio a percorrer, só aconteceu ou
   * não. `completed_at` acompanha porque é a data que o relatório usa; ao
   * desfazer ela é limpa, senão o relatório conta uma entrega que não houve.
   *
   * A coluna também é gravada, quando existe uma final: outras telas ainda
   * leem `workflow_stage_id` para saber se algo fechou, e deixá-la para trás
   * criaria um marco "atingido" que o Backlog mostra como pendente.
   */
  const alternarMarco = useCallback(async (a: LinhaEditavel & { status?: string; project_id?: string }) => {
    const atingido = a.status === "completed";
    const finais = (stagesByProject.get(a.project_id || "") || []) as { id: string; is_final?: boolean }[];
    const colunaFinal = finais.find((s) => s.is_final)?.id ?? null;
    const patch: Record<string, unknown> = {
      status: atingido ? "pending" : "completed",
      completed_at: atingido ? null : new Date().toISOString(),
    };
    if (colunaFinal && !atingido) patch.workflow_stage_id = colunaFinal;
    await gravarCampo(a.id, patch, atingido ? "Marco reaberto" : "Marco atingido");
  }, [gravarCampo, stagesByProject]);

  /**
   * Esta linha aceita edição na célula?
   *
   * Fase (linha sintética) não: ela vive na tabela `phases` e não tem os
   * campos. Agrupador não recebe DATA — as dele são derivadas dos filhos, e
   * aceitar um valor que o próximo cálculo sobrescreve é pior que recusar.
   */
  const podeEditarCelula = useCallback((a: LinhaEditavel, campo: "data" | "outro"): { ok: boolean; motivo?: string } => {
    if (isSyntheticPhaseRow(a)) return { ok: false, motivo: "A fase é editada na própria tela de fases." };
    if (campo === "data" && isGroupRow(a)) {
      return { ok: false, motivo: "Datas de fase e entrega vêm das tarefas de dentro." };
    }
    return { ok: true };
  }, [isGroupRow]);

  /**
   * As quatro datas usam a mesma célula — só muda o campo e o rótulo.
   *
   * Escrever o bloco quatro vezes era convite a divergirem no primeiro ajuste:
   * uma ganharia a validação e as outras não.
   *
   * A validação é a única regra própria daqui: fim antes do início produz uma
   * duração negativa, que o CPM não sabe tratar — melhor recusar na hora, com
   * o motivo, do que gravar e mostrar "-3d" na coluna ao lado.
   */
  const celulaDeData = useCallback((
    a: LinhaEditavel,
    campo: "start_date" | "end_date" | "actual_start_date" | "actual_end_date",
    rotulo: string,
    conteudo: ReactNode,
  ) => {
    const perm = podeEditarCelula(a, "data");
    const parDe: Record<string, { outro: string; ehFim: boolean }> = {
      start_date: { outro: "end_date", ehFim: false },
      end_date: { outro: "start_date", ehFim: true },
      actual_start_date: { outro: "actual_end_date", ehFim: false },
      actual_end_date: { outro: "actual_start_date", ehFim: true },
    };
    return (
      <td className="px-2 py-1.5 text-center">
        <CelulaEditavel
          rotulo={rotulo}
          editavel={perm.ok}
          vazio={!a[campo]}
          motivoBloqueio={perm.motivo}
          editor={(fechar) => (
            <DateField
              value={(a[campo] || "").slice(0, 10)}
              className="h-7 text-xs w-[128px]"
              onChange={async (v) => {
                const novo = v || null;
                const par = parDe[campo];
                const outro = (a[par.outro] || "").slice(0, 10) || null;
                if (novo && outro) {
                  const [ini, fim] = par.ehFim ? [outro, novo] : [novo, outro];
                  if (fim < ini) {
                    toast({
                      title: "Data recusada",
                      description: `O término (${formatDateBR(fim)}) não pode ser antes do início (${formatDateBR(ini)}).`,
                      variant: "destructive",
                    });
                    fechar(false);
                    return;
                  }
                }
                const ok = await gravarCampo(a.id, { [campo]: novo }, `${rotulo}: ${novo ? formatDateBR(novo) : "removida"}`);
                fechar(ok);
              }}
            />
          )}
        >
          {conteudo}
        </CelulaEditavel>
      </td>
    );
  }, [gravarCampo, podeEditarCelula, toast]);

  // ===== Setas de dependência =====
  // 41 ligações desenhadas ao mesmo tempo viram um emaranhado ilegível. Só a
  // cadeia da linha sob o cursor é traçada; "ver todas" existe para quem quiser.
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [verTodasSetas, setVerTodasSetas] = useState(false);

  /** Vizinhança direta da linha sob o cursor: ela, suas predecessoras e sucessoras. */
  const cadeiaDoHover = useMemo(() => {
    const set = new Set<string>();
    if (!hoverRowId) return set;
    set.add(hoverRowId);
    deps.forEach(d => {
      if (d.predecessor_id === hoverRowId) set.add(d.successor_id);
      if (d.successor_id === hoverRowId) set.add(d.predecessor_id);
    });
    return set;
  }, [hoverRowId, deps]);

  // ===== Linha de base =====
  const [congelando, setCongelando] = useState(false);
  const [confirmarBase, setConfirmarBase] = useState(false);

  const baselineStats = useMemo(() => {
    const comDatas = activities.filter(a => a.start_date && a.end_date);
    const congeladas = comDatas.filter(a => a.baseline_start_date && a.baseline_end_date);
    const desviosAbs: number[] = [];
    congeladas.forEach(a => {
      const d = differenceInDays(parseISO(a.end_date.slice(0, 10)), parseISO(a.baseline_end_date.slice(0, 10)));
      if (Number.isFinite(d)) desviosAbs.push(d);
    });
    // Média aritmética simples do desvio de término, em dias. Positivo = atrasou.
    const desvioMedio = desviosAbs.length
      ? Math.round(desviosAbs.reduce((s, v) => s + v, 0) / desviosAbs.length)
      : null;
    return { total: comDatas.length, congeladas: congeladas.length, desvioMedio };
  }, [activities]);

  /**
   * Congela a linha de base: copia start/end atuais para as colunas baseline_*.
   * É um ato deliberado — recongelar apaga a régua contra a qual o desvio é
   * medido, por isso passa por confirmação e grava em lote só o que tem data.
   */
  const congelarLinhaDeBase = useCallback(async () => {
    const alvo = activities.filter(a => a.start_date && a.end_date);
    if (alvo.length === 0) {
      toast({ title: "Nada a congelar", description: "Nenhuma atividade com data definida.", variant: "destructive" });
      return;
    }
    setCongelando(true);
    try {
      // Em lotes: o proxy corta a URL por volta de 3,7 KB e o .in() viaja na
      // query string. 50 ids é o teto seguro já usado no resto do projeto.
      const CHUNK = 50;
      for (let i = 0; i < alvo.length; i += CHUNK) {
        const lote = alvo.slice(i, i + CHUNK);
        const updates = lote.map(a =>
          supabase.from("activities")
            .update({ baseline_start_date: a.start_date, baseline_end_date: a.end_date })
            .eq("id", a.id)
        );
        const res = await Promise.all(updates);
        const erro = res.find(r => r.error);
        if (erro?.error) {
          // PGRST204 = coluna ausente: a migration da linha de base não rodou.
          const semColuna = erro.error.code === "PGRST204";
          toast({
            title: semColuna ? "Linha de base indisponível" : "Erro ao congelar",
            description: semColuna
              ? "As colunas de linha de base ainda não existem no banco."
              : erro.error.message,
            variant: "destructive",
          });
          return;
        }
      }
      setConfirmarBase(false);
      fetchData();
      toast({
        title: "Linha de base congelada",
        description: `${alvo.length} ${alvo.length === 1 ? "atividade" : "atividades"} — o desvio passa a ser medido a partir de agora.`,
      });
    } finally {
      setCongelando(false);
    }
  }, [activities, toast, fetchData]);

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

  /**
   * Título sem o código EAP repetido na frente.
   *
   * Quando `phases.wbs_code` não existe, a importação grava o código NO título
   * ("1.1 Iniciação e Planejamento"). Com a coluna EAP mostrando o mesmo
   * código, ele aparecia duas vezes na mesma linha. Só remove quando o código
   * do título é EXATAMENTE o que a coluna exibe — assim um título que
   * legitimamente começa com número não é mutilado.
   */
  const tituloSemCodigo = useCallback((a: any) => {
    const titulo = (a?.title ?? "").toString();
    const naColuna = wbsById.get(a?.id);
    if (!naColuna) return titulo;
    const m = titulo.match(/^\s*(\d+(?:\.\d+)*)\s*[-–—.)]?\s+(.*)$/);
    if (!m || m[1] !== naColuna) return titulo;
    return m[2] || titulo;
  }, [wbsById]);

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
            {/* O PAPEL VEM DA FONTE ÚNICA (lib/eapModel), como no Backlog.
                Aqui havia uma classificação paralela, e ela discordava da EAP:
                "Fase / Entrega" fundia dois papéis num rótulo só, "Subatividade"
                era um papel que o modelo não tem (qualquer item com pai virava
                isso), e o que agrupa abaixo da fase — a Entrega — aparecia como
                "Atividade". O mesmo 1.1.1 se chamava Entrega numa tela e
                Atividade na outra.

                `isGroupRow` continua mandando na LINHA SINTÉTICA de fase: ela
                é montada da tabela `phases` e já sabe o que é — perguntar a
                `resolveEapKind` daria chance de a resposta ser "não" quando
                `phases.wbs_code` não existe na base (ver o comentário lá). */}
            {(() => {
              const kind = isSyntheticPhaseRow(a) ? "fase" : resolveEapKind(a, isGroupRow(a));
              const estilo: Record<string, string> = {
                projeto: "bg-primary/10 text-primary border-primary/30",
                fase: "bg-primary/10 text-primary border-primary/30",
                entrega: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
                atividade: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
                marco: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/40",
              };
              return (
                <Badge variant="outline" className={`text-[10px] py-0 px-1.5 shrink-0 gap-1 ${estilo[kind]}`}>
                  {kind === "marco" && <Diamond className="h-2.5 w-2.5 fill-orange-500 text-orange-500" />}
                  {(kind === "fase" || kind === "projeto") && <Layers className="h-2.5 w-2.5" />}
                  {kind === "entrega" && <Package className="h-2.5 w-2.5" />}
                  {EAP_LABELS[kind]}
                </Badge>
              );
            })()}
            <button
              type="button"
              onClick={() => openFromCronograma(a)}
              className="font-medium truncate max-w-[480px] text-left hover:underline cursor-pointer"
              title="Abrir edição da atividade"
            >
              {tituloSemCodigo(a)}
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
      case "responsible": return (() => {
        const perm = podeEditarCelula(a, "outro");
        // `text-center`: sem responsável, a célula vazia é um chip curto —
        // encostado à esquerda ele fica desalinhado da própria coluna e do
        // seletor que abre no lugar.
        return (
          <td className="px-2 py-1.5 max-w-[160px] text-center">
            <CelulaEditavel
              rotulo="Responsável"
              editavel={perm.ok}
              vazio={!responsible}
              motivoBloqueio={perm.motivo}
              editor={(fechar) => (
                <PersonCombobox
                  people={pessoas}
                  value={pessoas.find((p) => p.full_name === a.assigned_to)?.id ?? null}
                  placeholder="Sem responsável"
                  // Largura fixa: sem ela o gatilho encolhe para o texto e o
                  // popover nasce estreito, cortando os nomes.
                  className="h-7 text-xs w-[152px]"
                  onSelect={async (p) => {
                    const ok = await gravarCampo(a.id, { assigned_to: p.full_name }, `Responsável: ${p.full_name}`);
                    fechar(ok);
                  }}
                  onClear={async () => {
                    const ok = await gravarCampo(a.id, { assigned_to: null }, "Responsável removido");
                    fechar(ok);
                  }}
                />
              )}
            >
              <span className={cn("truncate", !responsible && "text-muted-foreground")} title={responsible}>
                {responsible || "—"}
              </span>
            </CelulaEditavel>
          </td>
        );
      })();
      case "column": return (() => {
        const stageInfo = a.workflow_stage_id ? stageById.get(a.workflow_stage_id) : undefined;
        const perm = podeEditarCelula(a, "outro");
        const doProjeto = stagesByProject.get(a.project_id) || [];
        return (
          <td className="px-2 py-1.5 text-center">
            <CelulaEditavel
              rotulo="Coluna"
              editavel={perm.ok && doProjeto.length > 0}
              vazio={!stageInfo}
              motivoBloqueio={perm.motivo}
              editor={(fechar) => (
                <Select
                  defaultOpen
                  value={a.workflow_stage_id || undefined}
                  onValueChange={async (v) => {
                    const destino = doProjeto.find((s: { id: string; title: string }) => s.id === v);
                    const nome = destino?.title ?? "";
                    /**
                     * `status` e `completed_at` ACOMPANHAM a coluna.
                     *
                     * Aqui gravava só `workflow_stage_id`. Mover uma tarefa
                     * para "Concluída" pelo Cronograma deixava o `status` em
                     * "pending": o Backlog, que lê a coluna, mostrava a mudança;
                     * o Kanban, que também lê o `status`, não — a mesma tarefa
                     * aparecia concluída numa tela e aberta na outra.
                     *
                     * A regra é a da migration 20260811100000: a coluna é o
                     * fato do dia a dia, e o `status` é consequência dela. O
                     * Kanban e o Backlog já gravavam os três campos juntos;
                     * esta tela era a única que não.
                     *
                     * `completed_at` entra porque é a data que os relatórios
                     * usam, e ao reabrir precisa ser limpa — senão fica
                     * registrada uma entrega que deixou de existir.
                     */
                    const isFinal = (destino as { is_final?: boolean } | undefined)?.is_final === true;
                    const ok = await gravarCampo(
                      a.id,
                      {
                        workflow_stage_id: v,
                        status: isFinal ? "completed" : "pending",
                        completed_at: isFinal ? new Date().toISOString() : null,
                      },
                      `Movida para "${nome}"`,
                    );
                    fechar(ok);
                  }}
                  onOpenChange={(o) => { if (!o) fechar(false); }}
                >
                  <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {doProjeto.map((s: { id: string; title: string }) => (
                      <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            >
              {stageInfo ? (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: stageInfo.color, color: stageInfo.color }}>
                  {stageInfo.title}
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </CelulaEditavel>
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
        /* MARCO É ATINGIDO AQUI. Ele saiu do quadro (14/08/2026) — Kanban mede
           trabalho passando por estágios, e marco não passa, acontece. Com o
           arrasto fora, o gesto precisa existir onde ele vive: Backlog e
           Cronograma. Um clique alterna, sem abrir o diálogo. */
        if (a.is_milestone) {
          const atingido = a.status === "completed";
          return (
            <td className="px-2 py-1.5 text-center">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void alternarMarco(a); }}
                title={atingido ? "Clique para desfazer" : "Clique para marcar como atingido"}
                className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <Badge variant="outline" className={cn(
                  "text-[10px] py-0 px-1.5 gap-1 cursor-pointer transition-colors",
                  atingido
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
                    : "border-dashed border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10",
                )}>
                  <Diamond className={cn("h-2.5 w-2.5", atingido && "fill-current")} />
                  {atingido ? "Atingido" : "Marcar atingido"}
                </Badge>
              </button>
            </td>
          );
        }
        return (
          <td className="px-2 py-1.5 text-center">
            <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5", cls)}>
              {label}
            </Badge>
          </td>
        );
      })();
      // Calculada: o tooltip diz de onde vem. Não ganha fundo próprio — as
      // editáveis já se distinguem por acenderem no hover, e pintar cinco
      // colunas de forma permanente polui a tabela sem dizer mais nada.
      case "duration": return (
        <td className="px-2 py-1.5 text-center" title="Calculada a partir das datas de início e término">
          {dur ?? "—"}
        </td>
      );
      case "plannedStart": return celulaDeData(a, "start_date", "Início Previsto", formatDateBR(a.start_date));
      case "plannedEnd": return celulaDeData(a, "end_date", "Térm. Previsto",
        isOverdue ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive bg-destructive/10 text-destructive animate-pulse-overdue">
            <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
            {formatDateBR(a.end_date)}
          </Badge>
        ) : formatDateBR(a.end_date));
      case "actualStart": return celulaDeData(a, "actual_start_date", "Início Real",
        <span className="text-muted-foreground">{formatDateBR(a.actual_start_date || null)}</span>);
      case "actualEnd": return celulaDeData(a, "actual_end_date", "Térm. Real",
        <span className="text-muted-foreground">{formatDateBR(a.actual_end_date || null)}</span>);
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
      /* ESFORÇO passa a ser DADO, não sorteio. Mostrava `mock.effortHours` —
         um número derivado do hash do id — e quem lia a tabela via "12h" como
         se fosse real. O campo `hours` existe no banco e estava vazio. */
      case "effort": return (() => {
        const perm = podeEditarCelula(a, "outro");
        const h = a.hours == null ? null : Number(a.hours);
        return (
          <td className="px-2 py-1.5 text-center font-mono">
            <CelulaEditavel
              rotulo="Esforço"
              editavel={perm.ok}
              vazio={h == null}
              motivoBloqueio={perm.motivo}
              editor={(fechar) => (
                <Input
                  autoFocus
                  type="number"
                  min={0}
                  step="0.5"
                  defaultValue={h ?? ""}
                  className="h-7 text-xs w-[76px] text-center"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { e.preventDefault(); fechar(false); }
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  onBlur={async (e) => {
                    const bruto = e.target.value.trim();
                    const novo = bruto === "" ? null : Number(bruto);
                    if (novo !== null && (Number.isNaN(novo) || novo < 0)) { fechar(false); return; }
                    if (novo === h) { fechar(false); return; }
                    const ok = await gravarCampo(a.id, { hours: novo }, `Esforço: ${novo == null ? "removido" : `${novo}h`}`);
                    fechar(ok);
                  }}
                />
              )}
            >
              {h == null ? <span className="text-muted-foreground">—</span> : h}
            </CelulaEditavel>
          </td>
        );
      })();
      /* OBSERVAÇÕES idem: mostrava uma de quatro frases sorteadas ("Aguardando
         aprovação do PO"...), que ninguém escreveu. Passa a ler e gravar
         `description`, o campo real — vazio até agora porque nada o alimentava
         por aqui. */
      case "observation": return (() => {
        const perm = podeEditarCelula(a, "outro");
        const texto = (a.description || "").trim();
        return (
          <td className="px-2 py-1.5 max-w-[220px]">
            <CelulaEditavel
              rotulo="Observações"
              editavel={perm.ok}
              vazio={!texto}
              rotuloVazio="Anotar"
              motivoBloqueio={perm.motivo}
              editor={(fechar) => (
                <Input
                  autoFocus
                  defaultValue={texto}
                  placeholder="Anotar…"
                  className="h-7 text-xs w-[200px]"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { e.preventDefault(); fechar(false); }
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  onBlur={async (e) => {
                    const novo = e.target.value.trim();
                    if (novo === texto) { fechar(false); return; }
                    const ok = await gravarCampo(a.id, { description: novo || null }, "Observação salva");
                    fechar(ok);
                  }}
                />
              )}
            >
              <span className={cn("truncate", !texto && "text-muted-foreground")} title={texto}>
                {texto || "—"}
              </span>
            </CelulaEditavel>
          </td>
        );
      })();
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
            {/* VAZIO NÃO É UM SÓ (31/08/2026).
                "Nenhuma atividade encontrada" respondia por três situações
                distintas, e nenhuma delas ficava clara: o projeto realmente não
                tem atividades; um filtro está escondendo todas; ou o usuário não
                alcança projeto nenhum. Só a primeira é "não há o que fazer" — as
                outras duas têm uma saída, e a tela precisa dizer qual.
                Zero vazio não é zero, o mesmo princípio do painel do projeto. */}
            {rows.length === 0 && (
              <tr><td colSpan={visibleCols.length} className="text-center py-10 text-muted-foreground">
                {activities.length > 0 ? (
                  <>
                    <div>Nenhuma atividade corresponde aos filtros.</div>
                    <div className="mt-1 text-[12px]">
                      Há <b className="tabular-nums">{activities.length}</b>{" "}
                      {activities.length === 1 ? "atividade" : "atividades"} fora do filtro atual.
                    </div>
                  </>
                ) : (
                  <div>Este projeto ainda não tem atividades no cronograma.</div>
                )}
              </td></tr>
            )}
            {rows.map(({ a, idx, mock }, rowIdx) => {
              const id = indexById.get(a.id) ?? shortIdOf(a.id);
              const dur = workDays(a.start_date, a.end_date);
              const progress = progressFor(a);
              const preds = predsOf(a.id);
              const responsible = resolveResponsible(a.assigned_to, a.id);
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
                  /* Aqui os dois papéis dividem legitimamente a mesma linha: a
                     legenda descreve a FORMA da barra, e Fase e Entrega
                     desenham igual. O selo da tabela, esse sim, distingue. */
                  title="Agrupador (Fase ou Entrega)"
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
                const responsible = resolveResponsible(a.assigned_to, a.id);
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

                {/* Setas de dependência. SVG único sobre as barras: uma seta por
                    ligação seria dezenas de nós; um path por ligação num só SVG
                    mantém o custo baixo. pointer-events-none para não roubar o
                    arraste das barras que ficam por baixo. */}
                {(() => {
                  const geom = new Map<string, { left: number; width: number; top: number }>();
                  ganttData.all.forEach(({ a, s }, rowIdx) => {
                    if (!s) return;
                    const depth = depthById.get(a.id) ?? 0;
                    const off = Math.min(24, depth * 6);
                    const si = ganttData.days.findIndex(d => d.toDateString() === s.toDateString());
                    if (si < 0) return;
                    const ei = ganttData.days.findIndex(
                      d => d.toDateString() === (ganttData.all[rowIdx].e ?? s).toDateString());
                    const l = Math.max(0, si) * DAY_W + off;
                    const w = Math.max(2, Math.max(2, ((ei < 0 ? si : ei) - si + 1)) * DAY_W - 2 - off);
                    geom.set(a.id, { left: l, width: w, top: rowIdx * ROW_H + BAR_TOP + BAR_H / 2 });
                  });

                  const visiveis = deps.filter(d => {
                    if (!geom.has(d.predecessor_id) || !geom.has(d.successor_id)) return false;
                    if (verTodasSetas) return true;
                    return hoverRowId === d.predecessor_id || hoverRowId === d.successor_id;
                  });
                  if (visiveis.length === 0) return null;

                  const violadaSet = new Set(schedule.violadas.map(v => `${v.predecessor_id}>${v.successor_id}`));
                  const H = ganttData.all.length * ROW_H;

                  return (
                    <svg className="absolute inset-0 pointer-events-none z-[15]"
                      width="100%" height={H} style={{ overflow: "visible" }}>
                      <defs>
                        <marker id="cr-seta" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                          <path d="M0,0 L6,3 L0,6 z" fill="hsl(var(--foreground) / 0.55)" />
                        </marker>
                        <marker id="cr-seta-viol" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                          <path d="M0,0 L6,3 L0,6 z" fill="hsl(var(--destructive))" />
                        </marker>
                      </defs>
                      {visiveis.map((d, i) => {
                        const p = geom.get(d.predecessor_id)!;
                        const s2 = geom.get(d.successor_id)!;
                        const viol = violadaSet.has(`${d.predecessor_id}>${d.successor_id}`);
                        // Rota em cotovelo: sai da direita da predecessora, desce/sobe
                        // no meio do vão e entra pela esquerda da sucessora. Quando a
                        // sucessora começa antes (o caso violado), contorna por baixo.
                        const x1 = p.left + p.width, y1 = p.top;
                        const x2 = s2.left, y2 = s2.top;
                        const folga = 10;
                        const dPath = x2 >= x1 + folga
                          ? `M${x1},${y1} H${x1 + folga} V${y2} H${x2}`
                          : `M${x1},${y1} H${x1 + folga} V${y1 + ROW_H / 2} H${x2 - folga} V${y2} H${x2}`;
                        return (
                          <path key={`${d.predecessor_id}-${d.successor_id}-${i}`}
                            d={dPath} fill="none"
                            stroke={viol ? "hsl(var(--destructive))" : "hsl(var(--foreground) / 0.55)"}
                            strokeWidth={viol ? 1.75 : 1.25}
                            strokeDasharray={viol ? "4 2" : undefined}
                            markerEnd={`url(#${viol ? "cr-seta-viol" : "cr-seta"})`} />
                        );
                      })}
                    </svg>
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
                  const inCycle = schedule.cycles.has(a.id);
                  // Linha de base: barra fina cinza sob a atual. Só desenha se a
                  // base foi congelada E difere do plano — barras coincidentes
                  // não informam nada e só somariam ruído em 300 linhas.
                  const baseGeom = (() => {
                    const bStart = a.baseline_start_date?.slice(0, 10);
                    const bEnd = a.baseline_end_date?.slice(0, 10);
                    if (!bStart || !bEnd) return null;
                    if (bStart === a.start_date?.slice(0, 10) && bEnd === a.end_date?.slice(0, 10)) return null;
                    const bsD = parseISO(bStart);
                    const beD = parseISO(bEnd);
                    const bs = ganttData.days.findIndex(d => d.toDateString() === bsD.toDateString());
                    const be = ganttData.days.findIndex(d => d.toDateString() === beD.toDateString());
                    if (bs < 0 || be < 0) return null; // base fora da janela visível
                    return {
                      left: bs * DAY_W + hierarchyOffset,
                      width: Math.max(2, (be - bs + 1) * DAY_W - 2 - hierarchyOffset),
                    };
                  })();
                  const stageInfo = a.workflow_stage_id ? stageById.get(a.workflow_stage_id) : undefined;
                  const isCompleted = stageInfo?.is_final || a.status === "completed";
                  const isOverdue = isOverdueByRule(a, !!isCompleted);
                  const progress = progressFor(a);
                  const responsible = resolveResponsible(a.assigned_to, a.id);
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
                    <div
                      key={`${a.project_id}:${a.item_type ?? "atividade"}:${a.id}:${rowIdx}`}
                      className={cn(
                        "relative border-b transition-colors",
                        // A cadeia acesa marca a linha inteira: sem isso, a seta
                        // aponta para uma barra que o olho ainda precisa procurar.
                        !verTodasSetas && hoverRowId && cadeiaDoHover.has(a.id) && "bg-primary/5",
                      )}
                      style={{ height: ROW_H }}
                      onMouseEnter={() => setHoverRowId(a.id)}
                      onMouseLeave={() => setHoverRowId(prev => (prev === a.id ? null : prev))}
                    >
                      {/* Linha de base: fita fina colada ao pé da barra atual. Fica
                          atrás (z-0) e sem eventos — é régua de comparação, não alvo.
                          A barra descolar da fita É o desvio, sem precisar de número. */}
                      {baseGeom && !a.is_milestone && (
                        <div
                          className="absolute rounded-sm bg-muted-foreground/45 pointer-events-none z-0"
                          style={{ left: baseGeom.left, width: baseGeom.width, top: BAR_TOP + BAR_H + 1, height: 3 }}
                          title={`Linha de base: ${format(parseISO(a.baseline_start_date!.slice(0, 10)), "dd/MM")} → ${format(parseISO(a.baseline_end_date!.slice(0, 10)), "dd/MM")}`}
                        />
                      )}
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
                                "bg-muted-foreground/25",
                                // Caminho crítico = CONTORNO, não preenchimento. A cor de
                                // dentro já significa progresso/atraso/conclusão; pintar a
                                // barra de vermelho colidiria com "atrasada".
                                isCritical
                                  ? "border-2 border-destructive"
                                  : inCycle
                                    ? "border-2 border-dashed border-amber-500"
                                    : "border border-border",
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
                              {/* Folga só faz sentido para quem NÃO é crítica: em quem é,
                                  ela é zero por definição e repetir seria ruído. */}
                              {!isCritical && !inCycle && (() => {
                                const f = schedule.totalSlack.get(a.id);
                                return typeof f === "number" && f > 0
                                  ? <div>🕓 Folga de {f} {f === 1 ? "dia" : "dias"}</div>
                                  : null;
                              })()}
                              {inCycle && (
                                <div className="text-amber-400 font-semibold">
                                  ⚠ Dependência circular — sem cálculo de folga
                                </div>
                              )}
                              {baseGeom && (
                                <div className="text-muted-foreground">
                                  ▭ Base: {format(parseISO(a.baseline_start_date!.slice(0, 10)), "dd/MM")} → {format(parseISO(a.baseline_end_date!.slice(0, 10)), "dd/MM")}
                                </div>
                              )}
                              {a.is_milestone && <div>🎯 Marco</div>}
                              {/* O tooltip tem a atividade em mãos, então diz o
                                  papel EXATO — não precisa do rótulo genérico
                                  que a legenda usa para descrever a forma. */}
                              {isPhase && (
                                <div>
                                  📚 {EAP_LABELS[isSyntheticPhaseRow(a) ? "fase" : resolveEapKind(a, true)]}
                                  {" "}— datas derivadas dos filhos
                                </div>
                              )}
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

          {/* Setas: por padrão só a cadeia sob o cursor. Este botão mostra tudo
              de uma vez, para quem quer a malha inteira. */}
          {deps.length > 0 && (
            <Button
              variant={verTodasSetas ? "secondary" : "outline"} size="sm" className="h-9 gap-1.5"
              onClick={() => setVerTodasSetas(v => !v)}
              title="Por padrão, as setas aparecem só na linha sob o cursor"
            >
              <GitBranch className="h-4 w-4" />
              {verTodasSetas ? "Ocultar setas" : "Ver todas as setas"}
              <span className="tabular-nums text-muted-foreground">{deps.length}</span>
            </Button>
          )}

          {/* Linha de base. O rótulo muda com o estado: sem base é um convite a
              criar a régua; com base, mostra a cobertura e o desvio médio. */}
          <Button
            variant="outline" size="sm" className="h-9 gap-1.5"
            onClick={() => setConfirmarBase(true)}
            disabled={congelando || baselineStats.total === 0}
            title="Copia as datas atuais para a linha de base — o desvio passa a ser medido a partir dela"
          >
            <Flag className="h-4 w-4" />
            {baselineStats.congeladas > 0 ? "Recongelar base" : "Congelar linha de base"}
          </Button>
          {baselineStats.congeladas > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              base em {baselineStats.congeladas}/{baselineStats.total}
              {baselineStats.desvioMedio !== null && baselineStats.desvioMedio !== 0 && (
                <span className={cn(
                  "ml-1.5 font-semibold",
                  baselineStats.desvioMedio > 0 ? "text-destructive" : "text-emerald-600",
                )}>
                  {baselineStats.desvioMedio > 0 ? "+" : ""}{baselineStats.desvioMedio}d
                </span>
              )}
            </span>
          )}

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

      {/* A FALHA DE CARREGAMENTO, DITA (31/08/2026).
          Antes disto, cronograma quebrado e cronograma sem atividades eram a
          MESMA tela em branco. Aqui o usuário lê o motivo em português e tem o
          "Tentar de novo" — falha de rede é o caso comum, e recarregar a página
          inteira para tentar outra vez é castigo desproporcional. */}
      {erroAoCarregar && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> O cronograma não pôde ser carregado
          </span>
          <span className="text-foreground/80">{erroAoCarregar}</span>
          <button type="button" onClick={() => { void fetchData(); }}
            className="ml-auto rounded-md border border-destructive/40 px-2 py-0.5 font-medium text-destructive hover:bg-destructive/10">
            Tentar de novo
          </button>
        </div>
      )}

      {/* Avisos do cálculo. Só aparece quando há o que avisar — em cronograma
          saudável não ocupa espaço. Antes, tudo isto falhava em silêncio: a
          atividade simplesmente sumia do caminho crítico sem explicação. */}
      {mode === "gantt" && (schedule.violadas.length > 0 || schedule.cycles.size > 0 || schedule.semData.size > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Avisos do cálculo
          </span>
          {schedule.violadas.length > 0 && (
            <span className="inline-flex items-center gap-1 text-foreground/80"
              title="A sucessora começa antes do que a ligação permite. A dependência existe, mas as datas a ignoram.">
              <Link2Off className="h-3.5 w-3.5 text-destructive" />
              <b className="tabular-nums">{schedule.violadas.length}</b>
              {schedule.violadas.length === 1 ? " dependência desrespeitada" : " dependências desrespeitadas"}
            </span>
          )}
          {schedule.cycles.size > 0 && (
            <span className="inline-flex items-center gap-1 text-foreground/80"
              title="A→B→A. Sem ordem possível, estas atividades ficam fora do cálculo de folga.">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
              <b className="tabular-nums">{schedule.cycles.size}</b> em dependência circular
            </span>
          )}
          {schedule.semData.size > 0 && (
            <span className="inline-flex items-center gap-1 text-foreground/80"
              title="Têm dependência mas não têm data: saem do cálculo. Se for uma predecessora, o caminho crítico sai menor do que a realidade.">
              <CalendarOff className="h-3.5 w-3.5 text-muted-foreground" />
              <b className="tabular-nums">{schedule.semData.size}</b> sem data no cálculo
            </span>
          )}
        </div>
      )}

      {mode === "table" && TableView}
      {mode === "gantt" && GanttBlock}

      <AlertDialog open={confirmarBase} onOpenChange={setConfirmarBase}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {baselineStats.congeladas > 0 ? "Recongelar a linha de base?" : "Congelar a linha de base?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  As datas atuais de <b>{baselineStats.total}</b>{" "}
                  {baselineStats.total === 1 ? "atividade" : "atividades"} viram a régua
                  contra a qual todo desvio passa a ser medido.
                </p>
                {baselineStats.congeladas > 0 && (
                  <p className="text-destructive">
                    Já existe base em {baselineStats.congeladas}{" "}
                    {baselineStats.congeladas === 1 ? "atividade" : "atividades"}
                    {baselineStats.desvioMedio !== null && baselineStats.desvioMedio !== 0 && (
                      <> com desvio médio de {baselineStats.desvioMedio > 0 ? "+" : ""}{baselineStats.desvioMedio} dias</>
                    )}. Recongelar <b>apaga esse histórico</b> — o desvio volta a zero.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={congelando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); congelarLinhaDeBase(); }}
              disabled={congelando}
            >
              {congelando ? "Congelando…" : baselineStats.congeladas > 0 ? "Recongelar" : "Congelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Editor da FASE. O cronograma mostra fases como linhas, então clicar
          numa delas precisa abrir o editor da tabela `phases` — não o de
          atividade, onde a gravação não encontrava a linha. */}
      <EditPhaseDialog
        phase={editingPhase}
        open={!!editingPhase}
        onOpenChange={(v) => { if (!v) setEditingPhase(null); }}
        onSaved={() => { setEditingPhase(null); fetchData(); }}
      />
    </div>
  );
}