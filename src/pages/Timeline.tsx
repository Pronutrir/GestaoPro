import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  completed: "bg-success",
  overdue: "bg-destructive",
  in_progress: "bg-primary",
  pending: "bg-muted-foreground/60",
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

  const fetchData = useCallback(async () => {
    try {
      const [projectsRes, activitiesRes, phasesRes, depsRes] = await Promise.all([
        supabase.from("projects").select("id,title,status,priority,due_date,category").order("title"),
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

  // Week markers
  const weekMarkers = useMemo(() => {
    return eachWeekOfInterval({ start: minDate, end: maxDate }).map((date) => ({
      date,
      position: differenceInDays(date, minDate) * dayWidth,
    }));
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
  const HEADER_H = 56;

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
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={scrollToToday}>
                    <Calendar className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ir para Hoje</TooltipContent>
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
                <TooltipContent>Destacar caminho crítico</TooltipContent>
              </Tooltip>
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
            <div className="flex-none w-[260px] border-r border-border bg-card flex flex-col">
              {/* Header */}
              <div
                className="flex items-center px-4 border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                style={{ height: HEADER_H }}
              >
                <Layers className="w-3.5 h-3.5 mr-2" />
                Projetos / Atividades
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
                          <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
                            {row.phaseName}
                          </span>
                        )}
                      </div>
                    );
                  }
                })}
              </div>
            </div>

            {/* Right Panel: Gantt Bars */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Timeline header */}
              <div
                ref={scrollRef}
                className="overflow-x-auto overflow-y-hidden"
                style={{ height: HEADER_H }}
              >
                <div className="relative" style={{ width: totalWidth, height: HEADER_H }}>
                  {/* Month labels */}
                  {monthMarkers.map((m, i) => (
                    <div
                      key={i}
                      className="absolute top-0 flex flex-col items-start justify-center h-full border-l border-border/60"
                      style={{ left: m.position, width: m.width }}
                    >
                      <span className="pl-2 text-xs font-semibold text-foreground capitalize">
                        {format(m.date, "MMMM", { locale: ptBR })}
                      </span>
                      <span className="pl-2 text-[10px] text-muted-foreground">
                        {format(m.date, "yyyy")}
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
                      className="absolute top-0 bottom-0 w-0.5 bg-primary/80 z-10"
                      style={{ left: todayPosition }}
                    >
                      <div className="absolute -top-0 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] font-bold px-1 rounded-b">
                        HOJE
                      </div>
                    </div>
                  )}

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
                                className="absolute top-2 h-3 rounded-full bg-foreground/10 cursor-pointer hover:bg-foreground/15 transition-colors overflow-hidden"
                                style={{ left, width: Math.max(width, 8) }}
                                onClick={() => navigate(`/project/${project.id}`)}
                              >
                                <div
                                  className="h-full bg-primary/40 rounded-full transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                                {/* Diamond markers at start and end */}
                                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-foreground/60 rotate-45 rounded-sm" />
                                <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-foreground/60 rotate-45 rounded-sm" />
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
                          className="absolute w-full"
                          style={{ top, height: ROW_H }}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={`absolute top-[6px] rounded-md cursor-pointer transition-all hover:brightness-110 shadow-sm ${statusColors[status]}`}
                                style={{
                                  left: bar.left,
                                  width: Math.max(bar.width, 6),
                                  height: ROW_H - 12,
                                  outline: isCritical ? "2px solid hsl(45, 93%, 47%)" : undefined,
                                  outlineOffset: isCritical ? "1px" : undefined,
                                }}
                              >
                                {bar.width > 60 && (
                                  <span className="text-[10px] font-medium text-primary-foreground px-2 truncate block leading-6">
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
