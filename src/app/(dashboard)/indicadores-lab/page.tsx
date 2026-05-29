'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  DollarSign,
  Gauge,
  ListChecks,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { format, parseISO, subDays, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useProjectAccess } from '@/hooks/useProjectAccess';

type PeriodKey = '30d' | '90d' | '180d' | '365d';

const PERIOD_LABEL: Record<PeriodKey, string> = {
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  '180d': 'Últimos 6 meses',
  '365d': 'Últimos 12 meses',
};

const STATUS_LABELS: Record<string, string> = {
  concluido: 'Concluído',
  completed: 'Concluído',
  in_progress: 'Em andamento',
  pending: 'Pendente',
  ideacao: 'Ideação',
  mvp: 'MVP',
  blocked: 'Bloqueado',
  'em-execucao': 'Em execução',
};

const STATUS_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6'];

const KPI_TARGETS = {
  completionMin: 80,
  onTimeMin: 85,
  budgetUsageMax: 100,
  overdueMax: 12,
};

const normalizeText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export default function IndicadoresLabPage() {
  const { filterProjects, loading: accessLoading } = useProjectAccess();

  const [period, setPeriod] = useState<PeriodKey>('90d');
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [workflowStages, setWorkflowStages] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [projectMembers, setProjectMembers] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterSector, setFilterSector] = useState<string>('all');
  const [filterManager, setFilterManager] = useState<string>('all');
  const [presentationMode, setPresentationMode] = useState(false);
  const [strategicSectorFilter, setStrategicSectorFilter] = useState<string>('all');
  const [strategicDrilldown, setStrategicDrilldown] = useState<{
    sector: string;
    metric: 'projectsAtrasados' | 'projectsNoPrazo' | 'atividades' | 'leadTime' | 'horas' | 'conclusao';
  } | null>(null);

  const periodStart = useMemo(() => {
    if (period === '30d') return subDays(new Date(), 30);
    if (period === '90d') return subDays(new Date(), 90);
    if (period === '180d') return subDays(new Date(), 180);
    return subDays(new Date(), 365);
  }, [period]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, a, t, c, ws, pf, pm] = await Promise.all([
        supabase.from('projects').select('*').eq('is_trashed', false),
        supabase.from('activities').select('*').eq('is_trashed', false),
        supabase.from('time_entries').select('*'),
        supabase.from('change_requests').select('*').eq('is_trashed', false),
        supabase.from('workflow_stages').select('id, project_id, title, color, display_order, is_visible, is_final, is_blocked'),
        supabase.from('profiles').select('id, full_name, sector'),
        supabase.from('project_members').select('project_id, user_id, sector'),
      ]);

      if (p.error || a.error || t.error || c.error || ws.error || pf.error || pm.error) {
        throw new Error(
          [p.error?.message, a.error?.message, t.error?.message, c.error?.message, ws.error?.message, pf.error?.message, pm.error?.message]
            .filter(Boolean)
            .join(' | ') || 'Falha ao carregar indicadores.',
        );
      }

      const filteredProjects = await filterProjects(p.data || []);
      const allowedProjectIds = new Set(filteredProjects.map((pr: any) => pr.id));
      const scopedActivities = (a.data || []).filter((row: any) => allowedProjectIds.has(row.project_id));
      const scopedActivityIds = new Set(scopedActivities.map((row: any) => row.id));

      setProjects(filteredProjects);
      setActivities(scopedActivities);
      setTimeEntries(
        (t.data || []).filter(
          (row: any) => allowedProjectIds.has(row.project_id) && scopedActivityIds.has(row.activity_id),
        ),
      );
      setChangeRequests((c.data || []).filter((row: any) => allowedProjectIds.has(row.project_id)));
      setWorkflowStages((ws.data || []).filter((row: any) => allowedProjectIds.has(row.project_id) && row.is_visible !== false));
      setProfiles(pf.data || []);
      setProjectMembers((pm.data || []).filter((row: any) => allowedProjectIds.has(row.project_id)));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha ao carregar indicadores.';
      setLoadError(msg);
      setProjects([]);
      setActivities([]);
      setTimeEntries([]);
      setChangeRequests([]);
      setWorkflowStages([]);
      setProfiles([]);
      setProjectMembers([]);
    } finally {
      setLoading(false);
    }
  }, [filterProjects]);

  useEffect(() => {
    if (accessLoading) return;
    void fetchAll();
  }, [accessLoading, fetchAll]);

  useEffect(() => {
    if (accessLoading) return;

    const channel = supabase
      .channel('indicadores-lab-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        void fetchAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        void fetchAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, () => {
        void fetchAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'change_requests' }, () => {
        void fetchAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, () => {
        void fetchAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        void fetchAll();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accessLoading, fetchAll]);

  const dashboardData = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date();
    periodEnd.setHours(23, 59, 59, 999);

    const inPeriod = (value: string | null | undefined) => {
      const d = toDate(value);
      return !!d && d >= periodStart && d <= periodEnd;
    };

    const profileById = new Map<string, { full_name: string | null; sector: string | null }>();
    const profileByNormalizedName = new Map<string, { id: string; sector: string | null }>();
    profiles.forEach((p) => {
      profileById.set(p.id, { full_name: p.full_name ?? null, sector: p.sector ?? null });
      const normalized = normalizeText(p.full_name);
      if (normalized) profileByNormalizedName.set(normalized, { id: p.id, sector: p.sector ?? null });
    });

    const memberSectorById = new Map<string, string>();
    projectMembers.forEach((m) => {
      if (m?.user_id && m?.sector && !memberSectorById.has(m.user_id)) {
        memberSectorById.set(m.user_id, m.sector);
      }
    });

    const resolveAssignee = (assignedTo: string | null | undefined) => {
      const raw = (assignedTo || '').trim();
      if (!raw) return { name: 'Não atribuído', sector: 'Sem setor' };

      const byId = profileById.get(raw);
      if (byId) {
        return {
          name: byId.full_name || raw,
          sector: byId.sector || memberSectorById.get(raw) || 'Sem setor',
        };
      }

      const normalized = normalizeText(raw);
      const byName = profileByNormalizedName.get(normalized);
      if (byName) {
        const p = profileById.get(byName.id);
        return {
          name: p?.full_name || raw,
          sector: p?.sector || byName.sector || memberSectorById.get(byName.id) || 'Sem setor',
        };
      }

      return { name: raw, sector: 'Sem setor' };
    };

    const managerNorm = normalizeText(filterManager === 'all' ? '' : filterManager);
    const projectsScoped = projects.filter((p) => {
      if (filterManager === 'all') return true;
      return normalizeText(p.owner) === managerNorm || normalizeText(p.manager) === managerNorm;
    });
    const projectIdsScoped = new Set(projectsScoped.map((p) => p.id));
    const scopedStages = workflowStages.filter((s) => projectIdsScoped.has(s.project_id));
    const stageById = new Map(scopedStages.map((stage) => [stage.id, stage]));

    const activitiesByProject = activities.filter((a) => projectIdsScoped.has(a.project_id));
    const timeEntriesByProject = timeEntries.filter((t) => projectIdsScoped.has(t.project_id));
    const changeRequestsByProject = changeRequests.filter((c) => projectIdsScoped.has(c.project_id));

    const activitiesScoped = activitiesByProject.filter((a) => {
      if (filterSector === 'all') return true;
      return resolveAssignee(a.assigned_to).sector === filterSector;
    });

    const activityIdsScoped = new Set(activitiesScoped.map((a) => a.id));
    const timeEntriesScoped = timeEntriesByProject.filter((t) => activityIdsScoped.has(t.activity_id));

    const periodActivities = activitiesScoped.filter((a) =>
      inPeriod(a.created_at) || inPeriod(a.completed_at) || inPeriod(a.end_date),
    );

    const periodActivityIds = new Set(periodActivities.map((a) => a.id));
    const periodProjectIds = new Set(periodActivities.map((a) => a.project_id));

    const projectsPeriodScoped = projectsScoped.filter((p) => periodProjectIds.has(p.id));
    const completedActivities = periodActivities.filter((a) => a.status === 'completed' || a.status === 'concluido');
    const completedInPeriod = completedActivities.filter((a) => inPeriod(a.completed_at));

    const overdueActivities = periodActivities.filter((a) => {
      const due = toDate(a.end_date);
      if (!due) return false;
      const done = a.status === 'completed' || a.status === 'concluido';
      return !done && due < todayStart;
    });

    const plannedBudget = projectsPeriodScoped.reduce((acc, p) => acc + (Number(p.budget_planned) || 0), 0);
    const usedBudget = projectsPeriodScoped.reduce((acc, p) => acc + (Number(p.budget_used) || 0), 0);

    const totalHoursEstimated = periodActivities.reduce((acc, a) => acc + (Number(a.hours) || 0), 0);
    const timeEntriesPeriodScoped = timeEntriesScoped.filter(
      (t) => periodActivityIds.has(t.activity_id) || inPeriod(t.created_at) || inPeriod(t.entry_date) || inPeriod(t.date),
    );
    const totalHoursTracked = timeEntriesPeriodScoped.reduce((acc, t) => acc + (Number(t.duration_minutes) || 0), 0) / 60;

    const completedWithDue = completedActivities.filter((a) => !!a.end_date && !!a.completed_at);
    const deliveredOnTime = completedWithDue.filter((a) => {
      const due = toDate(a.end_date);
      const completedAt = toDate(a.completed_at);
      if (!due || !completedAt) return false;
      return completedAt <= due;
    }).length;

    const projectHealth = projectsPeriodScoped.map((p) => {
      const pa = periodActivities.filter((a) => a.project_id === p.id);
      const pOverdue = pa.filter((a) => {
        const due = toDate(a.end_date);
        if (!due) return false;
        const done = a.status === 'completed' || a.status === 'concluido';
        return !done && due < todayStart;
      }).length;
      const pTotal = pa.length;
      const pDone = pa.filter((a) => a.status === 'completed' || a.status === 'concluido').length;
      const completion = pTotal > 0 ? (pDone / pTotal) * 100 : 0;
      const budgetPlanned = Number(p.budget_planned) || 0;
      const budgetUsed = Number(p.budget_used) || 0;
      const budgetDeviation = budgetPlanned > 0 ? ((budgetUsed - budgetPlanned) / budgetPlanned) * 100 : 0;
      const riskScore = (pOverdue > 0 ? 40 : 0) + (budgetDeviation > 10 ? 35 : 0) + (completion < 50 ? 25 : 0);
      return {
        id: p.id,
        title: p.title,
        statusLabel: STATUS_LABELS[p.status] || p.status || 'Sem status',
        owner: p.owner || p.manager || 'Sem responsável',
        totalActivities: pTotal,
        doneActivities: pDone,
        overdue: pOverdue,
        completion,
        budgetDeviation,
        riskScore,
      };
    });

    const criticalProjects = projectHealth
      .filter((p) => p.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 6);

    const statusMap = new Map<string, number>();
    projectsPeriodScoped.forEach((p) => {
      const status = STATUS_LABELS[p.status] || p.status || 'Sem status';
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });

    const isShortPeriod = period === '30d' || period === '90d';
    const buckets = isShortPeriod
      ? Array.from({ length: Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1) }).map((_, idx, arr) => {
          const date = subDays(periodEnd, arr.length - 1 - idx);
          return {
            key: format(date, 'yyyy-MM-dd'),
            label: format(date, 'dd/MM', { locale: ptBR }),
            date,
            concluidas: 0,
            criadas: 0,
            backlog: 0,
          };
        })
      : Array.from({ length: period === '180d' ? 6 : 12 }).map((_, idx, arr) => {
          const date = subMonths(periodEnd, arr.length - 1 - idx);
          return {
            key: format(date, 'yyyy-MM'),
            label: format(date, 'MMM/yy', { locale: ptBR }),
            date,
            concluidas: 0,
            criadas: 0,
            backlog: 0,
          };
        });

    const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    periodActivities.forEach((a) => {
      const created = toDate(a.created_at);
      if (created && created >= periodStart && created <= periodEnd) {
        const key = isShortPeriod ? format(created, 'yyyy-MM-dd') : format(created, 'yyyy-MM');
        const target = bucketMap.get(key);
        if (target) target.criadas += 1;
      }
      const completed = toDate(a.completed_at);
      if (completed && completed >= periodStart && completed <= periodEnd) {
        const key = isShortPeriod ? format(completed, 'yyyy-MM-dd') : format(completed, 'yyyy-MM');
        const target = bucketMap.get(key);
        if (target) target.concluidas += 1;
      }
    });

    let backlogCursor = 0;
    buckets.forEach((bucket) => {
      backlogCursor += bucket.criadas - bucket.concluidas;
      bucket.backlog = Math.max(0, backlogCursor);
    });

    const throughputData = buckets;

    const burnPopulation = activitiesScoped.filter((activity) => {
      const created = toDate(activity.created_at);
      return !!created && created <= periodEnd;
    });

    const burnDownData = buckets.map((bucket) => {
      const pointDate = bucket.date;
      const totalAtDate = burnPopulation.filter((activity) => {
        const created = toDate(activity.created_at);
        return !!created && created <= pointDate;
      }).length;

      const completedAtDate = burnPopulation.filter((activity) => {
        const completed = toDate(activity.completed_at);
        return !!completed && completed <= pointDate;
      }).length;

      const pendingAtDate = Math.max(0, totalAtDate - completedAtDate);

      return {
        label: bucket.label,
        total: totalAtDate,
        completed: completedAtDate,
        pending: pendingAtDate,
      };
    });

    const leadTimeDays = completedActivities
      .map((a) => {
        const start = toDate(a.created_at);
        const end = toDate(a.completed_at);
        if (!start || !end) return null;
        const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 ? diff : null;
      })
      .filter((v): v is number => v !== null);

    const avgLeadTime = leadTimeDays.length > 0
      ? leadTimeDays.reduce((acc, cur) => acc + cur, 0) / leadTimeDays.length
      : 0;

    const statusData = Array.from(statusMap.entries()).map(([name, value]) => {
      const statusProjects = projectsPeriodScoped.filter((p) => (STATUS_LABELS[p.status] || p.status || 'Sem status') === name);
      const statusIds = new Set(statusProjects.map((p) => p.id));
      const statusActivities = periodActivities.filter((a) => statusIds.has(a.project_id));
      const statusDone = statusActivities.filter((a) => a.status === 'completed' || a.status === 'concluido').length;
      const statusOverdue = statusActivities.filter((a) => {
        const due = toDate(a.end_date);
        const done = a.status === 'completed' || a.status === 'concluido';
        return !!due && !done && due < todayStart;
      }).length;
      const completion = statusActivities.length > 0 ? (statusDone / statusActivities.length) * 100 : 0;

      return {
        name,
        value,
        completion: Number(completion.toFixed(1)),
        overdue: statusOverdue,
      };
    });

    const assigneeMap = new Map<string, { name: string; sector: string; abertas: number; concluidas: number; horas: number; atrasadas: number }>();
    periodActivities.forEach((a) => {
      const resolved = resolveAssignee(a.assigned_to);
      const name = resolved.name;
      if (!assigneeMap.has(name)) {
        assigneeMap.set(name, { name, sector: resolved.sector, abertas: 0, concluidas: 0, horas: 0, atrasadas: 0 });
      }
      const row = assigneeMap.get(name)!;
      const done = a.status === 'completed' || a.status === 'concluido';
      if (done) row.concluidas += 1;
      else row.abertas += 1;
      const due = toDate(a.end_date);
      if (!done && due && due < todayStart) row.atrasadas += 1;
    });

    const activityOwnerById = new Map(periodActivities.map((a) => [a.id, resolveAssignee(a.assigned_to).name]));
    timeEntriesPeriodScoped.forEach((entry) => {
      const owner = activityOwnerById.get(entry.activity_id) || 'Não atribuído';
      if (!assigneeMap.has(owner)) {
        assigneeMap.set(owner, { name: owner, sector: 'Sem setor', abertas: 0, concluidas: 0, horas: 0, atrasadas: 0 });
      }
      assigneeMap.get(owner)!.horas += (Number(entry.duration_minutes) || 0) / 60;
    });

    const capacityData = Array.from(assigneeMap.values())
      .sort((a, b) => (b.abertas + b.concluidas) - (a.abertas + a.concluidas))
      .map((row) => {
        const total = row.abertas + row.concluidas;
        const produtividade = total > 0 ? (row.concluidas / total) * 100 : 0;
        return {
          ...row,
          horas: Number(row.horas.toFixed(1)),
          produtividade: Number(produtividade.toFixed(1)),
        };
      });

    const assigneeStacksMap = new Map<string, { name: string; total: number; columns: Record<string, number> }>();
    const kanbanColumnsMap = new Map<string, { key: string; title: string; color: string; order: number; total: number }>();

    const resolveKanbanColumn = (activity: any) => {
      const stage = activity.workflow_stage_id ? stageById.get(activity.workflow_stage_id) : null;
      if (stage) {
        const title = String(stage.title || 'Sem coluna').trim() || 'Sem coluna';
        const key = normalizeText(title) || title.toLowerCase();
        return {
          key,
          title,
          color: stage.color || '#64748b',
          order: Number(stage.display_order ?? 999),
        };
      }

      const raw = normalizeText(activity.status);
      const fallback = STATUS_LABELS[raw] || activity.status || 'Sem coluna';
      return {
        key: normalizeText(fallback) || 'sem-coluna',
        title: fallback,
        color: '#94a3b8',
        order: 999,
      };
    };

    periodActivities.forEach((activity) => {
      const { name } = resolveAssignee(activity.assigned_to);
      const column = resolveKanbanColumn(activity);

      if (!assigneeStacksMap.has(name)) {
        assigneeStacksMap.set(name, {
          name,
          total: 0,
          columns: {},
        });
      }

      const bucket = assigneeStacksMap.get(name)!;
      bucket.columns[column.key] = (bucket.columns[column.key] || 0) + 1;
      bucket.total += 1;

      const current = kanbanColumnsMap.get(column.key);
      if (!current) {
        kanbanColumnsMap.set(column.key, { ...column, total: 1 });
      } else {
        current.total += 1;
        if (column.order < current.order) current.order = column.order;
      }
    });

    const responsibleStatusStacks = Array.from(assigneeStacksMap.values())
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
    const kanbanColumns = Array.from(kanbanColumnsMap.values())
      .sort((a, b) => a.order - b.order || b.total - a.total || a.title.localeCompare(b.title));

    const sectorMap = new Map<string, { sector: string; abertas: number; concluidas: number; atrasadas: number }>();
    periodActivities.forEach((a) => {
      const { sector } = resolveAssignee(a.assigned_to);
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { sector, abertas: 0, concluidas: 0, atrasadas: 0 });
      }
      const row = sectorMap.get(sector)!;
      const done = a.status === 'completed' || a.status === 'concluido';
      if (done) row.concluidas += 1;
      else row.abertas += 1;
      const due = toDate(a.end_date);
      if (!done && due && due < todayStart) row.atrasadas += 1;
    });
    const sectorData = Array.from(sectorMap.values())
      .sort((a, b) => (b.abertas + b.concluidas) - (a.abertas + a.concluidas))
      .slice(0, 8);

    const periodActivityById = new Map(periodActivities.map((a) => [a.id, a]));
    const sectorExecutiveMap = new Map<
      string,
      {
        sector: string;
        projectIds: Set<string>;
        projectsAtrasados: Set<string>;
        atividades: number;
        atrasadas: number;
        concluidas: number;
        horasPlanejadas: number;
        horasRealizadas: number;
        leadTimeSum: number;
        leadTimeCount: number;
      }
    >();

    periodActivities.forEach((activity) => {
      const { sector } = resolveAssignee(activity.assigned_to);
      if (!sectorExecutiveMap.has(sector)) {
        sectorExecutiveMap.set(sector, {
          sector,
          projectIds: new Set<string>(),
          projectsAtrasados: new Set<string>(),
          atividades: 0,
          atrasadas: 0,
          concluidas: 0,
          horasPlanejadas: 0,
          horasRealizadas: 0,
          leadTimeSum: 0,
          leadTimeCount: 0,
        });
      }

      const row = sectorExecutiveMap.get(sector)!;
      row.projectIds.add(activity.project_id);
      row.atividades += 1;
      row.horasPlanejadas += Number(activity.hours) || 0;

      const done = activity.status === 'completed' || activity.status === 'concluido';
      if (done) {
        row.concluidas += 1;
        const start = toDate(activity.created_at);
        const end = toDate(activity.completed_at);
        if (start && end) {
          const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays >= 0) {
            row.leadTimeSum += diffDays;
            row.leadTimeCount += 1;
          }
        }
      }

      const due = toDate(activity.end_date);
      if (!done && due && due < todayStart) {
        row.atrasadas += 1;
        row.projectsAtrasados.add(activity.project_id);
      }
    });

    timeEntriesPeriodScoped.forEach((entry) => {
      const activity = periodActivityById.get(entry.activity_id);
      if (!activity) return;
      const { sector } = resolveAssignee(activity.assigned_to);
      const row = sectorExecutiveMap.get(sector);
      if (!row) return;
      row.horasRealizadas += (Number(entry.duration_minutes) || 0) / 60;
    });

    const sectorExecutiveData = Array.from(sectorExecutiveMap.values())
      .map((row) => {
        const projectsTotal = row.projectIds.size;
        const projectsAtrasados = row.projectsAtrasados.size;
        const projectsNoPrazo = Math.max(0, projectsTotal - projectsAtrasados);
        const avgLeadTime = row.leadTimeCount > 0 ? row.leadTimeSum / row.leadTimeCount : 0;
        const produtividade = row.atividades > 0 ? (row.concluidas / row.atividades) * 100 : 0;

        return {
          sector: row.sector,
          projectsTotal,
          projectsAtrasados,
          projectsNoPrazo,
          atividades: row.atividades,
          atrasadas: row.atrasadas,
          concluidas: row.concluidas,
          produtividade: Number(produtividade.toFixed(1)),
          avgLeadTime: Number(avgLeadTime.toFixed(1)),
          horasPlanejadas: Number(row.horasPlanejadas.toFixed(1)),
          horasRealizadas: Number(row.horasRealizadas.toFixed(1)),
        };
      })
      .sort((a, b) => b.projectsTotal - a.projectsTotal || b.projectsAtrasados - a.projectsAtrasados || a.sector.localeCompare(b.sector));

    const pendingCR = changeRequestsByProject.filter(
      (c) => (c.status || '').toLowerCase() === 'pending' && (inPeriod(c.created_at) || inPeriod(c.updated_at)),
    ).length;

    const decisionItems = [
      {
        title: 'Mudanças pendentes',
        value: `${pendingCR}`,
        severity: pendingCR >= 5 ? 'high' : pendingCR > 0 ? 'medium' : 'low',
        action: 'Priorizar decisão de CRs para reduzir bloqueios de execução.',
      },
      {
        title: 'Atividades atrasadas',
        value: `${overdueActivities.length}`,
        severity: overdueActivities.length >= 20 ? 'high' : overdueActivities.length > 0 ? 'medium' : 'low',
        action: 'Atacar top 10 atrasos por impacto e dono nesta semana.',
      },
      {
        title: 'Lead time médio',
        value: `${avgLeadTime.toFixed(1)} dias`,
        severity: avgLeadTime > 25 ? 'high' : avgLeadTime > 15 ? 'medium' : 'low',
        action: 'Quebrar itens grandes e reduzir espera entre estágios.',
      },
      {
        title: 'Backlog atual',
        value: `${throughputData.at(-1)?.backlog || 0}`,
        severity: (throughputData.at(-1)?.backlog || 0) > 80 ? 'high' : (throughputData.at(-1)?.backlog || 0) > 40 ? 'medium' : 'low',
        action: 'Rebalancear capacidade por setor e foco em envelhecimento de fila.',
      },
    ];

    return {
      projectsScoped: projectsPeriodScoped,
      activitiesScoped: periodActivities,
      periodActivities,
      completedInPeriod,
      overdueActivities,
      plannedBudget,
      usedBudget,
      totalHoursEstimated,
      totalHoursTracked,
      deliveredOnTime,
      completedWithDueTotal: completedWithDue.length,
      projectHealth,
      criticalProjects,
      statusData,
      throughputData,
      burnDownData,
      capacityData,
      responsibleStatusStacks,
      kanbanColumns,
      sectorData,
      sectorExecutiveData,
      pendingCR,
      avgLeadTime,
      decisionItems,
    };
  }, [activities, changeRequests, filterManager, filterSector, periodStart, profiles, projectMembers, projects, timeEntries, workflowStages]);

  const completionRate = dashboardData.activitiesScoped.length > 0
    ? (dashboardData.completedInPeriod.length / Math.max(1, dashboardData.periodActivities.length)) * 100
    : 0;

  const onTimeRate = dashboardData.completedWithDueTotal > 0
    ? (dashboardData.deliveredOnTime / dashboardData.completedWithDueTotal) * 100
    : 0;

  const budgetUsage = dashboardData.plannedBudget > 0
    ? (dashboardData.usedBudget / dashboardData.plannedBudget) * 100
    : 0;

  const backlogAtual = dashboardData.throughputData.at(-1)?.backlog || 0;
  const backlogAnterior = dashboardData.throughputData.at(-2)?.backlog || 0;
  const backlogDelta = backlogAtual - backlogAnterior;

  const hasThroughputData = dashboardData.throughputData.some((r) => r.criadas > 0 || r.concluidas > 0 || r.backlog > 0);
  const hasBurnDownData = dashboardData.burnDownData.some((r) => r.total > 0 || r.completed > 0);
  const hasStatusData = dashboardData.statusData.some((r) => r.value > 0);
  const hasCapacityData = dashboardData.capacityData.some((r) => r.abertas > 0 || r.concluidas > 0);

  const maxThroughput = Math.max(
    1,
    ...dashboardData.throughputData.flatMap((r) => [r.criadas, r.concluidas, r.backlog]),
  );
  const statusTotalProjects = Math.max(1, dashboardData.statusData.reduce((acc, row) => acc + row.value, 0));
  const statusDistribution = dashboardData.statusData.map((row, idx) => ({
    ...row,
    pct: (row.value / statusTotalProjects) * 100,
    color: STATUS_COLORS[idx % STATUS_COLORS.length],
  }));
  const statusConic = (() => {
    let acc = 0;
    const parts = statusDistribution.map((row) => {
      const start = acc;
      acc += row.pct;
      return `${row.color} ${start}% ${acc}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  })();
  const throughputTotals = dashboardData.throughputData.reduce(
    (acc, row) => ({
      criadas: acc.criadas + row.criadas,
      concluidas: acc.concluidas + row.concluidas,
      backlog: row.backlog,
    }),
    { criadas: 0, concluidas: 0, backlog: 0 },
  );
  const throughputView = dashboardData.throughputData
    .filter((row) => row.criadas > 0 || row.concluidas > 0 || row.backlog > 0)
    .slice(-12);
  const burnSeries = dashboardData.burnDownData;
  const burnMax = Math.max(1, ...burnSeries.flatMap((p) => [p.total, p.completed]));
  const chartWidth = 920;
  const chartHeight = 280;
  const chartPadLeft = 56;
  const chartPadRight = 18;
  const chartPadTop = 12;
  const chartPadBottom = 30;
  const plotWidth = chartWidth - chartPadLeft - chartPadRight;
  const plotHeight = chartHeight - chartPadTop - chartPadBottom;
  const toX = (idx: number) =>
    burnSeries.length <= 1
      ? chartPadLeft
      : chartPadLeft + (idx * plotWidth) / (burnSeries.length - 1);
  const toY = (value: number) => chartHeight - chartPadBottom - (value / burnMax) * plotHeight;
  const totalPath = burnSeries
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(idx)} ${toY(p.total)}`)
    .join(' ');
  const completedPath = burnSeries
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(idx)} ${toY(p.completed)}`)
    .join(' ');
  const burnStart = burnSeries[0]?.total || 0;
  const burnCurrent = burnSeries.at(-1)?.total || 0;
  const completedCurrent = burnSeries.at(-1)?.completed || 0;
  const burnDelta = burnCurrent - burnStart;
  const burnBaseY = chartHeight - chartPadBottom;
  const totalArea = `${totalPath} L ${toX(burnSeries.length - 1)} ${burnBaseY} L ${toX(0)} ${burnBaseY} Z`;
  const completedArea = `${completedPath} L ${toX(burnSeries.length - 1)} ${burnBaseY} L ${toX(0)} ${burnBaseY} Z`;
  const yTickStep = Math.max(1, Math.ceil(burnMax / 4 / 10) * 10);
  const yTicks = [0, 1, 2, 3, 4].map((i) => i * yTickStep);
  const xTickIndexes = [0, 1, 2, 3, 4, 5].map((i) =>
    burnSeries.length <= 1 ? 0 : Math.min(burnSeries.length - 1, Math.round((i * (burnSeries.length - 1)) / 5)),
  );
  const maxResponsibleTotal = Math.max(1, ...dashboardData.responsibleStatusStacks.map((row) => row.total));
  const strategicSectorOptions = useMemo(
    () => dashboardData.sectorExecutiveData.map((row) => row.sector).sort((a, b) => a.localeCompare(b)),
    [dashboardData.sectorExecutiveData],
  );
  const sectorExecutiveView = useMemo(
    () => strategicSectorFilter === 'all'
      ? dashboardData.sectorExecutiveData
      : dashboardData.sectorExecutiveData.filter((row) => row.sector === strategicSectorFilter),
    [dashboardData.sectorExecutiveData, strategicSectorFilter],
  );
  const hasSectorExecutiveData = sectorExecutiveView.length > 0;
  const sectorExecutiveTotals = sectorExecutiveView.reduce(
    (acc, row) => ({
      projects: acc.projects + row.projectsTotal,
      projectsAtrasados: acc.projectsAtrasados + row.projectsAtrasados,
      hoursReal: acc.hoursReal + row.horasRealizadas,
      hoursPlanned: acc.hoursPlanned + row.horasPlanejadas,
    }),
    { projects: 0, projectsAtrasados: 0, hoursReal: 0, hoursPlanned: 0 },
  );
  const strategicPeriodEnd = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const strategicDrilldownData = useMemo(() => {
    if (!strategicDrilldown) return [] as Array<Record<string, string | number>>;

    const profileById = new Map<string, { full_name: string | null; sector: string | null }>();
    const profileByNormalizedName = new Map<string, { id: string; sector: string | null }>();
    profiles.forEach((p) => {
      profileById.set(p.id, { full_name: p.full_name ?? null, sector: p.sector ?? null });
      const normalized = normalizeText(p.full_name);
      if (normalized) profileByNormalizedName.set(normalized, { id: p.id, sector: p.sector ?? null });
    });

    const memberSectorById = new Map<string, string>();
    projectMembers.forEach((m) => {
      if (m?.user_id && m?.sector && !memberSectorById.has(m.user_id)) {
        memberSectorById.set(m.user_id, m.sector);
      }
    });

    const resolveAssignee = (assignedTo: string | null | undefined) => {
      const raw = (assignedTo || '').trim();
      if (!raw) return { name: 'Não atribuído', sector: 'Sem setor' };

      const byId = profileById.get(raw);
      if (byId) {
        return {
          name: byId.full_name || raw,
          sector: byId.sector || memberSectorById.get(raw) || 'Sem setor',
        };
      }

      const normalized = normalizeText(raw);
      const byName = profileByNormalizedName.get(normalized);
      if (byName) {
        const p = profileById.get(byName.id);
        return {
          name: p?.full_name || raw,
          sector: p?.sector || byName.sector || memberSectorById.get(byName.id) || 'Sem setor',
        };
      }

      return { name: raw, sector: 'Sem setor' };
    };

    const projectById = new Map(dashboardData.projectsScoped.map((p: any) => [p.id, p]));

    const activitiesScoped = dashboardData.periodActivities.filter((activity: any) => {
      const sector = resolveAssignee(activity.assigned_to).sector;
      return strategicDrilldown.sector === 'all' ? true : sector === strategicDrilldown.sector;
    });
    const activityIds = new Set(activitiesScoped.map((a: any) => a.id));

    const trackedMinutesByActivity = new Map<string, number>();
    timeEntries.forEach((entry: any) => {
      if (!activityIds.has(entry.activity_id)) return;
      const hasPeriodDate = [entry.created_at, entry.entry_date, entry.date]
        .map((value: string | null | undefined) => toDate(value))
        .find((d) => !!d);
      if (hasPeriodDate && (hasPeriodDate < periodStart || hasPeriodDate > strategicPeriodEnd)) return;
      trackedMinutesByActivity.set(entry.activity_id, (trackedMinutesByActivity.get(entry.activity_id) || 0) + (Number(entry.duration_minutes) || 0));
    });

    if (strategicDrilldown.metric === 'projectsAtrasados') {
      const byProject = new Map<string, { projeto: string; responsavel: string; atrasos: number }>();
      activitiesScoped.forEach((activity: any) => {
        const due = toDate(activity.end_date);
        const done = activity.status === 'completed' || activity.status === 'concluido';
        if (!due || done || due >= strategicPeriodEnd) return;
        const project = projectById.get(activity.project_id);
        const title = project?.title || 'Projeto sem título';
        const owner = project?.owner || project?.manager || 'Sem responsável';
        if (!byProject.has(activity.project_id)) {
          byProject.set(activity.project_id, { projeto: title, responsavel: owner, atrasos: 0 });
        }
        byProject.get(activity.project_id)!.atrasos += 1;
      });
      return Array.from(byProject.values()).sort((a, b) => b.atrasos - a.atrasos || a.projeto.localeCompare(b.projeto));
    }

    if (strategicDrilldown.metric === 'projectsNoPrazo') {
      const delayedProjects = new Set<string>();
      activitiesScoped.forEach((activity: any) => {
        const due = toDate(activity.end_date);
        const done = activity.status === 'completed' || activity.status === 'concluido';
        if (!!due && !done && due < strategicPeriodEnd) delayedProjects.add(activity.project_id);
      });
      const inTimeProjects = new Set(activitiesScoped.map((a: any) => a.project_id));
      return Array.from(inTimeProjects)
        .filter((projectId) => !delayedProjects.has(projectId))
        .map((projectId) => {
          const project = projectById.get(projectId);
          const projectActivities = activitiesScoped.filter((a: any) => a.project_id === projectId);
          const done = projectActivities.filter((a: any) => a.status === 'completed' || a.status === 'concluido').length;
          return {
            projeto: project?.title || 'Projeto sem título',
            responsavel: project?.owner || project?.manager || 'Sem responsável',
            conclusao: `${done}/${projectActivities.length}`,
          };
        })
        .sort((a, b) => a.projeto.localeCompare(b.projeto));
    }

    if (strategicDrilldown.metric === 'leadTime') {
      return activitiesScoped
        .map((activity: any) => {
          const start = toDate(activity.created_at);
          const end = toDate(activity.completed_at);
          if (!start || !end) return null;
          const leadDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
          if (leadDays < 0) return null;
          return {
            atividade: activity.title || 'Atividade',
            projeto: projectById.get(activity.project_id)?.title || 'Projeto sem título',
            responsavel: resolveAssignee(activity.assigned_to).name,
            leadTimeDias: Number(leadDays.toFixed(1)),
          };
        })
        .filter((row): row is { atividade: string; projeto: string; responsavel: string; leadTimeDias: number } => !!row)
        .sort((a, b) => b.leadTimeDias - a.leadTimeDias)
        .slice(0, 40);
    }

    if (strategicDrilldown.metric === 'horas') {
      return activitiesScoped
        .map((activity: any) => ({
          atividade: activity.title || 'Atividade',
          projeto: projectById.get(activity.project_id)?.title || 'Projeto sem título',
          responsavel: resolveAssignee(activity.assigned_to).name,
          horasPlanejadas: Number((Number(activity.hours) || 0).toFixed(1)),
          horasRealizadas: Number(((trackedMinutesByActivity.get(activity.id) || 0) / 60).toFixed(1)),
        }))
        .sort((a, b) => b.horasRealizadas - a.horasRealizadas || b.horasPlanejadas - a.horasPlanejadas)
        .slice(0, 40);
    }

    if (strategicDrilldown.metric === 'conclusao') {
      return activitiesScoped
        .map((activity: any) => ({
          atividade: activity.title || 'Atividade',
          projeto: projectById.get(activity.project_id)?.title || 'Projeto sem título',
          status: STATUS_LABELS[activity.status] || activity.status || 'Sem status',
          responsavel: resolveAssignee(activity.assigned_to).name,
        }))
        .sort((a, b) => a.status.localeCompare(b.status) || a.projeto.localeCompare(b.projeto))
        .slice(0, 60);
    }

    return activitiesScoped
      .map((activity: any) => ({
        atividade: activity.title || 'Atividade',
        projeto: projectById.get(activity.project_id)?.title || 'Projeto sem título',
        status: STATUS_LABELS[activity.status] || activity.status || 'Sem status',
        prazo: activity.end_date ? format(parseISO(activity.end_date), 'dd/MM/yyyy') : 'Sem data',
      }))
      .sort((a, b) => a.projeto.localeCompare(b.projeto))
      .slice(0, 60);
  }, [dashboardData.periodActivities, dashboardData.projectsScoped, periodStart, profiles, projectMembers, strategicDrilldown, strategicPeriodEnd, timeEntries]);

  useEffect(() => {
    if (strategicSectorFilter === 'all') return;
    const stillExists = strategicSectorOptions.includes(strategicSectorFilter);
    if (!stillExists) setStrategicSectorFilter('all');
  }, [strategicSectorFilter, strategicSectorOptions]);

  const strategicDrilldownTitle = useMemo(() => {
    if (!strategicDrilldown) return '';
    const metricLabel: Record<typeof strategicDrilldown.metric, string> = {
      projectsAtrasados: 'Projetos com atraso',
      projectsNoPrazo: 'Projetos sem atraso',
      atividades: 'Atividades do setor',
      leadTime: 'Tempo de entrega (lead time)',
      horas: 'Horas por atividade',
      conclusao: 'Detalhe de conclusão',
    };
    const suffix = strategicDrilldown.sector === 'all' ? 'todos os setores' : strategicDrilldown.sector;
    return `${metricLabel[strategicDrilldown.metric]} • ${suffix}`;
  }, [strategicDrilldown]);

  const strategicDrilldownColumns = useMemo(
    () => strategicDrilldownData.length > 0 ? Object.keys(strategicDrilldownData[0]) : [],
    [strategicDrilldownData],
  );

  const ritmoInsight = backlogDelta > 0
    ? `Backlog aumentou em ${Math.abs(backlogDelta)} no último período. Necessário elevar vazão de conclusão.`
    : backlogDelta < 0
      ? `Backlog reduziu em ${Math.abs(backlogDelta)} no último período. Fluxo em melhora.`
      : 'Backlog estável no último período. Monitorar para evitar nova acumulação.';

  const statusCritico = [...dashboardData.statusData].sort((a, b) => b.overdue - a.overdue)[0];
  const statusInsight = statusCritico && statusCritico.overdue > 0
    ? `Maior atenção em "${statusCritico.name}": ${statusCritico.overdue} atrasos e ${statusCritico.completion.toFixed(0)}% de conclusão.`
    : 'Nenhum status com atraso relevante no recorte atual.';

  const maisPressionado = [...dashboardData.capacityData].sort((a, b) => (b.abertas - a.abertas))[0];
  const capacidadeInsight = maisPressionado
    ? `${maisPressionado.name} concentra maior fila (${maisPressionado.abertas} abertas). Avaliar redistribuição.`
    : 'Sem responsáveis com carga relevante no recorte atual.';

  const riscoAlto = dashboardData.decisionItems.filter((i) => i.severity === 'high').length;
  const riscoInsight = riscoAlto > 0
    ? `${riscoAlto} indicador(es) em nível crítico. Priorizar decisões de curto prazo nesta semana.`
    : 'Sem indicadores críticos no momento. Manter cadência de acompanhamento.';
  const projectHealthView = [...dashboardData.projectHealth]
    .sort((a, b) => b.riskScore - a.riskScore || a.title.localeCompare(b.title));
  const projectHealthSummary = projectHealthView.reduce(
    (acc, project) => {
      if (project.riskScore >= 60) acc.critical += 1;
      else if (project.riskScore >= 25) acc.attention += 1;
      else acc.healthy += 1;
      return acc;
    },
    { healthy: 0, attention: 0, critical: 0 },
  );

  const semaforoClass = (status: 'ok' | 'warn' | 'risk') => {
    if (status === 'ok') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800';
    if (status === 'warn') return 'border-amber-500/40 bg-amber-500/10 text-amber-800';
    return 'border-red-500/40 bg-red-500/10 text-red-800';
  };

  const prazoStatus: 'ok' | 'warn' | 'risk' = onTimeRate >= KPI_TARGETS.onTimeMin
    ? 'ok'
    : onTimeRate >= KPI_TARGETS.onTimeMin * 0.85
      ? 'warn'
      : 'risk';
  const custoStatus: 'ok' | 'warn' | 'risk' = budgetUsage <= KPI_TARGETS.budgetUsageMax
    ? 'ok'
    : budgetUsage <= KPI_TARGETS.budgetUsageMax * 1.15
      ? 'warn'
      : 'risk';
  const riscoStatus: 'ok' | 'warn' | 'risk' = dashboardData.overdueActivities.length <= KPI_TARGETS.overdueMax
    ? 'ok'
    : dashboardData.overdueActivities.length <= KPI_TARGETS.overdueMax * 1.5
      ? 'warn'
      : 'risk';
  const fluxoStatus: 'ok' | 'warn' | 'risk' = completionRate >= KPI_TARGETS.completionMin
    ? 'ok'
    : completionRate >= KPI_TARGETS.completionMin * 0.85
      ? 'warn'
      : 'risk';

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    dashboardData.activitiesScoped.forEach((a: any) => {
      const norm = normalizeText(a.assigned_to);
      const profile = profiles.find((p) => normalizeText(p.full_name) === norm || p.id === a.assigned_to);
      if (profile?.sector) set.add(profile.sector);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [dashboardData.activitiesScoped, profiles]);

  const managerOptions = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => {
      if (p.owner) set.add(p.owner);
      if (p.manager) set.add(p.manager);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const kpiTone = (value: number, target: number, type: 'min' | 'max') => {
    if (type === 'min') {
      if (value >= target) return 'text-emerald-700 bg-emerald-500/10 border-emerald-500/40';
      if (value >= target * 0.85) return 'text-amber-700 bg-amber-500/10 border-amber-500/40';
      return 'text-red-700 bg-red-500/10 border-red-500/40';
    }
    if (value <= target) return 'text-emerald-700 bg-emerald-500/10 border-emerald-500/40';
    if (value <= target * 1.15) return 'text-amber-700 bg-amber-500/10 border-amber-500/40';
    return 'text-red-700 bg-red-500/10 border-red-500/40';
  };

  const exportExecutiveSnapshot = () => {
    const rows = [
      ['Métrica', 'Valor'],
      ['Projetos ativos', String(dashboardData.projectsScoped.length)],
      ['Taxa de conclusão no período', `${completionRate.toFixed(1)}%`],
      ['Entrega no prazo', `${onTimeRate.toFixed(1)}%`],
      ['Lead time médio', `${dashboardData.avgLeadTime.toFixed(1)} dias`],
      ['Atividades atrasadas', String(dashboardData.overdueActivities.length)],
      ['Mudanças pendentes', String(dashboardData.pendingCR)],
      ['Uso de orçamento', `${budgetUsage.toFixed(1)}%`],
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `indicadores_executivos_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <main className={`px-4 py-6 ${presentationMode ? 'space-y-8' : 'space-y-6'}`}>
      <section className="rounded-2xl border bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 text-white p-6 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Página de Teste para Validação Executiva
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Indicadores LAB</h1>
            <p className="text-sm text-cyan-100/90 mt-1">
              Visão consolidada para reuniões de diretoria e gerência. Versão piloto antes da oficialização.
            </p>
          </div>

          <div className="w-full sm:w-[620px]">
            <label className="text-xs text-cyan-100/90 mb-1 block">Período de análise</label>
            <div className="flex gap-2">
              <Select value={period} onValueChange={(value) => setPeriod(value as PeriodKey)}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERIOD_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterSector} onValueChange={setFilterSector}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os setores</SelectItem>
                  {sectorOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterManager} onValueChange={setFilterManager}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Gerência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as gerências</SelectItem>
                  {managerOptions.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" className="shrink-0" onClick={exportExecutiveSnapshot}>
                Exportar
              </Button>
              <Button variant={presentationMode ? 'default' : 'secondary'} size="sm" className="shrink-0" onClick={() => setPresentationMode((v) => !v)}>
                {presentationMode ? 'Sair apresentação' : 'Modo apresentação'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Carregando indicadores...</Card>
      ) : loadError ? (
        <Alert className="p-4 border-destructive/40 text-destructive">
          Erro ao carregar indicadores: {loadError}
        </Alert>
      ) : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className={`p-4 border ${semaforoClass(fluxoStatus)}`}>
              <div className="text-xs font-medium uppercase tracking-wide opacity-80">Fluxo</div>
              <div className="mt-2 text-2xl font-semibold">{completionRate.toFixed(0)}%</div>
              <p className="text-xs mt-1">Meta de conclusão ≥ {KPI_TARGETS.completionMin}%</p>
            </Card>
            <Card className={`p-4 border ${semaforoClass(prazoStatus)}`}>
              <div className="text-xs font-medium uppercase tracking-wide opacity-80">Prazo</div>
              <div className="mt-2 text-2xl font-semibold">{onTimeRate.toFixed(0)}%</div>
              <p className="text-xs mt-1">Entrega no prazo (meta ≥ {KPI_TARGETS.onTimeMin}%)</p>
            </Card>
            <Card className={`p-4 border ${semaforoClass(custoStatus)}`}>
              <div className="text-xs font-medium uppercase tracking-wide opacity-80">Custo</div>
              <div className="mt-2 text-2xl font-semibold">{budgetUsage.toFixed(0)}%</div>
              <p className="text-xs mt-1">Uso do orçamento (meta ≤ {KPI_TARGETS.budgetUsageMax}%)</p>
            </Card>
            <Card className={`p-4 border ${semaforoClass(riscoStatus)}`}>
              <div className="text-xs font-medium uppercase tracking-wide opacity-80">Risco</div>
              <div className="mt-2 text-2xl font-semibold">{dashboardData.overdueActivities.length}</div>
              <p className="text-xs mt-1">Atrasos críticos (meta ≤ {KPI_TARGETS.overdueMax})</p>
            </Card>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3"><span className="text-sm text-muted-foreground">Projetos ativos</span><Target className="w-4 h-4 text-primary" /></div>
              <div className="text-3xl font-bold">{dashboardData.projectsScoped.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Projetos após filtros ativos</p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3"><span className="text-sm text-muted-foreground">Atrasos críticos</span><AlertTriangle className="w-4 h-4 text-destructive" /></div>
              <div className="text-3xl font-bold text-destructive">{dashboardData.overdueActivities.length}</div>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xs text-muted-foreground">Atividades vencidas e não concluídas</p>
                <Badge variant="outline" className={kpiTone(dashboardData.overdueActivities.length, KPI_TARGETS.overdueMax, 'max')}>Meta ≤ {KPI_TARGETS.overdueMax}</Badge>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3"><span className="text-sm text-muted-foreground">Entrega no prazo</span><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div>
              <div className="text-3xl font-bold">{onTimeRate.toFixed(0)}%</div>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xs text-muted-foreground">Concluídas até a data final</p>
                <Badge variant="outline" className={kpiTone(onTimeRate, KPI_TARGETS.onTimeMin, 'min')}>Meta ≥ {KPI_TARGETS.onTimeMin}%</Badge>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3"><span className="text-sm text-muted-foreground">Uso de orçamento</span><DollarSign className="w-4 h-4 text-amber-600" /></div>
              <div className="text-3xl font-bold">{budgetUsage.toFixed(0)}%</div>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  R$ {dashboardData.usedBudget.toLocaleString('pt-BR')} de R$ {dashboardData.plannedBudget.toLocaleString('pt-BR')}
                </p>
                <Badge variant="outline" className={kpiTone(budgetUsage, KPI_TARGETS.budgetUsageMax, 'max')}>Meta ≤ {KPI_TARGETS.budgetUsageMax}%</Badge>
              </div>
            </Card>
          </section>

          <section>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Visão dos projetos no período</h2>
                  <p className="text-xs text-muted-foreground">Como cada projeto está em prazo, progresso e orçamento no recorte selecionado.</p>
                </div>
                <Badge variant="outline">{projectHealthView.length} projeto(s)</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="rounded-md border bg-emerald-500/10 border-emerald-500/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-emerald-800">Saudável</p>
                  <p className="text-xl font-semibold text-emerald-800">{projectHealthSummary.healthy}</p>
                </div>
                <div className="rounded-md border bg-amber-500/10 border-amber-500/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-amber-800">Atenção</p>
                  <p className="text-xl font-semibold text-amber-800">{projectHealthSummary.attention}</p>
                </div>
                <div className="rounded-md border bg-red-500/10 border-red-500/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-red-800">Crítico</p>
                  <p className="text-xl font-semibold text-red-800">{projectHealthSummary.critical}</p>
                </div>
              </div>

              <div className="rounded-md border overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2">Projeto</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Progresso</th>
                      <th className="text-right px-3 py-2">Atrasos</th>
                      <th className="text-right px-3 py-2">Desvio orç.</th>
                      <th className="text-right px-3 py-2">Saúde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectHealthView.length === 0 && (
                      <tr>
                        <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
                          Nenhum projeto com movimentação no período selecionado.
                        </td>
                      </tr>
                    )}
                    {projectHealthView.map((project) => {
                      const healthLabel = project.riskScore >= 60 ? 'Crítico' : project.riskScore >= 25 ? 'Atenção' : 'Saudável';
                      const healthClass = project.riskScore >= 60
                        ? 'bg-red-500/10 text-red-800 border-red-500/30'
                        : project.riskScore >= 25
                          ? 'bg-amber-500/10 text-amber-800 border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30';

                      return (
                        <tr key={project.id} className="border-t align-top">
                          <td className="px-3 py-2.5 min-w-[220px]">
                            <p className="font-medium text-foreground truncate">{project.title}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{project.owner}</p>
                          </td>
                          <td className="px-3 py-2.5">{project.statusLabel}</td>
                          <td className="px-3 py-2.5 min-w-[180px]">
                            <div className="flex items-center justify-between mb-1">
                              <span>{project.completion.toFixed(0)}%</span>
                              <span className="text-muted-foreground">{project.doneActivities}/{project.totalActivities}</span>
                            </div>
                            <div className="h-1.5 rounded bg-muted/60 overflow-hidden">
                              <div className="h-full bg-primary/80 rounded" style={{ width: `${Math.max(0, Math.min(project.completion, 100))}%` }} />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">{project.overdue}</td>
                          <td className="px-3 py-2.5 text-right">{project.budgetDeviation.toFixed(1)}%</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${healthClass}`}>
                              {healthLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          <section>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Visão estratégica por setor</h2>
                  <p className="text-xs text-muted-foreground">Projetos com e sem atraso, tempo médio de entrega e carga de horas por setor.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={strategicSectorFilter} onValueChange={setStrategicSectorFilter}>
                    <SelectTrigger className="h-8 min-w-[220px] text-xs">
                      <SelectValue placeholder="Filtrar setor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os setores</SelectItem>
                      {strategicSectorOptions.map((sector) => (
                        <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="outline">{sectorExecutiveView.length} setor(es)</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setStrategicDrilldown({ sector: strategicSectorFilter, metric: 'atividades' })}
                  className="rounded-md border bg-muted/20 px-3 py-2 text-left hover:bg-muted/35 transition-colors"
                >
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Projetos mapeados</p>
                  <p className="text-xl font-semibold text-foreground">{sectorExecutiveTotals.projects}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setStrategicDrilldown({ sector: strategicSectorFilter, metric: 'projectsAtrasados' })}
                  className="rounded-md border bg-red-500/10 border-red-500/30 px-3 py-2 text-left hover:bg-red-500/20 transition-colors"
                >
                  <p className="text-[11px] uppercase tracking-wide text-red-700">Projetos com atraso</p>
                  <p className="text-xl font-semibold text-red-700">{sectorExecutiveTotals.projectsAtrasados}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setStrategicDrilldown({ sector: strategicSectorFilter, metric: 'horas' })}
                  className="rounded-md border bg-sky-500/10 border-sky-500/30 px-3 py-2 text-left hover:bg-sky-500/20 transition-colors"
                >
                  <p className="text-[11px] uppercase tracking-wide text-sky-700">Horas realizadas</p>
                  <p className="text-xl font-semibold text-sky-700">{sectorExecutiveTotals.hoursReal.toFixed(1)}h</p>
                </button>
                <button
                  type="button"
                  onClick={() => setStrategicDrilldown({ sector: strategicSectorFilter, metric: 'leadTime' })}
                  className="rounded-md border bg-amber-500/10 border-amber-500/30 px-3 py-2 text-left hover:bg-amber-500/20 transition-colors"
                >
                  <p className="text-[11px] uppercase tracking-wide text-amber-700">Horas planejadas</p>
                  <p className="text-xl font-semibold text-amber-700">{sectorExecutiveTotals.hoursPlanned.toFixed(1)}h</p>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">Clique nos números para abrir o detalhamento por setor.</p>

              <div className="rounded-md border overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2">Setor</th>
                      <th className="text-right px-3 py-2">Proj.</th>
                      <th className="text-right px-3 py-2">Com atraso</th>
                      <th className="text-right px-3 py-2">Sem atraso</th>
                      <th className="text-right px-3 py-2">Atividades</th>
                      <th className="text-right px-3 py-2">Lead time médio</th>
                      <th className="text-right px-3 py-2">Horas (real/plan.)</th>
                      <th className="text-right px-3 py-2">Conclusão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!hasSectorExecutiveData && (
                      <tr>
                        <td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                          Sem dados por setor para o período/filtros selecionados.
                        </td>
                      </tr>
                    )}
                    {sectorExecutiveView.map((row) => (
                      <tr key={row.sector} className="border-t">
                        <td className="px-3 py-2.5 font-medium text-foreground">
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() => {
                              setStrategicSectorFilter(row.sector);
                              setStrategicDrilldown({ sector: row.sector, metric: 'atividades' });
                            }}
                          >
                            {row.sector}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right">{row.projectsTotal}</td>
                        <td className="px-3 py-2.5 text-right text-red-700">
                          <button type="button" className="hover:underline" onClick={() => setStrategicDrilldown({ sector: row.sector, metric: 'projectsAtrasados' })}>
                            {row.projectsAtrasados}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-700">
                          <button type="button" className="hover:underline" onClick={() => setStrategicDrilldown({ sector: row.sector, metric: 'projectsNoPrazo' })}>
                            {row.projectsNoPrazo}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button type="button" className="hover:underline" onClick={() => setStrategicDrilldown({ sector: row.sector, metric: 'atividades' })}>
                            {row.atividades}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button type="button" className="hover:underline" onClick={() => setStrategicDrilldown({ sector: row.sector, metric: 'leadTime' })}>
                            {row.avgLeadTime.toFixed(1)}d
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button type="button" className="hover:underline" onClick={() => setStrategicDrilldown({ sector: row.sector, metric: 'horas' })}>
                            {row.horasRealizadas.toFixed(1)}h / {row.horasPlanejadas.toFixed(1)}h
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button type="button" className="hover:underline" onClick={() => setStrategicDrilldown({ sector: row.sector, metric: 'conclusao' })}>
                            {row.produtividade.toFixed(1)}%
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {strategicDrilldown && (
                <div className="mt-4 rounded-md border bg-muted/10">
                  <div className="flex items-center justify-between px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-foreground">Detalhamento: {strategicDrilldownTitle}</p>
                    <Button variant="ghost" size="sm" onClick={() => setStrategicDrilldown(null)}>Fechar</Button>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {strategicDrilldownData.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-muted-foreground">Sem itens para este recorte.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            {strategicDrilldownColumns.map((col) => (
                              <th key={col} className="text-left px-3 py-2 capitalize">{col.replaceAll('_', ' ')}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {strategicDrilldownData.map((item, idx) => (
                            <tr key={idx} className="border-t">
                              {strategicDrilldownColumns.map((col) => {
                                const value = item[col];
                                const content = typeof value === 'number'
                                  ? Number.isInteger(value)
                                    ? value.toLocaleString('pt-BR')
                                    : value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                                  : String(value);
                                return <td key={`${idx}-${col}`} className="px-3 py-2">{content}</td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </section>

          <section>
            <Card className="p-4 min-h-[380px]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Burn-down ({PERIOD_LABEL[period]})</h2>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">Total: {burnCurrent} ({burnDelta >= 0 ? '+' : ''}{burnDelta})</Badge>
                  <Badge variant="outline">Concluído: {completedCurrent}</Badge>
                </div>
              </div>

              {hasBurnDownData ? (
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3 overflow-auto">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-[280px] min-w-[700px]">
                    {yTicks.map((tick) => {
                      const y = toY(tick);
                      return (
                        <line
                          key={`y-${tick}`}
                          x1={chartPadLeft}
                          y1={y}
                          x2={chartWidth - chartPadRight}
                          y2={y}
                          stroke="hsl(var(--border))"
                          strokeOpacity="0.5"
                          strokeDasharray="3 3"
                        />
                      );
                    })}

                    {xTickIndexes.map((idx, pos) => (
                      <line
                        key={`x-${idx}-${pos}`}
                        x1={toX(idx)}
                        y1={chartPadTop}
                        x2={toX(idx)}
                        y2={burnBaseY}
                        stroke="hsl(var(--border))"
                        strokeOpacity="0.35"
                        strokeDasharray="3 3"
                      />
                    ))}

                    <line x1={chartPadLeft} y1={chartPadTop} x2={chartPadLeft} y2={burnBaseY} stroke="#475569" strokeWidth="1.2" />
                    <line x1={chartPadLeft} y1={burnBaseY} x2={chartWidth - chartPadRight} y2={burnBaseY} stroke="#475569" strokeWidth="1.2" />

                    <path d={totalArea} fill="#ef4444" fillOpacity="0.12" />
                    <path d={completedArea} fill="#22c55e" fillOpacity="0.14" />

                    <path d={totalPath} fill="none" stroke="#ef4444" strokeWidth="2.4" />
                    <path d={completedPath} fill="none" stroke="#10b981" strokeWidth="2.2" />

                    {yTicks.map((tick) => (
                      <text key={`yt-${tick}`} x={chartPadLeft - 8} y={toY(tick) + 3} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">
                        {tick}
                      </text>
                    ))}

                    {xTickIndexes.map((idx, pos) => (
                      <text
                        key={`xt-${idx}-${pos}`}
                        x={toX(idx)}
                        y={chartHeight - 8}
                        textAnchor="middle"
                        fontSize="10"
                        fill="hsl(var(--muted-foreground))"
                      >
                        {burnSeries[idx]?.label || ''}
                      </text>
                    ))}
                  </svg>

                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-red-500" /> Total de tarefas</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-emerald-500" /> Concluído</span>
                  </div>
                </div>
              ) : (
                <div className="h-[280px] rounded-lg border border-dashed border-border/70 bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
                  Sem dados suficientes para calcular burn-down no período.
                </div>
              )}
            </Card>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="p-4 xl:col-span-2 min-h-[430px] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Ritmo de execução ({PERIOD_LABEL[period]})</h2></div>
                  <p className="text-[11px] text-muted-foreground mt-1">Criadas e Concluídas representam movimento do dia/mês. Backlog representa saldo acumulado.</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="gap-1"><TrendingUp className="w-3 h-3" /> Lead time médio: {dashboardData.avgLeadTime.toFixed(1)}d</Badge>
                  <Badge variant="outline" className="gap-1"><ListChecks className="w-3 h-3" /> Backlog: {backlogAtual} ({backlogDelta >= 0 ? '+' : ''}{backlogDelta})</Badge>
                </div>
              </div>
              <div className="h-72 flex-1">
                {hasThroughputData ? (
                  <div className="h-full overflow-auto rounded-lg border border-border/50 bg-muted/10 p-3">
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="rounded-md border bg-background/70 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground uppercase">Criadas</p>
                        <p className="text-sm font-semibold text-sky-700">{throughputTotals.criadas}</p>
                      </div>
                      <div className="rounded-md border bg-background/70 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground uppercase">Concluídas</p>
                        <p className="text-sm font-semibold text-emerald-700">{throughputTotals.concluidas}</p>
                      </div>
                      <div className="rounded-md border bg-background/70 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground uppercase">Backlog</p>
                        <p className="text-sm font-semibold text-amber-700">{throughputTotals.backlog}</p>
                      </div>
                    </div>

                    <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500/90" /> Criadas (no período pontual)</span>
                      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/90" /> Concluídas (no período pontual)</span>
                      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/90" /> Backlog (saldo acumulado)</span>
                    </div>

                    <div className="space-y-2">
                      {throughputView.length === 0 && (
                        <p className="text-xs text-muted-foreground">Sem movimentação relevante no período selecionado.</p>
                      )}
                      {throughputView.map((row) => (
                        <div key={row.key}>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{row.label}</span>
                            <span>
                              Criadas: {row.criadas} • Concluídas: {row.concluidas} • Backlog acumulado: {row.backlog}
                            </span>
                          </div>
                          <div className="mt-1 flex h-2 rounded overflow-hidden bg-muted/60">
                            <div className="bg-sky-500/85" style={{ width: `${(row.criadas / maxThroughput) * 100}%` }} />
                            <div className="bg-emerald-500/85" style={{ width: `${(row.concluidas / maxThroughput) * 100}%` }} />
                            <div className="bg-amber-500/85" style={{ width: `${(row.backlog / maxThroughput) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-full rounded-lg border border-dashed border-border/70 bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
                    Sem variação suficiente no período para desenhar tendência.
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Insight: {ritmoInsight}</p>
            </Card>

            <Card className="p-4 min-h-[430px] flex flex-col">
              <div className="flex items-center gap-2 mb-4"><Gauge className="w-4 h-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Status dos projetos</h2></div>
              <div className="h-52">
                {hasStatusData ? (
                  <div className="h-full overflow-auto rounded-lg border border-border/50 bg-muted/10 p-3">
                    <div className="grid grid-cols-1 md:grid-cols-[170px,1fr] gap-3 items-start">
                      <div className="flex flex-col items-center">
                        <div className="relative w-[150px] h-[150px] rounded-full" style={{ backgroundImage: statusConic }}>
                          <div className="absolute inset-[22px] rounded-full bg-card flex flex-col items-center justify-center border">
                            <p className="text-3xl font-semibold text-foreground">{statusTotalProjects}</p>
                            <p className="text-xs text-muted-foreground">projetos</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {statusDistribution.map((row) => (
                          <div key={row.name} className="grid grid-cols-[120px,1fr,56px,70px] items-center gap-2 text-xs">
                            <div className="truncate flex items-center gap-1.5">
                              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: row.color }} />
                              <span>{row.name}</span>
                            </div>
                            <div className="h-2.5 rounded bg-muted/60 overflow-hidden">
                              <div className="h-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                            </div>
                            <span className="text-right font-medium">{row.pct.toFixed(1)}%</span>
                            <span className="text-right text-muted-foreground">{row.value} proj.</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full rounded-lg border border-dashed border-border/70 bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
                    Sem dados de status para o filtro atual.
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1.5 max-h-28 overflow-auto pr-1">
                {dashboardData.statusData.map((row) => (
                  <div key={row.name} className="text-xs flex items-center justify-between gap-2">
                    <span className="truncate">{row.name}</span>
                    <span className="text-muted-foreground">{row.value} proj. • {row.completion.toFixed(0)}% concl. • {row.overdue} atrasos</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Insight: {statusInsight}</p>
            </Card>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="p-4 min-h-[510px] flex flex-col">
              <div className="flex items-center gap-2 mb-4"><Users className="w-4 h-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Capacidade por responsável (todos)</h2></div>
              <div className="h-64">
                {hasCapacityData ? (
                  <div className="h-full overflow-auto rounded-lg border border-border/50 bg-muted/10 p-3">
                    <p className="text-[11px] text-muted-foreground">Status por responsável (colunas empilhadas)</p>
                    <div className="mt-2 flex gap-2 flex-wrap text-[10px]">
                      {dashboardData.kanbanColumns.map((column) => (
                        <span key={column.key} className="inline-flex items-center gap-1 text-muted-foreground">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: column.color }} />
                          {column.title}
                        </span>
                      ))}
                    </div>

                    <div className="mt-3 h-[190px] overflow-auto">
                      <div className="min-w-[860px] h-full px-2 pb-5 flex items-end gap-2 border-b border-border/60">
                        {dashboardData.responsibleStatusStacks.map((row) => (
                          <div key={row.name} className="w-[74px] shrink-0 flex flex-col items-center gap-1">
                            <div className="w-full h-[150px] rounded-sm bg-muted/40 border border-border/40 flex flex-col justify-end overflow-hidden">
                              {dashboardData.kanbanColumns.map((column) => {
                                const value = row.columns[column.key] || 0;
                                if (value <= 0) return null;
                                return (
                                  <div
                                    key={`${row.name}-${column.key}`}
                                    title={`${row.name} • ${column.title}: ${value}`}
                                    style={{
                                      height: `${(value / maxResponsibleTotal) * 100}%`,
                                      backgroundColor: column.color,
                                    }}
                                  />
                                );
                              })}
                            </div>
                            <div className="text-[10px] text-muted-foreground text-center leading-tight w-full truncate" title={row.name}>{row.name}</div>
                            <div className="text-[10px] text-foreground font-medium">{row.total}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full rounded-lg border border-dashed border-border/70 bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
                    Sem dados de capacidade para o filtro atual.
                  </div>
                )}
              </div>
              {!presentationMode && <div className="mt-3 max-h-40 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-2 py-1">Responsável</th>
                      <th className="text-left px-2 py-1">Setor</th>
                      <th className="text-right px-2 py-1">Prod.</th>
                      <th className="text-right px-2 py-1">Atraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.capacityData.map((row) => (
                      <tr key={row.name} className="border-t">
                        <td className="px-2 py-1.5 truncate max-w-[120px]">{row.name}</td>
                        <td className="px-2 py-1.5 truncate max-w-[110px] text-muted-foreground">{row.sector}</td>
                        <td className="px-2 py-1.5 text-right">{row.produtividade.toFixed(0)}%</td>
                        <td className="px-2 py-1.5 text-right">{row.atrasadas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
              <p className="mt-3 text-xs text-muted-foreground">Insight: {capacidadeInsight}</p>
            </Card>

            <Card className="p-4 min-h-[510px] flex flex-col">
              <div className="flex items-center gap-2 mb-4"><CalendarClock className="w-4 h-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Risco e decisões imediatas</h2></div>

              <div className="space-y-3 mb-4">
                {dashboardData.decisionItems.map((item) => (
                  <div key={item.title} className="p-3 rounded-lg border bg-muted/30 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.action}</p>
                    </div>
                    <Badge variant={item.severity === 'high' ? 'destructive' : item.severity === 'medium' ? 'secondary' : 'outline'}>
                      {item.value}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Projetos mais críticos</p>
                <div className="space-y-2">
                  {dashboardData.criticalProjects.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum projeto crítico pelo critério atual.</p>
                  )}
                  {dashboardData.criticalProjects.map((project) => (
                    <div key={project.id} className="flex items-center justify-between text-sm">
                      <span className="truncate pr-2">{project.title}</span>
                      <Badge variant={project.riskScore >= 60 ? 'destructive' : 'secondary'}>
                        risco {project.riskScore}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 border-t pt-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Setores com maior pressão</p>
                <div className="space-y-2 max-h-28 overflow-auto">
                  {dashboardData.sectorData.map((row) => (
                    <div key={row.sector} className="flex items-center justify-between text-sm">
                      <span className="truncate pr-2">{row.sector}</span>
                      <span className="text-xs text-muted-foreground">{row.abertas + row.concluidas} itens • {row.atrasadas} atrasados</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Insight: {riscoInsight}</p>
            </Card>
          </section>

          {!presentationMode && <section className="text-xs text-muted-foreground flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            LAB ativo com dados reais e critérios experimentais. Após validação com diretoria e gerentes, consolidamos a versão oficial.
          </section>}
        </>
      )}
    </main>
  );
}
