/**
 * Calcula o andamento (%) de uma atividade.
 *
 * DUAS FONTES, nesta ordem:
 *
 *  1. SUBATIVIDADES, quando existem — MÉDIA DO AVANÇO de cada uma, não
 *     contagem das concluídas. A coluna diz onde o cartão está; as
 *     subatividades dizem quanto do trabalho andou. Quando discordam, o
 *     trabalho é a verdade: arrastar um cartão para "Concluída" não conclui o
 *     que está dentro dele.
 *
 *     Cada filho vale o que a coluna DELE vale (regra 2, recursivamente) — o
 *     mesmo j/(K+1), o mesmo % fixo por coluna. Contar 0-ou-1 fazia um pai com
 *     três filhos em andamento exibir 0%, e deixava o pai mais burro que o
 *     filho: sozinho o filho mostrava 50%, dentro do pai valia nada.
 *
 *  2. POSIÇÃO DA COLUNA, para quem não tem subatividade — as regras abaixo,
 *     inalteradas.
 *
 * TRÊS PAPÉIS, TRÊS RÉGUAS (decisão de 13/08/2026):
 *
 *   • ATIVIDADE — a coluna onde está. É trabalho que alguém executa, e a
 *     coluna diz o estágio.
 *   • MARCO — 0 ou 100 (`isMilestone`). Ponto no tempo, sem duração.
 *   • FASE · PACOTE · ENTREGA — a média dos filhos, SEMPRE (`isGrouper`), e a
 *     própria coluna é ignorada. Não é trabalho, é caixa: mover a caixa não
 *     move o que está dentro dela.
 *
 * Regras da coluna (decisão de produto, 29/07/2026):
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
  ehTrabalhoEmCurso,
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
  /** Preenchido só quando a atividade TEM subatividades — a barra passou a
   *  medir trabalho feito em vez de posição no quadro. */
  subs?: { feitas: number; total: number };
  /** Coluna diz "concluída" mas há subatividade aberta. Não bloqueia nada:
   *  existe motivo legítimo (a subatividade virou irrelevante), mas some com
   *  o 100% falso e mostra a divergência a quem gerencia. */
  divergente?: boolean;
}

/** O mínimo que o cálculo precisa saber de uma subatividade. */
export interface SubActivityLike {
  status?: string | null;
  /** Coluna da subatividade — usada quando `status` não é conclusivo. */
  workflow_stage_id?: string | null;
  /**
   * Marco não tem meio-caminho: é um ponto no tempo, sem duração, sem horas e
   * sem custo (ver o cabeçalho de `eapModel.ts`). Ou aconteceu, ou não.
   */
  is_milestone?: boolean | null;
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

/**
 * Uma subatividade conta como feita quando está concluída — pelo status ou
 * pela coluna final do quadro. As duas leituras porque `status` nem sempre
 * acompanha o arrasto do card no Kanban.
 */
function subFeita(s: SubActivityLike, stages: ProgressStageLike[] | null | undefined): boolean {
  if ((s.status || "").toLowerCase() === "completed") return true;
  if (!s.workflow_stage_id || !stages) return false;
  const col = stages.find((x) => x.id === s.workflow_stage_id);
  if (!col) return false;
  return parseWorkflowCategory(col.categoria) === "concluida" || col.is_final === true;
}

/**
 * QUANTO uma subatividade avançou — não "acabou, sim ou não".
 *
 * Antes o pai contava cabeças (`feitas / total`) e cada filho valia 0 ou 1. Um
 * cartão com três filhos em pleno andamento mostrava 0%: o quadro dizia que
 * nada tinha começado. E era pior que isso — o filho sozinho mostrava 50% pela
 * coluna dele, então o PAI era mais burro que o FILHO, e o Fixo configurado na
 * tela de colunas não chegava ao cartão-pai.
 *
 * Agora cada filho vale o que a COLUNA dele diz — a mesma conta j/(K+1), o
 * mesmo Fixo, a mesma função que já calcula o cartão sem filhos. Uma fonte só.
 *
 * `null` = fora da média (cancelada), não zero: zerar puniria o pai por algo
 * que saiu do escopo. Pausada devolve o percentual congelado, ou 0 quando não
 * há valor congelado — parada não avança, mas também não some da conta.
 *
 * MARCO é 0 ou 100, nunca o meio. Ele não tem duração: é um ponto no tempo, e
 * arrastá-lo para "Em Revisão" não significa que meio marco aconteceu.
 */
function subAvanco(
  s: SubActivityLike,
  stages: ProgressStageLike[] | null | undefined,
): number | null {
  // `status` fecha a questão: concluída é 100, independente da coluna.
  if ((s.status || "").toLowerCase() === "completed") return 100;
  // Sem coluna não há o que ler — não iniciada.
  if (!s.workflow_stage_id || !stages || stages.length === 0) return 0;
  // Marco: só a coluna FINAL o realiza. Qualquer posição intermediária é 0 —
  // ele não avança, acontece. `subFeita` já faz esse teste (status ou coluna
  // concluída), que é exatamente a pergunta binária que o marco aceita.
  if (s.is_milestone) return subFeita(s, stages) ? 100 : 0;
  // Sem netos aqui: `SubActivityLike` não os carrega, e buscá-los abriria uma
  // recursão que nenhuma das telas alimenta hoje. Um nível é o que existe.
  const p = computeActivityProgress(s.workflow_stage_id, stages);
  return p.percent;
}

/**
 * Quanto uma coluna vale QUANDO NÃO TEM PERCENTUAL PRÓPRIO — o "auto".
 *
 * O número sai da POSIÇÃO no fluxo: a j-ésima de K colunas de trabalho vale
 * j/(K+1). Divide por K+1, não por K, para nunca dar 100% antes da coluna
 * final. Logo o valor MUDA sozinho ao inserir, remover ou reordenar colunas —
 * é essa a diferença entre "auto" e um número fixo.
 *
 * Existe para a tela de gerenciar colunas poder MOSTRAR quanto o auto vale.
 * Antes o campo dizia só "auto" e escondia o número; quem quisesse saber tinha
 * de calcular de cabeça. Mesmas regras de `computeActivityProgress` — se
 * divergirem, a tela mente sobre o próprio sistema.
 *
 * Devolve `null` quando a coluna não entra na conta (backlog, bloqueio,
 * exceção, ou marcada para não contribuir): nesses casos não há "auto" a
 * exibir, o valor é 0 por definição.
 */
export function percentualAutomaticoDaColuna(
  stageId: string,
  stages: ProgressStageLike[] | null | undefined,
): number | null {
  if (!stages || stages.length === 0) return null;
  const current = stages.find((s) => s.id === stageId);
  if (!current) return null;

  const category = parseWorkflowCategory(current.categoria) ?? categoryFromLegacyFlags(current);
  if (category === "concluida" || current.is_final) return 100;
  if (category === "backlog" || isBacklogStage(current)) return null;
  if (current.is_blocked || current.is_exception) return null;
  if (current.contributes_to_progress === false) return null;

  // Mesmo denominador de computeActivityProgress: só colunas de "andamento".
  const flow = stages
    .filter((s) => ehTrabalhoEmCurso(parseWorkflowCategory(s.categoria) ?? categoryFromLegacyFlags(s)))
    .sort((a, b) => a.display_order - b.display_order);
  const j = flow.findIndex((s) => s.id === current.id) + 1;
  if (j <= 0) return null;
  return clampPercent((j / (flow.length + 1)) * 100);
}

export function computeActivityProgress(
  currentStageId: string | null | undefined,
  stages: ProgressStageLike[] | null | undefined,
  lastProgressStageId?: string | null,
  /**
   * Subatividades da atividade. QUANDO EXISTEM, elas mandam: a coluna diz onde
   * o cartão está, as subatividades dizem quanto do trabalho andou — e mover
   * um cartão não conclui nada.
   *
   * Medido em 03/08/2026: 703 das 1.317 atividades sao subatividades e o
   * calculo as ignorava por completo. Cinco atividades ficavam com a barra em
   * 100% tendo filho aberto (uma com 5 de 11 feitas).
   */
  subActivities?: SubActivityLike[] | null,
  /**
   * A PRÓPRIA atividade é um marco. Marco não tem percentual de avanço: é um
   * ponto no tempo, sem duração, sem horas e sem custo — ou aconteceu, ou não.
   * Sem esta marca ele herdava a régua das atividades e exibia 33%, 67%, como
   * se um marco pudesse estar pela metade.
   */
  isMilestone?: boolean | null,
  /**
   * A PRÓPRIA atividade é um AGRUPADOR (Fase, Pacote, Entrega) — uma caixa que
   * contém trabalho, não trabalho que alguém executa.
   *
   * Quando true, a coluna onde a caixa está é IGNORADA: ela vale a média dos
   * filhos, e só. Mover a caixa não move o que está dentro dela — arrastar uma
   * Entrega para "Aprovada" não faz ninguém escrever o manual.
   *
   * Sem esta marca a caixa herdava a régua das atividades: ir para uma coluna
   * de 80% anunciava 80% de trabalho pronto sem nada ter sido feito. É o mesmo
   * defeito do marco (ver `isMilestone`), com outra fantasia.
   */
  isGrouper?: boolean | null,
): ActivityProgress {
  // ── MARCO: binário, decidido antes de tudo ─────────────────────────────
  // Antes das subatividades de propósito: marco não agrupa (o trigger do banco
  // recusa), então filho aqui é dado inconsistente e não deve mandar no número.
  // Bloqueio ainda vence, porque "travado" descreve o cartão, não o avanço.
  if (isMilestone) {
    const col = currentStageId && stages ? stages.find((s) => s.id === currentStageId) : null;
    if (col?.is_blocked) return { percent: null, paused: true, label: "Pausada" };
    const feito = subFeita({ workflow_stage_id: currentStageId }, stages);
    return {
      percent: feito ? 100 : 0,
      paused: false,
      label: feito ? "Atingido" : "Não atingido",
    };
  }

  // ── Subatividades mandam quando existem ────────────────────────────────
  // MÉDIA DO AVANÇO, não contagem de concluídas. Cada filho entra com quanto
  // andou (ver `subAvanco`), então "Em Revisão" vale 75 em vez de 0.
  //
  // Média simples, não ponderada por horas: só 48% das atividades têm horas
  // preenchidas, e ponderar por um campo ausente em metade da base produziria
  // números piores. Trocar é uma linha, se isso mudar.
  //
  // `avancos` vazio = TODOS os filhos cancelados: não há trabalho a medir
  // neles. Cair para 0% seria mentir por omissão, então o bloco inteiro é
  // pulado e o pai volta a responder pela própria coluna, logo abaixo.
  const avancos = (subActivities ?? [])
    .map((s) => subAvanco(s, stages))
    .filter((v): v is number => v !== null);

  if (subActivities && subActivities.length > 0 && avancos.length > 0) {
    const total = subActivities.length;
    const feitas = subActivities.filter((s) => subFeita(s, stages)).length;
    const percent = clampPercent(avancos.reduce((a, b) => a + b, 0) / avancos.length);

    const col = currentStageId && stages ? stages.find((s) => s.id === currentStageId) : null;
    const colunaConcluida = !!col && (parseWorkflowCategory(col.categoria) === "concluida" || col.is_final === true);
    const divergente = colunaConcluida && feitas < total;

    // Bloqueio continua acima de tudo: pausada é pausada, com ou sem filhos.
    if (col?.is_blocked) {
      return { percent: null, paused: true, label: "Pausada", subs: { feitas, total } };
    }

    return {
      percent,
      paused: false,
      label: divergente
        ? `concluída com ${total - feitas} em aberto`
        : `${feitas} de ${total} subatividades`,
      subs: { feitas, total },
      divergente,
    };
  }

  // ── AGRUPADOR sem filhos a medir: NÃO herda a coluna ───────────────────
  // Chega aqui a caixa vazia, ou a caixa cujos filhos foram todos cancelados.
  // Deixá-la seguir para a régua das atividades era o defeito: uma Entrega
  // arrastada para "Aprovada" anunciaria 80% sem ninguém ter trabalhado.
  // Caixa sem conteúdo mensurável é 0% — não há trabalho a reportar.
  if (isGrouper) {
    const col = currentStageId && stages ? stages.find((s) => s.id === currentStageId) : null;
    if (col?.is_blocked) return { percent: null, paused: true, label: "Pausada" };
    return { percent: 0, paused: false, label: "Sem atividades" };
  }

  // ── Sem subatividades: posição na coluna, exatamente como antes ────────
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
    // ESPERA congela: o percentual para onde estava, e a atividade se anuncia
    // como parada. Vem ANTES do teste de peso nulo porque "espera" e
    // "cancelada" compartilham `progressWeight: null` por motivos opostos —
    // uma está pausada e volta, a outra saiu dos indicadores para sempre.
    // Sem esta guarda, uma coluna de espera exibiria "Cancelada".
    if (category === "espera") {
      const congelado = current.progress_percent != null ? clampPercent(current.progress_percent) : null;
      return { percent: congelado, paused: true, label: "Em espera" };
    }
    const weight = WORKFLOW_CATEGORY_META[category].progressWeight;
    if (weight === null) {
      // Cancelada: fora dos indicadores, sem percentual.
      return { percent: null, paused: false, label: "Cancelada" };
    }
    if (ehTrabalhoEmCurso(category)) {
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
        .filter((s) => ehTrabalhoEmCurso(parseWorkflowCategory(s.categoria) ?? categoryFromLegacyFlags(s)))
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

/**
 * O PROGRESSO DO PAI, PREFERINDO O NÚMERO DO SERVIDOR.
 *
 * ============================================================================
 * POR QUE ISTO EXISTE, JÁ QUE `computeActivityProgress` "funciona"
 *
 * Ele funciona para quem enxerga o projeto inteiro. Para quem enxerga uma
 * FATIA, não: a média é calculada sobre as filhas que a RLS deixou passar.
 * Quem vê 1 de 8 filhas tem a barra do pai medindo aquela filha só — está
 * certa por acidente, e o erro é invisível porque o número é plausível.
 *
 * `derived_progress` é derivado por trigger `SECURITY DEFINER` sobre TODAS as
 * filhas, independente do que o ator enxerga. É o motivo da fase 09.
 *
 * A MESMA RÉGUA NOS DOIS LADOS. A migration 20260826190000 copiou para
 * `derivar_do_pai()` os pesos exatos daqui: crédito parcial por posição de
 * coluna, um nível, média simples, `Math.round`. Conferido contra o código
 * real em 582 pais: **zero barra muda de valor**. Se algum dia divergir, o
 * script `scripts/medicoes/conferir-progresso-servidor.cjs` acusa.
 *
 * O QUE NÃO VEM DO SERVIDOR: `paused`, `label`, `subs` e `divergente`. O banco
 * não tem esses estados — "Pausada", "Em espera", "concluída com 3 em aberto"
 * são leitura de tela. Por isso esta função não substitui a outra: ela roda a
 * de sempre e TROCA SÓ O NÚMERO.
 *
 * SEM FALLBACK SILENCIOSO: `derived_progress` nulo num pai com filhas devolve
 * `percent: null`. Cair no número do cliente seria voltar a medir a fatia,
 * sem ninguém perceber — que é exatamente o defeito que a fase 09 corrige.
 * ============================================================================
 */
export function progressoDoPai(
  atividade: {
    workflow_stage_id?: string | null;
    last_progress_stage_id?: string | null;
    is_milestone?: boolean | null;
    derived_progress?: number | string | null;
    derived_children?: number | null;
  },
  stages: ProgressStageLike[] | null | undefined,
  subActivities?: SubActivityLike[] | null,
  isGrouper?: boolean | null,
): ActivityProgress {
  const base = computeActivityProgress(
    atividade.workflow_stage_id,
    stages,
    atividade.last_progress_stage_id,
    subActivities,
    atividade.is_milestone,
    isGrouper,
  );

  const ehPai = (atividade.derived_children ?? 0) > 0;
  if (!ehPai) return base;

  // Pausada/em espera vence o número: é estado, não percentual, e o servidor
  // não o representa. Mesma precedência que a função de origem já aplica.
  if (base.paused) return base;

  const derivado = atividade.derived_progress;
  if (derivado === null || derivado === undefined) {
    return { ...base, percent: null };
  }

  const n = typeof derivado === "number" ? derivado : Number(derivado);
  if (!Number.isFinite(n)) return { ...base, percent: null };

  return { ...base, percent: clampPercent(n) };
}