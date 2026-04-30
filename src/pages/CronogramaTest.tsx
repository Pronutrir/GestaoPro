import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Table2, GanttChart, ExternalLink, AlertTriangle, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInBusinessDays, addDays, eachDayOfInterval, startOfMonth, endOfMonth, isWeekend, isSameMonth, min as dateMin, max as dateMax } from "date-fns";
import { ptBR } from "date-fns/locale";
import { calculateCriticalPath } from "@/lib/criticalPath";
import { differenceInDays } from "date-fns";

type Mode = "table" | "gantt";

// Tipos de vínculo MS Project
const LINK_TYPES: Record<string, { short: string; label: string; desc: string }> = {
  finish_to_start: { short: "TI", label: "Término-Início (FS)", desc: "A sucessora só inicia quando a predecessora termina." },
  start_to_start:  { short: "II", label: "Início-Início (SS)",  desc: "A sucessora inicia quando a predecessora inicia." },
  finish_to_finish:{ short: "TT", label: "Término-Término (FF)", desc: "A sucessora só termina quando a predecessora termina." },
  start_to_finish: { short: "IT", label: "Início-Término (SF)", desc: "A sucessora só termina quando a predecessora inicia." },
};

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

export default function CronogramaTest() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [activities, setActivities] = useState<any[]>([]);
  const [phases, setPhases] = useState<any[]>([]);
  const [deps, setDeps] = useState<any[]>([]);
  const [workflowStages, setWorkflowStages] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; sector: string }>>({});
  const [mode, setMode] = useState<Mode>("table");

  // Carrega projetos (Onboard pré-selecionado)
  useEffect(() => {
    supabase.from("projects").select("id, title, due_date")
      .eq("is_trashed", false).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => {
        const list = data || [];
        setProjects(list);
        if (!projectId && list.length) {
          const onboard = list.find((p: any) => p.title?.toLowerCase().includes("onboard"));
          setProjectId(onboard?.id || list[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    const [{ data: acts }, { data: phs }, { data: profs }, { data: stages }] = await Promise.all([
      supabase.from("activities").select("*").eq("project_id", projectId).eq("is_trashed", false)
        .order("display_order", { ascending: true }),
      supabase.from("phases").select("*").eq("project_id", projectId).eq("is_trashed", false)
        .order("display_order", { ascending: true }),
      supabase.from("profiles").select("id, full_name, sector"),
      supabase.from("workflow_stages").select("id, title").eq("project_id", projectId).order("display_order", { ascending: true }),
    ]);
    setActivities(acts || []);
    setPhases(phs || []);
    setWorkflowStages(stages || []);
    const map: Record<string, { name: string; sector: string }> = {};
    (profs || []).forEach((p: any) => { map[p.id] = { name: p.full_name, sector: p.sector || "—" }; });
    setProfiles(map);

    const ids = (acts || []).map((a: any) => a.id);
    if (ids.length) {
      const { data: d } = await supabase.from("task_dependencies").select("*")
        .or(`predecessor_id.in.(${ids.join(",")}),successor_id.in.(${ids.join(",")})`);
      setDeps(d || []);
    } else setDeps([]);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ===== MOCK estável por atividade para campos não persistidos =====
  const mockFor = (id: string, idx: number) => {
    // hash simples
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
    return {
      eap: `${Math.floor(idx / 5) + 1}.${(idx % 5) + 1}`,
      effortHours: 4 + (h % 36),                  // esforço h
      compression: ["Baixa", "Média", "Alta", "Nenhuma"][h % 4],
      observation: ["", "Aguardando aprovação do PO", "Risco de overlap com sprint", "Depende de fornecedor externo"][h % 4],
      mainResource: profiles[activities[idx]?.assigned_to || ""]?.sector || "—",
    };
  };

  // ===== Caminho crítico REAL via CPM =====
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

  // ===== Folga (slack) por atividade — mesmo cálculo do CPM, expondo o número =====
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

  // Sem filtros — exibir todas as atividades
  const rows = useMemo(
    () => activities.map((a, idx) => ({ a, idx, mock: mockFor(a.id, idx) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, profiles]
  );

  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    activities.forEach((a, i) => m.set(a.id, i + 1)); // ID começando em 1
    return m;
  }, [activities]);

  const predsOf = (actId: string) =>
    deps.filter((d) => d.successor_id === actId);

  const goToDependencies = () => {
    if (!projectId) return;
    navigate(`/project/${projectId}?tab=dependencies`);
  };

  const TableView = (
    <div className="border rounded-lg overflow-auto bg-card">
      <table className="w-full text-xs">
        <thead className="bg-primary/95 text-primary-foreground sticky top-0 z-10">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold [&>th]:text-center [&>th]:border-r [&>th]:border-primary-foreground/20 [&>th:last-child]:border-r-0">
            <th className="w-12">ID</th>
            <th className="w-16">EAP</th>
            <th className="text-left min-w-[260px]">Atividade</th>
            <th className="w-20">Pred.</th>
            <th className="w-40">Responsável</th>
            <th className="w-16">Dur.<br/>(d)</th>
            <th className="w-24">Início<br/>Plan.</th>
            <th className="w-24">Térm.<br/>Plan.</th>
            <th className="w-24">Início<br/>Real</th>
            <th className="w-24">Térm.<br/>Real</th>
            <th className="w-16">% C.</th>
            <th className="w-20">Folga<br/>(d)</th>
            <th className="w-32">Recurso<br/>Principal</th>
            <th className="w-16">Esf.<br/>(h)</th>
            <th className="w-28">Compressão<br/>Possível</th>
            <th className="text-left min-w-[180px]">Observações</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={16} className="text-center py-10 text-muted-foreground">Nenhuma atividade encontrada.</td></tr>
          )}
          {rows.map(({ a, idx, mock }) => {
            const id = indexById.get(a.id) ?? idx + 1;
            const dur = workDays(a.start_date, a.end_date);
            const realDur = workDays(a.actual_start_date || null, a.actual_end_date || a.completed_at || null);
            const progress = a.status === "completed" ? 100 : a.status === "in_progress" ? 50 : 0;
            const preds = predsOf(a.id);
            const responsible = profiles[a.assigned_to || ""]?.name || "—";
            const isCritical = criticalSet.has(a.id);

            return (
              <tr key={a.id} className="border-b hover:bg-muted/40 transition-colors">
                <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{id}</td>
                <td className="px-2 py-1.5 text-center font-mono">{mock.eap}</td>
                <td className="px-2 py-1.5">
                  <div className="font-medium truncate max-w-[360px]" title={a.title}>{a.title}</div>
                  {a.description && (
                    <div className="text-muted-foreground truncate max-w-[360px]" title={a.description}>
                      {a.description}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {preds.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={goToDependencies}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary font-mono text-[11px] transition-colors"
                          >
                            {preds.map((p, i) => {
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
                            {preds.map((p) => {
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
                <td className="px-2 py-1.5 truncate max-w-[160px]" title={responsible}>{responsible}</td>
                <td className="px-2 py-1.5 text-center">{dur ?? "—"}</td>
                <td className="px-2 py-1.5 text-center">{formatDateBR(a.start_date)}</td>
                <td className="px-2 py-1.5 text-center">{formatDateBR(a.end_date)}</td>
                <td className="px-2 py-1.5 text-center text-muted-foreground">
                  {formatDateBR(a.actual_start_date || null)}
                </td>
                <td className="px-2 py-1.5 text-center text-muted-foreground">
                  {formatDateBR(a.actual_end_date || a.completed_at || null)}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[10px]">{progress}%</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-center">
                  {(() => {
                    if (!a.start_date || !a.end_date) {
                      return <span className="text-muted-foreground text-[11px]">—</span>;
                    }
                    const slack = slackMap.get(a.id);
                    if (slack === undefined) {
                      return <span className="text-muted-foreground text-[11px]">—</span>;
                    }
                    const cls =
                      slack === 0
                        ? "bg-red-500/10 text-red-600 border-red-500/40"
                        : slack <= 3
                        ? "bg-amber-500/10 text-amber-700 border-amber-500/40"
                        : "bg-emerald-500/10 text-emerald-700 border-emerald-500/40";
                    return (
                      <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 gap-1 font-mono", cls)}>
                        {slack === 0 && <AlertTriangle className="h-3 w-3" />}
                        {slack}d
                      </Badge>
                    );
                  })()}
                </td>
                <td className="px-2 py-1.5 truncate max-w-[140px]" title={mock.mainResource}>{mock.mainResource}</td>
                <td className="px-2 py-1.5 text-center font-mono">{mock.effortHours}</td>
                <td className="px-2 py-1.5 text-center">
                  <Badge variant="outline" className={cn(
                    "text-[10px] py-0 px-1.5",
                    mock.compression === "Alta" && "border-emerald-500/40 text-emerald-700",
                    mock.compression === "Média" && "border-amber-500/40 text-amber-700",
                    mock.compression === "Baixa" && "border-orange-500/40 text-orange-700",
                    mock.compression === "Nenhuma" && "text-muted-foreground",
                  )}>{mock.compression}</Badge>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground italic truncate max-w-[220px]" title={mock.observation}>
                  {mock.observation || "—"}
                </td>
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

  const project = projects.find(p => p.id === projectId);

  // ===== Gantt geral (todas as atividades, scroll horizontal, escala diária) =====
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

    // Se não há nenhuma com data, usa um range padrão em torno de hoje
    const today = new Date();
    const minDate = withDates.length
      ? addDays(dateMin(withDates.map(d => d.s)), -3)
      : addDays(today, -7);
    const maxDate = withDates.length
      ? addDays(dateMax(withDates.map(d => d.e)), 5)
      : addDays(today, 21);
    const days = eachDayOfInterval({ start: minDate, end: maxDate });
    // Lista combinada: primeiro com datas (na ordem original), depois sem datas
    const all = [
      ...withDates,
      ...undated,
    ];
    return { dated: withDates, undated, all, minDate, maxDate, days };
  }, [rows]);

  const DAY_W = 28; // px por dia
  const ROW_H = 32;
  const LABEL_W = 280;

  const GanttBlock = (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary" /> Atividade</span>
          <span className="inline-flex items-center gap-1 ml-3"><span className="w-3 h-3 rounded bg-red-500" /> Caminho crítico (folga 0)</span>
          <span className="inline-flex items-center gap-1 ml-3"><span className="w-3 h-3 rounded bg-emerald-500/70" /> Concluída</span>
          <span className="inline-flex items-center gap-1 ml-3"><AlertTriangle className="h-3 w-3 text-amber-500" /> Marco</span>
          <span className="inline-flex items-center gap-1 ml-3"><CalendarOff className="h-3 w-3 text-muted-foreground" /> Sem datas</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {ganttData
            ? `${ganttData.all.length} atividade(s) • ${ganttData.dated.length} com datas • ${ganttData.undated.length} sem datas • ${format(ganttData.minDate, "dd/MM/yy")} → ${format(ganttData.maxDate, "dd/MM/yy")}`
            : "—"}
        </div>
      </div>

      {!ganttData ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma atividade com datas para exibir no Gantt.
        </div>
      ) : (
        <div className="overflow-auto max-h-[70vh]">
          <div className="flex" style={{ width: LABEL_W + ganttData.days.length * DAY_W }}>
            {/* Coluna fixa de rótulos */}
            <div className="sticky left-0 z-20 bg-card border-r" style={{ width: LABEL_W }}>
              {/* Header de rótulos (2 linhas para alinhar com escala) */}
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
                return (
                  <div
                    key={a.id}
                    className="border-b px-3 flex items-center gap-2 hover:bg-muted/40"
                    style={{ height: ROW_H }}
                  >
                    <span className="text-[10px] font-mono text-muted-foreground w-8 shrink-0">#{id}</span>
                    {isCritical && (
                      <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                    )}
                    {noDates && (
                      <CalendarOff className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-xs truncate", isCritical && "font-semibold")}
                        title={a.title}>{a.title}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{responsible}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Área do gráfico */}
            <div className="relative" style={{ width: ganttData.days.length * DAY_W }}>
              {/* Cabeçalho meses + dias */}
              <div className="border-b sticky top-0 z-10 bg-card">
                {/* meses */}
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
                      <div key={k} className="border-r text-[11px] font-semibold text-center bg-muted/40 capitalize"
                        style={{ width: s.width, lineHeight: "22px" }}>
                        {s.label}
                      </div>
                    ));
                  })()}
                </div>
                {/* dias */}
                <div className="flex" style={{ height: 22 }}>
                  {ganttData.days.map((d, k) => (
                    <div key={k}
                      className={cn(
                        "border-r text-[10px] text-center text-muted-foreground",
                        isWeekend(d) && "bg-muted/40"
                      )}
                      style={{ width: DAY_W, lineHeight: "22px" }}
                    >
                      {format(d, "d")}
                    </div>
                  ))}
                </div>
              </div>

              {/* Grid de fundo + barras */}
              <div className="relative">
                {/* fundo: faixas de fim de semana */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {ganttData.days.map((d, k) => (
                    <div key={k}
                      className={cn("border-r", isWeekend(d) && "bg-muted/30")}
                      style={{ width: DAY_W }}
                    />
                  ))}
                </div>

                {/* linha de hoje */}
                {(() => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  if (today < ganttData.minDate || today > ganttData.maxDate) return null;
                  const offset = differenceInBusinessDays(today, ganttData.minDate); // não importa se util
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

                {/* linhas + barras */}
                {ganttData.all.map(({ a, s, e }) => {
                  // Atividade sem datas: linha vazia com aviso ancorado em "hoje"
                  if (!s || !e) {
                    const todayIdx = ganttData.days.findIndex(
                      d => d.toDateString() === new Date(new Date().setHours(0,0,0,0)).toDateString()
                    );
                    const left = (todayIdx >= 0 ? todayIdx : 0) * DAY_W;
                    return (
                      <div key={a.id} className="relative border-b bg-muted/10" style={{ height: ROW_H }}>
                        <div
                          className="absolute top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-muted-foreground/40 bg-card text-[10px] text-muted-foreground"
                          style={{ left: Math.max(0, left - 60) }}
                        >
                          <CalendarOff className="h-3 w-3" />
                          Sem datas — agendar no Backlog
                        </div>
                      </div>
                    );
                  }
                  const startIdx = ganttData.days.findIndex(d => d.toDateString() === s.toDateString());
                  const endIdx = ganttData.days.findIndex(d => d.toDateString() === e.toDateString());
                  const left = Math.max(0, startIdx) * DAY_W;
                  const width = Math.max(1, (endIdx - startIdx + 1)) * DAY_W - 4;
                  const isCritical = criticalSet.has(a.id);
                  const isCompleted = a.status === "completed";
                  const progress = isCompleted ? 100 : a.status === "in_progress" ? 50 : 0;
                  const responsible = profiles[a.assigned_to || ""]?.name || "—";

                  return (
                    <div key={a.id} className="relative border-b"
                      style={{ height: ROW_H }}>
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
                                style={{ left, width, height: ROW_H - 12 }}
                              >
                                <div className="h-full bg-white/30" style={{ width: `${100 - progress}%`, marginLeft: `${progress}%` }} />
                                <div className="absolute inset-0 flex items-center px-1.5 text-[10px] text-white font-medium truncate">
                                  {a.title}
                                </div>
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

  return (
    <AppLayout>
      <main className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="border-amber-500/60 text-amber-600">
                Prova de conceito
              </Badge>
              <h1 className="text-2xl font-semibold">Cronograma — Tabela detalhada + Gantt</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Visualização no estilo MS Project. Alterne entre <strong>Tabela detalhada</strong> e
              <strong> Gantt geral</strong> (todas as atividades, escala diária, role para o lado
              para ver e mapear o caminho crítico).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Projeto:</span>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Projeto" /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Toggle Tabela / Gantt */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex border rounded-lg overflow-hidden bg-card">
            {([
              { id: "table", label: "Tabela detalhada", icon: Table2 },
              { id: "gantt", label: "Gantt", icon: GanttChart },
            ] as const).map(opt => {
              const Icon = opt.icon;
              const active = mode === opt.id;
              return (
                <Button
                  key={opt.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode(opt.id)}
                  className={cn(
                    "rounded-none gap-2 h-9",
                    active && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" /> {opt.label}
                </Button>
              );
            })}
          </div>
        </div>

        {mode === "table" && TableView}
        {mode === "gantt" && GanttBlock}

        <div className="text-xs text-muted-foreground border-t pt-3">
          Após aprovação, a opção <strong>Tabela detalhada</strong> será adicionada como toggle
          dentro do Cronograma do projeto real (ao lado do Gantt já existente).
        </div>
      </main>
    </AppLayout>
  );
}