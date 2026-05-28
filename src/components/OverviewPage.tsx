'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardSkeleton } from '@/components/SkeletonScreens';
import { useProjectAccess } from '@/hooks/useProjectAccess';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PipelineByTypeLanes } from '@/components/PipelineByTypeLanes';
import { PriorityBadge } from '@/components/PriorityBadge';
import { normalizeGut, type GutLevel } from '@/lib/gutPriority';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Archive,
  Beaker,
  CalendarClock,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Flag,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  Rocket,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Project {
  id: string;
  title: string;
  status: string;
  budget_planned: number;
  budget_used: number;
  due_date: string | null;
  owner: string | null;
  blockers: string | null;
  project_type: string | null;
  priority: string;
  completion_percentage: number | null;
}

interface Activity {
  id: string;
  title: string;
  status: string;
  project_id: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  completed_at: string | null;
  created_at: string;
  hours: number;
  cost: number;
  priority: string;
  priority_score?: number | null;
}

interface TimeEntry {
  activity_id: string | null;
  duration_minutes: number | null;
  project_id: string;
  created_at: string;
}

const COLORS = {
  ideacao: 'hsl(38, 92%, 50%)',
  poc: 'hsl(199, 89%, 48%)',
  mvp: 'hsl(220, 90%, 56%)',
  blocked: 'hsl(0, 84%, 60%)',
  drawer: 'hsl(220, 15%, 50%)',
  'em-execucao': 'hsl(142, 76%, 36%)',
};

const STATUS_CARD_STYLES = {
  ideacao: {
    hover: 'hover:border-amber-400',
    iconWrap: 'bg-gradient-to-br from-amber-100 to-amber-50 ring-1 ring-amber-200/70',
    icon: 'text-amber-600',
  },
  poc: {
    hover: 'hover:border-sky-400',
    iconWrap: 'bg-gradient-to-br from-sky-100 to-cyan-50 ring-1 ring-sky-200/70',
    icon: 'text-sky-600',
  },
  mvp: {
    hover: 'hover:border-indigo-400',
    iconWrap: 'bg-gradient-to-br from-indigo-100 to-blue-50 ring-1 ring-indigo-200/70',
    icon: 'text-indigo-600',
  },
  blocked: {
    hover: 'hover:border-rose-400',
    iconWrap: 'bg-gradient-to-br from-rose-100 to-red-50 ring-1 ring-rose-200/70',
    icon: 'text-rose-600',
  },
  drawer: {
    hover: 'hover:border-slate-400',
    iconWrap: 'bg-gradient-to-br from-slate-100 to-zinc-50 ring-1 ring-slate-200/70',
    icon: 'text-slate-700',
  },
  'em-execucao': {
    hover: 'hover:border-emerald-400',
    iconWrap: 'bg-gradient-to-br from-emerald-100 to-teal-50 ring-1 ring-emerald-200/70',
    icon: 'text-emerald-600',
  },
  concluido: {
    hover: 'hover:border-green-400',
    iconWrap: 'bg-gradient-to-br from-green-100 to-lime-50 ring-1 ring-green-200/70',
    icon: 'text-green-600',
  },
} as const;

export function OverviewPage() {
  const router = useRouter();
  const { filterProjects, loading: authLoading } = useProjectAccess();
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [kpiDialog, setKpiDialog] = useState<{ title: string; items: Activity[] } | null>(null);

  useEffect(() => {
    if (!authLoading) {
      void fetchAllData();
    }
  }, [authLoading, isAdmin]);

  useEffect(() => {
    router.prefetch('/projects');
    router.prefetch('/investments');
    router.prefetch('/team');
  }, [router]);

  const fetchAllData = async () => {
    try {
      const projectsRes = await supabase
        .from('projects')
        .select(
          'id, title, status, budget_planned, budget_used, due_date, owner, blockers, project_type, priority, completion_percentage',
        )
        .eq('is_trashed', false);

      const allProjects = (projectsRes.data || []) as Project[];
      const filtered = await filterProjects(allProjects);
      setProjects(filtered as Project[]);

      const projectIds = filtered.map((project: Project) => project.id);
      if (projectIds.length === 0) {
        setActivities([]);
        setTimeEntries([]);
        return;
      }

      const [activitiesRes, timeRes] = await Promise.all([
        supabase
          .from('activities')
          .select(
            'id, title, status, project_id, assigned_to, start_date, end_date, completed_at, created_at, hours, cost, priority, priority_score, is_trashed',
          )
          .in('project_id', projectIds),
        supabase
          .from('time_entries')
          .select('activity_id, duration_minutes, project_id, created_at')
          .in('project_id', projectIds),
      ]);

      let activeActivities: Activity[] = [];
      if (activitiesRes.data) {
        activeActivities = activitiesRes.data.filter((activity: any) => activity.is_trashed !== true);
        setActivities(activeActivities);
      }
      if (timeRes.data) {
        const activeActivityIds = new Set(activeActivities.map((activity) => activity.id));
        setTimeEntries(
          timeRes.data.filter(
            (entry) => entry.activity_id !== null && activeActivityIds.has(entry.activity_id),
          ),
        );
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalProjects = projects.length;
  const statusCounts = {
    ideacao: projects.filter((project) => project.status === 'ideacao').length,
    poc: projects.filter((project) => project.status === 'poc').length,
    mvp: projects.filter((project) => project.status === 'mvp').length,
    blocked: projects.filter((project) => project.status === 'blocked').length,
    drawer: projects.filter((project) => project.status === 'drawer').length,
    'em-execucao': projects.filter((project) => project.status === 'em-execucao').length,
    concluido: projects.filter((project) => project.status === 'concluido' || (project.completion_percentage ?? 0) >= 100).length,
  };

  const totalBudgetPlanned = projects.reduce((sum, project) => sum + (Number(project.budget_planned) || 0), 0);
  const totalBudgetUsed = projects.reduce((sum, project) => sum + (Number(project.budget_used) || 0), 0);
  const budgetProgress = totalBudgetPlanned > 0 ? (totalBudgetUsed / totalBudgetPlanned) * 100 : 0;

  const totalActivities = activities.length;
  const completedActivities = activities.filter((activity) => activity.status === 'completed').length;
  const taskCompletionRate = totalActivities > 0 ? (completedActivities / totalActivities) * 100 : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueActivities = activities.filter(
    (activity) => activity.status !== 'completed' && activity.end_date && new Date(activity.end_date) < today,
  );
  const upcomingDeadlines = activities.filter((activity) => {
    if (activity.status === 'completed' || !activity.end_date) return false;
    const endDate = new Date(activity.end_date);
    const diff = (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  });

  const highPriorityPending = activities.filter(
    (activity) => {
      if (activity.status === 'completed') return false;
      const level = normalizeGut(activity.priority);
      return level === 'alta' || level === 'critica' || level === 'urgente';
    },
  );
  const totalHoursEstimated = activities.reduce((sum, activity) => sum + (activity.hours || 0), 0);
  const totalHoursTracked = timeEntries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0) / 60;

  const statusCards = [
    { key: 'ideacao', label: 'Ideação', icon: Lightbulb, count: statusCounts.ideacao },
    { key: 'poc', label: 'POC', icon: Beaker, count: statusCounts.poc },
    { key: 'mvp', label: 'MVP', icon: Rocket, count: statusCounts.mvp },
    { key: 'blocked', label: 'Bloqueio', icon: AlertTriangle, count: statusCounts.blocked },
    { key: 'drawer', label: 'Gaveta', icon: Archive, count: statusCounts.drawer },
    { key: 'em-execucao', label: 'Em Execução', icon: ActivityIcon, count: statusCounts['em-execucao'] },
    { key: 'concluido', label: 'Concluídos', icon: CheckCircle2, count: statusCounts.concluido },
  ] as const;

  return (
    <>
      <main className="space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="mb-2 text-3xl font-bold text-foreground">Dashboard Geral</h2>
          </div>
        </div>

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-8">
              <Card
                className="cursor-pointer p-5 transition-all hover:border-primary hover:shadow-md"
                onClick={() => router.push('/projects')}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-3xl font-bold text-foreground">{totalProjects}</p>
              </Card>
              {statusCards.map((statusCard) => {
                const Icon = statusCard.icon;
                const styles = STATUS_CARD_STYLES[statusCard.key];
                return (
                  <Card
                    key={statusCard.key}
                    className={`cursor-pointer p-5 transition-all hover:shadow-md ${styles.hover}`}
                    onClick={() => router.push(`/projects?status=${statusCard.key}`)}
                  >
                    <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${styles.iconWrap}`}>
                      <Icon className={`h-5 w-5 ${styles.icon}`} />
                    </div>
                    <p className="text-sm text-muted-foreground">{statusCard.label}</p>
                    <p className="text-3xl font-bold text-foreground">{statusCard.count}</p>
                  </Card>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Card
                className="h-full cursor-pointer p-5 transition-all hover:shadow-md"
                onClick={() =>
                  setKpiDialog({
                    title: 'Tarefas Concluídas',
                    items: activities.filter((activity) => activity.status === 'completed'),
                  })
                }
              >
                <div className="mb-3 flex items-center gap-2">
                  <ListTodo className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-muted-foreground">Conclusão</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{taskCompletionRate.toFixed(0)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {completedActivities}/{totalActivities} concluídas
                </p>
              </Card>

              <Card
                className={`h-full cursor-pointer p-5 transition-all hover:shadow-md ${
                  overdueActivities.length > 0 ? 'border-destructive/50' : ''
                }`}
                onClick={() => setKpiDialog({ title: 'Atividades Atrasadas', items: overdueActivities })}
              >
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle
                    className={`h-4 w-4 shrink-0 ${
                      overdueActivities.length > 0 ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">Atrasadas</span>
                </div>
                <p className={`text-2xl font-bold ${overdueActivities.length > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {overdueActivities.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">tarefas vencidas</p>
              </Card>

              <Card
                className={`h-full cursor-pointer p-5 transition-all hover:shadow-md ${
                  upcomingDeadlines.length > 0 ? 'border-warning/50' : ''
                }`}
                onClick={() => setKpiDialog({ title: 'Prazos Próximos (7 dias)', items: upcomingDeadlines })}
              >
                <div className="mb-3 flex items-center gap-2">
                  <CalendarClock
                    className={`h-4 w-4 shrink-0 ${
                      upcomingDeadlines.length > 0 ? 'text-warning' : 'text-muted-foreground'
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">Prazos Próximos</span>
                </div>
                <p className={`text-2xl font-bold ${upcomingDeadlines.length > 0 ? 'text-warning' : 'text-foreground'}`}>
                  {upcomingDeadlines.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">nos próximos 7 dias</p>
              </Card>

              <Card
                className="h-full cursor-pointer p-5 transition-all hover:shadow-md"
                onClick={() => setKpiDialog({ title: 'Alta Prioridade (Pendentes)', items: highPriorityPending })}
              >
                <div className="mb-3 flex items-center gap-2">
                  <Flag className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="text-sm text-muted-foreground">Alta Prioridade</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{highPriorityPending.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">pendentes</p>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Card className="cursor-pointer p-5 transition-shadow hover:shadow-md" onClick={() => router.push('/investments')}>
                <div className="mb-2 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Orçamento Planejado</span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  R$ {totalBudgetPlanned.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </Card>
              <Card
                className={`cursor-pointer p-5 transition-shadow hover:shadow-md ${budgetProgress > 90 ? 'border-destructive/50' : ''}`}
                onClick={() => router.push('/investments')}
              >
                <div className="mb-2 flex items-center gap-2">
                  <DollarSign className={`h-4 w-4 ${budgetProgress > 100 ? 'text-destructive' : 'text-success'}`} />
                  <span className="text-sm text-muted-foreground">Orçamento Utilizado</span>
                </div>
                <p className={`text-3xl font-bold ${budgetProgress > 100 ? 'text-destructive' : 'text-foreground'}`}>
                  R$ {totalBudgetUsed.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{budgetProgress.toFixed(0)}% do planejado</p>
              </Card>
              <Card className="cursor-pointer p-5 transition-shadow hover:shadow-md" onClick={() => router.push('/team')}>
                <div className="mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-muted-foreground">Horas Registradas</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{totalHoursTracked.toFixed(0)}h</p>
                <p className="mt-1 text-xs text-muted-foreground">de {totalHoursEstimated.toFixed(0)}h estimadas</p>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="p-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Tarefas Atrasadas ({overdueActivities.length})
                </h3>
                {overdueActivities.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma tarefa atrasada.</p>
                ) : (
                  <div className="max-h-[300px] space-y-2 overflow-y-auto">
                    {overdueActivities.slice(0, 15).map((activity) => {
                      const project = projects.find((item) => item.id === activity.project_id);
                      const daysOverdue = Math.floor(
                        (today.getTime() - new Date(activity.end_date!).getTime()) / (1000 * 60 * 60 * 24),
                      );
                      return (
                        <div
                          key={activity.id}
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-3 transition-colors hover:bg-destructive/10"
                          onClick={() => router.push(`/project/${activity.project_id}`)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{activity.title}</p>
                            <p className="text-xs text-muted-foreground">{project?.title}</p>
                          </div>
                          <Badge className="flex-shrink-0 bg-destructive/20 text-xs text-destructive">
                            {daysOverdue}d atraso
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <CalendarClock className="h-5 w-5 text-warning" />
                  Prazos Próximos ({upcomingDeadlines.length})
                </h3>
                {upcomingDeadlines.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nenhum prazo nos próximos 7 dias</p>
                ) : (
                  <div className="max-h-[300px] space-y-2 overflow-y-auto">
                    {upcomingDeadlines.slice(0, 15).map((activity) => {
                      const project = projects.find((item) => item.id === activity.project_id);
                      const daysLeft = Math.floor(
                        (new Date(activity.end_date!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
                      );
                      return (
                        <div
                          key={activity.id}
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-warning/20 bg-warning/5 p-3 transition-colors hover:bg-warning/10"
                          onClick={() => router.push(`/project/${activity.project_id}`)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{activity.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {project?.title} {activity.assigned_to ? `· ${activity.assigned_to}` : ''}
                            </p>
                          </div>
                          <Badge
                            className={`flex-shrink-0 text-xs ${
                              daysLeft <= 1 ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning'
                            }`}
                          >
                            {daysLeft === 0 ? 'Hoje' : `${daysLeft}d`}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            <PipelineByTypeLanes
              projects={projects.map((project) => ({
                id: project.id,
                title: project.title,
                status: project.status,
                project_type: project.project_type ?? null,
                priority: project.priority ?? 'medium',
                owner: project.owner,
                budget_planned: project.budget_planned ?? 0,
                budget_used: project.budget_used ?? 0,
                completion_percentage: project.completion_percentage ?? 0,
              }))}
            />
          </>
        )}
      </main>

      <Dialog open={!!kpiDialog} onOpenChange={() => setKpiDialog(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl">
          <DialogHeader>
            <DialogTitle>{kpiDialog?.title}</DialogTitle>
            <DialogDescription>{kpiDialog?.items.length || 0} atividade(s) encontrada(s)</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {kpiDialog?.items.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma atividade encontrada.</p>
              )}
              {kpiDialog?.items.map((activity) => {
                const project = projects.find((item) => item.id === activity.project_id);
                const scoreByLevel: Record<GutLevel, number> = {
                  urgente: 5,
                  critica: 4,
                  alta: 3,
                  media: 2,
                  baixa: 1,
                  pendente: 0,
                };
                const rankingScore = activity.priority_score ?? scoreByLevel[normalizeGut(activity.priority)];
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-foreground">{activity.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {project && (
                          <Badge variant="outline" className="text-xs">
                            {project.title.substring(0, 30)}
                          </Badge>
                        )}
                        {activity.assigned_to && (
                          <span className="whitespace-nowrap text-xs text-muted-foreground">{activity.assigned_to}</span>
                        )}
                        {activity.end_date && (
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(activity.end_date).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                        <PriorityBadge priority={activity.priority} score={rankingScore} showScore />
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => {
                        setKpiDialog(null);
                        router.push(`/project/${activity.project_id}`);
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}