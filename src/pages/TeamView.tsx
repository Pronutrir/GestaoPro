import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Users, Clock, CheckCircle2, AlertTriangle, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Activity {
  id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  project_id: string;
  hours: number;
  end_date: string | null;
  priority: string;
}

interface Project {
  id: string;
  title: string;
}

interface TimeEntry {
  activity_id: string;
  duration_minutes: number | null;
  user_name: string | null;
  project_id: string;
}

const TeamView = () => {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [actRes, projRes, timeRes] = await Promise.all([
        supabase.from("activities").select("id, title, status, assigned_to, project_id, hours, end_date, priority"),
        supabase.from("projects").select("id, title"),
        supabase.from("time_entries").select("activity_id, duration_minutes, user_name, project_id"),
      ]);
      if (actRes.data) setActivities(actRes.data);
      if (projRes.data) setProjects(projRes.data);
      if (timeRes.data) setTimeEntries(timeRes.data);
      setIsLoading(false);
    };
    fetchData();
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const teamMembers = useMemo(() => {
    const members = new Map<string, {
      name: string;
      totalTasks: number;
      completedTasks: number;
      overdueTasks: number;
      highPriority: number;
      hoursEstimated: number;
      hoursTracked: number;
      projects: Set<string>;
    }>();

    activities.forEach(a => {
      const name = a.assigned_to?.trim();
      if (!name) return;
      if (!members.has(name)) {
        members.set(name, { name, totalTasks: 0, completedTasks: 0, overdueTasks: 0, highPriority: 0, hoursEstimated: 0, hoursTracked: 0, projects: new Set() });
      }
      const m = members.get(name)!;
      m.totalTasks++;
      if (a.status === "completed") m.completedTasks++;
      if (a.status !== "completed" && a.end_date && new Date(a.end_date) < today) m.overdueTasks++;
      if (a.priority === "high" && a.status !== "completed") m.highPriority++;
      m.hoursEstimated += a.hours || 0;
      m.projects.add(a.project_id);
    });

    timeEntries.forEach(te => {
      const name = te.user_name?.trim();
      if (!name || !members.has(name)) return;
      members.get(name)!.hoursTracked += (te.duration_minutes || 0) / 60;
    });

    return Array.from(members.values()).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [activities, timeEntries]);

  const unassigned = activities.filter(a => !a.assigned_to?.trim());

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="w-5 h-5" /></Button>
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Visão por Equipe</h1>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Membros</p>
            <p className="text-3xl font-bold text-foreground">{teamMembers.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Tarefas Atribuídas</p>
            <p className="text-3xl font-bold text-foreground">{activities.filter(a => a.assigned_to?.trim()).length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Sem Responsável</p>
            <p className="text-3xl font-bold text-warning">{unassigned.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Horas Registradas</p>
            <p className="text-3xl font-bold text-info">{(timeEntries.reduce((s, t) => s + (t.duration_minutes || 0), 0) / 60).toFixed(0)}h</p>
          </Card>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Carregando...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamMembers.map(member => {
              const completionRate = member.totalTasks > 0 ? (member.completedTasks / member.totalTasks) * 100 : 0;
              return (
                <Card key={member.name} className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">{member.name.substring(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{member.name}</h3>
                      <p className="text-xs text-muted-foreground">{member.projects.size} projeto(s)</p>
                    </div>
                    {member.overdueTasks > 0 && (
                      <Badge className="bg-destructive/20 text-destructive text-xs">{member.overdueTasks} atrasada(s)</Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-medium text-foreground">{completionRate.toFixed(0)}%</span>
                    </div>
                    <Progress value={completionRate} className="h-2" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <span className="text-muted-foreground">{member.completedTasks}/{member.totalTasks}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-info" />
                      <span className="text-muted-foreground">{member.hoursTracked.toFixed(0)}h / {member.hoursEstimated}h</span>
                    </div>
                    {member.highPriority > 0 && (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <span className="text-muted-foreground">{member.highPriority} alta</span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeamView;
