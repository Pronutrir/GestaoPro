'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardSkeleton } from '@/components/SkeletonScreens';
import { useProjectAccess } from '@/hooks/useProjectAccess';
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
import {
  AlertTriangle,
  Archive,
  Beaker,
  CalendarClock,
  CheckCircle2,
  Clock,
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
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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
}

interface TimeEntry {
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
  ideacao: { hover: 'hover:border-warning', iconWrap: 'bg-warning/10', icon: 'text-warning' },
  poc: { hover: 'hover:border-info', iconWrap: 'bg-info/10', icon: 'text-info' },
  mvp: { hover: 'hover:border-primary', iconWrap: 'bg-primary/10', icon: 'text-primary' },
  blocked: { hover: 'hover:border-destructive', iconWrap: 'bg-destructive/10', icon: 'text-destructive' },
  drawer: { hover: 'hover:border-secondary', iconWrap: 'bg-secondary/50', icon: 'text-secondary-foreground' },
  'em-execucao': { hover: 'hover:border-success', iconWrap: 'bg-success/10', icon: 'text-success' },
} as const;

export function OverviewPage() {
  const router = useRouter();
  const { filterProjects, canManage: isAdmin, loading: authLoading } = useProjectAccess();
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

  const fetchAllData = async () => {
    try {
      const [projectsRes, activitiesRes, timeRes] = await Promise.all([
        supabase.from('projects').select('*').eq('is_trashed', false),
        supabase.from('activities').select('*'),
        supabase.from('time_entries').select('duration_minutes, project_id, created_at'),
      ]);

      const allProjects = (projectsRes.data || []) as Project[];
      const filtered = await filterProjects(allProjects);
      setProjects(filtered as Project[]);

      const projectIds = new Set(filtered.map((project: Project) => project.id));
      if (activitiesRes.data) {
        setActivities(activitiesRes.data.filter((activity) => projectIds.has(activity.project_id)));
      }
      if (timeRes.data) {
        setTimeEntries(timeRes.data.filter((entry) => projectIds.has(entry.project_id)));
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
    (activity) => activity.priority === 'high' && activity.status !== 'completed',
  );
  const totalHoursEstimated = activities.reduce((sum, activity) => sum + (activity.hours || 0), 0);
  const totalHoursTracked = timeEntries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0) / 60;

  const statusPieData = [
    { name: 'Ideação', value: statusCounts.ideacao, color: COLORS.ideacao },
    { name: 'POC', value: statusCounts.poc, color: COLORS.poc },
    { name: 'MVP', value: statusCounts.mvp, color: COLORS.mvp },
    { name: 'Bloqueio', value: statusCounts.blocked, color: COLORS.blocked },
    { name: 'Gaveta', value: statusCounts.drawer, color: COLORS.drawer },
    { name: 'Em Execução', value: statusCounts['em-execucao'], color: COLORS['em-execucao'] },
  ].filter((entry) => entry.value > 0);

  const burndownData = (() => {
    const days: { date: string; remaining: number; completed: number }[] = [];
    for (let index = 29; index >= 0; index -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - index);
      date.setHours(0, 0, 0, 0);
      const label = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1)
        .toString()
        .padStart(2, '0')}`;
      const completedByDate = activities.filter(
        (activity) => activity.completed_at && new Date(activity.completed_at) <= date,
      ).length;
      const remaining = totalActivities - completedByDate;
      days.push({ date: label, remaining, completed: completedByDate });
    }
    return days;
  })();

  const activitiesPerProject = (() => {
    const items = new Map<string, { name: string; total: number; done: number }>();
    activities.forEach((activity) => {
      const project = projects.find((item) => item.id === activity.project_id);
      if (!project) return;
      const existing = items.get(activity.project_id) || {
        name: project.title.substring(0, 20),
        total: 0,
        done: 0,
      };
      existing.total += 1;
      if (activity.status === 'completed') {
        existing.done += 1;
      }
      items.set(activity.project_id, existing);
    });
    return Array.from(items.values())
      .sort((left, right) => right.total - left.total)
      .slice(0, 10);
  })();

  const statusCards = [
    { key: 'ideacao', label: 'Ideação', icon: Lightbulb, count: statusCounts.ideacao },
    { key: 'poc', label: 'POC', icon: Beaker, count: statusCounts.poc },
    { key: 'mvp', label: 'MVP', icon: Rocket, count: statusCounts.mvp },
    { key: 'blocked', label: 'Bloqueio', icon: AlertTriangle, count: statusCounts.blocked },
    { key: 'drawer', label: 'Gaveta', icon: Archive, count: statusCounts.drawer },
    { key: 'em-execucao', label: 'Em Execução', icon: CheckCircle2, count: statusCounts['em-execucao'] },
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
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
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
              <Card className="cursor-pointer p-5 transition-shadow hover:shadow-md" onClick={() => router.push('/investments')}>
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
                  <TrendingUp className="h-5 w-5 text-primary" /> Burn-down (30 dias)
                </h3>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={burndownData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="remaining"
                        stroke="hsl(var(--destructive))"
                        fill="hsl(var(--destructive))"
                        fillOpacity={0.1}
                        name="Restantes"
                      />
                      <Area
                        type="monotone"
                        dataKey="completed"
                        stroke="hsl(var(--success))"
                        fill="hsl(var(--success))"
                        fillOpacity={0.1}
                        name="Concluídas"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="mb-4 text-lg font-semibold text-foreground">Distribuição de Projetos</h3>
                <div className="flex h-[280px] items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {statusPieData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="p-6">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Investimento</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Planejado</span>
                    <span className="text-sm font-medium text-foreground">R$ {totalBudgetPlanned.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Utilizado</span>
                    <span className="text-sm font-medium text-foreground">R$ {totalBudgetUsed.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Utilização</span>
                      <span className="font-medium">{budgetProgress.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${
                          budgetProgress > 90 ? 'bg-destructive' : budgetProgress > 70 ? 'bg-warning' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between border-t border-border pt-4">
                    <span className="text-sm text-muted-foreground">Saldo</span>
                    <span className={`text-lg font-bold ${totalBudgetPlanned - totalBudgetUsed >= 0 ? 'text-success' : 'text-destructive'}`}>
                      R$ {(totalBudgetPlanned - totalBudgetUsed).toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
                    <Clock className="h-5 w-5 text-info" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Horas</h3>
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">Estimadas</p>
                    <p className="text-3xl font-bold text-foreground">{totalHoursEstimated.toFixed(0)}h</p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">Registradas</p>
                    <p className="text-3xl font-bold text-info">{totalHoursTracked.toFixed(1)}h</p>
                  </div>
                  {totalHoursEstimated > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium">{((totalHoursTracked / totalHoursEstimated) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-info transition-all"
                          style={{ width: `${Math.min((totalHoursTracked / totalHoursEstimated) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="mb-4 text-lg font-semibold text-foreground">Atividades por Projeto</h3>
                {activitiesPerProject.length > 0 ? (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={activitiesPerProject} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Bar dataKey="done" stackId="a" fill="hsl(var(--success))" name="Concluídas" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="total" stackId="b" fill="hsl(var(--muted))" name="Total" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sem dados</p>
                )}
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
                        <Badge
                          variant={
                            activity.priority === 'high'
                              ? 'destructive'
                              : activity.priority === 'medium'
                                ? 'secondary'
                                : 'outline'
                          }
                          className="text-xs"
                        >
                          {activity.priority === 'high' ? 'Alta' : activity.priority === 'medium' ? 'Média' : 'Baixa'}
                        </Badge>
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