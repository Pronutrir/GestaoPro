import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  List,
  KanbanSquare,
  Calendar as CalendarIcon,
  GanttChart,
  Plus,
  Search,
  X,
  LayoutGrid,
  Rows3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type ViewMode = "list" | "kanban" | "calendar" | "gantt" | "timeline" | "board";

const VIEWS: { id: ViewMode; label: string; icon: any }[] = [
  { id: "list", label: "Lista", icon: List },
  { id: "kanban", label: "Kanban", icon: KanbanSquare },
  { id: "board", label: "Quadro (por fase)", icon: LayoutGrid },
  { id: "calendar", label: "Calendário", icon: CalendarIcon },
  { id: "gantt", label: "Gantt", icon: GanttChart },
  { id: "timeline", label: "Cronograma", icon: Rows3 },
];

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os status" },
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluída" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "Todas as prioridades" },
  { value: "urgente", label: "Urgente" },
  { value: "critica", label: "Crítica" },
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
];

function priorityColor(p?: string) {
  switch (p) {
    case "urgente":
    case "critica":
      return "bg-red-500/15 text-red-600 border-red-500/30";
    case "alta":
      return "bg-orange-500/15 text-orange-600 border-orange-500/30";
    case "media":
      return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    case "baixa":
      return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function statusBadge(s?: string) {
  if (s === "completed") return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  if (s === "in_progress") return "bg-blue-500/15 text-blue-600 border-blue-500/30";
  return "bg-muted text-muted-foreground border-border";
}

export default function TarefasTest() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [activities, setActivities] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [phases, setPhases] = useState<any[]>([]);

  // ===== Estado global persistente entre visões =====
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Carrega projetos (Onboard pré-selecionado)
  useEffect(() => {
    supabase
      .from("projects")
      .select("id, title")
      .eq("is_trashed", false)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        const list = data || [];
        setProjects(list);
        if (!projectId && list.length > 0) {
          const onboard = list.find((p: any) => p.title?.toLowerCase().includes("onboard"));
          setProjectId(onboard?.id || list[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega dados do projeto
  const fetchData = useCallback(async () => {
    if (!projectId) return;
    const [{ data: acts }, { data: phs }, { data: ws }] = await Promise.all([
      supabase
        .from("activities")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .order("display_order", { ascending: true }),
      supabase
        .from("phases")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .order("display_order", { ascending: true }),
      supabase
        .from("workflow_stages")
        .select("*")
        .eq("project_id", projectId)
        .order("display_order", { ascending: true }),
    ]);
    setActivities(acts || []);
    setPhases(phs || []);
    setStages(ws || []);
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ===== Filtragem global aplicada a TODAS as visões =====
  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (search && !a.title?.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (priorityFilter !== "all" && a.priority !== priorityFilter) return false;
      return true;
    });
  }, [activities, search, statusFilter, priorityFilter]);

  const hasActiveFilters = search || statusFilter !== "all" || priorityFilter !== "all";

  return (
    <AppLayout>
      <main className="p-4 md:p-6 space-y-4">
        {/* Cabeçalho da prova de conceito */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="border-amber-500/60 text-amber-600">
                Prova de conceito
              </Badge>
              <h1 className="text-2xl font-semibold">Tarefas — Uma coleção, várias visões</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Modelo ClickUp: <strong>uma única lista de tarefas</strong> com filtros globais
              persistentes. Troque de visão e os filtros continuam aplicados — nada se perde.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Projeto:</span>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Barra de filtros globais persistentes */}
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
          <div className="relative flex-1 min-w-[220px] max-w-[320px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tarefa..."
              className="pl-8 h-9 bg-background"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] h-9 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[200px] h-9 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setPriorityFilter("all");
              }}
              className="gap-1 h-9"
            >
              <X className="w-3.5 h-3.5" /> Limpar
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {filtered.length} de {activities.length} tarefas
            </Badge>
          </div>
        </div>

        {/* Seletor +Visualização (chips horizontais) */}
        <div className="border-b border-border">
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors border",
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {v.label}
                </button>
              );
            })}
            <button
              disabled
              className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground/60 border border-dashed border-border cursor-not-allowed"
              title="Em breve"
            >
              <Plus className="w-3.5 h-3.5" /> Visualização
            </button>
          </div>
        </div>

        {/* Conteúdo da visão atual (sempre alimentado por `filtered`) */}
        <div className="min-h-[400px]">
          {!projectId ? (
            <div className="p-12 text-center text-muted-foreground">Selecione um projeto.</div>
          ) : view === "list" ? (
            <ListView items={filtered} phases={phases} stages={stages} />
          ) : view === "kanban" ? (
            <KanbanView items={filtered} stages={stages} />
          ) : view === "board" ? (
            <BoardByPhaseView items={filtered} phases={phases} />
          ) : view === "calendar" ? (
            <CalendarView items={filtered} />
          ) : view === "gantt" ? (
            <GanttView items={filtered} />
          ) : (
            <TimelineView items={filtered} />
          )}
        </div>

        {/* Nota de rodapé */}
        <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg text-sm text-muted-foreground">
          <strong className="text-foreground">Como ler esta prova de conceito:</strong> esta página
          NÃO substitui o projeto. É só uma demonstração visual de como ficaria se trocássemos as
          abas atuais (Kanban, Lista, Gantt…) por <em>uma única coleção de tarefas</em> com seletor
          de visualização. Os filtros acima persistem ao trocar de visão. Aprovando, levamos para o
          ProjectDetails real.
        </div>
      </main>
    </AppLayout>
  );
}

// ============= VISÕES =============

function ListView({ items, phases, stages }: { items: any[]; phases: any[]; stages: any[] }) {
  const phaseMap = useMemo(() => Object.fromEntries(phases.map((p) => [p.id, p.title])), [phases]);
  const stageMap = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s.title])), [stages]);

  if (items.length === 0) {
    return <div className="p-12 text-center text-muted-foreground">Nenhuma tarefa encontrada.</div>;
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background">
      <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground border-b border-border">
        <div className="col-span-5">Tarefa</div>
        <div className="col-span-2">Fase</div>
        <div className="col-span-2">Coluna</div>
        <div className="col-span-1">Prioridade</div>
        <div className="col-span-2">Prazo</div>
      </div>
      {items.map((a) => (
        <div key={a.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm border-b border-border hover:bg-muted/30 transition-colors">
          <div className="col-span-5 flex items-center gap-2 min-w-0">
            <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", a.status === "completed" ? "bg-emerald-500" : "bg-muted-foreground/40")} />
            <span className="truncate">{a.title}</span>
          </div>
          <div className="col-span-2 text-muted-foreground truncate">{a.phase_id ? phaseMap[a.phase_id] || "—" : "Sem fase"}</div>
          <div className="col-span-2 text-muted-foreground truncate">{a.workflow_stage_id ? stageMap[a.workflow_stage_id] || "—" : "—"}</div>
          <div className="col-span-1">
            {a.priority && a.priority !== "pendente" && (
              <Badge variant="outline" className={cn("text-[10px] capitalize", priorityColor(a.priority))}>{a.priority}</Badge>
            )}
          </div>
          <div className="col-span-2 text-muted-foreground text-xs">{a.end_date ? format(parseISO(a.end_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</div>
        </div>
      ))}
    </div>
  );
}

function KanbanView({ items, stages }: { items: any[]; stages: any[] }) {
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    stages.forEach((s) => (g[s.id] = []));
    g["__none__"] = [];
    items.forEach((a) => {
      const k = a.workflow_stage_id || "__none__";
      if (!g[k]) g[k] = [];
      g[k].push(a);
    });
    return g;
  }, [items, stages]);

  const columns = [...stages, { id: "__none__", title: "Sem coluna", color: "hsl(220, 15%, 50%)" }];

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col: any) => (
        <div key={col.id} className="w-72 shrink-0 bg-muted/30 rounded-lg border border-border">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
              <span className="text-sm font-medium">{col.title}</span>
            </div>
            <Badge variant="secondary" className="text-xs">{(grouped[col.id] || []).length}</Badge>
          </div>
          <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
            {(grouped[col.id] || []).map((a) => (
              <div key={a.id} className="bg-background rounded-md p-2.5 border border-border text-sm space-y-1.5">
                <div className="line-clamp-2 font-medium">{a.title}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {a.priority && a.priority !== "pendente" && (
                    <Badge variant="outline" className={cn("text-[10px] capitalize", priorityColor(a.priority))}>{a.priority}</Badge>
                  )}
                  {a.end_date && (
                    <span className="text-[10px] text-muted-foreground">{format(parseISO(a.end_date + "T12:00:00"), "dd/MM")}</span>
                  )}
                </div>
              </div>
            ))}
            {(grouped[col.id] || []).length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">Vazio</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardByPhaseView({ items, phases }: { items: any[]; phases: any[] }) {
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { __none__: [] };
    phases.forEach((p) => (g[p.id] = []));
    items.forEach((a) => {
      const k = a.phase_id || "__none__";
      if (!g[k]) g[k] = [];
      g[k].push(a);
    });
    return g;
  }, [items, phases]);

  const columns = [...phases, { id: "__none__", title: "Sem fase" }];

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col: any) => (
        <div key={col.id} className="w-72 shrink-0 bg-muted/30 rounded-lg border border-border">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium">{col.title}</span>
            <Badge variant="secondary" className="text-xs">{(grouped[col.id] || []).length}</Badge>
          </div>
          <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
            {(grouped[col.id] || []).map((a) => (
              <div key={a.id} className="bg-background rounded-md p-2.5 border border-border text-sm">
                <div className="line-clamp-2">{a.title}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarView({ items }: { items: any[] }) {
  const today = new Date();
  const days = eachDayOfInterval({ start: startOfMonth(today), end: endOfMonth(today) });
  const tasksByDay = useMemo(() => {
    const m: Record<string, any[]> = {};
    items.forEach((a) => {
      if (!a.end_date) return;
      const k = a.end_date;
      if (!m[k]) m[k] = [];
      m[k].push(a);
    });
    return m;
  }, [items]);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background">
      <div className="px-4 py-2 bg-muted/40 text-sm font-medium border-b border-border">
        {format(today, "MMMM 'de' yyyy", { locale: ptBR })}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="bg-muted/40 text-xs text-center py-1.5 text-muted-foreground">{d}</div>
        ))}
        {days.map((d) => {
          const k = format(d, "yyyy-MM-dd");
          const tasks = tasksByDay[k] || [];
          return (
            <div key={k} className={cn("bg-background p-1.5 min-h-[80px] text-xs", isSameDay(d, today) && "ring-2 ring-primary ring-inset")}>
              <div className="font-medium text-muted-foreground mb-1">{format(d, "d")}</div>
              {tasks.slice(0, 3).map((a) => (
                <div key={a.id} className="truncate text-[10px] bg-primary/10 text-primary rounded px-1 py-0.5 mb-0.5">{a.title}</div>
              ))}
              {tasks.length > 3 && <div className="text-[10px] text-muted-foreground">+{tasks.length - 3}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GanttView({ items }: { items: any[] }) {
  const withDates = items.filter((a) => a.start_date && a.end_date);
  if (withDates.length === 0) {
    return <div className="p-12 text-center text-muted-foreground">Nenhuma tarefa com datas para exibir no Gantt.</div>;
  }
  const minDate = new Date(Math.min(...withDates.map((a) => new Date(a.start_date).getTime())));
  const maxDate = new Date(Math.max(...withDates.map((a) => new Date(a.end_date).getTime())));
  const totalMs = maxDate.getTime() - minDate.getTime() || 1;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background">
      <div className="px-4 py-2 bg-muted/40 text-xs text-muted-foreground border-b border-border flex justify-between">
        <span>{format(minDate, "dd/MM/yyyy")}</span>
        <span>{format(maxDate, "dd/MM/yyyy")}</span>
      </div>
      <div className="divide-y divide-border">
        {withDates.map((a) => {
          const start = ((new Date(a.start_date).getTime() - minDate.getTime()) / totalMs) * 100;
          const width = ((new Date(a.end_date).getTime() - new Date(a.start_date).getTime()) / totalMs) * 100;
          return (
            <div key={a.id} className="grid grid-cols-12 gap-2 items-center px-4 py-2 text-sm">
              <div className="col-span-4 truncate">{a.title}</div>
              <div className="col-span-8 relative h-5 bg-muted/40 rounded">
                <div
                  className="absolute h-5 bg-primary/70 rounded"
                  style={{ left: `${start}%`, width: `${Math.max(width, 1)}%` }}
                  title={`${format(parseISO(a.start_date + "T12:00:00"), "dd/MM")} → ${format(parseISO(a.end_date + "T12:00:00"), "dd/MM")}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineView({ items }: { items: any[] }) {
  const grouped = useMemo(() => {
    const m: Record<string, any[]> = {};
    items.forEach((a) => {
      const key = a.end_date ? format(parseISO(a.end_date + "T12:00:00"), "MMMM yyyy", { locale: ptBR }) : "Sem data";
      if (!m[key]) m[key] = [];
      m[key].push(a);
    });
    return m;
  }, [items]);

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([month, tasks]) => (
        <div key={month}>
          <div className="text-sm font-semibold text-muted-foreground capitalize mb-2 sticky top-0 bg-background py-1">{month}</div>
          <div className="space-y-1.5">
            {tasks.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded border border-border text-sm">
                <Badge variant="outline" className={cn("text-[10px]", statusBadge(a.status))}>{a.status}</Badge>
                <span className="flex-1 truncate">{a.title}</span>
                {a.end_date && <span className="text-xs text-muted-foreground">{format(parseISO(a.end_date + "T12:00:00"), "dd/MM")}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
