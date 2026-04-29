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
import { Table2, GanttChart, ExternalLink, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInBusinessDays, addDays, eachDayOfInterval, startOfMonth, endOfMonth, isWeekend, isSameMonth, min as dateMin, max as dateMax } from "date-fns";
import { ptBR } from "date-fns/locale";

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
      slack: h % 8,                               // dias de folga
      effortHours: 4 + (h % 36),                  // esforço h
      compression: ["Baixa", "Média", "Alta", "Nenhuma"][h % 4],
      observation: ["", "Aguardando aprovação do PO", "Risco de overlap com sprint", "Depende de fornecedor externo"][h % 4],
      mainResource: profiles[activities[idx]?.assigned_to || ""]?.sector || "—",
    };
  };

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
            <th className="w-16">Folga<br/>(d)</th>
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
            const isCritical = (mock.slack === 0);

            return (
              <tr key={a.id} className={cn(
                "border-b hover:bg-muted/40 transition-colors",
                isCritical && "bg-red-500/5"
              )}>
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
                <td className={cn("px-2 py-1.5 text-center font-mono", isCritical && "text-red-600 font-semibold")}>
                  {mock.slack}
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
        <span><span className="inline-block w-3 h-3 rounded bg-red-500/20 mr-1 align-middle" />Linha em vermelho claro = caminho crítico (Folga = 0)</span>
        <span>EAP, Folga, Esforço, Compressão e Observações são <strong>mock</strong> nesta prova de conceito.</span>
      </div>
    </div>
  );

  const project = projects.find(p => p.id === projectId);
  const GanttBlock = (
    <div className="border rounded-lg bg-card p-3">
      <TimelineView
        phases={phases}
        activities={activities as any}
        projectDueDate={project?.due_date || null}
      />
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
              Visualização opcional no estilo MS Project (tabela com EAP, predecessoras, folga,
              esforço, etc.) que pode coexistir com o Gantt atual. Use o seletor para alternar
              entre <strong>Tabela</strong>, <strong>Gantt</strong> ou ver os dois lado a lado.
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

        <CronogramaFilters
          value={filters}
          onChange={setFilters}
          phaseOptions={phaseOptions}
          responsibleOptions={responsibleOptions}
          sectorOptions={sectorOptions}
          tagOptions={tagOptions}
          workflowStageOptions={workflowStageOptions}
        />

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