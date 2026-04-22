import { useEffect, useMemo, useState } from "react";
import { Calendar as BigCalendar, dateFnsLocalizer, View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { isHoliday, isOnVacation, type Holiday, type WorkSchedule } from "@/lib/workCalendar";
import { CalendarFilters, emptyFilters, type CalendarFiltersValue, type FilterOption } from "@/components/calendar/CalendarFilters";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const locales = { "pt-BR": ptBR };
const localizer = dateFnsLocalizer({
  format, parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }),
  getDay, locales,
});
const DnDCalendar = withDragAndDrop(BigCalendar as any);

interface Activity {
  id: string; title: string; status: string;
  start_date: string | null; end_date: string | null;
  assigned_to: string | null;
  phase_id?: string | null; priority?: string;
  tags?: string[] | null; participants?: string[] | null;
  workflow_stage_id?: string | null;
}
interface Props {
  projectId: string;
  activities: Activity[];
  onEditActivity: (activityId: string) => void;
  onDataChanged: () => void;
}

interface CalEvent {
  id: string; title: string; start: Date; end: Date;
  resource: { status: string; assigned_to: string | null };
}

export const ProjectCalendarView = ({ projectId, activities, onEditActivity, onDataChanged }: Props) => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [schedule, setSchedule] = useState<WorkSchedule | undefined>();
  const [phases, setPhases] = useState<{ id: string; title: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; title: string }[]>([]);
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState<Date>(new Date());
  const [filters, setFilters] = useState<CalendarFiltersValue>(emptyFilters());

  useEffect(() => {
    Promise.all([
      supabase.from("holidays").select("date,name").order("date"),
      supabase.from("phases").select("id,title").eq("project_id", projectId),
      supabase.from("workflow_stages").select("id,title").eq("project_id", projectId),
      profile?.id ? supabase.from("user_work_schedules").select("*").eq("user_id", profile.id).maybeSingle() : Promise.resolve({ data: null } as any),
    ]).then(([hols, ph, st, sched]) => {
      setHolidays((hols.data || []) as Holiday[]);
      setPhases((ph.data || []) as any);
      setStages((st.data || []) as any);
      if (sched && (sched as any).data) setSchedule((sched as any).data as WorkSchedule);
    });
  }, [profile?.id, projectId]);

  const options = useMemo(() => {
    const owners = new Set<string>(), participants = new Set<string>(), tags = new Set<string>();
    activities.forEach(a => {
      if (a.assigned_to) owners.add(a.assigned_to);
      (a.participants || []).forEach(p => participants.add(p));
      (a.tags || []).forEach(t => tags.add(t));
    });
    const opt = (s: Set<string>): FilterOption[] => Array.from(s).sort().map(v => ({ value: v, label: v }));
    return {
      phases: phases.map(p => ({ value: p.id, label: p.title })),
      owners: opt(owners), participants: opt(participants), tags: opt(tags),
      statuses: [
        { value: "pending", label: "Pendente" },
        { value: "in_progress", label: "Em Andamento" },
        { value: "completed", label: "Concluída" },
      ],
      priorities: [
        { value: "low", label: "Baixa" }, { value: "medium", label: "Média" },
        { value: "high", label: "Alta" }, { value: "critical", label: "Crítica" },
      ],
      workflowStages: stages.map(s => ({ value: s.id, label: s.title })),
    };
  }, [activities, phases, stages]);

  const events = useMemo<CalEvent[]>(() => {
    return activities
      .filter(a => a.start_date && a.end_date)
      .filter(a => {
        const f = filters;
        if (f.phases.length && (!a.phase_id || !f.phases.includes(a.phase_id))) return false;
        if (f.owners.length && (!a.assigned_to || !f.owners.includes(a.assigned_to))) return false;
        if (f.participants.length && !(a.participants || []).some(p => f.participants.includes(p))) return false;
        if (f.statuses.length && !f.statuses.includes(a.status)) return false;
        if (f.priorities.length && !f.priorities.includes(a.priority || "medium")) return false;
        if (f.tags.length && !(a.tags || []).some(t => f.tags.includes(t))) return false;
        if (f.workflowStages.length && (!a.workflow_stage_id || !f.workflowStages.includes(a.workflow_stage_id))) return false;
        if (f.search && !a.title.toLowerCase().includes(f.search.toLowerCase())) return false;
        const s = parseISO(a.start_date!), e = parseISO(a.end_date!);
        if (f.dateFrom && e < f.dateFrom) return false;
        if (f.dateTo && s > f.dateTo) return false;
        return true;
      })
      .map(a => ({
        id: a.id, title: a.title,
        start: parseISO(a.start_date!), end: parseISO(a.end_date!),
        resource: { status: a.status, assigned_to: a.assigned_to },
      }));
  }, [activities, filters]);

  const dayPropGetter = (d: Date) => {
    const h = isHoliday(d, holidays);
    if (h) return { style: { backgroundColor: "hsl(0 84% 60% / 0.08)" } };
    if (isOnVacation(d, schedule)) return { style: { backgroundColor: "hsl(199 89% 48% / 0.08)" } };
    return {};
  };

  const eventPropGetter = (e: any) => {
    const status = e.resource?.status;
    const bg = status === "completed" ? "hsl(142 76% 36%)" : status === "in_progress" ? "hsl(220 90% 56%)" : "hsl(38 92% 50%)";
    return { style: { backgroundColor: bg, border: "none", borderRadius: 6, fontSize: 12 } };
  };

  const onEventDrop = async ({ event, start, end }: any) => {
    const startDate = new Date(start);
    const h = isHoliday(startDate, holidays);
    if (h) { toast({ title: "⚠️ Conflito", description: `${format(startDate, "dd/MM")} é feriado: ${h.name}`, variant: "destructive" }); return; }
    if (isOnVacation(startDate, schedule)) { toast({ title: "⚠️ Conflito", description: "Período de férias do responsável", variant: "destructive" }); return; }
    const { error } = await supabase.from("activities").update({ start_date: format(startDate, "yyyy-MM-dd"), end_date: format(new Date(end), "yyyy-MM-dd") }).eq("id", event.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Reagendado", description: `${event.title} → ${format(startDate, "dd/MM")}` });
    onDataChanged();
  };

  return (
    <div className="space-y-3">
      <CalendarFilters value={filters} onChange={setFilters} options={options} />
      <Card className="p-4">
        <div className="flex items-center gap-4 mb-3 text-xs">
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-success" />Concluída</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary" />Em andamento</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-warning" />Pendente</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/40" />Feriado</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-sky-500/20 border border-sky-500/40" />Férias</span>
        </div>
        <div style={{ height: "calc(100vh - 420px)", minHeight: 480 }}>
          <DnDCalendar
            localizer={localizer}
            events={events}
            startAccessor="start" endAccessor="end"
            view={view} onView={setView as any}
            date={date} onNavigate={setDate as any}
            views={["month", "week", "day", "agenda"]}
            dayPropGetter={dayPropGetter}
            eventPropGetter={eventPropGetter}
            onEventDrop={onEventDrop}
            onSelectEvent={(e: any) => onEditActivity(e.id)}
            draggableAccessor={() => true}
            messages={{
              next: "Próximo", previous: "Anterior", today: "Hoje",
              month: "Mês", week: "Semana", day: "Dia", agenda: "Agenda",
              date: "Data", time: "Hora", event: "Atividade", noEventsInRange: "Nenhuma atividade neste período",
            }}
            culture="pt-BR"
          />
        </div>
      </Card>
    </div>
  );
};
