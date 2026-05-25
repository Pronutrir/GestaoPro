/**
 * Calcula o andamento (%) de uma atividade automaticamente a partir
 * da posição da sua coluna no workflow do projeto.
 *
 * Regras (memória do produto):
 *  - Cálculo 100% automático pelo Kanban (sem override manual por atividade).
 *  - Cada coluna pode ter um percentual explícito (progress_percent).
 *  - Colunas podem participar ou não da evolução (contributes_to_progress).
 *  - Coluna marcada como "Bloqueio" → status "pausado" (sem %).
 *  - Coluna marcada como "Final" → 100%.
 *  - Sem stage definida → 0%.
 *
 * O cálculo usa a ordem (display_order) apenas como fallback para colunas
 * sem percentual explícito, mantendo comportamento adaptável por projeto.
 */

export interface ProgressStageLike {
  id: string;
  display_order: number;
  title?: string | null;
  is_final?: boolean | null;
  is_blocked?: boolean | null;
  is_exception?: boolean | null;
  progress_percent?: number | null;
  contributes_to_progress?: boolean | null;
}

export interface ActivityProgress {
  /** Percentual snapped: 0, 25, 50, 75 ou 100 (null se pausado/sem stage) */
  percent: number | null;
  /** true quando a coluna atual é de bloqueio */
  paused: boolean;
  /** Rótulo da etapa de progresso */
  label: string;
}

const PERCENT_LABELS: Record<number, string> = {
  0: "Não iniciada",
  25: "Iniciada",
  50: "Realizada",
  75: "Concluída",
  100: "Validada",
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getPercentLabel(percent: number): string {
  if (percent >= 100) return PERCENT_LABELS[100];
  if (percent >= 75) return PERCENT_LABELS[75];
  if (percent >= 50) return PERCENT_LABELS[50];
  if (percent >= 25) return PERCENT_LABELS[25];
  return PERCENT_LABELS[0];
}

function normalize(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isBacklogStage(stage: ProgressStageLike): boolean {
  const t = normalize(stage.title);
  return stage.display_order === 0 || t === "backlog";
}

export function computeActivityProgress(
  currentStageId: string | null | undefined,
  stages: ProgressStageLike[] | null | undefined,
  lastProgressStageId?: string | null
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

  // Exceção (ex.: "Atrasado") deve sempre aparecer como pausada,
  // sem percentual de avanço.
  if (current.is_exception) {
    return { percent: null, paused: true, label: "Pausada" };
  }

  const contributes = current.contributes_to_progress !== false;
  if (!contributes) {
    return { percent: 0, paused: false, label: PERCENT_LABELS[0] };
  }

  // Regra automática: Backlog não deve avançar percentual.
  if (isBacklogStage(current)) {
    return { percent: 0, paused: false, label: PERCENT_LABELS[0] };
  }

  if (current.progress_percent != null) {
    const explicit = clampPercent(current.progress_percent);
    return { percent: explicit, paused: false, label: getPercentLabel(explicit) };
  }

  // Fallback dinâmico por ordem: ignora bloqueios/exceções, colunas não participantes e backlog.
  const flow = stages
    .filter(
      (s) =>
        !s.is_blocked &&
        !s.is_exception &&
        s.contributes_to_progress !== false &&
        !isBacklogStage(s),
    )
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
  const raw = clampPercent(fraction * 100);
  return { percent: raw, paused: false, label: getPercentLabel(raw) };
}

export const PROGRESS_FLAG_COLORS: Record<number, string> = {
  0: "bg-muted-foreground/40",
  25: "bg-amber-500",
  50: "bg-blue-500",
  75: "bg-violet-500",
  100: "bg-emerald-500",
};