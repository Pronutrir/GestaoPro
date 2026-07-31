'use client';
// FLUXO DE ASSINATURA PARA A PÁGINA ESCRITA — a lacuna que motivou a fusão.
//
// O editor produzia texto que não saía dali: não havia como pedir ciência,
// aprovação ou assinatura de uma ata escrita aqui. O fluxo completo já existia
// do lado dos arquivos, então nada disso é reimplementado — o envelope
// (document_flows) passou a aceitar `page_id` como alvo alternativo, e esta
// barra reusa o MESMO diálogo, o MESMO painel e a MESMA trilha de auditoria.
//
// Diferença real de um arquivo: o conteúdo de uma página muda depois de
// enviada. Por isso o hash é calculado sobre o texto no instante da
// circulação — é isso que prova o que a pessoa assinou.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { DocumentFlowPanel } from "@/components/documentos/DocumentFlowPanel";
import { StartFlowDialog, type DraftParticipant } from "@/components/documentos/StartFlowDialog";
import {
  FLOW_KINDS, ROLE_META, flowProgress, captureOrigin,
  type DocumentFlow, type FlowParticipant, type FlowEvent, type FlowKind,
} from "@/lib/documentFlow";

// document_flows/participants/events ainda fora dos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface Props {
  projectId: string;
  pageId: string;
  pageTitle: string;
  /** Texto puro da página no momento do envio — base do hash. */
  getPlainText: () => string;
  canManage: boolean;
}

export function PageFlowBar({ projectId, pageId, pageTitle, getPlainText, canManage }: Props) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [flows, setFlows] = useState<DocumentFlow[]>([]);
  const [participants, setParticipants] = useState<FlowParticipant[]>([]);
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const [people, setPeople] = useState<{ id: string; full_name: string; sector: string | null }[]>([]);
  const [startOpen, setStartOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const fetchFlows = useCallback(async () => {
    const { data, error } = await sb
      .from("document_flows")
      .select("*")
      .eq("page_id", pageId)
      .order("created_at", { ascending: false });

    if (error) {
      // Migration pendente na VM (tabela ou coluna page_id ausentes): esconde a
      // barra em vez de quebrar o editor.
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    const list = (data ?? []) as DocumentFlow[];
    setFlows(list);
    if (list.length === 0) { setParticipants([]); setEvents([]); return; }

    const ids = list.map((f) => f.id);
    const [pRes, eRes] = await Promise.all([
      sb.from("document_participants").select("*").in("flow_id", ids).order("position"),
      sb.from("document_flow_events").select("*").in("flow_id", ids).order("occurred_at", { ascending: false }),
    ]);
    setParticipants((pRes.data ?? []) as FlowParticipant[]);
    setEvents((eRes.data ?? []) as FlowEvent[]);
  }, [pageId]);

  useEffect(() => { void fetchFlows(); }, [fetchFlows]);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, sector").order("full_name")
      .then(({ data }) => setPeople(data ?? []));
  }, []);

  const logEvent = async (flowId: string, type: string, extra?: { participantId?: string; detail?: string }) => {
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

  /** SHA-256 do texto da página no instante do envio. */
  const hashText = async (text: string): Promise<string | null> => {
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch { return null; }
  };

  const startFlow = async (data: {
    kind: FlowKind; message: string; dueDate: string; participants: DraftParticipant[];
  }) => {
    const hash = await hashText(getPlainText());
    const { data: flow, error } = await sb.from("document_flows").insert({
      page_id: pageId,
      document_id: null,
      project_id: projectId,
      kind: data.kind,
      status: "circulando",
      title: pageTitle,
      message: data.message || null,
      due_date: data.dueDate || null,
      file_hash: hash,
      created_by: user?.id ?? null,
      created_by_name: profile?.full_name ?? null,
      started_at: new Date().toISOString(),
    }).select("id").single();

    if (error) {
      toast({ title: "Não foi possível enviar", description: error.message, variant: "destructive" });
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
    await logEvent(flow.id, "enviado", {
      detail: `${rows.length} participante(s) · ${FLOW_KINDS[data.kind].label}`,
    });

    toast({
      title: "Documento enviado",
      description: `${rows.length} pessoa(s) receberão o pedido de ${FLOW_KINDS[data.kind].short}.`,
    });
    setStartOpen(false);
    void fetchFlows();
  };

  const actOnFlow = async (flowId: string, participantId: string, action: "concluir" | "recusar", reason?: string) => {
    const flow = flows.find((f) => f.id === flowId);
    if (!flow) return;
    const now = new Date().toISOString();

    if (action === "recusar") {
      await sb.from("document_participants")
        .update({ status: "recusado", refusal_reason: reason ?? null, completed_at: now })
        .eq("id", participantId);
      await sb.from("document_flows").update({ status: "recusado", finished_at: now }).eq("id", flowId);
      await logEvent(flowId, "recusado", { participantId, detail: reason });
      toast({ title: "Documento recusado", description: "O autor será notificado com o motivo." });
      void fetchFlows();
      return;
    }

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

    const after = participants.map((p) =>
      p.id === participantId ? { ...p, status: "concluido" as const } : p);
    const prog = flowProgress(after.filter((p) => p.flow_id === flowId));
    if (prog.isComplete) {
      await sb.from("document_flows").update({ status: "concluido", finished_at: now }).eq("id", flowId);
      await logEvent(flowId, "concluido");
    }

    toast({ title: prog.isComplete ? "Fluxo concluído" : "Registrado", description: FLOW_KINDS[flow.kind].acceptText });
    void fetchFlows();
  };

  const cancelFlow = async (flowId: string) => {
    await sb.from("document_flows")
      .update({ status: "cancelado", finished_at: new Date().toISOString() }).eq("id", flowId);
    await logEvent(flowId, "cancelado");
    void fetchFlows();
  };

  if (unavailable) return null;

  const current = flows[0] ?? null;
  const currentParts = current ? participants.filter((p) => p.flow_id === current.id) : [];
  const currentEvents = current ? events.filter((e) => e.flow_id === current.id) : [];

  return (
    <div className="mb-3 space-y-2">
      {/* Sem fluxo ativo: só o convite para enviar. Com fluxo, o painel inteiro
          — o mesmo componente usado pelos arquivos. */}
      {!current || current.status === "cancelado" ? (
        canManage && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
            onClick={() => setStartOpen(true)}>
            <Send className="w-3.5 h-3.5" /> Enviar para ciência ou assinatura
          </Button>
        )
      ) : (
        <>
          {/* Diferença real entre página e arquivo: a página continua editável
              depois de enviada. O hash registrado vale para o texto do momento
              do envio, então quem editar agora precisa saber que está mudando
              um documento que as pessoas já estão assinando. */}
          {current.status === "circulando" && (
            <p className="text-[11.5px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Em circulação — a assinatura registra o texto como estava no envio.
              Para mudar o conteúdo, cancele e envie de novo.
            </p>
          )}
          <DocumentFlowPanel
          flow={current}
          participants={currentParts}
          events={currentEvents}
          myUserId={user?.id ?? null}
          canManage={canManage}
          onAct={(participantId, action, reason) => actOnFlow(current.id, participantId, action, reason)}
          onCancel={() => cancelFlow(current.id)}
          onSend={async () => {
            await sb.from("document_flows")
              .update({ status: "circulando", started_at: new Date().toISOString() })
              .eq("id", current.id);
            await logEvent(current.id, "enviado");
            void fetchFlows();
          }}
          />
        </>
      )}

      <StartFlowDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        documentName={pageTitle}
        people={people.map((p) => ({ ...p, role_title: null, avatar_url: null }))}
        onConfirm={startFlow}
      />
    </div>
  );
}
