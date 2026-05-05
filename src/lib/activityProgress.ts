/**
 * Calcula o andamento (%) de uma atividade automaticamente a partir
 * da posição da sua coluna no workflow do projeto.
 *
 * Regras (memória do produto):
 *  - Cálculo 100% automático pelo Kanban (sem override manual).
 *  - Mapeamento fixo nas 5 flags: 0 / 25 / 50 / 75 / 100.
 *  - Coluna marcada como "Bloqueio" → status "pausado" (sem %).
 *  - Coluna marcada como "Final" → 100%.
 *  - Sem stage definida → 0%.
 *
 * O cálculo considera apenas as colunas não bloqueadas, ordenadas por
 * display_order. A posição da coluna atual nessa lista é convertida em
 * fração (0..1) e arredondada para a flag mais próxima (0/25/50/75/100).
 */

export interface ProgressStageLike {
  id: string;
  display_order: number;
  is_final?: boolean | null;
  is_blocked?: boolean | null;
}

export interface ActivityProgress {
  /** Percentual snapped: 0, 25, 50, 75 ou 100 (null se pausado/sem stage) */
  percent: number | null;
  /** true quando a coluna atual é de bloqueio */
  paused: boolean;
  /** Rótulo da etapa de progresso */
  label: string;
}

const FLAGS = [0, 25, 50, 75, 100] as const;

function snapToFlag(value: number): number {
  let best = FLAGS[0] as number;
  let bestDist = Math.abs(value - best);
  for (const f of FLAGS) {
    const d = Math.abs(value - f);
    if (d < bestDist) {
      best = f;
      bestDist = d;
    }
  }
  return best;
}

const PERCENT_LABELS: Record<number, string> = {
  0: "Não iniciada",
  25: "Iniciada",
  50: "Realizada",
  75: "Concluída",
  100: "Validada",
};

export function computeActivityProgress(
  currentStageId: string | null | undefined,
  stages: ProgressStageLike[] | null | undefined
): ActivityProgress {
  if (!currentStageId || !stages || stages.length === 0) {
    return { percent: 0, paused: false, label: PERCENT_LABELS[0] };
  }

  const current = stages.find((s) => s.id === currentStageId);
  if (!current) {
    return { percent: 0, paused: false, label: PERCENT_LABELS[0] };
  }

  if (current.is_blocked) {
    return { percent: null, paused: true, label: "Pausada" };
  }

  if (current.is_final) {
    return { percent: 100, paused: false, label: PERCENT_LABELS[100] };
  }

  // Linha de fluxo: ignora bloqueios, ordenada por display_order
  const flow = stages
    .filter((s) => !s.is_blocked)
    .sort((a, b) => a.display_order - b.display_order);

  if (flow.length <= 1) {
    return { percent: current.is_final ? 100 : 0, paused: false, label: PERCENT_LABELS[0] };
  }

  const idx = flow.findIndex((s) => s.id === currentStageId);
  if (idx < 0) {
    return { percent: 0, paused: false, label: PERCENT_LABELS[0] };
  }

  // Fração 0..1 da posição atual no fluxo
  const fraction = idx / (flow.length - 1);
  const raw = fraction * 100;
  const snapped = snapToFlag(raw);
  return { percent: snapped, paused: false, label: PERCENT_LABELS[snapped] ?? PERCENT_LABELS[0] };
}

export const PROGRESS_FLAG_COLORS: Record<number, string> = {
  0: "bg-muted-foreground/40",
  25: "bg-amber-500",
  50: "bg-blue-500",
  75: "bg-violet-500",
  100: "bg-emerald-500",
};
