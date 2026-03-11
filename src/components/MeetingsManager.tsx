import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  MapPin,
  CheckSquare,
  Zap,
  X,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Meeting {
  id: string;
  project_id: string;
  phase_id: string | null;
  title: string;
  meeting_date: string | null;
  location: string | null;
  agenda: string | null;
  minutes: string | null;
  participants: string[];
  created_at: string;
}

interface MeetingDecision {
  id: string;
  meeting_id: string;
  description: string;
}

interface MeetingAction {
  id: string;
  meeting_id: string;
  description: string;
  assigned_to: string | null;
  due_date: string | null;
  activity_id: string | null;
  is_completed: boolean;
}

interface Phase {
  id: string;
  title: string;
}

interface MeetingsManagerProps {
  projectId: string;
  phases: Phase[];
  onCreateActivity?: (title: string, assignedTo?: string) => Promise<void>;
}

export const MeetingsManager = ({ projectId, phases, onCreateActivity }: MeetingsManagerProps) => {
  const { toast } = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, MeetingDecision[]>>({});
  const [actions, setActions] = useState<Record<string, MeetingAction[]>>({});
  const [newDecision, setNewDecision] = useState("");
  const [newAction, setNewAction] = useState({ description: "", assigned_to: "", due_date: "" });
  const [newParticipant, setNewParticipant] = useState("");

  const [form, setForm] = useState({
    title: "",
    meeting_date: "",
    start_time: "",
    end_time: "",
    location: "",
    agenda: "",
    minutes: "",
    phase_id: "",
    participants: [] as string[],
  });

  useEffect(() => {
    fetchMeetings();
  }, [projectId]);

  const fetchMeetings = async () => {
    const { data } = await supabase
      .from("meetings")
      .select("*")
      .eq("project_id", projectId)
      .order("meeting_date", { ascending: false });
    if (data) setMeetings(data);
  };

  const fetchDetails = async (meetingId: string) => {
    const [{ data: dec }, { data: act }] = await Promise.all([
      supabase.from("meeting_decisions").select("*").eq("meeting_id", meetingId).order("created_at"),
      supabase.from("meeting_actions").select("*").eq("meeting_id", meetingId).order("created_at"),
    ]);
    setDecisions((prev) => ({ ...prev, [meetingId]: dec || [] }));
    setActions((prev) => ({ ...prev, [meetingId]: act || [] }));
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      fetchDetails(id);
    }
  };

  const resetForm = () => {
    setForm({ title: "", meeting_date: "", start_time: "", end_time: "", location: "", agenda: "", minutes: "", phase_id: "", participants: [] });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast({ title: "Informe o título", variant: "destructive" });
      return;
    }

    const payload = {
      project_id: projectId,
      title: form.title,
      meeting_date: form.meeting_date || null,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location || null,
      agenda: form.agenda || null,
      minutes: form.minutes || null,
      phase_id: form.phase_id || null,
      participants: form.participants,
    };

    if (editingId) {
      const { error } = await supabase.from("meetings").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); return; }
      toast({ title: "Reunião atualizada!" });
    } else {
      const { error } = await supabase.from("meetings").insert(payload);
      if (error) { toast({ title: "Erro ao criar", variant: "destructive" }); return; }
      toast({ title: "Reunião criada!" });
    }
    resetForm();
    fetchMeetings();
  };

  const handleEdit = (m: Meeting) => {
    setForm({
      title: m.title,
      meeting_date: m.meeting_date ? m.meeting_date.slice(0, 16) : "",
      start_time: (m as any).start_time || "",
      end_time: (m as any).end_time || "",
      location: m.location || "",
      agenda: m.agenda || "",
      minutes: m.minutes || "",
      phase_id: m.phase_id || "",
      participants: m.participants || [],
    });
    setEditingId(m.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta reunião?")) return;
    await supabase.from("meetings").delete().eq("id", id);
    fetchMeetings();
  };

  const addParticipant = () => {
    if (newParticipant.trim() && !form.participants.includes(newParticipant.trim())) {
      setForm({ ...form, participants: [...form.participants, newParticipant.trim()] });
      setNewParticipant("");
    }
  };

  const removeParticipant = (p: string) => {
    setForm({ ...form, participants: form.participants.filter((x) => x !== p) });
  };

  const handleAddDecision = async (meetingId: string) => {
    if (!newDecision.trim()) return;
    await supabase.from("meeting_decisions").insert({ meeting_id: meetingId, description: newDecision.trim() });
    setNewDecision("");
    fetchDetails(meetingId);
  };

  const handleDeleteDecision = async (id: string, meetingId: string) => {
    await supabase.from("meeting_decisions").delete().eq("id", id);
    fetchDetails(meetingId);
  };

  const handleAddAction = async (meetingId: string) => {
    if (!newAction.description.trim()) return;
    await supabase.from("meeting_actions").insert({
      meeting_id: meetingId,
      description: newAction.description.trim(),
      assigned_to: newAction.assigned_to || null,
      due_date: newAction.due_date || null,
    });
    setNewAction({ description: "", assigned_to: "", due_date: "" });
    fetchDetails(meetingId);
  };

  const handleToggleAction = async (action: MeetingAction, meetingId: string) => {
    await supabase.from("meeting_actions").update({ is_completed: !action.is_completed }).eq("id", action.id);
    fetchDetails(meetingId);
  };

  const handlePromoteToActivity = async (action: MeetingAction, meetingId: string) => {
    if (onCreateActivity) {
      await onCreateActivity(action.description, action.assigned_to || undefined);
      toast({ title: "Atividade criada no Kanban!" });
    }
  };

  const handleDeleteAction = async (id: string, meetingId: string) => {
    await supabase.from("meeting_actions").delete().eq("id", id);
    fetchDetails(meetingId);
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Reuniões
        </h3>
        <Button
          size="sm"
          variant={showForm ? "secondary" : "default"}
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
          className="gap-1"
        >
          <Plus className="w-4 h-4" />
          {showForm ? "Cancelar" : "Nova Reunião"}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 p-4 bg-accent/30 rounded-lg border border-border">
          <Input
            placeholder="Título da reunião *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Data</Label>
              <Input
                type="date"
                value={form.meeting_date ? form.meeting_date.slice(0, 10) : ""}
                onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Local / Link</Label>
              <Input
                placeholder="Sala 3 ou https://meet..."
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Horário de Início</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Horário de Término</Label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
          </div>
          {phases.length > 0 && (
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.phase_id}
              onChange={(e) => setForm({ ...form, phase_id: e.target.value })}
            >
              <option value="">Fase (opcional)</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          )}
          {/* Participants */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Participantes</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do participante"
                value={newParticipant}
                onChange={(e) => setNewParticipant(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addParticipant())}
                className="text-sm"
              />
              <Button size="sm" variant="outline" type="button" onClick={addParticipant}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            {form.participants.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.participants.map((p) => (
                  <Badge key={p} variant="secondary" className="gap-1 text-xs">
                    {p}
                    <button onClick={() => removeParticipant(p)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Textarea
            placeholder="Pauta"
            value={form.agenda}
            onChange={(e) => setForm({ ...form, agenda: e.target.value })}
            rows={2}
          />
          <Textarea
            placeholder="Ata / Registro"
            value={form.minutes}
            onChange={(e) => setForm({ ...form, minutes: e.target.value })}
            rows={3}
          />
          <Button onClick={handleSubmit}>{editingId ? "Atualizar" : "Criar Reunião"}</Button>
        </div>
      )}

      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma reunião registrada</p>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {meetings.map((meeting) => {
            const isExpanded = expandedId === meeting.id;
            const meetingDecisions = decisions[meeting.id] || [];
            const meetingActions = actions[meeting.id] || [];

            return (
              <div key={meeting.id} className="border border-border rounded-lg bg-card overflow-hidden">
                {/* Header */}
                <div
                  className="p-4 flex items-start justify-between cursor-pointer hover:bg-accent/20 transition-colors"
                  onClick={() => toggleExpand(meeting.id)}
                >
                  <div className="flex items-start gap-2">
                    {isExpanded ? <ChevronDown className="w-4 h-4 mt-0.5 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-muted-foreground" />}
                    <div>
                      <p className="font-medium text-foreground">{meeting.title}</p>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                        {meeting.meeting_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {new Date(meeting.meeting_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {meeting.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {meeting.location}
                          </span>
                        )}
                        {meeting.participants?.length > 0 && (
                          <span>{meeting.participants.length} participante(s)</span>
                        )}
                        {meeting.phase_id && (
                          <Badge variant="secondary" className="text-[10px]">
                            {phases.find((p) => p.id === meeting.phase_id)?.title}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(meeting)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(meeting.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    {/* Agenda */}
                    {meeting.agenda && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1">📋 Pauta</h4>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{meeting.agenda}</p>
                      </div>
                    )}

                    {/* Participants */}
                    {meeting.participants?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1">👥 Participantes</h4>
                        <div className="flex flex-wrap gap-1">
                          {meeting.participants.map((p, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{p}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Minutes */}
                    {meeting.minutes && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1">📝 Ata</h4>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{meeting.minutes}</p>
                      </div>
                    )}

                    {/* Decisions */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <CheckSquare className="w-3 h-3" /> Decisões
                      </h4>
                      <div className="space-y-1">
                        {meetingDecisions.map((d) => (
                          <div key={d.id} className="flex items-center justify-between text-sm p-2 bg-accent/20 rounded group">
                            <span>{d.description}</span>
                            <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => handleDeleteDecision(d.id, meeting.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Input
                          placeholder="Nova decisão..."
                          value={newDecision}
                          onChange={(e) => setNewDecision(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddDecision(meeting.id)}
                          className="text-sm h-8"
                        />
                        <Button size="sm" variant="outline" className="h-8" onClick={() => handleAddDecision(meeting.id)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Ações
                      </h4>
                      <div className="space-y-1">
                        {meetingActions.map((a) => (
                          <div key={a.id} className="flex items-center justify-between text-sm p-2 bg-accent/20 rounded group">
                            <div className="flex items-center gap-2">
                              <button
                                className={`w-4 h-4 rounded border flex items-center justify-center ${a.is_completed ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}
                                onClick={() => handleToggleAction(a, meeting.id)}
                              >
                                {a.is_completed && <span className="text-xs">✓</span>}
                              </button>
                              <span className={a.is_completed ? "line-through text-muted-foreground" : ""}>
                                {a.description}
                              </span>
                              {a.assigned_to && <Badge variant="outline" className="text-[10px]">👤 {a.assigned_to}</Badge>}
                              {a.due_date && <Badge variant="secondary" className="text-[10px]">📅 {new Date(a.due_date).toLocaleDateString("pt-BR")}</Badge>}
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                              {onCreateActivity && !a.activity_id && (
                                <Button size="icon" variant="ghost" className="h-6 w-6" title="Criar atividade no Kanban" onClick={() => handlePromoteToActivity(a, meeting.id)}>
                                  <Zap className="w-3 h-3 text-primary" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDeleteAction(a.id, meeting.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <Input
                          placeholder="Descrição da ação"
                          value={newAction.description}
                          onChange={(e) => setNewAction({ ...newAction, description: e.target.value })}
                          className="text-sm h-8 col-span-1"
                        />
                        <Input
                          placeholder="Responsável"
                          value={newAction.assigned_to}
                          onChange={(e) => setNewAction({ ...newAction, assigned_to: e.target.value })}
                          className="text-sm h-8"
                        />
                        <div className="flex gap-1">
                          <Input
                            type="date"
                            value={newAction.due_date}
                            onChange={(e) => setNewAction({ ...newAction, due_date: e.target.value })}
                            className="text-sm h-8"
                          />
                          <Button size="sm" variant="outline" className="h-8" onClick={() => handleAddAction(meeting.id)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
