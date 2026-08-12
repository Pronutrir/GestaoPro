'use client';
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FileText, Plus, Trash2, ExternalLink, Upload, Pencil, Save, X, Send, Clock, CheckCircle2, XCircle, Paperclip, Search, ChevronsUpDown, Check, MoreHorizontal, Link as LinkIcon } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AIAssistButton } from "@/components/AIAssistButton";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { useAssigneeAvatarLookup } from "@/hooks/useAssigneeAvatarLookup";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { useAuth } from "@/contexts/AuthContext";
import { DocumentFlowPanel } from "@/components/documentos/DocumentFlowPanel";
import { FileUploadField, type UploadResult } from "@/components/documentos/FileUploadField";
import { resolveFileUrl, ehLink, dominioDe, rotuloFormato, nomeDoArquivo } from "@/lib/documentCenter";
import { StartFlowDialog, type DraftParticipant } from "@/components/documentos/StartFlowDialog";
import {
  FLOW_KINDS, ROLE_META, flowProgress, isMyTurn, hashFile, captureOrigin,
  type DocumentFlow, type FlowParticipant, type FlowEvent, type FlowKind,
} from "@/lib/documentFlow";

// Tabelas do fluxo ainda fora dos tipos gerados (migration pendente na VM).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface ProjectDocument {
  id: string;
  project_id: string;
  activity_id: string | null;
  phase_id: string | null;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  version: number;
  uploaded_by: string | null;
  description: string | null;
  created_at: string;
  /** Caminho no bucket privado; vazio nos documentos que são link externo. */
  storage_path?: string | null;
}

interface Phase {
  id: string;
  title: string;
}

interface Activity {
  id: string;
  title: string;
  /** Código da EAP — entra na busca e identifica a atividade na lista. */
  wbs_code?: string | null;
  /** A que fase pertence: as da fase escolhida sobem para o topo. */
  phase_id?: string | null;
}

interface DocumentManagerProps {
  projectId: string;
  phases: Phase[];
  activities: Activity[];
  canManageProject?: boolean;
}

const emptyForm = {
  file_name: "",
  file_url: "",
  file_type: "",
  description: "",
  uploaded_by: "",
  phase_id: "",
  activity_id: "",
};

export const DocumentManager = ({ projectId, phases, activities, canManageProject = false }: DocumentManagerProps) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const [activityQuery, setActivityQuery] = useState("");
  // Arquivo enviado no formulário (ou link, no modo alternativo). Guarda o
  // caminho no storage para gravar em `storage_path` — é ele que permite gerar
  // a URL assinada depois, já que o bucket é privado.
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [query, setQuery] = useState("");
  const uploadedByAvatarMap = useAssigneeAvatarLookup(documents.map((doc) => doc.uploaded_by));
  const { user, profile } = useAuth();

  // ===== Fluxo de ciência / aprovação / assinatura =====
  const [flows, setFlows] = useState<DocumentFlow[]>([]);
  const [participants, setParticipants] = useState<FlowParticipant[]>([]);
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const [people, setPeople] = useState<{ id: string; full_name: string; sector: string | null; role_title?: string | null; avatar_url?: string | null }[]>([]);
  const [flowUnavailable, setFlowUnavailable] = useState(false);
  const [startFor, setStartFor] = useState<ProjectDocument | null>(null);
  const [openFlowDoc, setOpenFlowDoc] = useState<string | null>(null);

  useEffect(() => {
    fetchDocuments();
    fetchFlows();
  }, [projectId]);

  const fetchFlows = async () => {
    const [flowRes, peopleRes] = await Promise.all([
      sb.from("document_flows").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, sector, role_title, avatar_url")
        .not("full_name", "is", null).order("full_name"),
    ]);
    if (flowRes.error && /document_flows|does not exist|schema cache/i.test(flowRes.error.message || "")) {
      setFlowUnavailable(true);
      return;
    }
    setFlowUnavailable(false);
    const list = (flowRes.data as DocumentFlow[]) || [];
    setFlows(list);
    setPeople((peopleRes.data as { id: string; full_name: string; sector: string | null }[]) || []);
    if (list.length > 0) {
      const ids = list.map((f) => f.id);
      const [partRes, evRes] = await Promise.all([
        sb.from("document_participants").select("*").in("flow_id", ids),
        sb.from("document_flow_events").select("*").in("flow_id", ids).order("occurred_at", { ascending: false }),
      ]);
      if (!partRes.error) setParticipants((partRes.data as FlowParticipant[]) || []);
      if (!evRes.error) setEvents((evRes.data as FlowEvent[]) || []);
    } else {
      setParticipants([]);
      setEvents([]);
    }
  };

  /** Registra um evento na trilha — append-only, com a prova do ato. */
  const logEvent = async (flowId: string, type: string, extra?: { participantId?: string; detail?: string }) => {
    // IP vem do servidor: o navegador não conhece o próprio endereço público,
    // e valor escolhido pelo cliente não serve como prova de origem.
    const origin = await captureOrigin();
    await sb.from("document_flow_events").insert({
      flow_id: flowId,
      participant_id: extra?.participantId ?? null,
      event_type: type,
      actor_id: user?.id ?? null,
      actor_name: profile?.full_name ?? null,
      ip: origin.ip,
      user_agent: origin.userAgent,
      detail: extra?.detail ?? null,
    });
  };

  const startFlow = async (data: {
    kind: FlowKind; message: string; dueDate: string; participants: DraftParticipant[];
  }) => {
    if (!startFor) return;

    // ASSINATURA exige arquivo NO SISTEMA. Um link externo pode ser trocado
    // pelo dono depois de assinado, e o hash falha em silêncio quando o site
    // bloqueia leitura — assinar o que não se pode provar enfraquece toda a
    // trilha. Ciência e aprovação seguem valendo para link: ali o ato é
    // "eu vi", não "eu me responsabilizo por este conteúdo exato".
    //
    // `storagePathUnavailable`: enquanto a migration do bucket não roda, a
    // coluna não existe e TODO documento pareceria link externo — a regra
    // bloquearia até arquivo legítimo. Sem a coluna, não há o que distinguir,
    // então a regra não se aplica.
    if (data.kind === "assinatura" && !storagePathUnavailable && !startFor.storage_path) {
      toast({
        title: "Assinatura exige o arquivo enviado",
        description: "Este documento é um link externo, que pode mudar depois de assinado. Envie o arquivo ao projeto para poder assinar — ou use Ciência/Aprovação.",
        variant: "destructive",
      });
      return;
    }

    // Impressão digital do arquivo: prova que ele não mudou depois.
    let fileHash: string | null = null;
    try {
      const res = await fetch(startFor.file_url);
      if (res.ok) fileHash = await hashFile(await res.blob());
    } catch { /* link externo sem CORS: segue sem hash (só ciência/aprovação) */ }

    const { data: flow, error } = await sb.from("document_flows").insert({
      document_id: startFor.id,
      project_id: projectId,
      kind: data.kind,
      status: "circulando",
      title: startFor.file_name,
      message: data.message || null,
      due_date: data.dueDate || null,
      document_version: startFor.version ?? 1,
      file_hash: fileHash,
      file_url_snapshot: startFor.file_url,
      created_by: user?.id ?? null,
      created_by_name: profile?.full_name ?? null,
      started_at: new Date().toISOString(),
    }).select("id").single();

    if (error) {
      toast({ title: "Não foi possível enviar o documento", description: error.message, variant: "destructive" });
      return;
    }

    const rows = data.participants.map((p) => ({
      flow_id: flow.id,
      user_id: p.user_id,
      user_name: p.user_name,
      role: p.role,
      position: ROLE_META[p.role].blocking ? p.position : 999,
      is_blocking: ROLE_META[p.role].blocking,
      // 'pendente', não 'notificado': quem marca como notificado é a função
      // que de fato cria o aviso. Gravar o rótulo aqui era mentira — o
      // participante nascia "notificado" e ninguém recebia nada.
      status: "pendente",
    }));
    await sb.from("document_participants").insert(rows);
    await logEvent(flow.id, "enviado", { detail: `${rows.length} participante(s) · ${FLOW_KINDS[data.kind].label}` });

    // Avisa QUEM ESTÁ NA VEZ (menor posição pendente). Os demais são avisados
    // quando a vez chegar, pelo gatilho em document_participants.
    const { data: avisados, error: notifyErr } = await (sb as any)
      .rpc("notify_flow_participants", { _flow_id: flow.id });

    toast({
      title: "Documento enviado",
      // Migration pendente: o fluxo circula, mas ninguém é avisado. Dizer isso
      // é melhor que prometer um aviso que não sai.
      description: notifyErr
        ? `Circulando para ${rows.length} pessoa(s). Aviso automático indisponível neste ambiente — avise manualmente.`
        : `${avisados ?? 0} pessoa(s) avisada(s) agora; as demais quando chegar a vez.`,
      variant: notifyErr ? "destructive" : undefined,
    });
    setStartFor(null);
    setOpenFlowDoc(startFor.id);
    fetchFlows();
  };

  /** Concluir (ciência/aprovação/assinatura) ou recusar, com a prova do ato. */
  const actOnFlow = async (flowId: string, participantId: string, action: "concluir" | "recusar", reason?: string) => {
    const flow = flows.find((f) => f.id === flowId);
    if (!flow) return;
    const now = new Date().toISOString();

    if (action === "recusar") {
      await sb.from("document_participants")
        .update({ status: "recusado", refusal_reason: reason ?? null, completed_at: now })
        .eq("id", participantId);
      // Recusa encerra o fluxo: para retomar, nova versão e novo fluxo.
      await sb.from("document_flows").update({ status: "recusado", finished_at: now }).eq("id", flowId);
      await logEvent(flowId, "recusado", { participantId, detail: reason });
      toast({ title: "Documento recusado", description: "O autor será notificado com o motivo." });
      fetchFlows();
      return;
    }

    // Clickwrap: guarda o texto EXATO que a pessoa viu ao confirmar, mais a
    // origem do ato. É a linha com mais peso probatório do fluxo inteiro.
    const origin = await captureOrigin();
    await sb.from("document_participants").update({
      status: "concluido",
      completed_at: now,
      accepted_text: FLOW_KINDS[flow.kind].acceptText,
      ip: origin.ip,
      user_agent: origin.userAgent,
    }).eq("id", participantId);

    const eventType = flow.kind === "assinatura" ? "assinado" : flow.kind === "aprovacao" ? "aprovado" : "ciencia";
    await logEvent(flowId, eventType, { participantId, detail: FLOW_KINDS[flow.kind].acceptText });

    // Todos os bloqueantes concluíram? Então o fluxo fecha.
    const after = participants.map((p) =>
      p.id === participantId ? { ...p, status: "concluido" as const } : p);
    const prog = flowProgress(after.filter((p) => p.flow_id === flowId));
    if (prog.isComplete) {
      await sb.from("document_flows").update({ status: "concluido", finished_at: now }).eq("id", flowId);
      await logEvent(flowId, "concluido");
    }

    toast({ title: prog.isComplete ? "Fluxo concluído" : "Registrado", description: FLOW_KINDS[flow.kind].acceptText });
    fetchFlows();
  };

  const cancelFlow = async (flowId: string) => {
    const ok = await appConfirm({
      title: "Cancelar circulação",
      description: "O documento deixa de circular e o que já foi registrado permanece na trilha. Para retomar, será preciso enviar de novo.",
      confirmText: "Cancelar fluxo",
      destructive: true,
    });
    if (!ok) return;
    await sb.from("document_flows").update({ status: "cancelado", finished_at: new Date().toISOString() }).eq("id", flowId);
    await logEvent(flowId, "cancelado");
    toast({ title: "Fluxo cancelado" });
    fetchFlows();
  };

  const sendFlow = async (flowId: string) => {
    await sb.from("document_flows").update({ status: "circulando", started_at: new Date().toISOString() }).eq("id", flowId);
    await logEvent(flowId, "enviado");
    fetchFlows();
  };

  /**
   * Marca que a pessoa ABRIU o documento que está esperando por ela.
   * `viewed_at` e o status "visualizado" já eram exibidos pelo painel, mas nada
   * os gravava — a coluna existia sem nunca ser preenchida. Em fluxo de
   * assinatura isso importa: separa "não viu ainda" de "viu e não respondeu".
   */
  const markViewed = async (docId: string) => {
    const flow = flows.find((f) => f.document_id === docId);
    if (!flow || flow.status !== "circulando") return;
    const mine = participants.find(
      (p) => p.flow_id === flow.id && p.user_id === user?.id && p.status === "notificado",
    );
    if (!mine) return;

    const origin = await captureOrigin();
    await sb.from("document_participants")
      .update({ status: "visualizado", viewed_at: new Date().toISOString() })
      .eq("id", mine.id);
    await sb.from("document_flow_events").insert({
      flow_id: flow.id,
      participant_id: mine.id,
      event_type: "visualizado",
      actor_id: user?.id ?? null,
      actor_name: profile?.full_name ?? null,
      ip: origin.ip,
      user_agent: origin.userAgent,
    });
    fetchFlows();
  };

  // Detectado na primeira leitura: sem a coluna, não dá para distinguir
  // arquivo enviado de link externo (ver a regra de assinatura em startFlow).
  const [storagePathUnavailable, setStoragePathUnavailable] = useState(false);

  const fetchDocuments = async () => {
    // Sonda barata: pede só a coluna, uma linha. Se não existir, o PostgREST
    // devolve 400 e a regra de assinatura se desliga.
    const { error: probe } = await supabase
      .from("project_documents").select("storage_path").limit(1);
    setStoragePathUnavailable(!!probe && /storage_path/i.test(probe.message));

    const base = () => supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_trashed", false)
      .order("created_at", { ascending: false });

    // Só as versões VIGENTES. `is_current` é null em registros antigos (a
    // coluna nasceu depois), por isso o `or` — filtrar só por `true` esconderia
    // todo o acervo anterior à migration. Se a coluna nem existe, cai para a
    // consulta sem filtro em vez de deixar a lista vazia.
    let { data, error } = await base().or("is_current.is.null,is_current.eq.true");
    if (error && /is_current/i.test(error.message)) {
      ({ data, error } = await base());
    }

    if (!error && data) setDocuments(data);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setUpload(null);
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (doc: ProjectDocument) => {
    setEditingId(doc.id);
    setShowForm(true);
    setUpload(null);
    setForm({
      file_name: doc.file_name,
      file_url: doc.file_url,
      file_type: doc.file_type || "",
      description: doc.description || "",
      uploaded_by: doc.uploaded_by || "",
      phase_id: doc.phase_id || "",
      activity_id: doc.activity_id || "",
    });
  };

  const handleSubmit = async () => {
    if (!form.file_name.trim() || !form.file_url.trim()) {
      toast({
        title: editingId ? "Informe nome e URL do documento" : "Envie um arquivo ou informe um link",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, unknown> = {
      file_name: form.file_name,
      file_url: form.file_url,
      file_type: form.file_type || null,
      description: form.description || null,
      // Autoria deixa de ser texto digitado: quem envia é quem está logado.
      uploaded_by: form.uploaded_by || profile?.full_name || null,
      uploaded_by_id: user?.id ?? null,
      phase_id: form.phase_id || null,
      activity_id: form.activity_id || null,
    };
    if (upload) {
      payload.storage_path = upload.storagePath;
      payload.file_size = upload.fileSize;
    }

    // storage_path / uploaded_by_id podem não existir se a migration ainda não
    // rodou na VM. Repete sem elas em vez de impedir o cadastro.
    const withoutNewCols = () => {
      const { storage_path, uploaded_by_id, file_size, ...rest } = payload;
      void storage_path; void uploaded_by_id; void file_size;
      return rest;
    };
    const isMissingColumn = (msg: string) =>
      /storage_path|uploaded_by_id|file_size/i.test(msg);

    if (editingId) {
      let { error } = await sb.from("project_documents").update(payload).eq("id", editingId);
      if (error && isMissingColumn(error.message)) {
        ({ error } = await sb.from("project_documents").update(withoutNewCols()).eq("id", editingId));
      }
      if (error) {
        toast({ title: "Erro ao atualizar documento", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Documento atualizado!" });
    } else {
      let { error } = await sb
        .from("project_documents")
        .insert({ ...payload, project_id: projectId });
      if (error && isMissingColumn(error.message)) {
        ({ error } = await sb.from("project_documents").insert({ ...withoutNewCols(), project_id: projectId }));
      }
      if (error) {
        toast({ title: "Erro ao adicionar documento", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Documento adicionado!" });
    }

    resetForm();
    fetchDocuments();
  };

  /**
   * O que aparece na lista: filtrado pela busca e com o que exige ação da
   * pessoa no topo. Um termo esperando assinatura há três dias importa mais
   * que um anexo enviado hoje — e some no meio de uma lista cronológica.
   */
  const atividadeEscolhida = useMemo(
    () => activities.find((a) => a.id === form.activity_id) || null,
    [activities, form.activity_id],
  );

  /**
   * Atividades para o seletor: filtradas pela busca e agrupadas pela fase.
   *
   * A busca cobre título E código EAP, sem acento e sem caixa — quem procura
   * "1.1.2" ou "reuniao" precisa achar do mesmo jeito.
   *
   * O agrupamento existe porque a lista antes ignorava a Fase selecionada ao
   * lado: escolher "1 Iniciação" e ver atividades da fase 3 misturadas é ruído,
   * e permite anexar o documento a uma combinação incoerente. As da fase
   * escolhida sobem; as demais continuam acessíveis, porque um documento pode
   * legitimamente cruzar fases.
   */
  const atividadesAgrupadas = useMemo(() => {
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const q = norm(activityQuery.trim());

    const filtradas = q
      ? activities.filter((a) => norm(`${a.wbs_code || ""} ${a.title}`).includes(q))
      : activities;

    // Ordem da EAP: numérica, senão "1.10" viria antes de "1.2".
    const ordenar = (arr: Activity[]) =>
      arr.slice().sort((x, y) => {
        const wx = (x.wbs_code || "").trim(), wy = (y.wbs_code || "").trim();
        if (wx && wy && wx !== wy) return wx.localeCompare(wy, undefined, { numeric: true });
        if (wx && !wy) return -1;
        if (!wx && wy) return 1;
        return x.title.localeCompare(y.title);
      });

    if (!form.phase_id) {
      return filtradas.length ? [{ titulo: "Atividades", itens: ordenar(filtradas) }] : [];
    }

    const daFase = filtradas.filter((a) => a.phase_id === form.phase_id);
    const outras = filtradas.filter((a) => a.phase_id !== form.phase_id);
    const nomeFase = phases.find((p) => p.id === form.phase_id)?.title || "Desta fase";

    return [
      daFase.length && { titulo: nomeFase, itens: ordenar(daFase) },
      outras.length && { titulo: "Outras fases", itens: ordenar(outras) },
    ].filter(Boolean) as Array<{ titulo: string; itens: Activity[] }>;
  }, [activities, phases, activityQuery, form.phase_id]);

  const visibleDocuments = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? documents.filter((d) =>
          d.file_name.toLowerCase().includes(q) ||
          (d.file_type ?? "").toLowerCase().includes(q) ||
          (d.uploaded_by ?? "").toLowerCase().includes(q) ||
          (d.description ?? "").toLowerCase().includes(q))
      : documents;

    const needsMe = (docId: string) => {
      const flow = flows.find((f) => f.document_id === docId);
      if (!flow || flow.status !== "circulando") return false;
      return isMyTurn(participants.filter((p) => p.flow_id === flow.id), user?.id ?? null);
    };

    return [...filtered].sort((a, b) => {
      const am = needsMe(a.id), bm = needsMe(b.id);
      if (am !== bm) return am ? -1 : 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [documents, query, flows, participants, user?.id]);

  /**
   * Abre o documento numa aba nova.
   *
   * Abre a aba ANTES de pedir a URL assinada e só então navega: se a espera
   * viesse primeiro, o navegador trataria o window.open como popup e bloquearia,
   * porque já não seria resposta direta ao clique.
   */
  const openDocument = async (doc: ProjectDocument) => {
    const tab = window.open("", "_blank", "noopener,noreferrer");
    const url = await resolveFileUrl(supabase.storage, doc);
    if (tab) tab.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: "Excluir documento",
      description: "Excluir este documento?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await supabase.from("project_documents").update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq("id", id);
    fetchDocuments();
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="font-semibold text-foreground flex items-center gap-2 shrink-0">
          <FileText className="w-5 h-5 text-primary" />
          Documentos ({documents.length})
        </h3>
        {/* Busca: a lista carregava tudo ordenado por data, sem nenhuma forma
            de encontrar um documento específico. */}
        {documents.length > 4 && (
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar documento…" className="h-8 pl-8 text-[13px]" />
          </div>
        )}
        <Button
          size="sm"
          variant={showForm ? "secondary" : "default"}
          onClick={() => { if (showForm) resetForm(); else { resetForm(); setShowForm(true); } }}
          className="gap-1 ml-auto shrink-0"
        >
          {showForm ? <><X className="w-4 h-4" /> Cancelar</> : <><Plus className="w-4 h-4" /> Novo Documento</>}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 p-4 bg-card rounded-lg border border-border shadow-sm">
          {/* Upload de verdade. Antes eram três campos digitados à mão (nome,
              URL e tipo); o arquivo já sabe as três coisas. Só o modo link
              ainda pede o nome, porque uma URL externa não o informa. */}
          {!editingId && (
            <FileUploadField
              projectId={projectId}
              value={upload}
              onChange={(v) => {
                setUpload(v);
                if (v) {
                  setForm((f) => ({
                    ...f,
                    file_name: v.fileName,
                    file_url: v.fileUrl,
                    file_type: v.fileType,
                  }));
                }
              }}
            />
          )}
          <Input placeholder="Nome do documento *" value={form.file_name} onChange={(e) => setForm({ ...form, file_name: e.target.value })} />
          {/* Na edição, a URL só é editável quando o documento É um link. Para
              arquivo enviado, o campo guarda o caminho no storage — expor isso
              como texto editável só permitiria quebrar o vínculo. */}
          {editingId && !documents.find((d) => d.id === editingId)?.storage_path && (
            <Input placeholder="URL do documento *" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} />
          )}
          {editingId && documents.find((d) => d.id === editingId)?.storage_path && (
            <p className="text-[12px] text-muted-foreground">
              Arquivo enviado ao projeto. Para trocar o arquivo, exclua e envie de novo.
            </p>
          )}
          {/* IA DENTRO do campo, não numa linha abaixo.
              O botão ocupava uma faixa própria que aparecia e sumia conforme a
              descrição tinha texto — o formulário crescia e encolhia enquanto
              se digitava, e a linha extra empurrava fase e atividade para
              baixo. É o mesmo padrão que o TAP já usa (ProjectCharter:152):
              `pr-10` abre espaço no campo e o botão se sobrepõe à direita. */}
          <div className="relative">
            <Input
              placeholder="Descrição (opcional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={form.description.trim() ? "pr-10" : ""}
            />
            {form.description.trim() && (
              <div className="absolute top-1/2 -translate-y-1/2 right-1">
                <AIAssistButton
                  value={form.description}
                  onChange={(v) => setForm({ ...form, description: v })}
                  context="document_description"
                  size="icon"
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {phases.length > 0 && (
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.phase_id} onChange={(e) => setForm({ ...form, phase_id: e.target.value })}>
                <option value="">Fase (opcional)</option>
                {phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            )}
            {/* Atividade: COMBOBOX com busca, não <select>.
                Medido: o maior projeto tem 168 atividades, e a lista nativa
                obrigava a rolar até achar. A Fase continua <select> de
                propósito — são 4 opções, e buscar entre quatro é mais atrito
                que rolar.

                As da FASE ESCOLHIDA vêm primeiro: a lista antes ignorava a
                fase selecionada ao lado, misturando atividades de fases
                diferentes. Agrupa em vez de filtrar porque um documento pode
                legitimamente cruzar fases — filtrar seria decidir pelo usuário. */}
            {activities.length > 0 && (
              <Popover open={activityPickerOpen} onOpenChange={(o) => { setActivityPickerOpen(o); if (!o) setActivityQuery(""); }}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-between font-normal text-sm px-3"
                  >
                    <span className={cn("truncate", !atividadeEscolhida && "text-muted-foreground")}>
                      {atividadeEscolhida
                        ? `${atividadeEscolhida.wbs_code ? atividadeEscolhida.wbs_code + " " : ""}${atividadeEscolhida.title}`
                        : "Atividade (opcional)"}
                    </span>
                    <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar por título ou código EAP..."
                      value={activityQuery}
                      onValueChange={setActivityQuery}
                    />
                    <CommandList className="max-h-[260px]">
                      <CommandEmpty>Nenhuma atividade encontrada.</CommandEmpty>
                      {form.activity_id && (
                        <CommandItem
                          value="__limpar__"
                          onSelect={() => { setForm({ ...form, activity_id: "" }); setActivityPickerOpen(false); }}
                          className="text-muted-foreground"
                        >
                          Sem atividade
                        </CommandItem>
                      )}
                      {atividadesAgrupadas.map((grupo) => (
                        <CommandGroup key={grupo.titulo} heading={grupo.titulo}>
                          {grupo.itens.map((a) => (
                            <CommandItem
                              key={a.id}
                              value={a.id}
                              onSelect={() => {
                                setForm({ ...form, activity_id: a.id });
                                setActivityPickerOpen(false);
                                setActivityQuery("");
                              }}
                              className="gap-2 text-[13px] py-2"
                            >
                              {/* Badge com fundo próprio, não texto solto: o item
                                  selecionado usa bg-primary sólido, e um
                                  `text-muted-foreground` fixo desaparecia no
                                  azul — o código EAP ficava invisível justamente
                                  na linha em foco. `currentColor` herda a cor do
                                  item, então funciona nos dois estados. */}
                              {a.wbs_code && (
                                <span className="font-mono text-[11px] shrink-0 rounded px-1.5 py-0.5 border border-current/25 bg-current/10 tabular-nums">
                                  {a.wbs_code}
                                </span>
                              )}
                              <span className="truncate flex-1">{a.title}</span>
                              {a.id === form.activity_id && <Check className="w-4 h-4 shrink-0" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <Button onClick={handleSubmit} className="gap-1">
            {editingId ? <><Save className="w-4 h-4" /> Salvar</> : <><Upload className="w-4 h-4" /> Adicionar</>}
          </Button>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento associado</p>
      ) : visibleDocuments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhum documento encontrado para “{query}”.
        </p>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto">
          {visibleDocuments.map((doc, idx) => {
          // Fluxo mais recente deste documento (a lista já vem ordenada).
          const flow = flows.find((f) => f.document_id === doc.id) ?? null;
          const flowParts = flow ? participants.filter((p) => p.flow_id === flow.id) : [];
          const flowEvents = flow ? events.filter((e) => e.flow_id === flow.id) : [];
          const prog = flowProgress(flowParts);
          const myTurn = flow?.status === "circulando" && isMyTurn(flowParts, user?.id ?? null);
          const isOpen = openFlowDoc === doc.id;

          // A lista vem ordenada com as pendências primeiro; estes rótulos só
          // nomeiam a fronteira entre os dois blocos, sem reordenar nada.
          const prev = idx > 0 ? visibleDocuments[idx - 1] : null;
          const prevMine = prev ? (() => {
            const pf = flows.find((f) => f.document_id === prev.id);
            return pf?.status === "circulando" &&
              isMyTurn(participants.filter((p) => p.flow_id === pf.id), user?.id ?? null);
          })() : null;
          const groupLabel =
            myTurn && idx === 0 ? "Precisa de você"
            : !myTurn && prevMine ? "Demais documentos"
            : null;

          return (
          <div key={`g-${doc.id}`}>
          {groupLabel && (
            <p className={cn("text-[10.5px] font-semibold uppercase tracking-wide mb-1.5",
              groupLabel === "Precisa de você" ? "text-primary" : "text-muted-foreground mt-3")}>
              {groupLabel}
            </p>
          )}
          <div className={cn("border border-border rounded-lg bg-card overflow-hidden transition-shadow",
                myTurn && "border-primary/50 ring-1 ring-primary/20")}>
            <div className="flex items-center justify-between p-3 group hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Ícone diz o que é ANTES do selo: arquivo mora no projeto,
                    link mora fora — e a diferença muda o que se pode fazer com
                    ele (link não assina). */}
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                  ehLink(doc) ? "bg-success/10" : "bg-primary/10",
                )}>
                  {ehLink(doc)
                    ? <LinkIcon className="w-5 h-5 text-success" />
                    : <FileText className="w-5 h-5 text-primary" />}
                </div>
                <div className="min-w-0 flex-1">
                  {/* Sem selo de versão: ele existia para dar visibilidade ao
                      "enviar nova versão", removido a pedido. Todo documento
                      fica em v1, e "v1" em tudo seria ruído. A versão continua
                      na linha de metadados abaixo. */}
                  <p className="font-medium text-sm text-foreground truncate">{doc.file_name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ehLink(doc) ? (
                      <Badge variant="outline" className="text-xs border-success/40 text-success">Link</Badge>
                    ) : (
                      // O selo mostra o FORMATO por nome, e o tooltip traz o
                      // nome real do arquivo: "teste pdf" salvo como .md exibia
                      // "MD" e não havia como descobrir por quê.
                      doc.file_type && (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          title={nomeDoArquivo(doc.storage_path) || undefined}
                        >
                          {rotuloFormato(doc.file_type)}
                        </Badge>
                      )
                    )}
                    {doc.phase_id && (
                      <Badge className="bg-primary/20 text-primary text-xs">
                        {phases.find((p) => p.id === doc.phase_id)?.title}
                      </Badge>
                    )}
                    {/* Anexo enviado num card do Kanban cai nesta mesma lista —
                        mesma tabela, filtro sem activity_id. Sem este selo, ele
                        se confundia com documento formal do projeto. */}
                    {doc.activity_id && (() => {
                      const act = activities.find((a) => a.id === doc.activity_id);
                      return (
                        <Badge variant="outline" className="text-xs gap-1 border-dashed"
                          title={act ? `Anexo da atividade "${act.title}"` : "Anexo de uma atividade"}>
                          <Paperclip className="w-3 h-3" />
                          {act ? act.title : "atividade"}
                        </Badge>
                      );
                    })()}
                    {doc.uploaded_by && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Avatar className="h-4 w-4 shrink-0">
                          {(() => {
                            const avatar = resolveAvatarFromLookup(doc.uploaded_by, doc.uploaded_by, uploadedByAvatarMap);
                            return avatar ? <AvatarImage src={avatar} alt={doc.uploaded_by} /> : null;
                          })()}
                          <AvatarFallback className="text-[8px]">{getAvatarInitials(doc.uploaded_by)}</AvatarFallback>
                        </Avatar>
                        <span>{doc.uploaded_by}</span>
                      </span>
                    )}
                    {/* Link não tem versão — o conteúdo é de outra pessoa e muda
                        sem passar por aqui. No lugar dela, o DOMÍNIO: saber para
                        onde aponta antes de clicar vale mais que um "v1" que
                        nunca vai virar v2. */}
                    <span className="text-xs text-muted-foreground">
                      {ehLink(doc)
                        ? (dominioDe(doc.file_url) || "link externo")
                        : `v${doc.version}`} · {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    {/* Selo do fluxo: o que está sendo pedido e como vai */}
                    {flow && (
                      <button type="button" onClick={() => {
                        const next = isOpen ? null : doc.id;
                        setOpenFlowDoc(next);
                        // Abrir o painel É a visualização do documento.
                        if (next) void markViewed(doc.id);
                      }}
                        className={cn("inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-bold transition-colors",
                          flow.status === "concluido" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : flow.status === "recusado" || flow.status === "cancelado" ? "bg-destructive/10 text-destructive"
                          : myTurn ? "bg-primary text-primary-foreground"
                          : "bg-primary/10 text-primary")}
                        title="Ver participantes e trilha">
                        {flow.status === "concluido" ? <CheckCircle2 className="w-3 h-3" />
                          : flow.status === "recusado" ? <XCircle className="w-3 h-3" />
                          : <Clock className="w-3 h-3" />}
                        {myTurn ? "sua vez"
                          : flow.status === "circulando" ? `${FLOW_KINDS[flow.kind].short} ${prog.done}/${prog.total}`
                          : FLOW_KINDS[flow.kind].label}
                      </button>
                    )}
                  </div>
                  {doc.description && <p className="text-xs text-muted-foreground mt-1 truncate">{doc.description}</p>}
                </div>
              </div>
              <div className="flex gap-1 ml-2">
                {/* Enviar para circular: só quem pode editar o projeto, e só
                    se não houver fluxo em andamento neste documento. */}
                {canManageProject && !flowUnavailable && (!flow || flow.status !== "circulando") && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-primary"
                    onClick={() => setStartFor(doc)} title="Enviar para ciência, aprovação ou assinatura">
                    <Send className="w-4 h-4" />
                  </Button>
                )}
                {/* Bucket privado: a URL de leitura é assinada na hora e vale
                    poucos minutos. Link fixo só funciona para os documentos
                    antigos, que são URLs externas coladas. */}
                <Button size="icon" variant="ghost" className="h-8 w-8"
                  title="Abrir documento"
                  onClick={() => void openDocument(doc)}>
                  <ExternalLink className="w-4 h-4" />
                </Button>
                {/* Menu com RÓTULOS, não ícones soltos: dois ícones parecidos
                    lado a lado não dizem o que fazem.
                    "Enviar nova versão" foi REMOVIDO a pedido (11/08). Tinha
                    zero uso em 34 documentos e acrescentava um segundo jeito de
                    substituir arquivo, ao lado de "Editar dados". */}
                {canManageProject && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Ações do documento"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onSelect={() => startEdit(doc)}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Editar dados
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        onSelect={(e) => { e.preventDefault(); handleDelete(doc.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Painel do fluxo: participantes, progresso e trilha */}
            {flow && isOpen && (
              <div className="px-3 pb-3">
                <DocumentFlowPanel
                  flow={flow}
                  participants={flowParts}
                  events={flowEvents}
                  myUserId={user?.id ?? null}
                  canManage={canManageProject}
                  profileAvatarMap={uploadedByAvatarMap}
                  onAct={(pid, action, reason) => actOnFlow(flow.id, pid, action, reason)}
                  onCancel={() => cancelFlow(flow.id)}
                  onSend={() => sendFlow(flow.id)}
                />
              </div>
            )}
          </div>
          </div>
          );
          })}
        </div>
      )}

      {/* Enviar documento para circular */}
      {startFor && (
        <StartFlowDialog
          open={!!startFor}
          onOpenChange={(o) => { if (!o) setStartFor(null); }}
          documentName={startFor.file_name}
          people={people}
          onConfirm={startFlow}
        />
      )}
    </Card>
  );
};