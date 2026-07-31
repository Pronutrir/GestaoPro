'use client';
// VALOR AGREGADO + CURVA S (Fase 3) — responde "vou estourar?" com três
// entradas (planejado, real, entregue) e dez números derivados.
//
// Vocabulário traduzido com a sigla ao lado, conforme decidido: quem vem do
// PMBOK reconhece "CPI"; quem não vem lê "Desempenho de custo".
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatMoney, indexTone, type EarnedValue } from "@/lib/projectCosts";
import { cn } from "@/lib/utils";

interface Props {
  ev: EarnedValue;
  currency: string;
  precision: number;
  /** Meses do projeto (chaves 'YYYY-MM-01'), em ordem. */
  months: string[];
  /** Séries acumuladas, alinhadas a `months`. */
  pvSeries: number[];
  acSeries: number[];
  evSeries: number[];
  /** Índice do mês corrente em `months` (-1 se fora do período). */
  todayIndex: number;
}

const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `${m}/${y.slice(2)}`;
};

export function EarnedValuePanel({
  ev, currency, precision, months, pvSeries, acSeries, evSeries, todayIndex,
}: Props) {
  const money = (v: number) => formatMoney(v, currency, precision);
  const hasSeries = months.length > 1;

  // Escala do gráfico: o teto é o maior valor entre as três séries e o BAC.
  const maxY = Math.max(1, ev.bac, ...pvSeries, ...acSeries, ...evSeries);
  const W = 560, H = 200, PAD_L = 8, PAD_B = 22, PAD_T = 8;
  const x = (i: number) => PAD_L + (i / Math.max(1, months.length - 1)) * (W - PAD_L * 2);
  const y = (v: number) => PAD_T + (1 - v / maxY) * (H - PAD_T - PAD_B);
  const path = (series: number[]) =>
    series.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const cards: { label: string; value: string; hint: string; tone: "ok" | "warn" | "bad" | "flat" }[] = [
    {
      label: "Desempenho de custo (CPI)",
      value: ev.cpi > 0 ? ev.cpi.toFixed(2) : "—",
      hint: ev.cv === 0 ? "sem desvio" : ev.cv > 0 ? `${money(ev.cv)} a favor` : `${money(Math.abs(ev.cv))} acima`,
      tone: ev.cpi === 0 ? "flat" : indexTone(ev.cpi),
    },
    {
      label: "Desempenho de prazo (SPI)",
      value: ev.spi > 0 ? ev.spi.toFixed(2) : "—",
      hint: ev.sv === 0 ? "no plano" : ev.sv > 0 ? "adiantado" : "atrás do planejado",
      tone: ev.spi === 0 ? "flat" : indexTone(ev.spi),
    },
    {
      label: "Previsão final (EAC)",
      value: money(ev.eac),
      hint: ev.vac >= 0 ? `${money(ev.vac)} de sobra prevista` : `${money(Math.abs(ev.vac))} de estouro previsto`,
      tone: ev.vac >= 0 ? "ok" : "bad",
    },
    {
      label: "Custo restante (ETC)",
      value: money(ev.etc),
      hint: `${ev.progressPct.toFixed(0)}% entregue`,
      tone: "flat",
    },
  ];

  const toneCls = {
    ok: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-destructive",
    flat: "text-foreground",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">Desempenho do projeto</h3>
        {ev.bac > 0 && ev.vac < 0 && (
          <Badge variant="destructive" className="text-[10px] gap-1">
            <AlertTriangle className="w-3 h-3" /> Previsão acima da linha de base
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          Valor agregado (EV) {money(ev.ev)} · Planejado (PV) {money(ev.pv)} · Real (AC) {money(ev.ac)}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate" title={c.label}>{c.label}</p>
            <p className={cn("text-lg font-bold tabular-nums mt-0.5", toneCls[c.tone])}>{c.value}</p>
            <p className="text-[11px] text-muted-foreground truncate" title={c.hint}>{c.hint}</p>
          </div>
        ))}
      </div>

      {hasSeries ? (
        <div className="rounded-lg border bg-card p-3.5">
          <p className="text-[13px] font-semibold mb-2">Curva S — acumulado no tempo</p>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[420px]"
                 role="img" aria-label="Curva S com planejado, real e valor agregado acumulados">
              {/* eixo */}
              <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_L} y2={H - PAD_B}
                    stroke="hsl(var(--border))" strokeWidth="1" />
              {/* linha do BAC */}
              {ev.bac > 0 && (
                <>
                  <line x1={PAD_L} y1={y(ev.bac)} x2={W - PAD_L} y2={y(ev.bac)}
                        stroke="hsl(var(--muted-foreground))" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                  <text x={W - PAD_L} y={y(ev.bac) - 4} textAnchor="end"
                        fontSize="9" fill="hsl(var(--muted-foreground))">linha de base</text>
                </>
              )}
              {/* hoje */}
              {todayIndex >= 0 && (
                <>
                  <line x1={x(todayIndex)} y1={PAD_T} x2={x(todayIndex)} y2={H - PAD_B}
                        stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="2 3" />
                  <text x={x(todayIndex) + 3} y={PAD_T + 8} fontSize="9" fill="hsl(var(--muted-foreground))">hoje</text>
                </>
              )}
              {/* séries */}
              <path d={path(pvSeries)} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeDasharray="4 3" />
              <path d={path(acSeries)} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" />
              <path d={path(evSeries)} fill="none" stroke="hsl(38 74% 45%)" strokeWidth="2.5" />
              {/* rótulos de mês (a cada N, para não embolar) */}
              {months.map((m, i) => {
                const step = Math.ceil(months.length / 8);
                if (i % step !== 0 && i !== months.length - 1) return null;
                return (
                  <text key={m} x={x(i)} y={H - PAD_B + 12} textAnchor="middle"
                        fontSize="9" fill="hsl(var(--muted-foreground))">{monthLabel(m)}</text>
                );
              })}
            </svg>
          </div>
          <div className="flex items-center gap-4 flex-wrap mt-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 bg-muted-foreground" style={{ borderTop: "2px dashed" }} />
              Planejado (PV)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 rounded bg-primary" /> Custo real (AC)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 rounded" style={{ background: "hsl(38 74% 45%)" }} /> Valor agregado (EV)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            A distância vertical entre as curvas mostra os desvios: real acima de agregado é custo
            excedido; agregado abaixo de planejado é atraso.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">Curva S indisponível.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Defina as datas de início e entrega do projeto e aprove uma linha de base para ver a evolução no tempo.
          </p>
        </div>
      )}
    </div>
  );
}
