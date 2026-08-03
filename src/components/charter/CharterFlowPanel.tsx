'use client';
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";
import { getAvatarInitials } from "@/lib/avatarLookup";
import {
  Send, CheckCircle2, XCircle, Clock, RotateCcw, ShieldCheck, X,
} from "lucide-react";

/**
 * Estado do TAP + circulação para aprovação.
 *
 * O termo deixa de ser aprovado por um clique unilateral: circula para os
 * aprovadores designados, que recebem notificação, e só fica aprovado quando
 * todos respondem. Reabrir invalida a rodada e sobe a versão.
 *
 * Degrada com elegância: enquanto a migration não roda na VM, o painel some e o
 * TAP continua funcionando como antes.
 */

export type CharterStatus = "rascunho" | "em_aprovacao" | "aprovado" | "recusado";

interface Participant {
  id: string;
  user_id: string | null;
  user_name: string | null;
  status: string;
  refusal_reason: string | null;
  completed_at: string | null;
}

interface Props {
  projectId: string;
  status: CharterStatus;
  canManage: boolean;
  onChanged: () => void;
}

const STATUS_META: Record<CharterStatus, { label: string; cls: string; icon: JSX.Element }> = {
  rascunho: {
    label: "Rascunho",
    cls: "bg-muted text-muted-foreground border-border",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  em_aprovacao: {
    label: "Em aprovação",
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    icon: <Send className="w-3.5 h-3.5" />,
  },
  aprovado: {
    label: "Aprovado",
    cls: "bg-success/10 text-success border-success/30",
    icon: <ShieldCheck className="w-3.5 h-3.5" />,
  },
  recusado: {
    label: "Recusado",
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

export const CharterFlowPanel = ({ projectId, status, canManage, onChanged }: Props) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [people, setPeople] = useState<{ id: string; full_name: string; avatar_url: string | null }[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [refuseReason, setRefuseReason] = useState("");

  const load = useCallback(async () => {
    const { data: flow, error } = await supabase
      .from("document_flows" as any)
      .select("id, status")
      .eq("charter_project_id", projectId)
      .in("status", ["circulando", "concluido", "recusado"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Migration pendente na VM (coluna/tabela ausentes): esconde o painel em
    // vez de quebrar a aba inteira do TAP.
    if (error) { setUnavailable(true); return; }
    setUnavailable(false);
    if (!flow) { setParticipants([]); return; }

    const { data: parts } = await supabase
      .from("document_participants" as any)
      .select("id, user_id, user_name, status, refusal_reason, completed_at")
      .eq("flow_id", (flow as any).id)
      .order("position");
    setParticipants((parts as any[]) || []);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, avatar_url").eq("is_active", true)
      .then(({ data }) => setPeople(((data as any[]) || []).filter((p) => p.full_name)));
  }, []);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    const res = await fetch("/api/charter/flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...body }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: "Não foi possível concluir", description: data?.error || "Tente novamente.", variant: "destructive" });
      return null;
    }
    await load();
    onChanged();
    return data;
  };

  const enviar = async () => {
    const r = await call({ action: "enviar", approverIds: selected, dueDate: dueDate || null, message: message || null });
    if (!r) return;
    setSendOpen(false);
    setSelected([]); setDueDate(""); setMessage("");
    toast({
      title: "TAP enviado para aprovação",
      description: `${r.notified ?? 0} pessoa(s) notificada(s).`,
    });
  };

  const decidir = async (decision: "aprovado" | "recusado", reason?: string) => {
    const r = await call({ action: "decidir", decision, reason: reason ?? null });
    if (!r) return;
    setRefuseOpen(false); setRefuseReason("");
    toast({
      title: decision === "aprovado"
        ? (r.status === "aprovado" ? "TAP aprovado!" : "Sua aprovação foi registrada")
        : "TAP recusado",
      description: r.status === "em_aprovacao" ? `Faltam ${r.pendentes} aprovador(es).` : undefined,
    });
  };

  const reabrir = async () => {
    const r = await call({ action: "reabrir" });
    if (!r) return;
    toast({
      title: "TAP reaberto",
      description: `Nova versão (v${r.version}). As aprovações anteriores deixam de valer.`,
    });
  };

  if (unavailable) return null;

  const meta = STATUS_META[status] ?? STATUS_META.rascunho;
  const myTurn = participants.find(
    (p) => p.user_id === user?.id && p.status !== "concluido" && p.status !== "recusado",
  );
  const done = participants.filter((p) => p.status === "concluido").length;

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border", meta.cls)}>
          {meta.icon} {meta.label}
        </span>
        {participants.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {done}/{participants.length} aprovaram
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {status === "rascunho" && canManage && (
            <Button size="sm" className="gap-1.5 h-8" onClick={() => setSendOpen(true)}>
              <Send className="w-3.5 h-3.5" /> Enviar para aprovação
            </Button>
          )}
          {(status === "aprovado" || status === "recusado") && canManage && (
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={reabrir} disabled={busy}>
              <RotateCcw className="w-3.5 h-3.5" /> Reabrir para editar
            </Button>
          )}
          {/* Só quem foi designado decide — não qualquer gestor. */}
          {status === "em_aprovacao" && myTurn && (
            <>
              <Button size="sm" className="gap-1.5 h-8 bg-success hover:bg-success/90" onClick={() => decidir("aprovado")} disabled={busy}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-destructive border-destructive/30" onClick={() => setRefuseOpen(true)} disabled={busy}>
                <X className="w-3.5 h-3.5" /> Recusar
              </Button>
            </>
          )}
        </div>
      </div>

      {participants.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-[12px]">
              <Avatar className="h-5 w-5 shrink-0">
                <AvatarFallback className="text-[9px]">{getAvatarInitials(p.user_name)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{p.user_name || "—"}</span>
              <span className={cn(
                "ml-auto shrink-0 text-[10.5px] px-1.5 py-0.5 rounded border",
                p.status === "concluido" ? "text-success border-success/30 bg-success/10"
                  : p.status === "recusado" ? "text-destructive border-destructive/30 bg-destructive/10"
                  : "text-muted-foreground border-border",
              )}>
                {p.status === "concluido" ? "Aprovou"
                  : p.status === "recusado" ? "Recusou"
                  : p.status === "visualizado" ? "Visualizou" : "Aguardando"}
              </span>
            </div>
          ))}
          {participants.some((p) => p.refusal_reason) && (
            <p className="text-[11px] text-destructive mt-0.5">
              Motivo: {participants.find((p) => p.refusal_reason)?.refusal_reason}
            </p>
          )}
        </div>
      )}

      {/* Enviar para aprovação */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar TAP para aprovação</DialogTitle>
            <DialogDescription>
              Quem você escolher recebe uma notificação e decide. O termo só fica
              aprovado quando todos responderem.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Aprovadores</Label>
              <div className="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {people.map((p) => {
                  const on = selected.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelected((s) => on ? s.filter((x) => x !== p.id) : [...s, p.id])}
                      className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[13px]", on ? "bg-primary/10" : "hover:bg-muted/50")}
                    >
                      <Avatar className="h-6 w-6 shrink-0">
                        {p.avatar_url ? <AvatarImage src={p.avatar_url} /> : null}
                        <AvatarFallback className="text-[9px]">{getAvatarInitials(p.full_name)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{p.full_name}</span>
                      {on && <CheckCircle2 className="w-3.5 h-3.5 text-primary ml-auto shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Prazo (opcional)</Label>
              {/* DateField: o input nativo mostra mm/dd/aaaa em navegador com
                  idioma inglês, invertendo dia e mês em silêncio. */}
              <DateField value={dueDate} onChange={setDueDate} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Recado (opcional)</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Ex.: preciso da aprovação até sexta." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancelar</Button>
            <Button onClick={enviar} disabled={busy || selected.length === 0}>
              {busy ? "Enviando..." : `Enviar para ${selected.length || 0}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recusar — motivo obrigatório: recusa sem justificativa não ajuda ninguém */}
      <Dialog open={refuseOpen} onOpenChange={setRefuseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar o TAP</DialogTitle>
            <DialogDescription>
              A recusa encerra esta rodada. O termo volta para edição e precisa ser
              enviado de novo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={refuseReason}
            onChange={(e) => setRefuseReason(e.target.value)}
            rows={3}
            placeholder="O que precisa mudar?"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefuseOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => decidir("recusado", refuseReason)} disabled={busy || !refuseReason.trim()}>
              Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
