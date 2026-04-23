import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  format,
  differenceInDays,
  startOfDay,
  addDays,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  eachMonthOfInterval,
  eachWeekOfInterval,
  isSameMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  GanttChart,
  Zap,
  ExternalLink,
  Check,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { calculateCriticalPath } from "@/lib/criticalPath";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  category: string | null;
}

interface Activity {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  assigned_to: string | null;
  project_id: string;
  phase_id: string | null;
  priority: string;
}

interface Phase {
  id: string;
  title: string;
  project_id: string;
  display_order: number | null;
}

type ZoomLevel = "month" | "quarter" | "half" | "year";

const statusColors: Record<string, string> = {
  completed: "bg-gradient-to-r from-success to-success/80",
  overdue: "bg-gradient-to-r from-destructive to-destructive/80",
  in_progress: "bg-gradient-to-r from-primary to-primary/80",
  pending: "bg-gradient-to-r from-muted-foreground/70 to-muted-foreground/50",
};

const statusLabels: Record<string, string> = {
  completed: "Concluída",
  overdue: "Atrasada",
  in_progress: "Em andamento",
  pending: "Pendente",
};

const priorityColors: Record<string, string> = {
  high: "border-l-destructive",
  medium: "border-l-warning",
  low: "border-l-success",
};

const getActivityStatus = (activity: Activity) => {
  if (activity.status === "completed") return "completed";
  const t = startOfDay(new Date());
  if (activity.end_date && parseISO(activity.end_date) < t) return "overdue";
  if (activity.start_date && parseISO(activity.start_date) <= t) return "in_progress";
  return "pending";
};

const Timeline = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { filterProjects, loading: authLoading } = useProjectAccess();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("quarter");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dependencies, setDependencies] = useState<{ predecessor_id: string; successor_id: string; lag_days: number | null }[]>([]);
  const [showCritical, setShowCritical] = useState(true);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [projectsRes, activitiesRes, phasesRes, depsRes] = await Promise.all([
        supabase.from("projects").select("id,title,status,priority,due_date,category").eq("is_trashed", false).order("title"),
        supabase.from("activities").select("id,title,status,start_date,end_date,assigned_to,project_id,phase_id,priority"),
        supabase.from("phases").select("id,title,project_id,display_order").order("display_order"),
        supabase.from("task_dependencies").select("predecessor_id,successor_id,lag_days"),
      ]);

      const filtered = await filterProjects(projectsRes.data || []);
      setProjects(filtered);
      const projectIds = new Set(filtered.map((p) => p.id));
      setActivities((activitiesRes.data || []).filter((a) => projectIds.has(a.project_id)));
      setPhases((phasesRes.data || []).filter((p) => projectIds.has(p.project_id)));
      setDependencies(depsRes.data || []);
    } finally {
      setIsLoading(false);
    }
  }, [filterProjects]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  // auto-expand all projects on first load
  useEffect(() => {
    if (projects.length > 0 && expandedProjects.size === 0) {
      setExpandedProjects(new Set(projects.map((p) => p.id)));
    }
  }, [projects]);

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Only projects with scheduled activities
  const scheduledActivities = useMemo(
    () => activities.filter((a) => a.start_date || a.end_date),
    [activities]
  );

  // Date range
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const dates: Date[] = [startOfDay(new Date())];
    scheduledActivities.forEach((a) => {
      if (a.start_date) dates.push(parseISO(a.start_date));
      if (a.end_date) dates.push(parseISO(a.end_date));
    });
    projects.forEach((p) => {
      if (p.due_date) dates.push(parseISO(p.due_date));
    });

    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));

    const zoomPadding: Record<ZoomLevel, number> = {
      month: 7,
      quarter: 14,
      half: 21,
      year: 30,
    };
    const pad = zoomPadding[zoomLevel];
    const paddedMin = addDays(startOfMonth(min), -pad);
    const paddedMax = addDays(endOfMonth(max), pad);
    return {
      minDate: paddedMin,
      maxDate: paddedMax,
      totalDays: Math.max(differenceInDays(paddedMax, paddedMin), 30),
    };
  }, [scheduledActivities, projects, zoomLevel]);

  // Column width per day based on zoom
  const dayWidth = useMemo(() => {
    const widths: Record<ZoomLevel, number> = { month: 28, quarter: 14, half: 8, year: 4 };
    return widths[zoomLevel];
  }, [zoomLevel]);

  const totalWidth = totalDays * dayWidth;

  // Month markers
  const monthMarkers = useMemo(() => {
    return eachMonthOfInterval({ start: minDate, end: maxDate }).map((date) => ({
      date,
      position: differenceInDays(date, minDate) * dayWidth,
      width: differenceInDays(endOfMonth(date), date) * dayWidth,
    }));
  }, [minDate, maxDate, dayWidth]);

  // Quarter markers (Q1=jan-mar, Q2=abr-jun, Q3=jul-set, Q4=out-dez)
  const quarterMarkers = useMemo(() => {
    const result: { label: string; year: number; position: number; width: number }[] = [];
    const seen = new Set<string>();
    eachMonthOfInterval({ start: minDate, end: maxDate }).forEach((date) => {
      const q = Math.floor(date.getMonth() / 3) + 1;
      const y = date.getFullYear();
      const key = `${y}-Q${q}`;
      if (seen.has(key)) return;
      seen.add(key);
      const qStart = new Date(y, (q - 1) * 3, 1);
      const qEnd = new Date(y, q * 3, 0); // last day of quarter
      const left = differenceInDays(qStart, minDate) * dayWidth;
      const right = (differenceInDays(qEnd, minDate) + 1) * dayWidth;
      result.push({ label: `Q${q}`, year: y, position: left, width: right - left });
    });
    return result;
  }, [minDate, maxDate, dayWidth]);

  // Week markers
  const weekMarkers = useMemo(() => {
    return eachWeekOfInterval({ start: minDate, end: maxDate }).map((date) => ({
      date,
      position: differenceInDays(date, minDate) * dayWidth,
    }));
  }, [minDate, maxDate, dayWidth]);

  // Weekend bands (Sat + Sun) — only render when zoom is wide enough
  const weekendBands = useMemo(() => {
    if (dayWidth < 6) return [] as { left: number; width: number }[];
    const bands: { left: number; width: number }[] = [];
    const total = differenceInDays(maxDate, minDate);
    for (let i = 0; i <= total; i++) {
      const d = addDays(minDate, i);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) {
        bands.push({ left: i * dayWidth, width: dayWidth });
      }
    }
    return bands;
  }, [minDate, maxDate, dayWidth]);


  const todayPosition = useMemo(() => {
    const t = startOfDay(new Date());
    if (t < minDate || t > maxDate) return null;
    return differenceInDays(t, minDate) * dayWidth;
  }, [minDate, maxDate, dayWidth]);

  const getBarPosition = (activity: Activity) => {
    const start = activity.start_date
      ? parseISO(activity.start_date)
      : parseISO(activity.end_date!);
    const end = activity.end_date ? parseISO(activity.end_date) : start;
    const left = differenceInDays(start, minDate) * dayWidth;
    const duration = Math.max(differenceInDays(end, start), 1);
    const width = duration * dayWidth;
    return { left: Math.max(left, 0), width: Math.max(width, dayWidth) };
  };

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase());
      const projectActivities = scheduledActivities.filter((a) => a.project_id === p.id);
      const hasScheduledActivities = projectActivities.length > 0;
      if (statusFilter !== "all") {
        const matchesStatus = projectActivities.some((a) => getActivityStatus(a) === statusFilter);
        return matchesSearch && hasScheduledActivities && matchesStatus;
      }
      return matchesSearch && hasScheduledActivities;
    });
  }, [projects, searchTerm, scheduledActivities, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const all = scheduledActivities;
    return {
      total: all.length,
      completed: all.filter((a) => getActivityStatus(a) === "completed").length,
      inProgress: all.filter((a) => getActivityStatus(a) === "in_progress").length,
      overdue: all.filter((a) => getActivityStatus(a) === "overdue").length,
      pending: all.filter((a) => getActivityStatus(a) === "pending").length,
    };
  }, [scheduledActivities]);

  // Critical path computed per-project (dependencies are scoped per project anyway)
  const criticalIds = useMemo(() => {
    if (!showCritical) return new Set<string>();
    const all = new Set<string>();
    projects.forEach(p => {
      const projActs = scheduledActivities.filter(a => a.project_id === p.id);
      const projActIds = new Set(projActs.map(a => a.id));
      const projDeps = dependencies.filter(d => projActIds.has(d.predecessor_id) && projActIds.has(d.successor_id));
      const cp = calculateCriticalPath(projActs, projDeps);
      cp.forEach(id => all.add(id));
    });
    return all;
  }, [projects, scheduledActivities, dependencies, showCritical]);

  // Projects without any dependencies → critical path is not meaningful
  const projectsWithoutDeps = useMemo(() => {
    if (!showCritical) return [] as Project[];
    return filteredProjects.filter((p) => {
      const acts = scheduledActivities.filter((a) => a.project_id === p.id);
      const ids = new Set(acts.map((a) => a.id));
      const hasDep = dependencies.some((d) => ids.has(d.predecessor_id) && ids.has(d.successor_id));
      return acts.length > 1 && !hasDep;
    });
  }, [filteredProjects, scheduledActivities, dependencies, showCritical]);

  const scrollToToday = () => {
    if (scrollRef.current && todayPosition !== null) {
      scrollRef.current.scrollLeft = todayPosition - scrollRef.current.clientWidth / 2;
    }
  };

  const completeActivity = async (id: string) => {
    const { error } = await supabase
      .from("activities")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao concluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Atividade concluída" });
    fetchData();
  };

  const ROW_H = 36;
  const HEADER_H = 76;
  const QUARTER_H = 22;
  const MONTH_H = HEADER_H - QUARTER_H;

  // Build row list
  const rows = useMemo(() => {
    const result: { type: "project" | "activity"; data: Project | Activity; phaseName?: string }[] = [];
    filteredProjects.forEach((project) => {
      result.push({ type: "project", data: project });
      if (expandedProjects.has(project.id)) {
        const projectPhases = phases
          .filter((ph) => ph.project_id === project.id)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        const projectActivities = scheduledActivities.filter((a) => a.project_id === project.id);

        if (projectPhases.length > 0) {
          projectPhases.forEach((phase) => {
            const phaseActivities = projectActivities
              .filter((a) => a.phase_id === phase.id)
              .filter((a) => statusFilter === "all" || getActivityStatus(a) === statusFilter);
            phaseActivities.forEach((act) => {
              result.push({ type: "activity", data: act, phaseName: phase.title });
            });
          });
          // Unassigned
          const unassigned = projectActivities
            .filter((a) => !a.phase_id)
            .filter((a) => statusFilter === "all" || getActivityStatus(a) === statusFilter);
          unassigned.forEach((act) => {
            result.push({ type: "activity", data: act });
          });
        } else {
          const acts = projectActivities.filter(
            (a) => statusFilter === "all" || getActivityStatus(a) === statusFilter
          );
          acts.forEach((act) => {
            result.push({ type: "activity", data: act });
          });
        }
      }
    });
    return result;
  }, [filteredProjects, expandedProjects, scheduledActivities, phases, statusFilter]);

  if (isLoading) {
    return (
      <AppLayout title="Cronograma">
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Cronograma">
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Toolbar */}
        <div className="flex-none px-6 py-4 border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left: Search + Filter */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar projetos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="completed">Concluídas</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="overdue">Atrasadas</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stats */}
            <div className="hidden md:flex items-center gap-3">
              {[
                { key: "completed", label: "Concluídas", count: stats.completed, color: "bg-success" },
                { key: "inProgress", label: "Em andamento", count: stats.inProgress, color: "bg-primary" },
                { key: "overdue", label: "Atrasadas", count: stats.overdue, color: "bg-destructive" },
                { key: "pending", label: "Pendentes", count: stats.pending, color: "bg-muted-foreground/60" },
              ].map((s) => (
                <div key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                  <span>{s.count}</span>
                </div>
              ))}
            </div>

            {/* Right: Zoom + Today */}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setLeftPanelOpen((v) => !v)}
                  >
                    {leftPanelOpen ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeftOpen className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {leftPanelOpen ? "Ocultar painel de projetos" : "Mostrar painel de projetos"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={scrollToToday}>
                    <Calendar className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Ir para Hoje</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showCritical ? "default" : "ghost"}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setShowCritical(v => !v)}
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {showCritical ? "Ocultar caminho crítico" : "Destacar caminho crítico"}
                </TooltipContent>
              </Tooltip>
              {showCritical && projectsWithoutDeps.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 relative text-warning hover:text-warning hover:bg-warning/10 animate-pulse"
                      aria-label="Aviso sobre caminho crítico"
                    >
                      <AlertCircle className="h-4 w-4" />
                      <span className="absolute top-1 right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-warning" />
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="end" className="w-80">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                      <div className="text-xs text-foreground">
                        <p className="font-semibold mb-1">Caminho crítico pouco confiável</p>
                        {projectsWithoutDeps.length === 1 ? (
                          <p>
                            O projeto <span className="font-medium">"{projectsWithoutDeps[0].title}"</span> não possui dependências cadastradas entre as tarefas. Cadastre dependências na aba "Dependências" das atividades para um cálculo realista.
                          </p>
                        ) : (
                          <>
                            <p className="mb-2">
                              {projectsWithoutDeps.length} projetos não possuem dependências cadastradas — todas as tarefas aparecerão como críticas.
                            </p>
                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground max-h-40 overflow-auto">
                              {projectsWithoutDeps.map((p) => (
                                <li key={p.id} className="truncate">{p.title}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <div className="flex items-center border border-border rounded-lg overflow-hidden">
                {(["month", "quarter", "half", "year"] as ZoomLevel[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => setZoomLevel(level)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      zoomLevel === level
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {{ month: "Mês", quarter: "Trim", half: "Sem", year: "Ano" }[level]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Gantt Area */}
        {filteredProjects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <GanttChart className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Nenhum cronograma encontrado</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Adicione datas de início e fim às atividades dos projetos para visualizá-las no cronograma geral.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel: Row Labels */}
            {leftPanelOpen && (
            <div className="flex-none w-[180px] sm:w-[260px] lg:w-[320px] border-r border-border bg-card flex flex-col transition-all">
              {/* Header */}
              <div
                className="flex items-center px-4 border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider gap-2"
                style={{ height: HEADER_H }}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">Projetos / Atividades</span>
                <span className="hidden sm:inline w-[64px] text-right normal-case tracking-normal text-[11px] shrink-0">Data final</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 -mr-1 hover:bg-primary/10 hover:text-primary"
                      onClick={() => setLeftPanelOpen(false)}
                      aria-label="Recolher painel"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Recolher painel</TooltipContent>
                </Tooltip>
              </div>
              {/* Rows */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {rows.map((row, idx) => {
                  if (row.type === "project") {
                    const project = row.data as Project;
                    const isExpanded = expandedProjects.has(project.id);
                    const actCount = scheduledActivities.filter(
                      (a) => a.project_id === project.id
                    ).length;
                    const projectActs = scheduledActivities.filter((a) => a.project_id === project.id);
                    const endDates = projectActs
                      .map((a) => a.end_date || a.start_date)
                      .filter(Boolean)
                      .map((d) => parseISO(d!));
                    const projEnd = endDates.length
                      ? new Date(Math.max(...endDates.map((d) => d.getTime())))
                      : null;
                    return (
                      <div
                        key={`p-${project.id}`}
                        className="flex items-center px-4 gap-2 border-b border-border/50 bg-muted/30 cursor-pointer hover:bg-muted/60 transition-colors"
                        style={{ height: ROW_H }}
                        onClick={() => toggleProject(project.id)}
                      >
                        <ChevronRight
                          className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                        <span className="text-sm font-semibold text-foreground truncate flex-1">
                          {project.title}
                        </span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {actCount}
                        </Badge>
                        <span className="hidden sm:inline w-[64px] text-right text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {projEnd ? format(projEnd, "dd/MM/yy") : "—"}
                        </span>
                      </div>
                    );
                  } else {
                    const activity = row.data as Activity;
                    const status = getActivityStatus(activity);
                    return (
                      <div
                        key={`a-${activity.id}`}
                        className={`flex items-center pl-9 pr-4 gap-2 border-b border-border/30 border-l-2 ${
                          priorityColors[activity.priority] || "border-l-transparent"
                        } hover:bg-muted/30 transition-colors`}
                        style={{ height: ROW_H }}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColors[status]}`} />
                        <span className="text-xs text-foreground truncate flex-1">{activity.title}</span>
                        {row.phaseName && (
                          <span className="hidden md:inline text-[10px] text-muted-foreground truncate max-w-[60px]">
                            {row.phaseName}
                          </span>
                        )}
                        <span className="hidden sm:inline w-[64px] text-right text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {activity.end_date ? format(parseISO(activity.end_date), "dd/MM/yy") : "—"}
                        </span>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
            )}

            {/* Right Panel: Gantt Bars */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
              {!leftPanelOpen && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="icon"
                      className="absolute left-2 top-2 z-30 h-7 w-7 shadow-md rounded-full"
                      onClick={() => setLeftPanelOpen(true)}
                      aria-label="Mostrar painel"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Mostrar painel de projetos</TooltipContent>
                </Tooltip>
              )}
              {/* Timeline header */}
              <div
                ref={scrollRef}
                className="overflow-x-auto overflow-y-hidden"
                style={{ height: HEADER_H }}
              >
                <div className="relative" style={{ width: totalWidth, height: HEADER_H }}>
                  {/* Quarter row */}
                  {quarterMarkers.map((q, i) => (
                    <div
                      key={`q-${i}`}
                      className="absolute top-0 flex items-center justify-center border-l border-border/60 bg-muted/40 text-[11px] font-bold text-foreground/80 tracking-wide"
                      style={{ left: q.position, width: q.width, height: QUARTER_H }}
                    >
                      <span className="truncate px-1">
                        {q.year} <span className="text-primary">{q.label}</span>
                      </span>
                    </div>
                  ))}
                  {/* Month labels (below quarters) */}
                  {monthMarkers.map((m, i) => (
                    <div
                      key={i}
                      className="absolute flex items-center justify-start border-l border-border/60"
                      style={{ left: m.position, width: m.width, top: QUARTER_H, height: MONTH_H }}
                    >
                      <span className="pl-2 text-xs font-medium text-muted-foreground capitalize truncate">
                        {format(m.date, "MMM", { locale: ptBR })}
                      </span>
                    </div>
                  ))}
                  {/* Today line in header */}
                  {todayPosition !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-primary z-20"
                      style={{ left: todayPosition }}
                    />
                  )}
                </div>
              </div>

              {/* Gantt body (synced scroll) */}
              <div
                className="flex-1 overflow-auto"
                onScroll={(e) => {
                  if (scrollRef.current) {
                    scrollRef.current.scrollLeft = (e.target as HTMLElement).scrollLeft;
                  }
                }}
              >
                <div className="relative" style={{ width: totalWidth, minHeight: rows.length * ROW_H }}>
                  {/* Weekend bands */}
                  {weekendBands.map((b, i) => (
                    <div
                      key={`wk-${i}`}
                      className="absolute top-0 bottom-0 bg-muted/30 pointer-events-none"
                      style={{ left: b.left, width: b.width }}
                    />
                  ))}
                  {/* Zebra row backgrounds */}
                  {rows.map((_, idx) =>
                    idx % 2 === 1 ? (
                      <div
                        key={`zb-${idx}`}
                        className="absolute left-0 right-0 bg-muted/15 pointer-events-none"
                        style={{ top: idx * ROW_H, height: ROW_H }}
                      />
                    ) : null
                  )}
                  {/* Week grid lines */}
                  {weekMarkers.map((w, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 w-px bg-border/15"
                      style={{ left: w.position }}
                    />
                  ))}
                  {/* Month grid lines */}
                  {monthMarkers.map((m, i) => (
                    <div
                      key={`mg-${i}`}
                      className="absolute top-0 bottom-0 w-px bg-border/40"
                      style={{ left: m.position }}
                    />
                  ))}
                  {/* Today line */}
                  {todayPosition !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                      style={{ left: todayPosition }}
                    >
                      <div className="absolute -top-0 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] font-bold px-1 rounded-b">
                        HOJE
                      </div>
                    </div>
                  )}

                  {/* Dependency arrows (SVG) */}
                  <svg
                    className="absolute top-0 left-0 pointer-events-none"
                    width={totalWidth}
                    height={rows.length * ROW_H}
                    style={{ overflow: "visible" }}
                  >
                    <defs>
                      <marker
                        id="dep-arrow"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
                      </marker>
                    </defs>
                    {dependencies.map((dep, i) => {
                      const predIdx = rows.findIndex(
                        (r) => r.type === "activity" && (r.data as Activity).id === dep.predecessor_id
                      );
                      const succIdx = rows.findIndex(
                        (r) => r.type === "activity" && (r.data as Activity).id === dep.successor_id
                      );
                      if (predIdx === -1 || succIdx === -1) return null;
                      const pred = rows[predIdx].data as Activity;
                      const succ = rows[succIdx].data as Activity;
                      if (!pred.start_date || !succ.start_date) return null;
                      const predBar = getBarPosition(pred);
                      const succBar = getBarPosition(succ);
                      const x1 = predBar.left + predBar.width;
                      const y1 = predIdx * ROW_H + ROW_H / 2;
                      const x2 = succBar.left;
                      const y2 = succIdx * ROW_H + ROW_H / 2;
                      const midX = x1 + Math.max(12, (x2 - x1) / 2);
                      const path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
                      return (
                        <path
                          key={`dep-${i}`}
                          d={path}
                          stroke="hsl(var(--muted-foreground))"
                          strokeWidth="1.2"
                          strokeOpacity="0.55"
                          fill="none"
                          markerEnd="url(#dep-arrow)"
                        />
                      );
                    })}
                  </svg>

                  {/* Row backgrounds + bars */}
                  {rows.map((row, idx) => {
                    const top = idx * ROW_H;

                    if (row.type === "project") {
                      const project = row.data as Project;
                      // Project summary bar
                      const projectActivities = scheduledActivities.filter(
                        (a) => a.project_id === project.id
                      );
                      const startDates = projectActivities
                        .map((a) => a.start_date)
                        .filter(Boolean)
                        .map((d) => parseISO(d!));
                      const endDates = projectActivities
                        .map((a) => a.end_date || a.start_date)
                        .filter(Boolean)
                        .map((d) => parseISO(d!));
                      if (startDates.length === 0) return null;

                      const projStart = new Date(Math.min(...startDates.map((d) => d.getTime())));
                      const projEnd = new Date(Math.max(...endDates.map((d) => d.getTime())));
                      const left = differenceInDays(projStart, minDate) * dayWidth;
                      const width = Math.max(differenceInDays(projEnd, projStart), 1) * dayWidth;

                      const completedCount = projectActivities.filter(
                        (a) => a.status === "completed"
                      ).length;
                      const progress =
                        projectActivities.length > 0
                          ? (completedCount / projectActivities.length) * 100
                          : 0;

                      return (
                        <div
                          key={`pr-${project.id}`}
                          className="absolute w-full bg-muted/20"
                          style={{ top, height: ROW_H }}
                        >
                          {/* Summary bar */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="absolute top-2 h-3 rounded-full bg-foreground/15 cursor-pointer hover:bg-foreground/25 transition-all overflow-hidden ring-1 ring-foreground/20 hover:shadow-md"
                                style={{ left, width: Math.max(width, 8) }}
                                onClick={() => navigate(`/project/${project.id}`)}
                              >
                                <div
                                  className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                                {/* Diamond markers at start and end */}
                                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-foreground/70 rotate-45 rounded-sm shadow-sm" />
                                <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-foreground/70 rotate-45 rounded-sm shadow-sm" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <p className="font-semibold">{project.title}</p>
                              <p>
                                {format(projStart, "dd/MM/yy")} → {format(projEnd, "dd/MM/yy")}
                              </p>
                              <p>{Math.round(progress)}% concluído</p>
                            </TooltipContent>
                          </Tooltip>

                          {/* Due date marker */}
                          {project.due_date && (
                            <div
                              className="absolute top-1 bottom-1 w-0.5 bg-destructive/60"
                              style={{
                                left: differenceInDays(parseISO(project.due_date), minDate) * dayWidth,
                              }}
                            >
                              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-destructive" />
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      const activity = row.data as Activity;
                      const status = getActivityStatus(activity);
                      const bar = getBarPosition(activity);
                      const isCritical = criticalIds.has(activity.id);

                      return (
                        <div
                          key={`ar-${activity.id}`}
                          className="absolute w-full group/bar"
                          style={{ top, height: ROW_H }}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={`absolute top-[6px] rounded-md cursor-pointer transition-all duration-200 ease-out hover:brightness-110 hover:shadow-lg hover:-translate-y-0.5 shadow-md ring-1 ring-black/5 dark:ring-white/10 ${statusColors[status]}`}
                                style={{
                                  left: bar.left,
                                  width: Math.max(bar.width, 6),
                                  height: ROW_H - 12,
                                  outline: isCritical ? "2px solid hsl(45, 93%, 47%)" : undefined,
                                  outlineOffset: isCritical ? "2px" : undefined,
                                  boxShadow: isCritical
                                    ? "0 0 12px hsl(45, 93%, 47%, 0.5), 0 1px 3px rgba(0,0,0,0.15)"
                                    : undefined,
                                }}
                              >
                                {/* Priority indicator stripe */}
                                <div
                                  className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${
                                    activity.priority === "high"
                                      ? "bg-destructive"
                                      : activity.priority === "medium"
                                      ? "bg-warning"
                                      : "bg-success"
                                  }`}
                                />
                                {bar.width > 60 && (
                                  <span className="text-[10px] font-medium text-primary-foreground pl-3 pr-2 truncate block leading-6 drop-shadow-sm">
                                    {isCritical && "⚡ "}
                                    {activity.title}
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[220px]">
                              <p className="font-semibold">{activity.title}</p>
                              <p className="text-muted-foreground">{statusLabels[status]}</p>
                              {isCritical && <p className="text-warning font-semibold">⚡ Caminho Crítico</p>}
                              {activity.assigned_to && <p>👤 {activity.assigned_to}</p>}
                              <div className="flex gap-2 mt-1">
                                {activity.start_date && (
                                  <span>Início: {format(parseISO(activity.start_date), "dd/MM/yy")}</span>
                                )}
                                {activity.end_date && (
                                  <span>Fim: {format(parseISO(activity.end_date), "dd/MM/yy")}</span>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>

                          {/* Floating action icons on hover */}
                          <div
                            className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/bar:opacity-100 transition-opacity duration-200 z-20 pointer-events-none group-hover/bar:pointer-events-auto"
                            style={{ left: bar.left + Math.max(bar.width, 6) + 6 }}
                          >
                            {status !== "completed" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); completeActivity(activity.id); }}
                                    className="h-6 w-6 rounded-full bg-success text-success-foreground flex items-center justify-center hover:scale-110 transition-transform shadow-md"
                                    aria-label="Concluir"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Concluir atividade</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/project/${activity.project_id}`); }}
                                  className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-110 transition-transform shadow-md"
                                  aria-label="Abrir"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Abrir projeto</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Timeline;
