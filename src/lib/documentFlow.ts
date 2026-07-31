/**
 * FLUXO DE DOCUMENTO — ciência, aprovação e assinatura.
 *
 * Decisão central: os três NÃO são fluxos diferentes. São o mesmo participante
 * com um `role` diferente, na mesma máquina de estados. É como DocuSign e
 * Clicksign modelam, e é o que permitiu entregar as quatro fases sobre uma
 * estrutura só.
 *
 * A ORDEM é um inteiro por participante: posições iguais agem em paralelo,
 * diferentes em sequência, e o caso misto (1, 2, 2, 3) funciona naturalmente.
 * Um enum "paralelo | sequencial" não daria conta do misto.
 */

export type FlowKind = "ciencia" | "aprovacao" | "assinatura";
export type FlowStatus = "rascunho" | "circulando" | "concluido" | "recusado" | "cancelado";
export type ParticipantRole = "assinante" | "aprovador" | "ciencia" | "observador";
export type ParticipantStatus = "pendente" | "notificado" | "visualizado" | "concluido" | "recusado";

export interface DocumentFlow {
  id: string;
  document_id: string;
  project_id: string;
  kind: FlowKind;
  status: FlowStatus;
  title: string | null;
  message: string | null;
  file_hash: string | null;
  due_date: string | null;
  document_version: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  external_provider?: string | null;
  external_id?: string | null;
}

export interface FlowParticipant {
  id: string;
  flow_id: string;
  user_id: string | null;
  user_name: string | null;
  role: ParticipantRole;
  position: number;
  is_blocking: boolean;
  status: ParticipantStatus;
  notified_at: string | null;
  viewed_at: string | null;
  completed_at: string | null;
  refusal_reason: string | null;
  accepted_text?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}

export interface FlowEvent {
  id: string;
  flow_id: string;
  participant_id: string | null;
  event_type: string;
  actor_name: string | null;
  ip: string | null;
  user_agent: string | null;
  detail: string | null;
  occurred_at: string;
}

/** Vocabulário de cada tipo de fluxo — rótulo, verbo e texto do aceite. */
export const FLOW_KINDS: Record<FlowKind, {
  label: string;
  short: string;
  /** O que o participante clica. */
  action: string;
  /** Texto EXATO exibido no aceite — guardado junto com o ato (clickwrap). */
  acceptText: string;
  defaultRole: ParticipantRole;
}> = {
  ciencia: {
    label: "Ciência",
    short: "ciência",
    action: "Li e estou ciente",
    acceptText: "Declaro que li o documento e estou ciente do seu conteúdo.",
    defaultRole: "ciencia",
  },
  aprovacao: {
    label: "Aprovação",
    short: "aprovação",
    action: "Aprovar",
    acceptText: "Aprovo o conteúdo deste documento na versão apresentada.",
    defaultRole: "aprovador",
  },
  assinatura: {
    label: "Assinatura",
    short: "assinatura",
    action: "Assinar",
    acceptText:
      "Assino eletronicamente este documento, declarando concordância com seu conteúdo. " +
      "Reconheço este meio como válido para fins de comprovação de autoria e integridade.",
    defaultRole: "assinante",
  },
};

export const ROLE_META: Record<ParticipantRole, { label: string; hint: string; blocking: boolean }> = {
  assinante: { label: "Assina", hint: "Declara concordância formal", blocking: true },
  aprovador: { label: "Aprova", hint: "Autoriza o conteúdo; pode recusar", blocking: true },
  ciencia: { label: "Toma ciência", hint: "Confirma que leu; não assina", blocking: true },
  observador: { label: "Acompanha", hint: "Recebe cópia; não trava o fluxo", blocking: false },
};

export const FLOW_STATUS_META: Record<FlowStatus, { label: string; tone: "draft" | "run" | "done" | "stop" }> = {
  rascunho: { label: "Rascunho", tone: "draft" },
  circulando: { label: "Em circulação", tone: "run" },
  concluido: { label: "Concluído", tone: "done" },
  recusado: { label: "Recusado", tone: "stop" },
  cancelado: { label: "Cancelado", tone: "stop" },
};

/** Estados finais não voltam: para mudar, cria-se nova versão e novo fluxo. */
export const isTerminal = (s: FlowStatus): boolean =>
  s === "concluido" || s === "recusado" || s === "cancelado";

/**
 * Quem é a "vez" agora: a menor posição que ainda tem bloqueante pendente.
 * Participantes de posições posteriores só são notificados quando esta fecha.
 */
export function currentPosition(participants: FlowParticipant[]): number | null {
  const pending = participants
    .filter((p) => p.is_blocking && p.status !== "concluido" && p.status !== "recusado")
    .map((p) => p.position);
  return pending.length > 0 ? Math.min(...pending) : null;
}

/** É a vez desta pessoa? (posição corrente e ainda não agiu) */
export function isMyTurn(participants: FlowParticipant[], userId: string | null): boolean {
  if (!userId) return false;
  const pos = currentPosition(participants);
  if (pos === null) return false;
  return participants.some(
    (p) => p.user_id === userId && p.position === pos && p.is_blocking &&
           p.status !== "concluido" && p.status !== "recusado",
  );
}

export interface FlowProgress {
  /** Quantos bloqueantes já concluíram. */
  done: number;
  /** Total de bloqueantes (observador não conta). */
  total: number;
  pct: number;
  /** Todos os bloqueantes concluíram? */
  isComplete: boolean;
  /** Alguém recusou? */
  hasRefusal: boolean;
}

export function flowProgress(participants: FlowParticipant[]): FlowProgress {
  const blocking = participants.filter((p) => p.is_blocking);
  const done = blocking.filter((p) => p.status === "concluido").length;
  const hasRefusal = participants.some((p) => p.status === "recusado");
  return {
    done,
    total: blocking.length,
    pct: blocking.length > 0 ? (done / blocking.length) * 100 : 0,
    isComplete: blocking.length > 0 && done === blocking.length,
    hasRefusal,
  };
}

/** Prazo vencido? Só AVISA — não fecha o fluxo sozinho (decisão do usuário). */
export const isOverdue = (flow: DocumentFlow): boolean => {
  if (!flow.due_date || isTerminal(flow.status)) return false;
  return flow.due_date < new Date().toISOString().slice(0, 10);
};

/**
 * Impressão digital do arquivo (SHA-256) — prova que o documento não mudou
 * depois de assinado. Usa a Web Crypto API, disponível em contexto seguro.
 */
export async function hashFile(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Rótulo legível de cada evento da trilha. */
export const EVENT_LABEL: Record<string, string> = {
  criado: "Fluxo criado",
  enviado: "Enviado para circulação",
  notificado: "Participante notificado",
  visualizado: "Documento visualizado",
  ciencia: "Ciência confirmada",
  aprovado: "Aprovado",
  assinado: "Assinado",
  recusado: "Recusado",
  cancelado: "Fluxo cancelado",
  concluido: "Fluxo concluído",
  lembrete: "Lembrete enviado",
};

/** Data e hora legíveis, no fuso local. */
export const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
