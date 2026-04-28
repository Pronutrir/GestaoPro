import { useEffect, useMemo, useState } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  List,
  KanbanSquare,
  Calendar as CalendarIcon,
  GanttChart,
  Plus,
  Filter,
  X,
  Search,
  Check,
  LayoutGrid,
  Rows3,
  Activity as ActivityIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "kanban" | "calendar" | "gantt" | "timeline" | "board";

const VIEWS: { id: ViewMode; label: string; icon: any }[] = [
  { id: "list", label: "Lista", icon: List },
  { id: "kanban", label: "Kanban", icon: KanbanSquare },
  { id: "board", label: "Quadro (por fase)", icon: LayoutGrid },
  { id: "calendar", label: "Calendário", icon: CalendarIcon },
  { id: "gantt", label: "Gantt", icon: GanttChart },
  { id: "timeline", label: "Cronograma", icon: Rows3 },
];

export default function TarefasTest() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [activities, setActivities] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [phases, setPhases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Estado da visão (persistente entre trocas)
  const [view, setView] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  // Carrega projetos (Onboard primeiro)
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
          // Pré-seleciona o projeto Onboard se existir
          const onboard = list.find((p) =>
            p.title?.toLowerCase().includes("onboard")
          );
          setProjectId(onboard?.id || list[0].id);
        }
      });
  }, []);

  // Carrega tarefas e stages do projeto selecionado
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      supabase
        .from("activities")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .order("display_order", { ascending: true }),
      supabase
        .from("workflow_stages")
        .select("*")
        .eq("project_id", projectId)
        .order("display_order", { ascending: true }),
      supabase
        .from("phases")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .order("display_order", { ascending: true }),
    ]).then(([acts, stgs, phs]) => {
      setActivities(acts.data || []);
      setStages(stgs.data || []);
      setPhases(phs.data || []);
      setLoading(false);
    });
  }, [projectId]);

  // Filtragem unificada (aplica em TODAS as visões)
  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (a.item_type === "fase") return false;
      if (search && !a.title?.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (stageFilter !== "all" && a.workflow_stage_id !== stageFilter)
        return false;
      if (priorityFilter !== "all" && a.priority !== priorityFilter)
        return false;
      return true;
    });
  }, [activities, search, stageFilter, priorityFilter]);

  const stageById = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages]
  );

  const phaseById = useMemo(
    () => new Map(phases.map((p) => [p.id, p])),
    [phases]
  );

  const activeView = VIEWS.find((v) => v.id === view)!;
  const ActiveIcon = activeView.icon;

  const clearFilters = () => {
    setSearch("");
    setStageFilter("all");
    setPriorityFilter("all");
  };

  const hasFilters =
    search !== "" || stageFilter !== "all" || priorityFilter !== "all";

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Cabeçalho da página de teste */}
        <div className="border-b bg-muted/30 px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">
                Tarefas <Badge variant="outline" className="ml-2">PÁGINA DE TESTE</Badge>
              </h1>
              <p className="text-xs text-muted-foreground">
                Modelo "+Visualização" estilo ClickUp — uma única coleção, várias visões. Filtros persistem ao trocar de visão.
              </p>
            </div>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[280px]">
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

        {/* Barra de visualização + filtros (persistentes) */}
        <div className="border-b bg-background px-6 py-2 flex items-center gap-3 flex-wrap">
          {/* Seletor de visão */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ActiveIcon className="h-4 w-4" />
                {activeView.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Visualizações</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {VIEWS.map((v) => {
                const Icon = v.icon;
                return (
                  <DropdownMenuItem
                    key={v.id}
                    onClick={() => setView(v.id)}
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{v.label}</span>
                    {view === v.id && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled className="gap-2 text-muted-foreground">
                <Plus className="h-4 w-4" />
                Nova visão (em breve)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-5 w-px bg-border" />

          {/* Filtros que PERSISTEM entre visões */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tarefa..."
              className="h-8 pl-8 w-56"
            />
          </div>

          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas prioridades</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8 gap-1 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Limpar
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            {filtered.length} de {activities.filter(a => a.item_type !== "fase").length} tarefas
          </div>
        </div>

        {/* Área da visão ativa */}
        <div className="flex-1 overflow-auto p-6 bg-muted/10">
          {loading ? (
            <div className="text-center text-muted-foreground py-20">
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-20">
              Nenhuma tarefa corresponde aos filtros.
            </div>
          ) : (
            <>
              {view === "list" && (
                <ListView tasks={filtered} stageById={stageById} />
              )}
              {view === "kanban" && (
                <KanbanView tasks={filtered} stages={stages} />
              )}
              {view === "calendar" && (
                <CalendarView tasks={filtered} stageById={stageById} />
              )}
              {view === "gantt" && (
                <GanttView tasks={filtered} stageById={stageById} />
              )}
              {view === "timeline" && (
                <TimelineView tasks={filtered} stageById={stageById} />
              )}
              {view === "board" && (
                <BoardByPhaseView tasks={filtered} phases={phases} stageById={stageById} />
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

/* ---------------- VISÕES ---------------- */

function StatusBadge({ stage }: { stage: any }) {
  if (!stage) return null;
  return (
    <Badge
      variant="outline"
      className="text-[10px] font-medium border-0"
      style={{
        backgroundColor: `${stage.color}20`,
        color: stage.color,
      }}
    >
      {stage.title}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const map: Record<string, string> = {
    alta: "bg-red-100 text-red-700",
    media: "bg-amber-100 text-amber-700",
    baixa: "bg-blue-100 text-blue-700",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] border-0", map[priority])}>
      {priority}
    </Badge>
  );
}

function ListView({ tasks, stageById }: { tasks: any[]; stageById: Map<string, any> }) {
  return (
    <div className="bg-background border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Tarefa</th>
            <th className="text-left px-4 py-2 font-medium w-32">Status</th>
            <th className="text-left px-4 py-2 font-medium w-28">Prioridade</th>
            <th className="text-left px-4 py-2 font-medium w-32">Prazo</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-t hover:bg-muted/30">
              <td className="px-4 py-2">{t.title}</td>
              <td className="px-4 py-2">
                <StatusBadge stage={stageById.get(t.workflow_stage_id)} />
              </td>
              <td className="px-4 py-2">
                <PriorityBadge priority={t.priority} />
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KanbanView({ tasks, stages }: { tasks: any[]; stages: any[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage) => {
        const colTasks = tasks.filter((t) => t.workflow_stage_id === stage.id);
        return (
          <div
            key={stage.id}
            className="flex-1 min-w-[260px] bg-background rounded-lg border"
          >
            <div
              className="px-3 py-2 border-b flex items-center justify-between"
              style={{ borderTop: `3px solid ${stage.color}` }}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{stage.title}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {colTasks.length}
                </Badge>
              </div>
            </div>
            <div className="p-2 space-y-2 min-h-[200px]">
              {colTasks.map((t) => (
                <div
                  key={t.id}
                  className="bg-card border rounded-md p-2 text-xs space-y-1.5 hover:shadow-sm transition-shadow"
                >
                  <div className="font-medium line-clamp-2">{t.title}</div>
                  <div className="flex items-center gap-1.5">
                    <PriorityBadge priority={t.priority} />
                    {t.due_date && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarView({ tasks, stageById }: { tasks: any[]; stageById: Map<string, any> }) {
  // Calendário simples por semana atual + próximas 3
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());

  const days: Date[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  const tasksByDay = new Map<string, any[]>();
  tasks.forEach((t) => {
    if (!t.due_date) return;
    const key = t.due_date;
    if (!tasksByDay.has(key)) tasksByDay.set(key, []);
    tasksByDay.get(key)!.push(t);
  });

  return (
    <div className="bg-background border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground bg-muted/50">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="px-2 py-1.5 text-center border-r last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const dayTasks = tasksByDay.get(key) || [];
          const isToday = d.getTime() === today.getTime();
          return (
            <div
              key={key}
              className={cn(
                "border-t border-r last:border-r-0 min-h-[100px] p-1.5 text-xs",
                isToday && "bg-primary/5"
              )}
            >
              <div className={cn("font-medium mb-1", isToday && "text-primary")}>
                {d.getDate()}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((t) => {
                  const stage = stageById.get(t.workflow_stage_id);
                  return (
                    <div
                      key={t.id}
                      className="px-1.5 py-0.5 rounded text-[10px] truncate"
                      style={{
                        backgroundColor: stage ? `${stage.color}25` : undefined,
                        color: stage?.color,
                      }}
                      title={t.title}
                    >
                      {t.title}
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{dayTasks.length - 3}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GanttView({ tasks, stageById }: { tasks: any[]; stageById: Map<string, any> }) {
  const withDates = tasks.filter((t) => t.start_date && t.due_date);
  if (withDates.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-20">
        Nenhuma tarefa com data de início e prazo definidos para exibir no Gantt.
      </div>
    );
  }

  const allDates = withDates.flatMap((t) => [
    new Date(t.start_date + "T12:00:00").getTime(),
    new Date(t.due_date + "T12:00:00").getTime(),
  ]);
  const min = Math.min(...allDates);
  const max = Math.max(...allDates);
  const totalDays = Math.max(1, Math.ceil((max - min) / 86400000));

  return (
    <div className="bg-background border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground">
        {new Date(min).toLocaleDateString("pt-BR")} → {new Date(max).toLocaleDateString("pt-BR")}
      </div>
      <div className="divide-y">
        {withDates.map((t) => {
          const start = new Date(t.start_date + "T12:00:00").getTime();
          const end = new Date(t.due_date + "T12:00:00").getTime();
          const left = ((start - min) / 86400000 / totalDays) * 100;
          const width = Math.max(2, ((end - start) / 86400000 / totalDays) * 100);
          const stage = stageById.get(t.workflow_stage_id);
          return (
            <div key={t.id} className="grid grid-cols-[240px_1fr] items-center gap-3 px-4 py-2 hover:bg-muted/30">
              <div className="text-sm truncate">{t.title}</div>
              <div className="relative h-6">
                <div
                  className="absolute h-6 rounded text-[10px] text-white px-2 flex items-center truncate"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: stage?.color || "hsl(var(--primary))",
                  }}
                  title={`${new Date(start).toLocaleDateString("pt-BR")} → ${new Date(end).toLocaleDateString("pt-BR")}`}
                >
                  {stage?.title}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}