'use client';
// LINHA DE BASE (Fase 2) — congela o orçamento aprovado para que o desvio
// possa existir. Sem ela, editar o planejado apaga o estouro junto.
//
// Decisão do usuário: o líder/gestor faz tudo, mas fica REGISTRADO quem
// aprovou e quando — sem fluxo de aprovação em duas etapas.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Lock, History, CheckCircle2 } from "lucide-react";
import { formatMoney, type BudgetBaseline, type BudgetSummary } from "@/lib/projectCosts";
import { cn } from "@/lib/utils";

interface Props {
  baselines: BudgetBaseline[];
  /** Resumo ATUAL do orçamento (o que seria congelado agora). */
  summary: BudgetSummary;
  currency: string;
  precision: number;
  canManage: boolean;
  onApprove: (reason: string) => Promise<void>;
}

export function BaselineManager({ baselines, summary, currency, precision, canManage, onApprove }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const money = (v: number) => formatMoney(v, currency, precision);
  const active = baselines.find((b) => b.is_active) ?? null;
  const isFirst = baselines.length === 0;
  // Mudou o orçamento depois de aprovar? Então a base está desatualizada.
  const drift = active ? summary.baseline - active.baseline_total : 0;
  const hasDrift = !!active && Math.abs(drift) > 0.01;

  const submit = async () => {
    setSaving(true);
    await onApprove(reason.trim());
    setSaving(false);
    setOpen(false);
    setReason("");
  };

  return (
    <div className="rounded-lg border bg-card p-3.5 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Lock className="w-4 h-4 text-primary" />
        <h3 className="text-[13px] font-semibold">Linha de base do orçamento</h3>
        {active ? (
          <Badge variant="outline" className="text-[10px]">v{active.version}</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">não definida</Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {baselines.length > 1 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
              onClick={() => setShowHistory((v) => !v)}>
              <History className="w-3.5 h-3.5" /> Histórico ({baselines.length})
            </Button>
          )}
          {canManage && (
            <Button size="sm" variant={hasDrift || isFirst ? "default" : "outline"}
              className="h-7 gap-1.5 text-xs" onClick={() => setOpen(true)}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isFirst ? "Aprovar linha de base" : "Nova versão"}
            </Button>
          )}
        </div>
      </div>

      {active ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Congelado (BAC)</p>
              <p className="text-[15px] font-bold tabular-nums">{money(active.baseline_total)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Orçado</p>
              <p className="text-[15px] font-semibold tabular-nums">{money(active.planned_total)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Contingência</p>
              <p className="text-[15px] font-semibold tabular-nums">{money(active.contingency_total)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Aprovada em</p>
              <p className="text-[13px] font-medium">
                {new Date(active.approved_at).toLocaleDateString("pt-BR")}
              </p>
              <p className="text-[11px] text-muted-foreground truncate" title={active.approved_by_name ?? ""}>
                {active.approved_by_name || "—"}
              </p>
            </div>
          </div>
          {hasDrift && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
              O orçamento mudou {money(Math.abs(drift))} {drift > 0 ? "para mais" : "para menos"} desde a
              aprovação da v{active.version}. O desempenho continua medido contra a linha de base congelada —
              aprove uma nova versão para incorporar a mudança.
            </div>
          )}
        </>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Sem linha de base, não há desvio: qualquer edição do orçamento apaga o estouro junto.
          {canManage ? " Aprove a versão 1 para começar a medir." : ""}
        </p>
      )}

      {showHistory && baselines.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          {baselines.map((b) => (
            <div key={b.id} className={cn("flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-[12px]",
                  b.is_active && "bg-primary/5")}>
              <Badge variant={b.is_active ? "default" : "outline"} className="text-[10px] shrink-0">v{b.version}</Badge>
              <span className="tabular-nums font-medium shrink-0">{money(b.baseline_total)}</span>
              <span className="text-muted-foreground truncate flex-1" title={b.reason ?? ""}>
                {b.reason || (b.version === 1 ? "Linha de base inicial" : "—")}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {new Date(b.approved_at).toLocaleDateString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isFirst ? "Aprovar linha de base" : `Aprovar versão ${(active?.version ?? 0) + 1}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">Orçado</span>
                <span className="tabular-nums font-medium">{money(summary.planned)}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">+ Contingência</span>
                <span className="tabular-nums font-medium">{money(summary.contingency)}</span>
              </div>
              <div className="flex justify-between text-[13px] pt-1.5 border-t">
                <span className="font-semibold">= Linha de base (BAC)</span>
                <span className="tabular-nums font-bold">{money(summary.baseline)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Reserva gerencial (fora da base)</span>
                <span className="tabular-nums">{money(summary.managementReserve)}</span>
              </div>
            </div>
            {!isFirst && (
              <div className="space-y-1.5">
                <Label className="text-xs">Motivo do replanejamento *</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: escopo adicional aprovado no comitê de 12/06" autoFocus />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              A versão fica registrada com seu nome e a data. O desempenho passa a ser medido contra
              este valor; as versões anteriores permanecem no histórico.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving || (!isFirst && !reason.trim())}>
              {saving ? "Aprovando..." : "Aprovar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
