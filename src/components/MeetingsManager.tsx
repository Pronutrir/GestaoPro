import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Building2,
  Briefcase,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Meeting {
  id: string;
  project_id: string;
  phase_id: string | null;
  title: string;
  meeting_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  agenda: string | null;
  minutes: string | null;
  participants: string[];
  created_at: string;
  created_by: string | null;
  responsible: string | null;
  meeting_type?: string;
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

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  sector: string | null;
  role_title: string | null;
}

interface Phase {
  id: string;
  title: string;
}

interface MeetingsManagerProps {
  projectId: string;
  phases: Phase[];
  onCreateActivity?: (title: string, assignedTo?: string) => Promise<void>;
  onCreateBlocker?: (description: string) => Promise<void>;
  onCreateLesson?: (problem: string, suggestion: string) => Promise<void>;
}

const MEETING_TYPES = [
  { value: "general", label: "Geral" },
  { value: "daily", label: "Daily Scrum" },
  { value: "planning", label: "Sprint Planning" },
  { value: "review", label: "Sprint Review" },
  { value: "retrospective", label: "Sprint Retrospective" },
];

const MEETING_TYPE_COLORS: Record<string, string> = {
  general: "bg-muted text-muted-foreground",
  daily: "bg-primary/20 text-primary",
  planning: "bg-blue-500/20 text-blue-700",
  review: "bg-emerald-500/20 text-emerald-700",
  retrospective: "bg-purple-500/20 text-purple-700",
};

export const MeetingsManager = ({ projectId, phases, onCreateActivity, onCreateBlocker, onCreateLesson }: MeetingsManagerProps) => {
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, MeetingDecision[]>>({});
  const [actions, setActions] = useState<Record<string, MeetingAction[]>>({});
  const [newDecision, setNewDecision] = useState("");
  const [newAction, setNewAction] = useState({ description: "", assigned_to: "", due_date: "" });

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
    responsible: "",
    meeting_type: "general",
    // Daily fields
    daily_yesterday: "",
    daily_today: "",
    daily_impediment: "",
    // Retro fields
    retro_good: "",
    retro_bad: "",
    retro_improve: "",
  });

  const getProfile = (id: string) => profiles.find((p) => p.id === id);

  useEffect(() => {
    fetchMeetings();
    fetchProfiles();
  }, [projectId]);

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, email, full_name, sector, role_title");
    if (data) setProfiles(data);
  };

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
    setForm({ title: "", meeting_date: "", start_time: "", end_time: "", location: "", agenda: "", minutes: "", phase_id: "", participants: [], responsible: "", meeting_type: "general", daily_yesterday: "", daily_today: "", daily_impediment: "", retro_good: "", retro_bad: "", retro_improve: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast({ title: "Informe o título", variant: "destructive" });
      return;
    }

    // Build minutes from template fields
    let computedMinutes = form.minutes || "";
    if (form.meeting_type === "daily") {
      computedMinutes = `**O que fiz ontem:**\n${form.daily_yesterday}\n\n**O que farei hoje:**\n${form.daily_today}\n\n**Impedimentos:**\n${form.daily_impediment}`;
    } else if (form.meeting_type === "retrospective") {
      computedMinutes = `**O que foi bom:**\n${form.retro_good}\n\n**O que foi ruim:**\n${form.retro_bad}\n\n**O que melhorar:**\n${form.retro_improve}`;
    }

    const payload: any = {
      project_id: projectId,
      title: form.title,
      meeting_date: form.meeting_date || null,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location || null,
      agenda: form.agenda || null,
      minutes: computedMinutes || null,
      phase_id: form.phase_id || null,
      participants: form.participants,
      responsible: form.responsible || null,
      meeting_type: form.meeting_type,
    };

    if (!editingId) {
      payload.created_by = user?.id || null;
    }

    if (editingId) {
      const { error } = await supabase.from("meetings").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); return; }
      toast({ title: "Reunião atualizada!" });
    } else {
      const { error } = await supabase.from("meetings").insert(payload);
      if (error) { toast({ title: "Erro ao criar", variant: "destructive" }); return; }
      toast({ title: "Reunião criada!" });

      // Auto-create blocker from daily impediment
      if (form.meeting_type === "daily" && form.daily_impediment.trim() && onCreateBlocker) {
        await onCreateBlocker(form.daily_impediment.trim());
        toast({ title: "Impedimento registrado como risco!" });
      }
    }
    resetForm();
    fetchMeetings();
  };

  const handleEdit = (m: Meeting) => {
    // Parse daily/retro fields from minutes if applicable
    let daily_yesterday = "", daily_today = "", daily_impediment = "";
    let retro_good = "", retro_bad = "", retro_improve = "";
    
    if (m.meeting_type === "daily" && m.minutes) {
      const parts = m.minutes.split(/\*\*[^*]+\*\*\n?/);
      daily_yesterday = parts[1]?.trim() || "";
      daily_today = parts[2]?.trim() || "";
      daily_impediment = parts[3]?.trim() || "";
    } else if (m.meeting_type === "retrospective" && m.minutes) {
      const parts = m.minutes.split(/\*\*[^*]+\*\*\n?/);
      retro_good = parts[1]?.trim() || "";
      retro_bad = parts[2]?.trim() || "";
      retro_improve = parts[3]?.trim() || "";
    }
    
    setForm({
      title: m.title,
      meeting_date: m.meeting_date ? m.meeting_date.slice(0, 16) : "",
      start_time: m.start_time || "",
      end_time: m.end_time || "",
      location: m.location || "",
      agenda: m.agenda || "",
      minutes: m.minutes || "",
      phase_id: m.phase_id || "",
      participants: m.participants || [],
      responsible: m.responsible || "",
      meeting_type: m.meeting_type || "general",
      daily_yesterday,
      daily_today,
      daily_impediment,
      retro_good,
      retro_bad,
      retro_improve,
    });
    setEditingId(m.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta reunião?")) return;
    await supabase.from("meetings").delete().eq("id", id);
    fetchMeetings();
  };

  const addParticipant = (userId: string) => {
    if (userId && !form.participants.includes(userId)) {
      setForm({ ...form, participants: [...form.participants, userId] });
    }
  };

  const removeParticipant = (userId: string) => {
    setForm({ ...form, participants: form.participants.filter((x) => x !== userId) });
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
  const handleSaveAsLesson = async (meeting: Meeting) => {
    if (!onCreateLesson) return;
    // Extract retro content from minutes
    const parts = (meeting.minutes || "").split(/\*\*[^*]+\*\*\n?/);
    const bad = parts[2]?.trim() || "Problema identificado na retrospectiva";
    const improve = parts[3]?.trim() || "";
    await onCreateLesson(bad, improve);
    toast({ title: "Lição aprendida criada a partir da retrospectiva!" });
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
          {/* Meeting Type Selector */}
          <div className="flex gap-2 flex-wrap">
            {MEETING_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                  form.meeting_type === t.value
                    ? `${MEETING_TYPE_COLORS[t.value]} border-current ring-2 ring-current/20`
                    : "border-border text-muted-foreground hover:border-foreground/30"
                }`}
                onClick={() => setForm({ ...form, meeting_type: t.value, title: form.title || t.label })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Título da reunião *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Input
            placeholder="Proponente / Responsável pela reunião"
            value={form.responsible}
            onChange={(e) => setForm({ ...form, responsible: e.target.value })}
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
            {(() => {
              const available = profiles.filter((p) => !form.participants.includes(p.id));
              return available.length > 0 ? (
                <Select onValueChange={(val) => addParticipant(val)}>
                  <SelectTrigger className="text-sm h-9">
                    <SelectValue placeholder="Adicionar participante..." />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email}
                        {p.sector ? ` — ${p.sector}` : ""}
                        {p.role_title ? ` (${p.role_title})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">Todos os usuários já foram adicionados.</p>
              );
            })()}
            {form.participants.length > 0 && (
              <div className="space-y-1">
                {form.participants.map((userId) => {
                  const prof = getProfile(userId);
                  return (
                    <div key={userId} className="flex items-center justify-between p-2 rounded border border-border bg-accent/10">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{prof?.full_name || prof?.email || userId}</span>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          {prof?.sector && (
                            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{prof.sector}</span>
                          )}
                          {prof?.role_title && (
                            <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{prof.role_title}</span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => removeParticipant(userId)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Template-specific fields */}
          {form.meeting_type === "daily" && (
            <div className="space-y-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-xs font-semibold text-primary">🏃 Daily Scrum</p>
              <Textarea placeholder="O que fiz ontem?" value={form.daily_yesterday} onChange={(e) => setForm({ ...form, daily_yesterday: e.target.value })} rows={2} />
              <Textarea placeholder="O que farei hoje?" value={form.daily_today} onChange={(e) => setForm({ ...form, daily_today: e.target.value })} rows={2} />
              <Textarea placeholder="Há algum impedimento?" value={form.daily_impediment} onChange={(e) => setForm({ ...form, daily_impediment: e.target.value })} rows={2} className="border-destructive/30" />
              {form.daily_impediment.trim() && (
                <p className="text-[10px] text-destructive">⚠️ O impedimento será registrado automaticamente como risco ao salvar</p>
              )}
            </div>
          )}

          {form.meeting_type === "planning" && (
            <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
              <p className="text-xs font-semibold text-blue-700 mb-2">📋 Sprint Planning</p>
              <p className="text-xs text-muted-foreground">Use a aba "Backlog" para selecionar e mover atividades para o Kanban durante esta reunião.</p>
              <Textarea placeholder="Pauta / Objetivos da Sprint" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} rows={3} />
            </div>
          )}

          {form.meeting_type === "review" && (
            <div className="p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
              <p className="text-xs font-semibold text-emerald-700 mb-2">🎯 Sprint Review</p>
              <p className="text-xs text-muted-foreground mb-2">Registre o incremento do produto. Anexe links ou documentos pela aba "Entregas".</p>
              <Textarea placeholder="Ata da Review / Incremento entregue" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} rows={3} />
            </div>
          )}

          {form.meeting_type === "retrospective" && (
            <div className="space-y-2 p-3 bg-purple-500/5 rounded-lg border border-purple-500/20">
              <p className="text-xs font-semibold text-purple-700">🔄 Sprint Retrospective</p>
              <Textarea placeholder="O que foi bom?" value={form.retro_good} onChange={(e) => setForm({ ...form, retro_good: e.target.value })} rows={2} />
              <Textarea placeholder="O que foi ruim?" value={form.retro_bad} onChange={(e) => setForm({ ...form, retro_bad: e.target.value })} rows={2} />
              <Textarea placeholder="O que melhorar?" value={form.retro_improve} onChange={(e) => setForm({ ...form, retro_improve: e.target.value })} rows={2} />
              <p className="text-[10px] text-purple-600">💡 Após salvar, você poderá converter em Lição Aprendida</p>
            </div>
          )}

          {form.meeting_type === "general" && (
            <>
              <Textarea placeholder="Pauta" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} rows={2} />
              <Textarea placeholder="Ata / Registro" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} rows={3} />
            </>
          )}

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
            const canEditMeeting = isAdmin || meeting.created_by === user?.id;

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
                            {new Date(meeting.meeting_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                          </span>
                        )}
                        {(meeting.start_time || meeting.end_time) && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {meeting.start_time?.slice(0, 5) || "?"} – {meeting.end_time?.slice(0, 5) || "?"}
                            {meeting.start_time && meeting.end_time && (() => {
                              const [sh, sm] = meeting.start_time!.split(":").map(Number);
                              const [eh, em] = meeting.end_time!.split(":").map(Number);
                              const diff = (eh * 60 + em) - (sh * 60 + sm);
                              if (diff > 0) {
                                const h = Math.floor(diff / 60);
                                const m = diff % 60;
                                return <span className="text-primary font-medium ml-1">({h > 0 ? `${h}h` : ""}{m > 0 ? `${m}min` : ""})</span>;
                              }
                              return null;
                            })()}
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
                        {meeting.responsible && (
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            👤 {meeting.responsible}
                          </span>
                        )}
                        {meeting.phase_id && (
                          <Badge variant="secondary" className="text-[10px]">
                            {phases.find((p) => p.id === meeting.phase_id)?.title}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {(isAdmin || meeting.created_by === user?.id) && (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(meeting)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(meeting.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
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
                        <div className="space-y-1">
                          {meeting.participants.map((pId, i) => {
                            const prof = getProfile(pId);
                            return (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <span className="font-medium">{prof?.full_name || prof?.email || pId}</span>
                                {prof?.sector && (
                                  <Badge variant="outline" className="text-[10px] gap-1"><Building2 className="w-2.5 h-2.5" />{prof.sector}</Badge>
                                )}
                                {prof?.role_title && (
                                  <Badge variant="secondary" className="text-[10px] gap-1"><Briefcase className="w-2.5 h-2.5" />{prof.role_title}</Badge>
                                )}
                              </div>
                            );
                          })}
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
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                              {canEditMeeting && onCreateActivity && (
                                <Button size="icon" variant="ghost" className="h-6 w-6" title="Gerar Tarefa" onClick={async () => {
                                  await onCreateActivity(d.description);
                                  toast({ title: "Tarefa criada a partir da decisão!" });
                                }}>
                                  <Zap className="w-3 h-3 text-primary" />
                                </Button>
                              )}
                              {canEditMeeting && (
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDeleteDecision(d.id, meeting.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {canEditMeeting && (
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
                      )}
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
                                onClick={() => canEditMeeting && handleToggleAction(a, meeting.id)}
                                disabled={!canEditMeeting}
                              >
                                {a.is_completed && <span className="text-xs">✓</span>}
                              </button>
                              <span className={a.is_completed ? "line-through text-muted-foreground" : ""}>
                                {a.description}
                              </span>
                              {a.assigned_to && <Badge variant="outline" className="text-[10px]">👤 {a.assigned_to}</Badge>}
                              {a.due_date && <Badge variant="secondary" className="text-[10px]">📅 {new Date(a.due_date).toLocaleDateString("pt-BR")}</Badge>}
                            </div>
                            {canEditMeeting && (
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
                            )}
                          </div>
                        ))}
                      </div>
                      {canEditMeeting && (
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
                      )}
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
