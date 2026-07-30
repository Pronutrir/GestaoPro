/**
 * Envelhecimento de card (card aging) — há quanto tempo o item está parado na
 * coluna atual.
 *
 * É a métrica central do método Kanban e a que estava totalmente ausente do
 * quadro: sem ela, um card esquecido há 40 dias e um que entrou hoje têm
 * exatamente a mesma aparência. A referência é o Card Aging do Trello e os
 * dias-na-coluna do Jira/Azure DevOps.
 *
 * Só sinaliza a partir de um limiar (não polui o card com "0d" em tudo) e
 * escala a cor conforme o tempo, para o quadro poder ser lido de relance.
 */

export interface CardAging {
  /** Dias inteiros na coluna atual. */
  days: number;
  /** Texto curto para o badge ("3d", "2sem", "1mês"). */
  label: string;
  /** Severidade — dirige a cor. */
  tone: "fresh" | "warn" | "stale";
}

/** A partir de quantos dias vale mostrar algo. Abaixo disso o card é "novo". */
const THRESHOLD_DAYS = 3;
const WARN_DAYS = 7;
const STALE_DAYS = 14;

function humanize(days: number): string {
  if (days < 7) return `${days}d`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks}sem`;
  }
  const months = Math.floor(days / 30);
  return `${months}${months === 1 ? "mês" : "meses"}`;
}

/**
 * Calcula o envelhecimento. Devolve `null` quando não há o que mostrar:
 * sem data registrada, item já concluído, ou ainda dentro do limiar.
 *
 * @param stageEnteredAt quando entrou na coluna atual (activities.stage_entered_at)
 * @param status status da atividade — concluída não envelhece
 * @param now injetável para teste; padrão é agora
 */
export function computeCardAging(
  stageEnteredAt: string | null | undefined,
  status?: string | null,
  now: Date = new Date(),
): CardAging | null {
  if (!stageEnteredAt) return null;
  // Card entregue não envelhece — o tempo dele virou cycle time, não atraso.
  if (status === "completed") return null;

  const entered = new Date(stageEnteredAt);
  if (Number.isNaN(entered.getTime())) return null;

  const ms = now.getTime() - entered.getTime();
  if (ms < 0) return null;

  const days = Math.floor(ms / 86_400_000);
  if (days < THRESHOLD_DAYS) return null;

  const tone: CardAging["tone"] =
    days >= STALE_DAYS ? "stale" : days >= WARN_DAYS ? "warn" : "fresh";

  return { days, label: humanize(days), tone };
}

/** Classes Tailwind por severidade — discreto quando novo, forte quando velho. */
export const CARD_AGING_CLASSES: Record<CardAging["tone"], string> = {
  fresh: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  stale: "text-destructive font-semibold",
};
