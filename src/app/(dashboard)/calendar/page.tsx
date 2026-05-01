'use client';
import { useEffect, useMemo, useState } from "react";
import { Calendar as BigCalendar, dateFnsLocalizer, View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';
import { useAuth } from "@/contexts/AuthContext";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { Card } from "@/components/ui/card";
import { isHoliday, isOnVacation, type Holiday, type WorkSchedule } from "@/lib/workCalendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const locales = { "pt-BR": ptBR };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }), getDay, locales });
const DnDCalendar = withDragAndDrop(BigCalendar as any);

interface ActivityRow {
  id: string; title: string; start_date: string | null; end_date: string | null;
  assigned_to: string | null; project_id: string; status: string;
}
interface CalEvent {
  id: string; title: string; start: Date; end: Date;
  resource: { project_id: string; assigned_to: string | null; status: string; category: string | null };
}

const Calendario = () => {
  const { profile } = useAuth();
  const { filterProjects } = useProjectAccess();
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [projects, setProjects] = useState<{ id: string; title: string; category: string | null }[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [schedule, setSchedule] = useState<WorkSchedule | undefined>();
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState<Date>(new Date());

  const fetchAll = async () => {
    const [actsRes, projsRes, holsRes, schedRes] = await Promise.all([
      supabase.from("activities").select("id,title,start_date,end_date,assigned_to,project_id,status").not("start_date","is",null).not("end_date","is",null).eq("is_trashed", false),
      supabase.from("projects").select("id,title,category").eq("is_trashed", false),
      supabase.from("holidays").select("date,name").order("date"),
      profile?.id ? supabase.from("user_work_schedules").select("*").eq("user_id", profile.id).maybeSingle() : Promise.resolve({ data: null } as any),
    ]);
    const filteredProjects = await filterProjects((projsRes.data || []) as any);
    const allowedIds = new Set(filteredProjects.map((p: any) => p.id));
    setProjects(filteredProjects as any);
    setActivities(((actsRes.data || []) as ActivityRow[]).filter(a => allowedIds.has(a.project_id)));
    setHolidays((holsRes.data || []) as Holiday[]);
    if (schedRes && (schedRes as any).data) setSchedule((schedRes as any).data as WorkSchedule);
  };

  useEffect(() => { fetchAll(); }, [profile?.id]);

  const projMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const events = useMemo<CalEvent[]>(() => {
    return activities
      .filter(a => projMap.get(a.project_id)?.category !== "qualidade")
      .map(a => ({
        id: a.id, title: a.title,
        start: parseISO(a.start_date!), end: parseISO(a.end_date!),
        resource: { project_id: a.project_id, assigned_to: a.assigned_to, status: a.status, category: projMap.get(a.project_id)?.category ?? null },
      }));
  }, [activities, projMap]);

  const dayPropGetter = (d: Date) => {
    const h = isHoliday(d, holidays);
    if (h) return { style: { backgroundColor: "hsl(0 84% 60% / 0.08)" }, className: "rbc-holiday" };
    if (isOnVacation(d, schedule)) return { style: { backgroundColor: "hsl(199 89% 48% / 0.08)" } };
    return {};
  };

  const onEventDrop = async ({ event, start, end }: any) => {
    const startDate = new Date(start);
    const h = isHoliday(startDate, holidays);
    if (h) { toast.error(`⚠️ Conflito: O dia ${format(startDate,"dd/MM")} é feriado: ${h.name}`); return; }
    if (isOnVacation(startDate, schedule)) { toast.error("⚠️ Conflito"); return; }
    const { error } = await supabase.from("activities").update({ start_date: format(startDate,"yyyy-MM-dd"), end_date: format(new Date(end),"yyyy-MM-dd") }).eq("id", event.id);
    if (error) { toast.error("Erro"); return; }
    toast.success(`Reagendado: ${event.title} → ${format(startDate,"dd/MM")}`);  
    fetchAll();
  };

  const eventPropGetter = (e: any) => {
    const status = e.resource?.status;
    const bg = status === "completed" ? "hsl(142 76% 36%)" : status === "in_progress" ? "hsl(220 90% 56%)" : "hsl(38 92% 50%)";
    return { style: { backgroundColor: bg, border: "none", borderRadius: 6, fontSize: 12 } };
  };

  return (
          <div className="p-6 space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-4 mb-3 text-xs">
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-success"/>Concluída</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary"/>Em andamento</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-warning"/>Pendente</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/40"/>Feriado</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-sky-500/20 border border-sky-500/40"/>Férias</span>
          </div>
          <div style={{ height: "calc(100vh - 280px)", minHeight: 480 }}>
            <DnDCalendar
              localizer={localizer}
              events={events}
              startAccessor="start" endAccessor="end"
              view={view} onView={setView as any}
              date={date} onNavigate={setDate as any}
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
    
  );
};

export default Calendario;
