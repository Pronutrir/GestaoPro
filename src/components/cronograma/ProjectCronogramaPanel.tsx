import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table2, GanttChart, ExternalLink, AlertTriangle, CalendarOff,
  CalendarDays, Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format, parseISO, differenceInBusinessDays, addDays, eachDayOfInterval,
  isWeekend, isSameMonth, min as dateMin, max as dateMax, differenceInDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { calculateCriticalPath } from "@/lib/criticalPath";

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
}

const LINK_TYPES: Record<string, { short: string; label: string; desc: string }> = {
  finish_to_start:  { short: "TI", label: "Término-Início (FS)",  desc: "A sucessora só inicia quando a predecessora termina." },
  start_to_start:   { short: "II", label: "Início-Início (SS)",   desc: "A sucessora inicia quando a predecessora inicia." },
  finish_to_finish: { short: "TT", label: "Término-Término (FF)", desc: "A sucessora só termina quando a predecessora termina." },
  start_to_finish:  { short: "IT", label: "Início-Término (SF)",  desc: "A sucessora só termina quando a predecessora inicia." },
};

/** Cada zoom controla a largura em pixels de UM DIA na régua do Gantt. */
const ZOOM_PX_PER_DAY: Record<GanttZoom, number> = {
  day: 36,
  week: 14,
  month: 6,
  quarter: 2.5,
  year: 0.9,
};

const ZOOM_LABEL: Record<GanttZoom, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
  quarter: "Trimestre",
  year: "Ano",
};

/** Colunas opcionais da tabela (controladas pelo usuário, persistidas em localStorage). */
type ColKey =
  | "id" | "eap" | "title" | "preds" | "responsible" | "duration"
  | "plannedStart" | "plannedEnd" | "actualStart" | "actualEnd"
  | "progress" | "slack" | "mainResource" | "effort" | "compression"
  | "observation" | "project";

const COL_LABELS: Record<ColKey, string> = {
  id: "ID", eap: "EAP", title: "Atividade", preds: "Predecessoras",
  responsible: "Responsável", duration: "Duração (d)",
  plannedStart: "Início Plan.", plannedEnd: "Térm. Plan.",
  actualStart: "Início Real", actualEnd: "Térm. Real",
  progress: "% Concluído", slack: "Folga (d)",
  mainResource: "Recurso Principal", effort: "Esforço (h)",
  compression: "Compressão", observation: "Observações",
  project: "Projeto",
};

const DEFAULT_VISIBLE: ColKey[] = [
  "id", "eap", "title", "preds", "responsible",
  "duration", "plannedStart", "plannedEnd", "progress", "slack",
];

function formatDateBR(iso: string | null) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }); } catch { return "—"; }
}

function workDays(startISO: string | null, endISO: string | null) {
  if (!startISO || !endISO) return null;
  try {
    const d = differenceInBusinessDays(parseISO(endISO), parseISO(startISO)) + 1;
    return d > 0 ? d : 1;
  } catch { return null; }
}

export function ProjectCronogramaPanel({
  projectIds,
  defaultMode = "gantt",
  showProjectColumn = false,
}: Props) {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<any[]>([]);
  const [phases, setPhases] = useState<any[]>([]);
  const [deps, setDeps] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; sector: string }>>({});
  const [projectsMap, setProjectsMap] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<CronogramaMode>(defaultMode);

  // ===== Toolbar Gantt =====
  const [zoom, setZoom] = useState<GanttZoom>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("cronograma:zoom") : null;
    return (stored as GanttZoom) || "day";
  });
  useEffect(() => {
    localStorage.setItem("cronograma:zoom", zoom);
  }, [zoom]);

  const [visibleCols, setVisibleCols] = useState<ColKey[]>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("cronograma:cols") : null;
    if (stored) {
      try { return JSON.parse(stored) as ColKey[]; } catch {}
    }
    return showProjectColumn ? ["project", ...DEFAULT_VISIBLE] : DEFAULT_VISIBLE;
  });
  useEffect(() => {
    localStorage.setItem("cronograma:cols", JSON.stringify(visibleCols));
  }, [visibleCols]);

  const colVisible = (k: ColKey) => visibleCols.includes(k);
  const toggleCol = (k: ColKey) => {
    setVisibleCols(v => v.includes(k) ? v.filter(x => x !== k) : [...v, k]);
  };

  // ===== Fetch =====
  const fetchData = useCallback(async () => {
    let actsQ = supabase.from("activities").select("*")
      .eq("is_trashed", false)
      .order("display_order", { ascending: true });
    if (projectIds && projectIds.length > 0) {
      actsQ = actsQ.in("project_id", projectIds);
    } else if (projectIds && projectIds.length === 0) {
      setActivities([]); setDeps([]); setPhases([]);
      return;
    }

    const [{ data: acts }, { data: phs }, { data: profs }, { data: projs }] = await Promise.all([
      actsQ,
      projectIds && projectIds.length
        ? supabase.from("phases").select("*").in("project_id", projectIds).eq("is_trashed", false).order("display_order", { ascending: true })
        : supabase.from("phases").select("*").eq("is_trashed", false).order("display_order", { ascending: true }),
      supabase.from("profiles").select("id, full_name, sector"),
      supabase.from("projects").select("id, title").eq("is_trashed", false),
    ]);
    setActivities(acts || []);
    setPhases(phs || []);
    const map: Record<string, { name: string; sector: string }> = {};
    (profs || []).forEach((p: any) => { map[p.id] = { name: p.full_name, sector: p.sector || "—" }; });
    setProfiles(map);
    const pm: Record<string, string> = {};
    (projs || []).forEach((p: any) => { pm[p.id] = p.title; });
    setProjectsMap(pm);

    const ids = (acts || []).map((a: any) => a.id);
    if (ids.length) {
      const { data: d } = await supabase.from("task_dependencies").select("*")
        .or(`predecessor_id.in.(${ids.join(",")}),successor_id.in.(${ids.join(",")})`);
      setDeps(d || []);
    } else setDeps([]);
  }, [projectIds]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ===== Mock estável (para colunas ainda não persistidas) =====
  const mockFor = (id: string, idx: number) => {
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
    return {
      eap: `${Math.floor(idx / 5) + 1}.${(idx % 5) + 1}`,
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

  // ===== Folga real =====
  const slackMap = useMemo(() => {
    const map = new Map<string, number>();
    const valid = activities.filter(a => a.start_date && a.end_date);
    if (valid.length === 0) return map;

    const byId = new Map(valid.map(a => [a.id, a]));
    const succ = new Map<string, { id: string; lag: number }[]>();
    const pred = new Map<string, { id: string; lag: number }[]>();
    valid.forEach(a => { succ.set(a.id, []); pred.set(a.id, []); });
    deps.forEach(d => {
      if (byId.has(d.predecessor_id) && byId.has(d.successor_id)) {
        succ.get(d.predecessor_id)!.push({ id: d.successor_id, lag: d.lag_days ?? 0 });
        pred.get(d.successor_id)!.push({ id: d.predecessor_id, lag: d.lag_days ?? 0 });
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
    const ef = new Map<string, number>();
    const es = new Map<string, number>();
    order.forEach(id => {
      const a = byId.get(id)!;
      const baseEs = differenceInDays(parseISO(a.start_date!), minDate);
      let earliest = baseEs;
      pred.get(id)!.forEach(p => {
        const pEf = ef.get(p.id);
        if (pEf !== undefined) earliest = Math.max(earliest, pEf + p.lag);
      });
      es.set(id, earliest);
      ef.set(id, earliest + dur.get(id)!);
    });
    const projectEnd = ef.size ? Math.max(...Array.from(ef.values())) : 0;
    const lf = new Map<string, number>();
    const ls = new Map<string, number>();
    [...order].reverse().forEach(id => {
      const succs = succ.get(id)!;
      let latest = projectEnd;
      if (succs.length > 0) {
        latest = Math.min(...succs.map(s => (ls.get(s.id) ?? projectEnd) - s.lag));
      }
      lf.set(id, latest);
      ls.set(id, latest - dur.get(id)!);
    });
    valid.forEach(a => {
      const slack = (ls.get(a.id) ?? 0) - (es.get(a.id) ?? 0);
      map.set(a.id, Math.max(0, slack));
    });
    return map;
  }, [activities, deps]);

  const rows = useMemo(
    () => activities.map((a, idx) => ({ a, idx, mock: mockFor(a.id, idx) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, profiles]
  );

  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    activities.forEach((a, i) => m.set(a.id, i + 1));
    return m;
  }, [activities]);

  const predsOf = (actId: string) => deps.filter((d) => d.successor_id === actId);

  const goToDependencies = (projectId?: string) => {
    const pid = projectId || (projectIds && projectIds[0]);
    if (!pid) return;
    navigate(`/project/${pid}?tab=dependencies`);
  };

  // ===== Gantt data =====
  const DAY_W = ZOOM_PX_PER_DAY[zoom];
  const ROW_H = 32;
  const LABEL_W = 280;

  const ganttData = useMemo(() => {
    const withDates = rows
      .map(r => {
        const s = r.a.start_date ? parseISO(r.a.start_date) : null;
        const e = r.a.end_date ? parseISO(r.a.end_date) : (s ? addDays(s, 1) : null);
        return s && e ? { ...r, s, e } : null;
      })
      .filter(Boolean) as Array<{ a: any; idx: number; mock: any; s: Date; e: Date }>;

    const undated = rows
      .filter(r => !(r.a.start_date && r.a.end_date))
      .map(r => ({ ...r, s: null as Date | null, e: null as Date | null }));

    if (!withDates.length && !undated.length) return null;

    const today = new Date();
    const minDate = withDates.length
      ? addDays(dateMin(withDates.map(d => d.s)), -3)
      : addDays(today, -7);
    const maxDate = withDates.length
      ? addDays(dateMax(withDates.map(d => d.e)), 5)
      : addDays(today, 21);
    const days = eachDayOfInterval({ start: minDate, end: maxDate });
    const all = [...withDates, ...undated];
    return { dated: withDates, undated, all, minDate, maxDate, days };
  }, [rows]);

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
    const { a, idx, mock, id, dur, progress, preds, responsible } = ctx;
    switch (k) {
      case "id": return <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{id}</td>;
      case "eap": return <td className="px-2 py-1.5 text-center font-mono">{mock.eap}</td>;
      case "project": return <td className="px-2 py-1.5 truncate max-w-[180px] text-muted-foreground" title={projectsMap[a.project_id] || "—"}>{projectsMap[a.project_id] || "—"}</td>;
      case "title": return (
        <td className="px-2 py-1.5">
          <div className="font-medium truncate max-w-[360px]" title={a.title}>{a.title}</div>
          {a.description && (
            <div className="text-muted-foreground truncate max-w-[360px]" title={a.description}>{a.description}</div>
          )}
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
                  <button onClick={() => goToDependencies(a.project_id)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary font-mono text-[11px] transition-colors">
                    {preds.map((p: any, i: number) => {
                      const lt = LINK_TYPES[p.dependency_type] || LINK_TYPES.finish_to_start;
                      const pid = indexById.get(p.predecessor_id) ?? "?";
                      const lag = (p.lag_days ?? 0);
                      return (
                        <span key={p.id}>
                          {i > 0 && ";"}
                          {pid}{lt.short !== "TI" ? lt.short : ""}{lag ? (lag > 0 ? `+${lag}d` : `${lag}d`) : ""}
                        </span>
                      );
                    })}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold">Predecessoras</div>
                    {preds.map((p: any) => {
                      const lt = LINK_TYPES[p.dependency_type] || LINK_TYPES.finish_to_start;
                      const pid = indexById.get(p.predecessor_id) ?? "?";
                      const pact = activities.find(x => x.id === p.predecessor_id);
                      return (
                        <div key={p.id} className="text-[11px]">
                          <div className="font-mono">#{pid} • {lt.label}</div>
                          <div className="text-muted-foreground">{pact?.title || "—"}</div>
                          <div className="text-muted-foreground">{lt.desc}</div>
                          {p.lag_days != null && p.lag_days !== 0 && (
                            <div className="text-muted-foreground">Lag: {p.lag_days}d</div>
                          )}
                        </div>
                      );
                    })}
                    <div className="pt-1.5 mt-1.5 border-t flex items-center gap-1 text-[10px] text-primary">
                      <ExternalLink className="h-3 w-3" /> Clique para abrir Dependências
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </td>
      );
      case "responsible": return <td className="px-2 py-1.5 truncate max-w-[160px]" title={responsible}>{responsible}</td>;
      case "duration": return <td className="px-2 py-1.5 text-center">{dur ?? "—"}</td>;
      case "plannedStart": return <td className="px-2 py-1.5 text-center">{formatDateBR(a.start_date)}</td>;
      case "plannedEnd": return <td className="px-2 py-1.5 text-center">{formatDateBR(a.end_date)}</td>;
      case "actualStart": return <td className="px-2 py-1.5 text-center text-muted-foreground">{formatDateBR(a.actual_start_date || null)}</td>;
      case "actualEnd": return <td className="px-2 py-1.5 text-center text-muted-foreground">{formatDateBR(a.actual_end_date || a.completed_at || null)}</td>;
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
            const slack = slackMap.get(a.id);
            if (slack === undefined) return <span className="text-muted-foreground text-[11px]">—</span>;
            const cls =
              slack === 0 ? "bg-red-500/10 text-red-600 border-red-500/40"
              : slack <= 3 ? "bg-amber-500/10 text-amber-700 border-amber-500/40"
              : "bg-emerald-500/10 text-emerald-700 border-emerald-500/40";
            return (
              <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 gap-1 font-mono", cls)}>
                {slack === 0 && <AlertTriangle className="h-3 w-3" />}
                {slack}d
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
      <table className="w-full text-xs">
        <thead className="bg-primary/95 text-primary-foreground sticky top-0 z-10">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold [&>th]:text-center [&>th]:border-r [&>th]:border-primary-foreground/20 [&>th:last-child]:border-r-0">
            {visibleCols.map(k => (
              <th key={k} className={cn(
                k === "title" && "text-left min-w-[260px]",
                k === "observation" && "text-left min-w-[180px]",
              )}>{COL_LABELS[k]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={visibleCols.length} className="text-center py-10 text-muted-foreground">Nenhuma atividade encontrada.</td></tr>
          )}
          {rows.map(({ a, idx, mock }) => {
            const id = indexById.get(a.id) ?? idx + 1;
            const dur = workDays(a.start_date, a.end_date);
            const progress = a.status === "completed" ? 100 : a.status === "in_progress" ? 50 : 0;
            const preds = predsOf(a.id);
            const responsible = profiles[a.assigned_to || ""]?.name || "—";
            const ctx = { a, idx, mock, id, dur, progress, preds, responsible };
            return (
              <tr key={a.id} className="border-b hover:bg-muted/40 transition-colors">
                {visibleCols.map(k => <span key={k} style={{ display: "contents" }}>{renderCell(k, ctx)}</span>)}
              </tr>
            );
          })}
        </tbody>
      </table>
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
        <span className="ml-auto">EAP, Esforço, Compressão e Observações são <strong>mock</strong> nesta prova de conceito.</span>
      </div>
    </div>
  );

  /** Decide quando rotular dias x meses na régua, baseado no zoom. */
  const showDayLabels = zoom === "day" || zoom === "week";

  const GanttBlock = (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary" /> Atividade</span>
          <span className="inline-flex items-center gap-1 ml-3"><span className="w-3 h-3 rounded bg-red-500" /> Caminho crítico (folga 0)</span>
          <span className="inline-flex items-center gap-1 ml-3"><span className="w-3 h-3 rounded bg-emerald-500/70" /> Concluída</span>
          <span className="inline-flex items-center gap-1 ml-3"><AlertTriangle className="h-3 w-3 text-amber-500" /> Marco</span>
          <span className="inline-flex items-center gap-1 ml-3"><CalendarOff className="h-3 w-3 text-muted-foreground" /> Sem datas</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {ganttData
            ? `${ganttData.all.length} atividade(s) • ${ganttData.dated.length} com datas • ${ganttData.undated.length} sem datas`
            : "—"}
        </div>
      </div>

      {!ganttData ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma atividade para exibir no Gantt.
        </div>
      ) : (
        <div id="gantt-scroll-container" className="overflow-auto max-h-[70vh]">
          <div className="flex" style={{ width: LABEL_W + ganttData.days.length * DAY_W }}>
            {/* Coluna fixa de rótulos */}
            <div className="sticky left-0 z-20 bg-card border-r" style={{ width: LABEL_W }}>
              <div className="border-b bg-muted/40" style={{ height: 44 }}>
                <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                  Atividade
                </div>
              </div>
              {ganttData.all.map(({ a }) => {
                const id = indexById.get(a.id);
                const isCritical = criticalSet.has(a.id);
                const noDates = !a.start_date || !a.end_date;
                const responsible = profiles[a.assigned_to || ""]?.name || "—";
                const projTitle = projectsMap[a.project_id];
                return (
                  <div key={a.id}
                    className="border-b px-3 flex items-center gap-2 hover:bg-muted/40"
                    style={{ height: ROW_H }}>
                    <span className="text-[10px] font-mono text-muted-foreground w-8 shrink-0">#{id}</span>
                    {isCritical && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                    {noDates && <CalendarOff className="h-3 w-3 text-muted-foreground shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-xs truncate", isCritical && "font-semibold")} title={a.title}>{a.title}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {showProjectColumn && projTitle ? `${projTitle} • ` : ""}{responsible}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Área do gráfico */}
            <div className="relative" style={{ width: ganttData.days.length * DAY_W }}>
              {/* Cabeçalho meses + dias */}
              <div className="border-b sticky top-0 z-10 bg-card">
                <div className="flex" style={{ height: 22 }}>
                  {(() => {
                    const segments: { label: string; width: number }[] = [];
                    let i = 0;
                    while (i < ganttData.days.length) {
                      const monthStart = ganttData.days[i];
                      let j = i;
                      while (j < ganttData.days.length && isSameMonth(ganttData.days[j], monthStart)) j++;
                      segments.push({
                        label: format(monthStart, "MMM yyyy", { locale: ptBR }),
                        width: (j - i) * DAY_W,
                      });
                      i = j;
                    }
                    return segments.map((s, k) => (
                      <div key={k} className="border-r text-[11px] font-semibold text-center bg-muted/40 capitalize overflow-hidden whitespace-nowrap"
                        style={{ width: s.width, lineHeight: "22px" }}>
                        {s.label}
                      </div>
                    ));
                  })()}
                </div>
                {showDayLabels && (
                  <div className="flex" style={{ height: 22 }}>
                    {ganttData.days.map((d, k) => (
                      <div key={k}
                        className={cn(
                          "border-r text-[10px] text-center text-muted-foreground",
                          isWeekend(d) && "bg-muted/40"
                        )}
                        style={{ width: DAY_W, lineHeight: "22px" }}>
                        {zoom === "day" ? format(d, "d") : (d.getDay() === 1 ? format(d, "d/MM") : "")}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                {/* fundo: faixas de fim de semana (só faz sentido em day/week) */}
                {(zoom === "day" || zoom === "week") && (
                  <div className="absolute inset-0 flex pointer-events-none">
                    {ganttData.days.map((d, k) => (
                      <div key={k}
                        className={cn("border-r border-border/30", isWeekend(d) && "bg-muted/30")}
                        style={{ width: DAY_W }} />
                    ))}
                  </div>
                )}

                {/* linha de hoje */}
                {(() => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  if (today < ganttData.minDate || today > ganttData.maxDate) return null;
                  const idxDay = ganttData.days.findIndex(d => d.toDateString() === today.toDateString());
                  if (idxDay < 0) return null;
                  return (
                    <div className="absolute top-0 bottom-0 border-l-2 border-primary/70 pointer-events-none z-10"
                      style={{ left: idxDay * DAY_W + DAY_W / 2 }}>
                      <div className="absolute -top-0 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] px-1 rounded">
                        Hoje
                      </div>
                    </div>
                  );
                })()}

                {ganttData.all.map(({ a, s, e }) => {
                  if (!s || !e) {
                    const todayIdx = ganttData.days.findIndex(
                      d => d.toDateString() === new Date(new Date().setHours(0,0,0,0)).toDateString()
                    );
                    const left = (todayIdx >= 0 ? todayIdx : 0) * DAY_W;
                    return (
                      <div key={a.id} className="relative border-b bg-muted/10" style={{ height: ROW_H }}>
                        <div className="absolute top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-muted-foreground/40 bg-card text-[10px] text-muted-foreground"
                          style={{ left: Math.max(0, left - 60) }}>
                          <CalendarOff className="h-3 w-3" />
                          Sem datas
                        </div>
                      </div>
                    );
                  }
                  const startIdx = ganttData.days.findIndex(d => d.toDateString() === s.toDateString());
                  const endIdx = ganttData.days.findIndex(d => d.toDateString() === e.toDateString());
                  const left = Math.max(0, startIdx) * DAY_W;
                  const width = Math.max(2, (endIdx - startIdx + 1)) * DAY_W - 2;
                  const isCritical = criticalSet.has(a.id);
                  const isCompleted = a.status === "completed";
                  const progress = isCompleted ? 100 : a.status === "in_progress" ? 50 : 0;
                  const responsible = profiles[a.assigned_to || ""]?.name || "—";

                  return (
                    <div key={a.id} className="relative border-b" style={{ height: ROW_H }}>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {a.is_milestone ? (
                              <div className="absolute top-1/2 -translate-y-1/2"
                                style={{ left: left + DAY_W / 2 - 8 }}>
                                <div className="w-4 h-4 rotate-45 bg-amber-500 border border-amber-700" />
                              </div>
                            ) : (
                              <div className={cn(
                                "absolute top-1.5 rounded-sm shadow-sm overflow-hidden cursor-pointer transition-opacity hover:opacity-90",
                                isCritical ? "bg-red-500" : isCompleted ? "bg-emerald-500/70" : "bg-primary"
                              )}
                                style={{ left, width, height: ROW_H - 12 }}>
                                <div className="h-full bg-white/30" style={{ width: `${100 - progress}%`, marginLeft: `${progress}%` }} />
                                {DAY_W >= 6 && (
                                  <div className="absolute inset-0 flex items-center px-1.5 text-[10px] text-white font-medium truncate">
                                    {a.title}
                                  </div>
                                )}
                              </div>
                            )}
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="space-y-0.5 text-[11px]">
                              <div className="font-semibold">{a.title}</div>
                              <div>📅 {format(s, "dd/MM/yy")} → {format(e, "dd/MM/yy")} ({workDays(a.start_date, a.end_date)}d)</div>
                              <div>👤 {responsible}</div>
                              <div>📊 {progress}% {isCritical && <span className="text-red-400 font-semibold ml-1">• Caminho crítico</span>}</div>
                              {a.is_milestone && <div>🎯 Marco</div>}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
      {/* Toggle Tabela / Gantt */}
      <div className="inline-flex border rounded-lg overflow-hidden bg-card">
        {([
          { id: "table" as const, label: "Tabela detalhada", icon: Table2 },
          { id: "gantt" as const, label: "Gantt", icon: GanttChart },
        ]).map(opt => {
          const Icon = opt.icon;
          const active = mode === opt.id;
          return (
            <Button key={opt.id} variant="ghost" size="sm" onClick={() => setMode(opt.id)}
              className={cn("rounded-none gap-2 h-9",
                active && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>
              <Icon className="h-4 w-4" /> {opt.label}
            </Button>
          );
        })}
      </div>

      {mode === "gantt" && (
        <>
          {/* Botão Hoje */}
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleScrollToToday}>
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