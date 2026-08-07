/**
 * PRONTIDÃO DE UMA TAREFA — o que falta para ela virar trabalho.
 *
 * O backlog do projeto mostrava o que existe, nunca o que falta. Medido em
 * 06/08/2026 nas 718 tarefas de trabalho da base: 20 (3%) tinham o mínimo para
 * alguém executar. As outras 698 estavam incompletas e nada na tela dizia isso
 * — era preciso abrir uma por uma para descobrir.
 *
 * É a ideia que o Scrum chama de "Definition of Ready" e que o Jira e o Linear
 * materializam de formas diferentes: um item só é executável quando quem vai
 * pegá-lo sabe o que fazer, até quando, com que prioridade e de quem é.
 *
 * NÃO é validação: nada aqui impede salvar uma tarefa incompleta. Rascunho é um
 * estado legítimo — o que não pode é o rascunho parecer pronto.
 */

/** Campos que compõem a prontidão. A ordem é a de exibição. */
export type RequisitoProntidao = "responsavel" | "prazo" | "prioridade" | "estimativa" | "descricao";

/** Entrada mínima para avaliar. Aceita o shape das várias telas. */
export interface TarefaProntidaoLike {
  assigned_to?: string | null;
  end_date?: string | null;
  /** Gravidade do GUT: é o campo que inicia a definição de prioridade. */
  gravity?: number | null;
  priority?: string | null;
  hours?: number | string | null;
  description?: string | null;
  /** Marco não tem esforço nem intervalo — regra própria, ver abaixo. */
  is_milestone?: boolean | null;
  status?: string | null;
}

/** Rótulo curto, para o chip na linha. */
export const PRONTIDAO_LABELS: Record<RequisitoProntidao, string> = {
  responsavel: "responsável",
  prazo: "prazo",
  prioridade: "prioridade",
  estimativa: "estimativa",
  descricao: "descrição",
};

/** Rótulo longo, para o resumo no topo. */
export const PRONTIDAO_LABELS_LONGOS: Record<RequisitoProntidao, string> = {
  responsavel: "sem responsável",
  prazo: "sem prazo",
  prioridade: "sem prioridade",
  estimativa: "sem estimativa",
  descricao: "sem descrição",
};

export interface ResultadoProntidao {
  /** true quando nada falta — a tarefa pode ser executada. */
  pronta: boolean;
  /** O que falta, na ordem de exibição. Vazio quando pronta. */
  faltando: RequisitoProntidao[];
  /** false para itens que não entram na conta (concluídos, agrupadores). */
  avaliavel: boolean;
}

const semTexto = (v?: string | null) => !v || !v.trim();
const semNumero = (v?: number | string | null) => {
  const n = Number(v);
  return !Number.isFinite(n) || n <= 0;
};

/**
 * O que falta nesta tarefa.
 *
 * `temFilhos`: agrupadores (Fase/Entrega) são avaliados pelos filhos, não por
 * si — horas, custo e datas deles já são rollup. Cobrar prazo de uma fase seria
 * pedir para digitar o que o sistema calcula.
 *
 * Concluídas também saem: exigir estimativa de algo já entregue é ruído sobre
 * trabalho que acabou.
 *
 * MARCO tem regra própria: é um ponto no tempo, sem esforço. Precisa de data e
 * responsável; estimativa e descrição não se aplicam.
 */
export function avaliarProntidao(
  tarefa: TarefaProntidaoLike,
  temFilhos = false,
): ResultadoProntidao {
  const concluida = (tarefa.status || "").toLowerCase() === "completed";
  if (temFilhos || concluida) {
    return { pronta: true, faltando: [], avaliavel: false };
  }

  const faltando: RequisitoProntidao[] = [];

  if (semTexto(tarefa.assigned_to)) faltando.push("responsavel");
  if (semTexto(tarefa.end_date)) faltando.push("prazo");

  // Prioridade vem do GUT (gravity × urgency × tendency). `gravity` preenchido
  // significa que alguém a definiu; `priority` textual é o valor legado.
  const prioridadeDefinida =
    !semNumero(tarefa.gravity) ||
    (!semTexto(tarefa.priority) && (tarefa.priority || "").toLowerCase() !== "pendente");
  if (!prioridadeDefinida) faltando.push("prioridade");

  if (!tarefa.is_milestone) {
    if (semNumero(tarefa.hours)) faltando.push("estimativa");
    if (semTexto(tarefa.description)) faltando.push("descricao");
  }

  return { pronta: faltando.length === 0, faltando, avaliavel: true };
}

export interface ResumoProntidao {
  /** Tarefas que entram na conta (exclui agrupadores e concluídas). */
  total: number;
  prontas: number;
  /** Falta exatamente um campo — quase lá. */
  quaseProntas: number;
  /** Falta mais de um campo. */
  incompletas: number;
  /** Quantas tarefas carecem de cada campo, para o texto do resumo. */
  porRequisito: Record<RequisitoProntidao, number>;
}

/** Consolida a prontidão de uma lista — alimenta a barra do topo. */
export function resumirProntidao(
  itens: Array<{ tarefa: TarefaProntidaoLike; temFilhos?: boolean }>,
): ResumoProntidao {
  const porRequisito: Record<RequisitoProntidao, number> = {
    responsavel: 0, prazo: 0, prioridade: 0, estimativa: 0, descricao: 0,
  };
  let total = 0, prontas = 0, quaseProntas = 0, incompletas = 0;

  for (const { tarefa, temFilhos } of itens) {
    const r = avaliarProntidao(tarefa, temFilhos);
    if (!r.avaliavel) continue;
    total += 1;
    if (r.pronta) prontas += 1;
    else if (r.faltando.length === 1) quaseProntas += 1;
    else incompletas += 1;
    r.faltando.forEach((f) => { porRequisito[f] += 1; });
  }

  return { total, prontas, quaseProntas, incompletas, porRequisito };
}

/**
 * As duas carências mais frequentes, para o texto ao lado da barra.
 * Mostrar as cinco viraria parede; as duas maiores é o que orienta a ação.
 */
export function principaisCarencias(
  resumo: ResumoProntidao,
  quantas = 2,
): Array<{ requisito: RequisitoProntidao; quantidade: number }> {
  return (Object.entries(resumo.porRequisito) as Array<[RequisitoProntidao, number]>)
    .filter(([, q]) => q > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, quantas)
    .map(([requisito, quantidade]) => ({ requisito, quantidade }));
}
