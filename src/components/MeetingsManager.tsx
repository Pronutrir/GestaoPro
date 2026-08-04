'use client';
import { useState, useEffect, useMemo } from "react";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AIAssistButton } from "@/components/AIAssistButton";
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
  Lightbulb,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { useAssigneeAvatarLookup } from "@/hooks/useAssigneeAvatarLookup";
import { selectInChunks } from "@/lib/chunkedIn";
import { PersonCombobox } from "@/components/PersonCombobox";
import { VinculoSelect } from "@/components/VinculoSelect";
import { cn } from "@/lib/utils";

// meeting_types ainda fora dos tipos gerados (migration 20260802130000
// pendente na VM). Mesmo padrão usado em PageComments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

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
  /** Colunas da migration 20260802130000 — opcionais porque o schema da VM
   *  ainda pode ser o antigo (ver typesAvailable). */
  meeting_type_id?: string | null;
  recording_url?: string | null;
  transcript?: string | null;
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
  avatar_url?: string | null;
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
  canManageProject?: boolean;
}

/**
 * Os tipos de reunião eram CONSTANTES aqui: Daily Scrum, Sprint Planning,
 * Sprint Review, Sprint Retrospective — cerimônias de Scrum, cada uma trocando
 * os campos do formulário ("O que fiz ontem?", "O que foi bom/ruim?").
 *
 * A metodologia daqui é por atividades/EAP, não por sprint: conferido no banco
 * em 02/08/2026, zero sprints cadastradas. Os tipos viraram DADO
 * (tabela meeting_types), editáveis por projeto, e o formulário passou a ser
 * um só — o tipo é apenas classificação, para filtrar e contar.
 */
interface MeetingType {
  id: string;
  label: string;
  display_order: number;
  is_default: boolean;
  asks_phase: boolean;
}

/**
 * Botões de promover na linha — o mesmo gesto do 💡 no Registro da atividade.
 * Discretos por padrão (só o contorno), ganham cor no hover; quando já
 * promovido, o ícone fica preenchido e o botão desabilita.
 */
function PromoverBotoes({
  onAtividade, onLicao, onRisco, feitos,
}: {
  onAtividade?: () => void;
  onLicao?: () => void;
  onRisco?: () => void;
  feitos: string[];
}) {
  // Classes COMPLETAS, nunca montadas por interpolação: o Tailwind varre o
  // código-fonte estaticamente, então `hover:${cor}` não geraria nada e o
  // botão ficaria sem cor no hover — falha silenciosa que passa no build.
  const btn = (
    key: string, label: string, feito: string,
    Icon: typeof Zap, ativo: string, hover: string, onClick?: () => void,
  ) => {
    if (!onClick) return null;
    const pronto = feitos.includes(feito);
    return (
      <button
        key={key}
        type="button"
        disabled={pronto}
        onClick={onClick}
        title={pronto ? `Já virou ${label.toLowerCase()}` : label}
        className={cn(
          "h-6 w-6 rounded flex items-center justify-center transition-colors shrink-0",
          pronto ? `${ativo} cursor-default` : `text-muted-foreground hover:bg-muted ${hover}`,
        )}
      >
        <Icon className={cn("w-3.5 h-3.5", pronto && "fill-current")} />
      </button>
    );
  };

  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {btn("a", "Virar atividade no Kanban", "atividade", Zap, "text-primary", "hover:text-primary", onAtividade)}
      {btn("l", "Virar lição aprendida", "licao", Lightbulb, "text-warning", "hover:text-warning", onLicao)}
      {btn("r", "Virar risco", "risco", AlertTriangle, "text-destructive", "hover:text-destructive", onRisco)}
    </span>
  );
}

export const MeetingsManager = ({ projectId, phases, onCreateActivity, onCreateBlocker, onCreateLesson, canManageProject = false }: MeetingsManagerProps) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, MeetingDecision[]>>({});
  const [actions, setActions] = useState<Record<string, MeetingAction[]>>({});
  const [types, setTypes] = useState<MeetingType[]>([]);
  const [atividades, setAtividades] = useState<{ id: string; title: string; wbs_code?: string | null; parent_id?: string | null }[]>([]);
  /** false enquanto a coluna meetings.activity_id não existe na VM. */
  const [vinculoAtividadeOk, setVinculoAtividadeOk] = useState(true);
  /** false enquanto a migration de meeting_types não rodou na VM. */
  const [typesAvailable, setTypesAvailable] = useState(true);
  /** Ações de TODAS as reuniões do projeto — base do painel do topo. */
  const [allActions, setAllActions] = useState<MeetingAction[]>([]);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  /** Filtros do painel — os números viraram botões. null = sem filtro. */
  const [filtroAcoes, setFiltroAcoes] = useState<"abertas" | "atrasadas" | "concluidas" | null>(null);
  const [filtroPessoa, setFiltroPessoa] = useState<string | null>(null);
  /** O que já foi promovido nesta sessão, por linha: evita criar a mesma
   *  atividade duas vezes num clique repetido. Não persiste — as tabelas de
   *  destino não guardam a origem, e inventar esse vínculo exigiria migration
   *  para um ganho pequeno. */
  const [promovidos, setPromovidos] = useState<Record<string, string[]>>({});
  const [newDecision, setNewDecision] = useState("");
  const [newAction, setNewAction] = useState({ description: "", assigned_to: "", due_date: "" });
  const assigneeAvatarMap = useAssigneeAvatarLookup([
    ...meetings.map((meeting) => meeting.responsible),
    ...Object.values(actions).flatMap((meetingActions) => meetingActions.map((action) => action.assigned_to)),
  ]);

  const [form, setForm] = useState({
    title: "",
    meeting_date: "",
    start_time: "",
    end_time: "",
    location: "",
    agenda: "",
    minutes: "",
    phase_id: "",
    activity_id: "",
    participants: [] as string[],
    responsible: "",
    meeting_type_id: "",
    recording_url: "",
    transcript: "",
  });

  const getProfile = (id: string) => profiles.find((p) => p.id === id);

  /** Painel: as duas perguntas de quem gerencia são "o que está aberto" e
   *  "o que já venceu". O resto é contexto. */
  const painel = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const abertas = allActions.filter((a) => !a.is_completed);
    const atrasadas = abertas.filter((a) => a.due_date && a.due_date.slice(0, 10) < hoje);

    // Responsável é TEXTO livre (assigned_to), não FK — mesma escolha do resto
    // do sistema. Agrupa pelo nome como está gravado.
    const porPessoa = new Map<string, { abertas: number; atrasadas: number }>();
    for (const a of abertas) {
      const quem = (a.assigned_to || "").trim();
      if (!quem) continue;
      const cur = porPessoa.get(quem) || { abertas: 0, atrasadas: 0 };
      cur.abertas += 1;
      if (a.due_date && a.due_date.slice(0, 10) < hoje) cur.atrasadas += 1;
      porPessoa.set(quem, cur);
    }

    return {
      abertas: abertas.length,
      atrasadas: atrasadas.length,
      concluidas: allActions.length - abertas.length,
      total: allActions.length,
      pessoas: Array.from(porPessoa.entries())
        .map(([nome, v]) => ({ nome, ...v }))
        // Quem tem atraso primeiro: é o que exige ação de quem está olhando.
        .sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas),
    };
  }, [allActions]);

  useEffect(() => {
    fetchMeetings();
    fetchProfiles();
    fetchTypes();
    fetchAtividades();
  }, [projectId]);

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, email, full_name, sector, role_title, avatar_url");
    if (data) setProfiles(data);
  };

  /** Atividades do projeto — destinos do vínculo, além das fases. O seletor
   *  oferecia só as 5 fases enquanto 827 atividades ficavam inalcançáveis. */
  const fetchAtividades = async () => {
    const { data } = await supabase
      .from("activities")
      .select("id, title, wbs_code, parent_id")
      .eq("project_id", projectId)
      .eq("is_trashed", false)
      .order("wbs_code", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    setAtividades(data || []);
  };

  /** Enquanto a migration não roda na VM a tabela não existe: em vez de quebrar
   *  a aba, o seletor de tipo simplesmente não aparece e o resto funciona. */
  const fetchTypes = async () => {
    const { data, error } = await sb
      .from("meeting_types")
      .select("id, label, display_order, is_default, asks_phase")
      .eq("project_id", projectId)
      .order("display_order");
    if (error) { setTypesAvailable(false); return; }
    setTypesAvailable(true);
    setTypes(data || []);
  };

  const fetchMeetings = async () => {
    const { data } = await supabase
      .from("meetings")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_trashed", false)
      .order("meeting_date", { ascending: false });
    if (data) {
      setMeetings(data);
      void fetchAllActions(data.map((m) => m.id));
    }
  };

  /** O painel precisa das ações de TODAS as reuniões — fetchDetails só busca
   *  as da reunião aberta. Lotes de 50 ids: acima disso o `in.(…)` estoura o
   *  limite de URL do proxy e vira 502 (ver lib/chunkedIn). */
  const fetchAllActions = async (ids: string[]) => {
    if (!ids.length) { setAllActions([]); return; }
    const rows = await selectInChunks<MeetingAction>(ids, (chunk) =>
      supabase
        .from("meeting_actions")
        .select("id, meeting_id, description, assigned_to, due_date, activity_id, is_completed")
        .in("meeting_id", chunk),
    );
    setAllActions(rows);
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
    setForm({
      title: "", meeting_date: "", start_time: "", end_time: "", location: "",
      agenda: "", minutes: "", phase_id: "", activity_id: "", participants: [], responsible: "",
      // Já abre no tipo marcado como padrão do projeto ("Alinhamento"), que é
      // o caso mais frequente — evita um clique na maioria das criações.
      meeting_type_id: types.find((t) => t.is_default)?.id || "",
      recording_url: "", transcript: "",
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast({ title: "Informe o título", variant: "destructive" });
      return;
    }

    const payload: any = {
      project_id: projectId,
      title: form.title,
      meeting_date: form.meeting_date ? `${form.meeting_date.slice(0, 10)}T12:00:00` : null,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location || null,
      agenda: form.agenda || null,
      minutes: form.minutes || null,
      phase_id: form.phase_id || null,
      participants: form.participants,
      responsible: form.responsible || null,
    };

    // Colunas da migration 20260802130000. Enquanto ela não roda na VM, o
    // PostgREST devolve PGRST204 e o insert inteiro falharia — por isso vão
    // num payload à parte, removido e reenviado se o schema for antigo.
    if (typesAvailable) {
      payload.meeting_type_id = form.meeting_type_id || null;
      payload.recording_url = form.recording_url || null;
      payload.transcript = form.transcript || null;
    }
    // Coluna da migration 20260804120000 (vínculo com atividade), com a mesma
    // degradação: sem ela, a reunião salva só com a fase — como antes.
    if (vinculoAtividadeOk) {
      payload.activity_id = form.activity_id || null;
    }

    if (!editingId) {
      payload.created_by = user?.id || null;
    }

    const semColunasNovas = () => {
      const p = { ...payload };
      delete p.meeting_type_id; delete p.recording_url; delete p.transcript;
      delete p.activity_id;
      return p;
    };
    const colunaAusente = (msg?: string | null) =>
      !!msg && /Could not find the '(meeting_type_id|recording_url|transcript|activity_id)' column/i.test(msg);

    if (editingId) {
      let { error } = await supabase.from("meetings").update(payload).eq("id", editingId);
      if (colunaAusente(error?.message)) {
        setTypesAvailable(false); setVinculoAtividadeOk(false);
        ({ error } = await supabase.from("meetings").update(semColunasNovas()).eq("id", editingId));
      }
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); return; }
      toast({ title: "Reunião atualizada!" });
    } else {
      let { error } = await supabase.from("meetings").insert(payload);
      if (colunaAusente(error?.message)) {
        setTypesAvailable(false); setVinculoAtividadeOk(false);
        ({ error } = await supabase.from("meetings").insert(semColunasNovas()));
      }
      if (error) { toast({ title: "Erro ao criar", variant: "destructive" }); return; }
      toast({ title: "Reunião criada!" });
    }
    resetForm();
    fetchMeetings();
  };

  const handleEdit = (m: Meeting) => {
    // A ata era REMONTADA a partir dos campos da cerimônia ("**O que fiz
    // ontem:**\n…"), e a edição desmontava de volta por regex. Com formulário
    // único, minutes é texto direto — reuniões antigas gravadas no formato
    // antigo continuam legíveis, só aparecem como um texto só.
    setForm({
      title: m.title,
      meeting_date: m.meeting_date ? m.meeting_date.slice(0, 16) : "",
      start_time: m.start_time || "",
      end_time: m.end_time || "",
      location: m.location || "",
      agenda: m.agenda || "",
      minutes: m.minutes || "",
      phase_id: m.phase_id || "",
      activity_id: (m as any).activity_id || "",
      participants: m.participants || [],
      responsible: m.responsible || "",
      meeting_type_id: m.meeting_type_id || types.find((t) => t.is_default)?.id || "",
      recording_url: m.recording_url || "",
      transcript: m.transcript || "",
    });
    setEditingId(m.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: "Excluir reunião",
      description: "Excluir esta reunião?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await supabase.from("meetings").update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq("id", id);
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

  /** Dispara a notificação das ações abertas — uma por pessoa, não por ação
   *  (ver /api/meetings/notify-actions). É explícito e não automático: a ata
   *  costuma ser escrita aos poucos, e avisar a cada digitação seria spam. */
  const handleNotifyActions = async (meetingId: string) => {
    setNotifyingId(meetingId);
    try {
      const res = await fetch("/api/meetings/notify-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Não foi possível avisar", description: data?.error, variant: "destructive" });
        return;
      }
      toast({
        title: data.created > 0
          ? `${data.created} ${data.created === 1 ? "pessoa avisada" : "pessoas avisadas"}`
          : "Ninguém para avisar",
        description: data.created > 0 ? undefined : "As ações abertas não têm responsável, ou são suas.",
      });
    } finally {
      setNotifyingId(null);
    }
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
      marcarPromovido(`acao:${action.id}`, "atividade");
      toast({ title: "Atividade criada no Kanban!" });
    }
  };

  /**
   * PROMOVER — mesmo gesto do 💡 no Registro da atividade: um ícone na própria
   * linha, sem menu nem tela nova.
   *
   * Antes só a AÇÃO virava atividade. A decisão — que é o registro do que foi
   * combinado, e de onde nascem retrabalho e aprendizado — ficava gravada e
   * nunca mais era lida. A ata só virava lição por um botão grande separado.
   *
   * A linha NÃO some depois de promovida: a reunião é registro histórico do que
   * foi dito. Ganha só uma marca, para ninguém promover duas vezes.
   */
  const marcarPromovido = (chave: string, destino: "atividade" | "licao" | "risco") => {
    setPromovidos((prev) => ({ ...prev, [chave]: [...(prev[chave] || []), destino] }));
  };

  const jaPromovido = (chave: string, destino: string) =>
    (promovidos[chave] || []).includes(destino);

  const promoverParaAtividade = async (chave: string, texto: string, responsavel?: string) => {
    if (!onCreateActivity) return;
    const ok = await appConfirm({
      title: "Criar atividade no Kanban?",
      description: texto.slice(0, 160),
      confirmText: "Criar atividade",
    });
    if (!ok) return;
    await onCreateActivity(texto, responsavel);
    marcarPromovido(chave, "atividade");
    toast({ title: "Atividade criada no Kanban!" });
  };

  const promoverParaLicao = async (chave: string, texto: string) => {
    if (!onCreateLesson) return;
    const ok = await appConfirm({
      title: "Registrar como Lição Aprendida?",
      description: texto.slice(0, 160),
      confirmText: "Criar lição",
    });
    if (!ok) return;
    // O texto vai como "problema" e a sugestão fica vazia — quem edita a lição
    // na aba Lições refina. Adivinhar qual parte é problema e qual é sugestão
    // foi o que quebrou na versão anterior (fatiava por marcador de Scrum).
    await onCreateLesson(texto, "");
    marcarPromovido(chave, "licao");
    toast({ title: "Lição criada!", description: "Disponível na aba Lições do projeto." });
  };

  const promoverParaRisco = async (chave: string, texto: string) => {
    if (!onCreateBlocker) return;
    const ok = await appConfirm({
      title: "Registrar como risco do projeto?",
      description: texto.slice(0, 160),
      confirmText: "Criar risco",
    });
    if (!ok) return;
    await onCreateBlocker(texto);
    marcarPromovido(chave, "risco");
    toast({ title: "Risco registrado!" });
  };

  const handleDeleteAction = async (id: string, meetingId: string) => {
    await supabase.from("meeting_actions").delete().eq("id", id);
    fetchDetails(meetingId);
  };

  /** Os dois filtros do painel se COMBINAM: clicar em "atrasadas" e depois
   *  numa pessoa mostra as atrasadas daquela pessoa. */
  const acoesFiltradas = useMemo(() => {
    if (!filtroAcoes && !filtroPessoa) return [];
    const hoje = new Date().toISOString().slice(0, 10);
    return allActions
      .filter((a) => {
        if (filtroPessoa && (a.assigned_to || "").trim() !== filtroPessoa) return false;
        if (filtroAcoes === "abertas") return !a.is_completed;
        if (filtroAcoes === "concluidas") return a.is_completed;
        if (filtroAcoes === "atrasadas") {
          return !a.is_completed && !!a.due_date && a.due_date.slice(0, 10) < hoje;
        }
        return true; // só filtro por pessoa: mostra tudo dela
      })
      // Prazo mais próximo primeiro; sem prazo vai para o fim.
      .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  }, [allActions, filtroAcoes, filtroPessoa]);

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

      {/* PAINEL — responde "o que ficou pendente e com quem" sem obrigar a
          abrir reunião por reunião. Só aparece quando há ação: num projeto
          sem nenhuma, seria uma faixa de zeros ocupando o topo. */}
      {painel.total > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
          {/* Os números eram só leitura: informavam "3 atrasadas" e deixavam a
              pessoa procurando quais são, reunião por reunião. Agora cada um
              filtra a lista abaixo — clicar de novo desliga. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { id: "abertas",   n: painel.abertas,   label: "ações abertas", cor: "" },
              { id: "atrasadas", n: painel.atrasadas, label: "atrasadas",     cor: painel.atrasadas > 0 ? "text-destructive" : "" },
              { id: "concluidas", n: painel.concluidas, label: "concluídas",  cor: "text-success" },
            ] as const).map((c) => {
              const ativo = filtroAcoes === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFiltroAcoes(ativo ? null : c.id)}
                  title={ativo ? "Clique para remover o filtro" : `Ver ${c.label}`}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left transition-colors",
                    ativo
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/60 bg-background hover:border-primary/40 hover:bg-muted/50",
                  )}
                >
                  <p className={cn("text-xl font-semibold tabular-nums leading-tight", c.cor)}>{c.n}</p>
                  <p className="text-[11px] text-muted-foreground">{c.label}</p>
                </button>
              );
            })}
            {/* Reuniões não filtra ação nenhuma — é contagem de outra coisa.
                Fica como número, sem fingir que é clicável. */}
            <div className="rounded-md bg-background border border-border/60 px-3 py-2">
              <p className="text-xl font-semibold tabular-nums leading-tight">{meetings.length}</p>
              <p className="text-[11px] text-muted-foreground">reuniões</p>
            </div>
          </div>

          {painel.pessoas.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Por responsável
              </p>
              <div className="flex flex-wrap gap-1.5">
                {painel.pessoas.map((p) => {
                  const ativo = filtroPessoa === p.nome;
                  return (
                    <button
                      key={p.nome}
                      type="button"
                      onClick={() => setFiltroPessoa(ativo ? null : p.nome)}
                      title={ativo ? "Clique para remover o filtro" : `Ver as ações de ${p.nome}`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors",
                        ativo
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border/60 bg-background hover:border-primary/40",
                      )}
                    >
                      <Avatar className="h-4 w-4 shrink-0">
                        {(() => {
                          const avatar = resolveAvatarFromLookup(p.nome, p.nome, assigneeAvatarMap);
                          return avatar ? <AvatarImage src={avatar} alt={p.nome} /> : null;
                        })()}
                        <AvatarFallback className="text-[8px]">{getAvatarInitials(p.nome)}</AvatarFallback>
                      </Avatar>
                      <span className="max-w-[130px] truncate">{p.nome}</span>
                      {p.atrasadas > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-destructive font-medium tabular-nums">
                          <AlertTriangle className="w-3 h-3" />{p.atrasadas}
                        </span>
                      )}
                      <span className="text-muted-foreground tabular-nums">{p.abertas} aberta{p.abertas > 1 ? "s" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resultado do filtro: a lista das ações em si, com a reunião de
              origem — sem isto o clique acenderia o cartão e nada mais. */}
          {(filtroAcoes || filtroPessoa) && (
            <div className="rounded-md border border-border/60 bg-background">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
                <span className="text-[11px] font-medium text-foreground">
                  {acoesFiltradas.length} {acoesFiltradas.length === 1 ? "ação" : "ações"}
                  {filtroPessoa ? ` de ${filtroPessoa}` : ""}
                  {filtroAcoes === "atrasadas" ? " atrasada(s)" : filtroAcoes === "concluidas" ? " concluída(s)" : filtroAcoes === "abertas" ? " em aberto" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => { setFiltroAcoes(null); setFiltroPessoa(null); }}
                  className="ml-auto text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> limpar
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
                {acoesFiltradas.length === 0 && (
                  <p className="px-3 py-3 text-[12px] text-muted-foreground">Nenhuma ação neste filtro.</p>
                )}
                {acoesFiltradas.map((a) => {
                  const reuniao = meetings.find((m) => m.id === a.meeting_id);
                  const atrasada = !a.is_completed && a.due_date && a.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      // Leva à reunião de origem: sem isso a ação apareceria
                      // solta, sem o contexto em que foi combinada.
                      onClick={() => { setExpandedId(a.meeting_id); fetchDetails(a.meeting_id); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                    >
                      <span className={cn("text-[12.5px] flex-1 min-w-0 truncate", a.is_completed && "line-through text-muted-foreground")}>
                        {a.description}
                      </span>
                      {a.assigned_to && !filtroPessoa && (
                        <span className="text-[11px] text-muted-foreground shrink-0 max-w-[120px] truncate">{a.assigned_to}</span>
                      )}
                      {a.due_date && (
                        <span className={cn("text-[11px] tabular-nums shrink-0", atrasada ? "text-destructive font-medium" : "text-muted-foreground")}>
                          {new Date(a.due_date).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {reuniao && (
                        <span className="text-[10px] text-muted-foreground shrink-0 max-w-[110px] truncate hidden sm:inline">
                          {reuniao.title}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="space-y-3 p-4 bg-card rounded-lg border border-border shadow-sm">
          {/* Tipo — seletor, não abas: com 6 tipos as abas ocupavam duas linhas,
              e a lista é editável (pode crescer). Some por completo enquanto a
              migration de meeting_types não rodou na VM. */}
          {typesAvailable && types.length > 0 && (
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select
                value={form.meeting_type_id}
                onValueChange={(v) => setForm({ ...form, meeting_type_id: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Input
            placeholder="Título da reunião *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          {form.title.trim() && (
            <div className="flex justify-end -mt-2">
              <AIAssistButton value={form.title} onChange={(v) => setForm({ ...form, title: v })} context="meeting_title" />
            </div>
          )}
          {/* Também era texto livre — mesmo problema do responsável da ação. */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Proponente / Responsável</Label>
            <PersonCombobox
              people={profiles.map((p) => ({
                id: p.id,
                full_name: p.full_name || p.email || "Sem nome",
                sector: p.sector,
                role_title: p.role_title,
                avatar_url: p.avatar_url,
              }))}
              value={profiles.find((p) => p.full_name === form.responsible)?.id ?? null}
              placeholder="Quem conduz a reunião"
              onSelect={(p) => setForm({ ...form, responsible: p.full_name })}
              onClear={() => setForm({ ...form, responsible: "" })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Data</Label>
              <DateField
                value={form.meeting_date ? form.meeting_date.slice(0, 10) : ""}
                onChange={(v) => setForm({ ...form, meeting_date: v })}
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
          {/* Vínculo: fase OU atividade num campo só. Antes só oferecia as
              fases do projeto — 5 opções contra 827 atividades invisíveis. */}
          {(phases.length > 0 || atividades.length > 0) && (
            <VinculoSelect
              fases={phases}
              atividades={atividades}
              faseId={form.phase_id}
              atividadeId={form.activity_id}
              atividadeDisponivel={vinculoAtividadeOk}
              onChange={({ faseId, atividadeId }) =>
                setForm({ ...form, phase_id: faseId, activity_id: atividadeId })}
            />
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
          {/* Formulário ÚNICO. Antes cada tipo trocava os campos (o Daily
              perguntava "o que fiz ontem?"), o que fazia a aba inteira mudar de
              forma conforme o botão clicado. Agora o tipo é só classificação, e
              o que organiza a tela é o TEMPO: o que se preenche antes da
              reunião e o que se preenche depois. */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Pauta</span>
              <AIAssistButton value={form.agenda} onChange={(v) => setForm({ ...form, agenda: v })} context="meeting_agenda" />
            </div>
            <Textarea placeholder="O que será tratado" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} rows={2} />
          </div>

          <div className="pt-1 border-t border-border/60">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-2 pb-1.5">
              Depois da reunião
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Ata</span>
                <AIAssistButton value={form.minutes} onChange={(v) => setForm({ ...form, minutes: v })} context="meeting_minutes" />
              </div>
              <Textarea placeholder="O que foi decidido" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} rows={3} />
            </div>

            {/* Gravação por LINK e não upload: uma reunião de 1h passa de
                500 MB, e o vídeo já vive no Meet/Teams/Zoom que o gerou. */}
            {typesAvailable && (
              <div className="grid md:grid-cols-2 gap-2 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Gravação</Label>
                  <Input
                    placeholder="https://… link do vídeo"
                    value={form.recording_url}
                    onChange={(e) => setForm({ ...form, recording_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Transcrição</Label>
                  <Textarea
                    placeholder="Cole aqui a transcrição"
                    value={form.transcript}
                    onChange={(e) => setForm({ ...form, transcript: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>

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
            const canEditMeeting = canManageProject || meeting.created_by === user?.id;

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
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{meeting.title}</p>
                        {/* Sem cor por tipo: a lista é editável, então não há
                            paleta fixa que dê conta. O rótulo basta. */}
                        {meeting.meeting_type_id && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {types.find((t) => t.id === meeting.meeting_type_id)?.label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                        {meeting.meeting_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {(() => { const d = meeting.meeting_date!.slice(0, 10).split("-").map(Number); return new Date(d[0], d[1] - 1, d[2]).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }); })()}
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
                          <span className="inline-flex items-center gap-1 font-medium text-foreground max-w-[220px]">
                            <Avatar className="h-4 w-4 shrink-0">
                              {(() => {
                                const avatar = resolveAvatarFromLookup(meeting.responsible, meeting.responsible, assigneeAvatarMap);
                                return avatar ? <AvatarImage src={avatar} alt={meeting.responsible} /> : null;
                              })()}
                              <AvatarFallback className="text-[8px]">{getAvatarInitials(meeting.responsible)}</AvatarFallback>
                            </Avatar>
                            <span className="truncate">{meeting.responsible}</span>
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
                  {(canManageProject || meeting.created_by === user?.id) && (
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

                    {/* Ata — o "Salvar como Lição Aprendida" era um botão
                        grande solto embaixo (e antes disso só aparecia no tipo
                        Retrospective, cerimônia que ninguém usava). Virou ícone
                        no cabeçalho da seção, como nas decisões e ações. */}
                    {meeting.minutes && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                          📝 Ata
                          {canEditMeeting && (
                            <span className="ml-auto">
                              <PromoverBotoes
                                feitos={promovidos[`ata:${meeting.id}`] || []}
                                onLicao={onCreateLesson && (() => promoverParaLicao(`ata:${meeting.id}`, meeting.minutes || ""))}
                              />
                            </span>
                          )}
                        </h4>
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
                          <div key={d.id} className="flex items-center gap-2 text-sm p-2 bg-accent/20 rounded">
                            <span className="flex-1 min-w-0">{d.description}</span>
                            {/* Antes só havia "Gerar Tarefa", e escondido em
                                opacity-0: ação que só aparece no hover não é
                                descoberta por quem não sabe que existe.
                                Agora as três promoções ficam visíveis. */}
                            {canEditMeeting && (
                              <PromoverBotoes
                                feitos={promovidos[`dec:${d.id}`] || []}
                                onAtividade={onCreateActivity && (() => promoverParaAtividade(`dec:${d.id}`, d.description))}
                                onLicao={onCreateLesson && (() => promoverParaLicao(`dec:${d.id}`, d.description))}
                                onRisco={onCreateBlocker && (() => promoverParaRisco(`dec:${d.id}`, d.description))}
                              />
                            )}
                            {canEditMeeting && (
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => handleDeleteDecision(d.id, meeting.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
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
                          {newDecision.trim() && (
                            <AIAssistButton value={newDecision} onChange={setNewDecision} context="meeting_decision" size="icon" />
                          )}
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
                        {/* A ata terminava nela mesma: a ação era gravada com
                            responsável e ninguém era avisado. Só aparece quando
                            há ação aberta COM responsável — sem isso não há a
                            quem notificar. */}
                        {canEditMeeting && meetingActions.some((a) => !a.is_completed && a.assigned_to) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 ml-auto gap-1 text-[11px] font-normal"
                            disabled={notifyingId === meeting.id}
                            onClick={() => handleNotifyActions(meeting.id)}
                          >
                            <Bell className="w-3 h-3" />
                            {notifyingId === meeting.id ? "enviando…" : "Avisar responsáveis"}
                          </Button>
                        )}
                      </h4>
                      <div className="space-y-1">
                        {meetingActions.map((a) => (
                          <div key={a.id} className="flex items-center gap-2 text-sm p-2 bg-accent/20 rounded">
                            <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
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
                              {a.assigned_to && (
                                <Badge variant="outline" className="text-[10px]">
                                  <span className="inline-flex items-center gap-1 max-w-[180px]">
                                    <Avatar className="h-4 w-4 shrink-0">
                                      {(() => {
                                        const avatar = resolveAvatarFromLookup(a.assigned_to, a.assigned_to, assigneeAvatarMap);
                                        return avatar ? <AvatarImage src={avatar} alt={a.assigned_to} /> : null;
                                      })()}
                                      <AvatarFallback className="text-[8px]">{getAvatarInitials(a.assigned_to)}</AvatarFallback>
                                    </Avatar>
                                    <span className="truncate">{a.assigned_to}</span>
                                  </span>
                                </Badge>
                              )}
                              {a.due_date && <Badge variant="secondary" className="text-[10px]">📅 {new Date(a.due_date).toLocaleDateString("pt-BR")}</Badge>}
                            </div>
                            {canEditMeeting && (
                              <div className="flex items-center gap-1">
                                <PromoverBotoes
                                  feitos={[
                                    ...(promovidos[`acao:${a.id}`] || []),
                                    // activity_id gravado = já foi promovida em
                                    // outra sessão; o estado local não saberia.
                                    ...(a.activity_id ? ["atividade"] : []),
                                  ]}
                                  onAtividade={onCreateActivity && (() => handlePromoteToActivity(a, meeting.id))}
                                  onLicao={onCreateLesson && (() => promoverParaLicao(`acao:${a.id}`, a.description))}
                                />
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => handleDeleteAction(a.id, meeting.id)}>
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
                          {/* Era Input de texto livre: dava para digitar
                              qualquer coisa, e a ação nascia com um
                              "responsável" que não existe no sistema — logo,
                              sem ninguém para notificar. Agora escolhe da
                              lista real de pessoas. */}
                          <PersonCombobox
                            people={profiles.map((p) => ({
                              id: p.id,
                              full_name: p.full_name || p.email || "Sem nome",
                              sector: p.sector,
                              role_title: p.role_title,
                              avatar_url: p.avatar_url,
                            }))}
                            value={profiles.find((p) => p.full_name === newAction.assigned_to)?.id ?? null}
                            placeholder="Responsável"
                            className="h-8 text-sm"
                            onSelect={(p) => setNewAction({ ...newAction, assigned_to: p.full_name })}
                            onClear={() => setNewAction({ ...newAction, assigned_to: "" })}
                          />
                          <div className="flex gap-1">
                            <DateField
                              value={newAction.due_date}
                              onChange={(v) => setNewAction({ ...newAction, due_date: v })}
                              className="text-sm h-8"
                            />
                            <Button size="sm" variant="outline" className="h-8" onClick={() => handleAddAction(meeting.id)}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      {canEditMeeting && newAction.description.trim() && (
                        <div className="flex justify-end mt-1">
                          <AIAssistButton value={newAction.description} onChange={(v) => setNewAction({ ...newAction, description: v })} context="meeting_action" />
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
