/**
 * Fonte única do ESTADO de uma atividade.
 *
 * Antes desta função havia três definições concorrentes de "concluída" e
 * "atrasada" no código (Cronograma, healthScore e Kanban), que produziam
 * números diferentes para o mesmo projeto. Tudo que precisar classificar
 * uma atividade deve chamar `resolveActivityState`.
 *
 * Relação com o Kanban: o andamento é derivado da coluna do workflow
 * (ver `lib/activityProgress.ts` — "cálculo 100% automático pelo Kanban").
 * Portanto mover uma atividade de coluna, ou reconfigurar as colunas do
 * projeto, muda legitimamente o estado aqui. O que NÃO pode acontecer é
 * cada tela interpretar essa mesma configuração de um jeito.
 */

import { computeActivityProgress, type ProgressStageLike } from "./activityProgress";
import { parseWorkflowCategory, isClosingCategory } from "./workflowCategory";

export type ActivityState =
  | "concluida"
  | "cancelada"
  | "atrasada"
  | "bloqueada"
  | "andamento"
  | "a_iniciar";

export interface ActivityStateInput {
  status?: string | null;
  end_date?: string | null;
  workflow_stage_id?: string | null;
  last_progress_stage_id?: string | null;
}

/** Rótulos exibidos ao usuário. Uma grafia só, em todas as telas. */
export const ACTIVITY_STATE_LABEL: Record<ActivityState, string> = {
  concluida: "Concluída",
  cancelada: "Cancelada",
  atrasada: "Atrasada",
  bloqueada: "Bloqueada",
  andamento: "Em andamento",
  a_iniciar: "A iniciar",
};

/** Interpreta "YYYY-MM-DD" no fuso local, evitando o deslocamento de UTC. */
function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * `true` quando a atividade está encerrada — pela coluna final do Kanban
 * ou pelo status próprio. As duas formas valem: nem todo projeto usa
 * workflow, e o status é editável direto na atividade.
 */
export function isActivityCompleted(
  activity: ActivityStateInput,
  stage?: { is_final?: boolean | null; categoria?: string | null } | null,
): boolean {
  // A categoria tem precedência: é a fonte da verdade e não muda ao renomear.
  // Cancelada NÃO é concluída — encerra a atividade, mas fica fora dos
  // indicadores de entrega (ver isActivityClosed).
  const category = parseWorkflowCategory(stage?.categoria);
  if (category) return category === "concluida" || activity.status === "completed";
  return !!stage?.is_final || activity.status === "completed";
}

/**
 * `true` quando a atividade está encerrada por qualquer via — concluída ou
 * cancelada. Use para decidir se algo ainda demanda trabalho; para contar
 * entregas, use `isActivityCompleted`.
 */
export function isActivityClosed(
  activity: ActivityStateInput,
  stage?: { is_final?: boolean | null; categoria?: string | null } | null,
): boolean {
  const category = parseWorkflowCategory(stage?.categoria);
  if (category && isClosingCategory(category)) return true;
  return isActivityCompleted(activity, stage);
}

/**
 * `true` quando a data de fim já passou e a atividade não foi concluída.
 * Note a dependência de `isActivityCompleted`: uma atividade na coluna
 * final do Kanban nunca é atrasada, mesmo com a data vencida.
 */
export function isActivityOverdue(
  activity: ActivityStateInput,
  stage?: { is_final?: boolean | null; categoria?: string | null } | null,
  today: Date = new Date(),
): boolean {
  if (!activity.end_date) return false;
  // Encerrada (concluída OU cancelada) nunca é atraso: cancelada não deve
  // poluir o indicador de prazo com trabalho que ninguém vai mais fazer.
  if (isActivityClosed(activity, stage)) return false;
  const ref = new Date(today);
  ref.setHours(0, 0, 0, 0);
  return parseLocalDate(activity.end_date) < ref;
}

/**
 * Estado único da atividade, na ordem de precedência que o usuário espera:
 * concluída → atrasada → bloqueada → em andamento → a iniciar.
 *
 * "Bloqueada" vem de `computeActivityProgress().paused` (coluna de bloqueio
 * ou de exceção no Kanban) e precisa existir como estado próprio: sem ela,
 * trabalho travado se esconde entre as atividades "a iniciar" — o oposto
 * do que significa, e justamente o caso que exige ação.
 *
 * @param stages Colunas do workflow DO PROJETO da atividade. Sem elas, o
 *   andamento não é calculável e o estado cai em concluída/atrasada/a_iniciar.
 */
export function resolveActivityState(
  activity: ActivityStateInput,
  stage?: { is_final?: boolean | null; categoria?: string | null } | null,
  stages?: ProgressStageLike[] | null,
  today: Date = new Date(),
): ActivityState {
  if (parseWorkflowCategory(stage?.categoria) === "cancelada") return "cancelada";
  if (isActivityCompleted(activity, stage)) return "concluida";
  if (isActivityOverdue(activity, stage, today)) return "atrasada";

  const progress = computeActivityProgress(
    activity.workflow_stage_id,
    stages,
    activity.last_progress_stage_id,
  );
  // "bloqueada" ainda vem da coluna enquanto a flag no item não existe (fase 3).
  if (progress.paused) return "bloqueada";
  return (progress.percent ?? 0) > 0 ? "andamento" : "a_iniciar";
}
