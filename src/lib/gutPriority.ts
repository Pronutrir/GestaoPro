/**
 * Sistema de priorização GUT (Gravidade × Urgência × Tendência)
 * - Cada fator: nota 1 a 5
 * - Score: 1 a 125
 * - Rótulo derivado automaticamente das faixas (sem opinião humana)
 *
 * Faixas:
 *  1–8    → baixa     (verde)
 *  9–27   → média     (amarelo)
 *  28–59  → alta      (laranja)
 *  60–99  → crítica   (vermelho)
 *  100–125→ urgente   (roxo, pulsante)
 */

export type GutLevel = "baixa" | "media" | "alta" | "critica" | "urgente" | "pendente";

export interface GutMeta {
  label: string;
  shortLabel: string;
  /** Tailwind classes (background+text) para badges */
  badgeClass: string;
  /** Cor de borda lateral / ring */
  ringClass: string;
  /** Cor do ponto/dot */
  dotClass: string;
  /** Animação extra (urgente pulsa) */
  pulse?: boolean;
}

export const GUT_META: Record<GutLevel, GutMeta> = {
  pendente: {
    label: "Pendente",
    shortLabel: "?",
    badgeClass: "bg-muted text-muted-foreground border border-dashed border-muted-foreground/40",
    ringClass: "border-muted-foreground/40",
    dotClass: "bg-muted-foreground",
  },
  baixa: {
    label: "Baixa",
    shortLabel: "B",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
    ringClass: "border-emerald-500/40",
    dotClass: "bg-emerald-500",
  },
  media: {
    label: "Média",
    shortLabel: "M",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
    ringClass: "border-amber-500/40",
    dotClass: "bg-amber-500",
  },
  alta: {
    label: "Alta",
    shortLabel: "A",
    badgeClass: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30",
    ringClass: "border-orange-500/40",
    dotClass: "bg-orange-500",
  },
  critica: {
    label: "Crítica",
    shortLabel: "C",
    badgeClass: "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/40",
    ringClass: "border-red-500/50",
    dotClass: "bg-red-500",
  },
  urgente: {
    label: "Urgente",
    shortLabel: "U",
    badgeClass: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/40 animate-pulse",
    ringClass: "border-fuchsia-500/60",
    dotClass: "bg-fuchsia-500",
    pulse: true,
  },
};

/** Calcula score 1–125 (ou null se incompleto) */
export function gutScore(g?: number | null, u?: number | null, t?: number | null): number | null {
  if (!g || !u || !t) return null;
  const G = Math.max(1, Math.min(5, g));
  const U = Math.max(1, Math.min(5, u));
  const T = Math.max(1, Math.min(5, t));
  return G * U * T;
}

/** Mapeia score → rótulo (espelha public.gut_label no Postgres) */
export function gutLabel(score: number | null | undefined): GutLevel {
  if (score == null) return "pendente";
  if (score <= 8) return "baixa";
  if (score <= 27) return "media";
  if (score <= 59) return "alta";
  if (score <= 99) return "critica";
  return "urgente";
}

/** Normaliza qualquer string vinda do banco para um GutLevel válido */
export function normalizeGut(raw: string | null | undefined): GutLevel {
  if (!raw) return "pendente";
  const v = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (v === "baixa" || v === "low") return "baixa";
  if (v === "media" || v === "medium") return "media";
  if (v === "alta" || v === "high") return "alta";
  if (v === "critica") return "critica";
  if (v === "urgente") return "urgente";
  return "pendente";
}

/** Texto curto explicando cada nota — usado em tooltips */
export const GUT_HINTS = {
  gravity: {
    title: "Gravidade — qual o impacto se nada for feito?",
    notes: {
      1: "Sem dano relevante",
      2: "Pequeno desconforto",
      3: "Prejuízo moderado",
      4: "Prejuízo significativo",
      5: "Prejuízo grave / operação para",
    },
  },
  urgency: {
    title: "Urgência — qual a pressão do prazo?",
    notes: {
      1: "Pode esperar meses",
      2: "Próximas semanas",
      3: "Este mês",
      4: "Próximos dias",
      5: "Imediato / vencendo agora",
    },
  },
  tendency: {
    title: "Tendência — o problema piora com o tempo?",
    notes: {
      1: "Estável, não muda",
      2: "Pequena tendência de piora",
      3: "Piora gradual",
      4: "Piora notável",
      5: "Piora rápida / explode",
    },
  },
} as const;