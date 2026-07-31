'use client';
// PAINEL FINANCEIRO (Fase 1) — responde três perguntas, nesta ordem:
//   onde estou (indicadores) · para onde vai (consumo) · onde dói (por fase).
//
// Vocabulário: rótulo em português com a sigla entre parênteses, conforme
// decidido — "Linha de base (BAC)". Quem vem do PMBOK reconhece a sigla; quem
// não vem lê o rótulo e entende.
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Wallet, ShieldCheck, Layers, PiggyBank } from "lucide-react";
import { formatMoney, type BudgetSummary } from "@/lib/projectCosts";
import { cn } from "@/lib/utils";

export interface PhaseBreakdown {
  id: string | null;
  title: string;
  planned: number;
  actual: number;
}

interface Props {
  summary: BudgetSummary;
  currency: string;
  precision: number;
  /** Orçado × real por fase, para o gráfico de barras. */
  phases: PhaseBreakdown[];
  /** Custo de mão de obra (horas × taxa) e custos lançados, separados. */
  laborCost: number;
  directCost: number;
  /** Quantas horas viraram custo — dá contexto ao número de mão de obra. */
  laborHours: number;
  /** Sem taxa cadastrada, as horas não viram dinheiro: avisa em vez de somar 0. */
  ratesConfigured: boolean;
}

export function BudgetDashboard({
  summary, currency, precision, phases, laborCost, directCost, laborHours, ratesConfigured,
}: Props) {
  const money = (v: number) => formatMoney(v, currency, precision);
  const s = summary;

  const tone = s.overBudget ? "bad" : s.overThreshold ? "warn" : "ok";
  const toneCls = {
    ok: "text-foreground",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-destructive",
  }[tone];

  const kpis = [
    {
      label: "Linha de base (BAC)",
      value: money(s.baseline),
      hint: s.contingency > 0 ? `inclui ${money(s.contingency)} de contingência` : "orçado, sem reservas",
      icon: <Layers className="w-3.5 h-3.5" />,
      cls: "text-foreground",
    },
    {
      label: "Custo real (AC)",
      value: money(s.actual),
      hint: `${s.consumedPct.toFixed(1)}% da linha de base`,
      icon: <Wallet className="w-3.5 h-3.5" />,
      cls: toneCls,
    },
    {
      label: "Saldo",
      value: money(s.remaining),
      hint: s.remaining < 0 ? "acima do previsto" : "disponível",
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      cls: s.remaining < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Reserva gerencial",
      value: money(s.managementReserve),
      hint: s.managementReserve > 0 ? "fora da linha de base" : "não definida",
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      cls: "text-muted-foreground",
    },
  ];

  const maxPhase = Math.max(1, ...phases.map((p) => Math.max(p.planned, p.actual)));

  return (
    <div className="space-y-3">
      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <span className="text-muted-foreground/70">{k.icon}</span>{k.label}
            </p>
            <p className={cn("text-lg font-bold tabular-nums mt-0.5 truncate", k.cls)} title={k.value}>{k.value}</p>
            <p className="text-[11px] text-muted-foreground truncate">{k.hint}</p>
          </div>
        ))}
      </div>

      {/* Consumo da linha de base */}
      <div className="rounded-lg border bg-card p-3.5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[13px] font-semibold">Consumo da linha de base</span>
          {s.overBudget ? (
            <Badge variant="destructive" className="text-[10px] gap-1">
              <AlertTriangle className="w-3 h-3" /> Estourou {money(Math.abs(s.remaining))}
            </Badge>
          ) : s.overThreshold ? (
            <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" /> Passou do limite de alerta
            </Badge>
          ) : null}
          <span className="ml-auto text-[13px] font-bold tabular-nums">{s.consumedPct.toFixed(1)}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden relative">
          <div
            className={cn("h-full rounded-full transition-all",
              s.overBudget ? "bg-destructive" : s.overThreshold ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${Math.min(100, s.consumedPct)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
          <span>{money(s.actual)} gastos</span>
          <span>{money(s.baseline)} de base</span>
        </div>

        {/* Composição do custo real: o que é mão de obra e o que é desembolso */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mão de obra</p>
            <p className="text-[13px] font-semibold tabular-nums">{money(laborCost)}</p>
            <p className="text-[11px] text-muted-foreground">
              {ratesConfigured
                ? `${laborHours.toFixed(1)}h apontadas`
                : "sem taxa cadastrada — horas não viram custo"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Custos lançados</p>
            <p className="text-[13px] font-semibold tabular-nums">{money(directCost)}</p>
            <p className="text-[11px] text-muted-foreground">compras, serviços, licenças</p>
          </div>
        </div>
      </div>

      {/* Orçado × real por fase — onde está doendo */}
      {phases.length > 0 && (
        <div className="rounded-lg border bg-card p-3.5">
          <p className="text-[13px] font-semibold mb-3">Orçado × real por fase</p>
          <div className="space-y-2.5">
            {phases.map((p) => {
              const over = p.planned > 0 && p.actual > p.planned;
              const pct = p.planned > 0 ? (p.actual / p.planned) * 100 : 0;
              return (
                <div key={p.id ?? "__none__"} className="grid grid-cols-[minmax(80px,1fr)_2fr_auto] gap-2.5 items-center">
                  <span className="text-[12px] truncate text-muted-foreground" title={p.title}>{p.title}</span>
                  <span className="relative h-4 rounded bg-muted overflow-hidden">
                    <span className="absolute inset-y-0 left-0 bg-primary/25 rounded"
                          style={{ width: `${(p.planned / maxPhase) * 100}%` }} />
                    <span className={cn("absolute top-1 h-2 rounded", over ? "bg-destructive" : "bg-primary")}
                          style={{ left: 0, width: `${(p.actual / maxPhase) * 100}%` }} />
                  </span>
                  <span className={cn("text-[11px] tabular-nums shrink-0 w-[92px] text-right",
                        over ? "text-destructive font-semibold" : "text-muted-foreground")}
                        title={`Orçado ${money(p.planned)} · Real ${money(p.actual)}`}>
                    {p.planned > 0 ? `${pct.toFixed(0)}%` : money(p.actual)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2.5 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 rounded bg-primary/25" /> orçado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 rounded bg-primary" /> real
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 rounded bg-destructive" /> acima do orçado
            </span>
          </p>
        </div>
      )}

      {/* Contingência: medidor separado — não se mistura com o orçamento */}
      {s.contingency > 0 && (
        <div className="rounded-lg border bg-card p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <PiggyBank className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-[13px] font-semibold">Reserva de contingência</span>
            <span className="ml-auto text-[13px] font-bold tabular-nums">{money(s.contingency)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Dentro da linha de base, para riscos identificados. A reserva gerencial
            ({money(s.managementReserve)}) fica fora e exige aprovação para ser usada.
          </p>
        </div>
      )}
    </div>
  );
}
