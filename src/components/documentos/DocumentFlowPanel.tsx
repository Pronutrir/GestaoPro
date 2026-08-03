'use client';
// PAINEL DO FLUXO — ciência, aprovação e assinatura num só componente, porque
// os três são o mesmo participante com papel diferente. Mostra progresso,
// participantes com sua posição na ordem, e a trilha de auditoria.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CheckCircle2, Clock, Eye, XCircle, ShieldCheck, History, AlertTriangle, Ban, Send,
} from "lucide-react";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import {
  FLOW_KINDS, ROLE_META, FLOW_STATUS_META, EVENT_LABEL, fmtDateTime,
  flowProgress, currentPosition, isMyTurn, isTerminal, isOverdue,
  type DocumentFlow, type FlowParticipant, type FlowEvent,
} from "@/lib/documentFlow";
import { cn } from "@/lib/utils";

interface Props {
  flow: DocumentFlow;
  participants: FlowParticipant[];
  events: FlowEvent[];
  myUserId: string | null;
  canManage: boolean;
  profileAvatarMap?: Record<string, string>;
  onAct: (participantId: string, action: "concluir" | "recusar", reason?: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onSend: () => Promise<void>;
}

export function DocumentFlowPanel({
  flow, participants, events, myUserId, canManage, profileAvatarMap = {},
  onAct, onCancel, onSend,
}: Props) {
  const [showTrail, setShowTrail] = useState(false);
  const [refuseFor, setRefuseFor] = useState<FlowParticipant | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const kind = FLOW_KINDS[flow.kind];
  const statusMeta = FLOW_STATUS_META[flow.status];
  const progress = flowProgress(participants);
  const pos = currentPosition(participants);
  const myTurn = isMyTurn(participants, myUserId);
  const overdue = isOverdue(flow);
  const mine = participants.find(
    (p) => p.user_id === myUserId && p.position === pos && p.is_blocking &&
           p.status !== "concluido" && p.status !== "recusado",
  );

  const toneCls = {
    draft: "bg-muted text-muted-foreground",
    run: "bg-primary/10 text-primary",
    done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    stop: "bg-destructive/10 text-destructive",
  }[statusMeta.tone];

  const act = async (p: FlowParticipant, action: "concluir" | "recusar") => {
    setSaving(true);
    await onAct(p.id, action, action === "recusar" ? reason.trim() : undefined);
    setSaving(false);
    setRefuseFor(null);
    setReason("");
  };

  const statusIcon = (p: FlowParticipant) => {
    if (p.status === "concluido") return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    if (p.status === "recusado") return <XCircle className="w-4 h-4 text-destructive" />;
    if (p.status === "visualizado") return <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  };

  const statusText = (p: FlowParticipant) => {
    if (p.status === "concluido" && p.completed_at) {
      const verb = p.role === "assinante" ? "assinou" : p.role === "aprovador" ? "aprovou" : "confirmou";
      return `${verb} em ${fmtDateTime(p.completed_at)}`;
    }
    if (p.status === "recusado") return `recusou${p.refusal_reason ? `: ${p.refusal_reason}` : ""}`;
    if (p.status === "visualizado" && p.viewed_at) return `visualizou em ${fmtDateTime(p.viewed_at)}`;
    if (p.status === "notificado") return "notificado, aguardando";
    if (!p.is_blocking) return "recebe cópia ao concluir";
    return pos !== null && p.position > pos ? "aguarda a vez" : "aguardando";
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Cabeçalho: tipo, estado e progresso */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b bg-muted/30 flex-wrap">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
        <span className="text-[13px] font-semibold">{kind.label}</span>
        <Badge className={cn("text-[10px]", toneCls)} variant="secondary">{statusMeta.label}</Badge>
        {flow.document_version > 1 && (
          <Badge variant="outline" className="text-[10px]">v{flow.document_version}</Badge>
        )}
        {overdue && (
          <Badge variant="outline" className="text-[10px] gap-1 border-destructive/50 text-destructive">
            <AlertTriangle className="w-3 h-3" /> Prazo vencido
          </Badge>
        )}
        {progress.total > 0 && (
          <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">
            {progress.done} de {progress.total} {kind.short === "ciência" ? "confirmaram" : "concluíram"}
          </span>
        )}
      </div>

      {/* Barra de progresso */}
      {progress.total > 0 && (
        <div className="px-3.5 pt-2.5">
          <div className="flex gap-1">
            {participants.filter((p) => p.is_blocking).map((p) => (
              <span key={p.id} className={cn("h-1.5 flex-1 rounded-full",
                p.status === "concluido" ? "bg-emerald-500"
                  : p.status === "recusado" ? "bg-destructive"
                  : pos !== null && p.position === pos ? "bg-primary"
                  : "bg-muted")} />
            ))}
          </div>
        </div>
      )}

      {/* Minha vez — a ação em destaque */}
      {mine && flow.status === "circulando" && (
        <div className="m-3.5 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-[13px] font-semibold mb-1">É a sua vez</p>
          <p className="text-[12px] text-muted-foreground mb-2.5">{kind.acceptText}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={saving}
              onClick={() => act(mine, "concluir")}>
              <CheckCircle2 className="w-3.5 h-3.5" /> {kind.action}
            </Button>
            {mine.role !== "ciencia" && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-destructive"
                onClick={() => { setReason(""); setRefuseFor(mine); }}>
                <XCircle className="w-3.5 h-3.5" /> Recusar
              </Button>
            )}
            <span className="text-[11px] text-muted-foreground">
              Registra data, hora e origem do acesso.
            </span>
          </div>
        </div>
      )}

      {/* Participantes */}
      <div>
        {participants
          .slice()
          .sort((a, b) => a.position - b.position || (a.user_name ?? "").localeCompare(b.user_name ?? ""))
          .map((p) => {
            const avatar = resolveAvatarFromLookup(p.user_id ?? "", p.user_name ?? "", profileAvatarMap);
            const isNow = pos !== null && p.position === pos && p.is_blocking && p.status !== "concluido";
            return (
              <div key={p.id} className={cn(
                "flex items-center gap-2.5 px-3.5 py-2 border-b last:border-b-0",
                isNow && "bg-primary/5")}>
                <span className="w-5 h-5 rounded bg-muted text-[10px] font-bold text-muted-foreground
                                 flex items-center justify-center shrink-0" title={`Posição ${p.position} na ordem`}>
                  {p.is_blocking ? p.position : "—"}
                </span>
                <Avatar className="h-6 w-6 shrink-0">
                  {avatar ? <AvatarImage src={avatar} alt={p.user_name ?? ""} /> : null}
                  <AvatarFallback className="text-[9px]">{getAvatarInitials(p.user_name ?? "?")}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">{p.user_name || "—"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {ROLE_META[p.role].label} · {statusText(p)}
                  </p>
                </div>
                <span className="shrink-0">{statusIcon(p)}</span>
              </div>
            );
          })}
      </div>

      {/* Ações do gestor + trilha */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-t bg-muted/20 flex-wrap">
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setShowTrail((v) => !v)}>
          <History className="w-3.5 h-3.5" /> Trilha ({events.length})
        </Button>
        {canManage && flow.status === "rascunho" && participants.length > 0 && (
          <Button size="sm" className="h-7 gap-1.5 text-xs ml-auto" onClick={onSend} disabled={saving}>
            <Send className="w-3.5 h-3.5" /> Enviar para circulação
          </Button>
        )}
        {canManage && flow.status === "circulando" && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-destructive ml-auto"
            onClick={onCancel} disabled={saving}>
            <Ban className="w-3.5 h-3.5" /> Cancelar fluxo
          </Button>
        )}
        {isTerminal(flow.status) && flow.file_hash && (
          <span className="ml-auto text-[10px] text-muted-foreground font-mono truncate max-w-[220px]"
                title={`Impressão digital do ${flow.page_id ? "texto" : "arquivo"} no envio (SHA-256): ${flow.file_hash}`}>
            SHA-256 {flow.file_hash.slice(0, 12)}…
          </span>
        )}
      </div>

      {/* Trilha de auditoria — o comprovante */}
      {showTrail && (
        <div className="border-t bg-muted/10">
          {events.length === 0 ? (
            <p className="px-3.5 py-3 text-[12px] text-muted-foreground">Nenhum evento registrado ainda.</p>
          ) : (
            events.map((e) => (
              <div key={e.id} className="px-3.5 py-2 border-b last:border-b-0 text-[12px]">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                  {e.actor_name && <span className="text-muted-foreground">por {e.actor_name}</span>}
                  <span className="ml-auto text-muted-foreground tabular-nums shrink-0">
                    {fmtDateTime(e.occurred_at)}
                  </span>
                </div>
                {(e.ip || e.detail) && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {e.detail}{e.detail && e.ip ? " · " : ""}{e.ip ? `origem ${e.ip}` : ""}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Recusa exige motivo */}
      <Dialog open={!!refuseFor} onOpenChange={(o) => { if (!o) setRefuseFor(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Recusar documento</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Motivo da recusa *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: valores da seção 3 divergem do orçamento aprovado" autoFocus />
            <p className="text-[11px] text-muted-foreground">
              O fluxo é encerrado e o autor é notificado com o motivo. Para retomar, é preciso
              uma nova versão do documento.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefuseFor(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={saving || !reason.trim()}
              onClick={() => refuseFor && act(refuseFor, "recusar")}>
              {saving ? "Registrando..." : "Recusar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
