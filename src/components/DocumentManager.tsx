'use client';
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FileText, Plus, Trash2, ExternalLink, Upload, Pencil, Save, X, Send, Clock, CheckCircle2, XCircle, Paperclip, Search, FilePlus } from "lucide-react";
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
import { resolveFileUrl } from "@/lib/documentCenter";
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
  // Documento que está sendo SUBSTITUÍDO por uma versão nova. Diferente de
  // editar: cria um registro novo e aposenta o anterior, preservando a trilha.
  const [novaVersaoDe, setNovaVersaoDe] = useState<ProjectDocument | null>(null);
  const [form, setForm] = useState(emptyForm);
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
    // Sem isto o modo "nova versão" sobreviveria ao cancelar e o próximo
    // cadastro aposentaria um documento sem querer.
    setNovaVersaoDe(null);
  };

  const startEdit = (doc: ProjectDocument) => {
    setEditingId(doc.id);
    setNovaVersaoDe(null);
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
      // NOVA VERSÃO de um documento existente: a anterior não é apagada — sai
      // da lista como versão superada, preservando a trilha de quem assinou o
      // que. Sem isto, substituir um contrato assinado apagava a prova.
      const base = novaVersaoDe
        ? {
            ...payload,
            project_id: projectId,
            version: (novaVersaoDe.version ?? 1) + 1,
            supersedes_id: novaVersaoDe.id,
            is_current: true,
            phase_id: payload.phase_id ?? novaVersaoDe.phase_id,
            activity_id: payload.activity_id ?? novaVersaoDe.activity_id,
          }
        : { ...payload, project_id: projectId };

      let { error } = await sb.from("project_documents").insert(base);
      if (error && /supersedes_id|is_current|version/i.test(error.message)) {
        // Migration do versionamento pendente: cria como documento novo.
        const { supersedes_id, is_current, version, ...semVersao } = base as any;
        void supersedes_id; void is_current; void version;
        ({ error } = await sb.from("project_documents").insert(semVersao));
      }
      if (error && isMissingColumn(error.message)) {
        ({ error } = await sb.from("project_documents").insert({ ...withoutNewCols(), project_id: projectId }));
      }
      if (error) {
        toast({ title: "Erro ao adicionar documento", description: error.message, variant: "destructive" });
        return;
      }

      if (novaVersaoDe) {
        // A anterior deixa de ser a vigente e seu fluxo em aberto é encerrado:
        // manter alguém assinando a v1 depois da v2 existir é pior que cancelar.
        await sb.from("project_documents")
          .update({ is_current: false }).eq("id", novaVersaoDe.id);
        await sb.from("document_flows")
          .update({ status: "cancelado", finished_at: new Date().toISOString() })
          .eq("document_id", novaVersaoDe.id).eq("status", "circulando");
        setNovaVersaoDe(null);
        toast({
          title: `Versão ${(novaVersaoDe.version ?? 1) + 1} publicada`,
          description: "A versão anterior saiu da lista e o fluxo dela foi encerrado.",
        });
      } else {
        toast({ title: "Documento adicionado!" });
      }
    }

    resetForm();
    fetchDocuments();
  };

  /**
   * O que aparece na lista: filtrado pela busca e com o que exige ação da
   * pessoa no topo. Um termo esperando assinatura há três dias importa mais
   * que um anexo enviado hoje — e some no meio de uma lista cronológica.
   */
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
          {/* Nova versão precisa ficar explícito: o formulário é o mesmo do
              cadastro, e sem aviso a pessoa acha que está criando um documento
              solto — quando na verdade vai aposentar o anterior. */}
          {novaVersaoDe && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[12px]">
              <FilePlus className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-medium">
                  Nova versão de “{novaVersaoDe.file_name}” (v{(novaVersaoDe.version ?? 1) + 1})
                </p>
                <p className="text-muted-foreground">
                  A versão atual sai da lista e vira histórico. Se houver fluxo em
                  circulação, ele é encerrado — quem já assinou continua registrado.
                </p>
              </div>
              <button
                type="button"
                className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => { setNovaVersaoDe(null); resetForm(); }}
                title="Cancelar nova versão"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
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
          <Input placeholder="Descrição (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {form.description.trim() && (
            <div className="flex justify-end -mt-2">
              <AIAssistButton value={form.description} onChange={(v) => setForm({ ...form, description: v })} context="document_description" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {phases.length > 0 && (
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.phase_id} onChange={(e) => setForm({ ...form, phase_id: e.target.value })}>
                <option value="">Fase (opcional)</option>
                {phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            )}
            {activities.length > 0 && (
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.activity_id} onChange={(e) => setForm({ ...form, activity_id: e.target.value })}>
                <option value="">Atividade (opcional)</option>
                {activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
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
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-foreground truncate">{doc.file_name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {doc.file_type && <Badge variant="outline" className="text-xs">{doc.file_type}</Badge>}
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
                    <span className="text-xs text-muted-foreground">
                      v{doc.version} · {new Date(doc.created_at).toLocaleDateString("pt-BR")}
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
                {canManageProject && (
                  <>
                    {/* Nova versão: substitui mantendo a anterior no histórico.
                        Editar muda o registro no lugar — o que é errado depois
                        de alguém já ter assinado aquela versão. */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Enviar nova versão (a atual vira histórico)"
                      onClick={() => {
                        setNovaVersaoDe(doc);
                        setEditingId(null);
                        setForm({ ...emptyForm, file_name: doc.file_name, description: doc.description ?? "" });
                        setUpload(null);
                        setShowForm(true);
                      }}
                    >
                      <FilePlus className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => startEdit(doc)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
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