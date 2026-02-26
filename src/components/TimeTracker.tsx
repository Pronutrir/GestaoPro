import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Square, Clock, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TimeEntry {
  id: string;
  activity_id: string;
  project_id: string;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  user_name: string | null;
  created_at: string;
}

interface Activity {
  id: string;
  title: string;
}

interface TimeTrackerProps {
  projectId: string;
  activities: Activity[];
}

export const TimeTracker = ({ projectId, activities }: TimeTrackerProps) => {
  const { toast } = useToast();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [description, setDescription] = useState("");
  const [userName, setUserName] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchEntries();
  }, [projectId]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from("time_entries")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) setEntries(data);
  };

  const handleStart = async () => {
    if (!selectedActivityId) {
      toast({ title: "Selecione uma atividade", variant: "destructive" });
      return;
    }

    const { data, error } = await supabase
      .from("time_entries")
      .insert({
        activity_id: selectedActivityId,
        project_id: projectId,
        started_at: new Date().toISOString(),
        description: description || null,
        user_name: userName || null,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao iniciar timer", variant: "destructive" });
      return;
    }

    setActiveEntryId(data.id);
    setIsRunning(true);
    setElapsed(0);
  };

  const handleStop = async () => {
    if (!activeEntryId) return;

    const endedAt = new Date().toISOString();
    const durationMinutes = Math.round(elapsed / 60);

    await supabase
      .from("time_entries")
      .update({ ended_at: endedAt, duration_minutes: durationMinutes })
      .eq("id", activeEntryId);

    setIsRunning(false);
    setActiveEntryId(null);
    setElapsed(0);
    setDescription("");
    fetchEntries();
  };

  const handleManualEntry = async () => {
    if (!selectedActivityId) {
      toast({ title: "Selecione uma atividade", variant: "destructive" });
      return;
    }

    const totalMinutes = (parseInt(manualHours) || 0) * 60 + (parseInt(manualMinutes) || 0);
    if (totalMinutes <= 0) {
      toast({ title: "Informe um tempo válido", variant: "destructive" });
      return;
    }

    const now = new Date();
    const startedAt = new Date(now.getTime() - totalMinutes * 60000);

    await supabase.from("time_entries").insert({
      activity_id: selectedActivityId,
      project_id: projectId,
      started_at: startedAt.toISOString(),
      ended_at: now.toISOString(),
      duration_minutes: totalMinutes,
      description: description || null,
      user_name: userName || null,
    });

    setManualHours("");
    setManualMinutes("");
    setDescription("");
    setShowManualForm(false);
    fetchEntries();
    toast({ title: "Tempo registrado!" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    await supabase.from("time_entries").delete().eq("id", id);
    fetchEntries();
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const totalMinutes = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Time Tracking
        </h3>
        <Badge variant="secondary">{totalHours}h registradas</Badge>
      </div>

      {/* Timer Controls */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <select
            className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedActivityId}
            onChange={(e) => setSelectedActivityId(e.target.value)}
            disabled={isRunning}
          >
            <option value="">Selecione a atividade</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
          <Input
            placeholder="Seu nome"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="max-w-[120px]"
            disabled={isRunning}
          />
        </div>

        <div className="flex gap-2 items-center">
          <Input
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1"
            disabled={isRunning}
          />
          {isRunning ? (
            <>
              <span className="text-2xl font-mono font-bold text-primary min-w-[100px] text-center">
                {formatTime(elapsed)}
              </span>
              <Button variant="destructive" size="icon" onClick={handleStop}>
                <Square className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" onClick={handleStart} className="bg-success hover:bg-success/90">
                <Play className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManualForm(!showManualForm)}
                className="gap-1"
              >
                <Plus className="w-3 h-3" /> Manual
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Manual Entry Form */}
      {showManualForm && (
        <div className="flex gap-2 items-end p-3 bg-accent/30 rounded-lg">
          <div>
            <label className="text-xs text-muted-foreground">Horas</label>
            <Input
              type="number"
              min="0"
              value={manualHours}
              onChange={(e) => setManualHours(e.target.value)}
              className="w-20"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Minutos</label>
            <Input
              type="number"
              min="0"
              max="59"
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
              className="w-20"
            />
          </div>
          <Button size="sm" onClick={handleManualEntry}>Registrar</Button>
        </div>
      )}

      {/* Entries List */}
      {entries.length > 0 && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {entries.map((entry) => {
            const activityTitle = activities.find((a) => a.id === entry.activity_id)?.title || "—";
            return (
              <div key={entry.id} className="flex items-center justify-between p-2 bg-accent/20 rounded-lg text-sm group">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{activityTitle}</p>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    {entry.user_name && <span>👤 {entry.user_name}</span>}
                    {entry.description && <span>· {entry.description}</span>}
                    <span>· {new Date(entry.started_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {entry.duration_minutes ? `${Math.floor(entry.duration_minutes / 60)}h${entry.duration_minutes % 60}m` : "em andamento"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
