import { useEffect, useMemo, useState } from "react";
import { Calendar as BigCalendar, dateFnsLocalizer, View, SlotInfo } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { isHoliday, isOnVacation, type Holiday, type WorkSchedule } from "@/lib/workCalendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const locales = { "pt-BR": ptBR };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }), getDay, locales });
const DnDCalendar = withDragAndDrop(BigCalendar as any);

interface ActivityEvent {
  id: string; title: string; start: Date; end: Date;
  resource: { project_id: string; assigned_to: string | null; status: string; category: string | null };
}

const Calendario = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [schedule, setSchedule] = useState<WorkSchedule | undefined>();
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState<Date>(new Date());

  const fetchAll = async () => {
    const [actsRes, projsRes, holsRes, schedRes] = await Promise.all([
      supabase.from("activities").select("id,title,start_date,end_date,assigned_to,project_id,status").not("start_date","is",null).not("end_date","is",null),
      supabase.from("projects").select("id,category"),
      supabase.from("holidays").select("date,name").order("date"),
      profile?.id ? supabase.from("user_work_schedules").select("*").eq("user_id", profile.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const projMap = new Map((projsRes.data || []).map(p => [p.id, p.category]));
    const evts: ActivityEvent[] = (actsRes.data || [])
      .filter(a => projMap.get(a.project_id) !== "qualidade")
      .map(a => ({
        id: a.id,
        title: a.title,
        start: parseISO(a.start_date!),
        end: parseISO(a.end_date!),
        resource: { project_id: a.project_id, assigned_to: a.assigned_to, status: a.status, category: projMap.get(a.project_id) ?? null },
      }));
    setEvents(evts);
    setHolidays((holsRes.data || []) as Holiday[]);
    if (schedRes && (schedRes as any).data) setSchedule((schedRes as any).data as WorkSchedule);
  };

  useEffect(() => { fetchAll(); }, [profile?.id]);

  // dayPropGetter — destaca feriados e férias
  const dayPropGetter = (d: Date) => {
    const h = isHoliday(d, holidays);
    if (h) return { style: { backgroundColor: "hsl(0 84% 60% / 0.08)" }, className: "rbc-holiday" };
    if (isOnVacation(d, schedule)) return { style: { backgroundColor: "hsl(199 89% 48% / 0.08)" } };
    return {};
  };

  const onEventDrop = async ({ event, start, end }: any) => {
    // Conflito: feriado/férias?
    const startDate = new Date(start);
    const h = isHoliday(startDate, holidays);
    if (h) {
      toast({ title: "⚠️ Conflito", description: `O dia ${format(startDate,"dd/MM")} é feriado: ${h.name}`, variant: "destructive" });
      return;
    }
    if (isOnVacation(startDate, schedule)) {
      toast({ title: "⚠️ Conflito", description: "Período de férias do responsável", variant: "destructive" });
      return;
    }
    const newStart = format(startDate, "yyyy-MM-dd");
    const newEnd = format(new Date(end), "yyyy-MM-dd");
    const { error } = await supabase.from("activities").update({ start_date: newStart, end_date: newEnd }).eq("id", event.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Reagendado", description: `${event.title} → ${format(startDate,"dd/MM")}` });
    fetchAll();
  };

  const eventPropGetter = (e: any) => {
    const status = e.resource?.status;
    const bg = status === "completed" ? "hsl(142 76% 36%)" : status === "in_progress" ? "hsl(220 90% 56%)" : "hsl(38 92% 50%)";
    return { style: { backgroundColor: bg, border: "none", borderRadius: 6, fontSize: 12 } };
  };

  return (
    <AppLayout title="Calendário">
      <div className="p-6 space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-4 mb-3 text-xs">
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-success"/>Concluída</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary"/>Em andamento</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-warning"/>Pendente</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/40"/>Feriado</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-sky-500/20 border border-sky-500/40"/>Férias</span>
          </div>
          <div style={{ height: "calc(100vh - 240px)" }}>
            <DnDCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              view={view}
              onView={setView as any}
              date={date}
              onNavigate={setDate as any}
              views={["month","week","day","agenda"]}
              dayPropGetter={dayPropGetter}
              eventPropGetter={eventPropGetter}
              onEventDrop={onEventDrop}
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
    </AppLayout>
  );
};

export default Calendario;
