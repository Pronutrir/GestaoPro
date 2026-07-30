/**
 * Calcula o andamento (%) de uma atividade automaticamente a partir
 * da posição da sua coluna no workflow do projeto.
 *
 * Regras (decisão de produto, 29/07/2026):
 *  - Backlog e "A iniciar" (a_iniciar) são SEMPRE 0% — existir/estar na fila
 *    não é avanço.
 *  - Concluída = 100%; Cancelada fica fora dos indicadores (sem %).
 *  - Colunas de TRABALHO (categoria "andamento") avançam pela POSIÇÃO no
 *    fluxo: com K colunas de trabalho, a j-ésima vale j/(K+1) de 100.
 *    Ex.: A Fazer(0) → Fazendo → Revisão → Concluída(100) dá 33% e 67%.
 *    Antes toda coluna "andamento" valia 25% fixo (modelo Linear) — o quadro
 *    inteiro parecia parado no mesmo número, e ninguém entendia o percentual.
 *  - Um % explícito da coluna (progress_percent, menu "Definir % da coluna")
 *    vence a posição — é o override manual por coluna.
 *  - Coluna de bloqueio/exceção (legado sem categoria) → "pausada" (sem %).
 *  - Sem stage definida → 0%.
 */

import {
  categoryFromLegacyFlags,
  parseWorkflowCategory,
  WORKFLOW_CATEGORY_META,
} from "./workflowCategory";

export interface ProgressStageLike {
  id: string;
  display_order: number;
  title?: string | null;
  is_final?: boolean | null;
  is_blocked?: boolean | null;
  is_exception?: boolean | null;
  progress_percent?: number | null;
  contributes_to_progress?: boolean | null;
  /** Categoria semântica — quando presente, tem precedência sobre as flags. */
  categoria?: string | null;
}

export interface ActivityProgress {
  /** Percentual 0–100 (null se pausada/cancelada). */
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

  // A CATEGORIA manda quando existe: backlog/a_iniciar = 0, concluída = 100,
  // cancelada = fora. "Andamento" avança pela POSIÇÃO entre as colunas de
  // trabalho (ver cabeçalho) — o peso fixo do META vira só fallback.
  const category = parseWorkflowCategory(current.categoria);
  if (category) {
    const weight = WORKFLOW_CATEGORY_META[category].progressWeight;
    if (weight === null) {
      // Cancelada: fora dos indicadores, sem percentual.
      return { percent: null, paused: false, label: "Cancelada" };
    }
    if (category === "andamento") {
      // 1) % explícito da coluna (menu "Definir % da coluna") vence a posição.
      if (current.progress_percent != null) {
        const explicit = clampPercent(current.progress_percent);
        return { percent: explicit, paused: false, label: getPercentLabel(explicit) };
      }
      // 2) Posicional: j-ésima de K colunas de trabalho → j/(K+1) de 100.
      //    Divide por K+1 (não K) para nunca dar 100% antes da Concluída.
      //    Colunas sem categoria explícita entram pela leitura legada, para o
      //    fluxo ficar completo em quadros mistos (pré/pós-backfill).
      const flow = stages
        .filter((s) => (parseWorkflowCategory(s.categoria) ?? categoryFromLegacyFlags(s)) === "andamento")
        .sort((a, b) => a.display_order - b.display_order);
      const j = flow.findIndex((s) => s.id === current.id) + 1;
      if (j > 0) {
        const raw = clampPercent((j / (flow.length + 1)) * 100);
        return { percent: raw, paused: false, label: getPercentLabel(raw) };
      }
      // Posição indeterminável: crédito parcial constante (fallback).
      return { percent: weight, paused: false, label: getPercentLabel(weight) };
    }
    return {
      percent: weight,
      paused: false,
      label: category === "concluida" ? PERCENT_LABELS[100] : getPercentLabel(weight),
    };
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