'use client';
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FileText, Plus, Trash2, ExternalLink, Upload, Pencil, Save, X, Send, Clock, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AIAssistButton } from "@/components/AIAssistButton";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { useAssigneeAvatarLookup } from "@/hooks/useAssigneeAvatarLookup";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { useAuth } from "@/contexts/AuthContext";
import { DocumentFlowPanel } from "@/components/documentos/DocumentFlowPanel";
import { StartFlowDialog, type DraftParticipant } from "@/components/documentos/StartFlowDialog";
import {
  FLOW_KINDS, ROLE_META, flowProgress, isMyTurn, hashFile,
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
  const [form, setForm] = useState(emptyForm);
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
    await sb.from("document_flow_events").insert({
      flow_id: flowId,
      participant_id: extra?.participantId ?? null,
      event_type: type,
      actor_id: user?.id ?? null,
      actor_name: profile?.full_name ?? null,
      // O IP real só o servidor conhece; o navegador registra o agente. Numa
      // evolução, um endpoint captura o IP — a coluna já existe para isso.
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
      detail: extra?.detail ?? null,
    });
  };

  const startFlow = async (data: {
    kind: FlowKind; message: string; dueDate: string; participants: DraftParticipant[];
  }) => {
    if (!startFor) return;
    // Impressão digital do arquivo (Fase 3): prova que ele não mudou depois.
    // Falha em silêncio se a URL for externa e não permitir leitura — o fluxo
    // continua válido, só sem o hash.
    let fileHash: string | null = null;
    try {
      const res = await fetch(startFor.file_url);
      if (res.ok) fileHash = await hashFile(await res.blob());
    } catch { /* arquivo externo sem CORS: segue sem hash */ }

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
      status: "notificado",
      notified_at: new Date().toISOString(),
    }));
    await sb.from("document_participants").insert(rows);
    await logEvent(flow.id, "enviado", { detail: `${rows.length} participante(s) · ${FLOW_KINDS[data.kind].label}` });

    toast({
      title: "Documento enviado",
      description: `${rows.length} pessoa(s) receberão o pedido de ${FLOW_KINDS[data.kind].short}.`,
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

    // Clickwrap: guarda o texto EXATO que a pessoa viu ao confirmar.
    await sb.from("document_participants").update({
      status: "concluido",
      completed_at: now,
      accepted_text: FLOW_KINDS[flow.kind].acceptText,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
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

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_trashed", false)
      .order("created_at", { ascending: false });

    if (!error && data) setDocuments(data);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (doc: ProjectDocument) => {
    setEditingId(doc.id);
    setShowForm(true);
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
      toast({ title: "Informe nome e URL do documento", variant: "destructive" });
      return;
    }

    const payload = {
      file_name: form.file_name,
      file_url: form.file_url,
      file_type: form.file_type || null,
      description: form.description || null,
      uploaded_by: form.uploaded_by || null,
      phase_id: form.phase_id || null,
      activity_id: form.activity_id || null,
    };

    if (editingId) {
      const { error } = await supabase.from("project_documents").update(payload).eq("id", editingId);
      if (error) {
        toast({ title: "Erro ao atualizar documento", variant: "destructive" });
        return;
      }
      toast({ title: "Documento atualizado!" });
    } else {
      const { error } = await supabase.from("project_documents").insert({ ...payload, project_id: projectId });
      if (error) {
        toast({ title: "Erro ao adicionar documento", variant: "destructive" });
        return;
      }
      toast({ title: "Documento adicionado!" });
    }

    resetForm();
    fetchDocuments();
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
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Documentos ({documents.length})
        </h3>
        <Button
          size="sm"
          variant={showForm ? "secondary" : "default"}
          onClick={() => { if (showForm) resetForm(); else { resetForm(); setShowForm(true); } }}
          className="gap-1"
        >
          {showForm ? <><X className="w-4 h-4" /> Cancelar</> : <><Plus className="w-4 h-4" /> Novo Documento</>}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 p-4 bg-card rounded-lg border border-border shadow-sm">
          <Input placeholder="Nome do documento *" value={form.file_name} onChange={(e) => setForm({ ...form, file_name: e.target.value })} />
          <Input placeholder="URL do documento *" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Tipo (PDF, DOCX, etc.)" value={form.file_type} onChange={(e) => setForm({ ...form, file_type: e.target.value })} />
            <Input placeholder="Adicionado por" value={form.uploaded_by} onChange={(e) => setForm({ ...form, uploaded_by: e.target.value })} />
          </div>
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
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto">
          {documents.map((doc) => {
          // Fluxo mais recente deste documento (a lista já vem ordenada).
          const flow = flows.find((f) => f.document_id === doc.id) ?? null;
          const flowParts = flow ? participants.filter((p) => p.flow_id === flow.id) : [];
          const flowEvents = flow ? events.filter((e) => e.flow_id === flow.id) : [];
          const prog = flowProgress(flowParts);
          const myTurn = flow?.status === "circulando" && isMyTurn(flowParts, user?.id ?? null);
          const isOpen = openFlowDoc === doc.id;
          return (
          <div key={doc.id} className={cn("border border-border rounded-lg bg-card overflow-hidden transition-shadow",
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
                      <button type="button" onClick={() => setOpenFlowDoc(isOpen ? null : doc.id)}
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
                <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                {canManageProject && (
                  <>
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