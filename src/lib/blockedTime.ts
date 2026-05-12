// Utilitário para calcular tempo total em colunas de bloqueio
export function getBlockedDays(activity: {
  blocked_since?: string | null;
  blocked_days_total?: number | null;
}): number {
  const accumulated = Number(activity?.blocked_days_total || 0);
  if (!activity?.blocked_since) return accumulated;
  const since = new Date(activity.blocked_since).getTime();
  if (Number.isNaN(since)) return accumulated;
  const diff = (Date.now() - since) / (1000 * 60 * 60 * 24);
  return accumulated + Math.max(0, diff);
}

export function formatBlockedDays(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return "";
  if (days < 1) {
    const hours = Math.round(days * 24);
    if (hours < 1) return "menos de 1h";
    return `${hours}h bloqueada`;
  }
  const whole = Math.floor(days);
  return `${whole} ${whole === 1 ? "dia bloqueada" : "dias bloqueada"}`;
}
