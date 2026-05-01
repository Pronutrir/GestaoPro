'use client';
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
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState<Date>(new Date());

  useEffect(() => {
    Promise.all([
      supabase.from("holidays").select("date,name").order("date"),
      profile?.id ? supabase.from("user_work_schedules").select("*").eq("user_id", profile.id).maybeSingle() : Promise.resolve({ data: null } as any),
    ]).then(([hols, sched]) => {
      setHolidays((hols.data || []) as Holiday[]);
      if (sched && (sched as any).data) setSchedule((sched as any).data as WorkSchedule);
    });
  }, [profile?.id, projectId]);

  const events = useMemo<CalEvent[]>(() => {
    return activities
      .filter(a => a.start_date && a.end_date)
      .map(a => ({
        id: a.id, title: a.title,
        start: parseISO(a.start_date!), end: parseISO(a.end_date!),
        resource: { status: a.status, assigned_to: a.assigned_to },
      }));
  }, [activities]);

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
      <Card className="p-4">
        <div className="flex items-center gap-4 mb-3 text-xs">
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-success" />Concluída</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary" />Em andamento</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-warning" />Pendente</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/40" />Feriado</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-sky-500/20 border border-sky-500/40" />Férias</span>
        </div>
        <div style={{ height: "calc(100vh - 340px)", minHeight: 480 }}>
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
