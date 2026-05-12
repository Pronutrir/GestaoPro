/**
 * Conceito de Previsto x Real x Linha de Base.
 *
 * - Previsto (planned): start_date / end_date (ou due_date no projeto). Pode ser
 *   replanejado ao longo do projeto.
 * - Linha de Base (baseline): snapshot do previsto congelado. Não muda mais.
 * - Real (actual): datas efetivas de início e término.
 *
 * Desvio = (Real − Baseline) em dias corridos. Se baseline ainda não foi
 * congelada, usa o Previsto atual como referência.
 */

function parseLocal(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Diferença em dias corridos (real - referência). Positivo = atrasado. */
export function diffDays(actualISO: string | null | undefined, refISO: string | null | undefined): number | null {
  const a = parseLocal(actualISO);
  const r = parseLocal(refISO);
  if (!a || !r) return null;
  return Math.round((a.getTime() - r.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Calcula desvio de término. Prioriza baseline; se não houver, usa previsto.
 * Retorna null quando faltar real ou referência.
 */
export function endVariance(
  actualEnd: string | null | undefined,
  baselineEnd: string | null | undefined,
  plannedEnd: string | null | undefined,
): number | null {
  const ref = baselineEnd || plannedEnd;
  return diffDays(actualEnd, ref);
}

export type VarianceTone = "ontime" | "warning" | "late" | "neutral";

export function varianceTone(days: number | null): VarianceTone {
  if (days === null || days === undefined) return "neutral";
  if (days <= 0) return "ontime";
  if (days <= 7) return "warning";
  return "late";
}

export function varianceClasses(tone: VarianceTone): string {
  switch (tone) {
    case "ontime":
      return "bg-success/15 text-success border-success/30";
    case "warning":
      return "bg-warning/15 text-warning border-warning/30";
    case "late":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function formatVariance(days: number | null): string {
  if (days === null || days === undefined) return "—";
  if (days === 0) return "no prazo";
  return days > 0 ? `+${days}d` : `${days}d`;
}
