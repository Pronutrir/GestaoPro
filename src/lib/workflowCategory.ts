/**
 * Categoria semântica da coluna do Kanban — o enum fechado que os relatórios
 * entendem, independente do nome que o time deu à coluna.
 *
 * Por que existe
 * -------------
 * Antes disto a semântica era ADIVINHADA por regex sobre o título
 * (ver `workflowStageRules.ts`), inclusive ao renomear. Trocar "Concluída"
 * por "Entregue ao cliente" desmarcava `is_final` em silêncio: as atividades
 * daquela coluna deixavam de contar como concluídas, o progresso caía de 100%
 * e o health score do projeto despencava — sem ninguém ter mexido em
 * configuração de progresso.
 *
 * O padrão adotado é o mesmo de Jira (status category), Linear (state type),
 * Azure DevOps (state category) e Notion (status group): **nome livre**, para
 * a autonomia do time, + **categoria fixa**, para a integridade analítica.
 *
 * Bloqueio NÃO é categoria aqui. A literatura Kanban trata coluna de bloqueio
 * como anti-padrão (o item sai do fluxo, escapa do limite de WIP e distorce o
 * tempo por etapa); bloqueio é uma flag no item, tratada à parte.
 */

export type WorkflowCategory =
  | "backlog"
  | "a_iniciar"
  | "andamento"
  | "espera"
  | "revisao"
  | "concluida"
  | "cancelada";

/** Na ordem do fluxo — é a ordem em que aparecem no seletor. */
export const WORKFLOW_CATEGORIES: WorkflowCategory[] = [
  "backlog", "a_iniciar", "andamento", "espera", "revisao", "concluida", "cancelada",
];

export interface WorkflowCategoryMeta {
  label: string;
  /** Frase curta usada em menus e na legenda. */
  hint: string;
  /**
   * Peso no cálculo de andamento. Para backlog/a_iniciar (0) e concluida (100)
   * é o valor final. Para "andamento" é só FALLBACK: o percentual real é
   * posicional — j-ésima de K colunas de trabalho vale j/(K+1) de 100 (ver
   * lib/activityProgress) — e cai neste peso apenas quando a posição não é
   * determinável.
   *
   * `null` = fora da conta (não entra no numerador nem no denominador).
   */
  progressWeight: number | null;
  /** Classe Tailwind de fundo, alinhada ao ponto de estado do Cronograma. */
  dotClass: string;
}

export const WORKFLOW_CATEGORY_META: Record<WorkflowCategory, WorkflowCategoryMeta> = {
  backlog: {
    label: "Backlog",
    hint: "Existe, mas ainda não foi priorizado.",
    progressWeight: 0,
    dotClass: "bg-muted-foreground/50",
  },
  a_iniciar: {
    label: "A iniciar",
    hint: "Priorizado e pronto para começar.",
    progressWeight: 0,
    dotClass: "bg-muted-foreground/50",
  },
  andamento: {
    label: "Em andamento",
    hint: "Alguém está trabalhando nisso agora. Conta no limite de tarefas.",
    progressWeight: 25,
    dotClass: "bg-primary",
  },
  /**
   * Parado por terceiro — cliente, fornecedor, aprovação externa.
   *
   * NÃO é trabalho em curso: fica fora do limite de tarefas simultâneas e não
   * avança o percentual. Antes disto, espera virava "andamento" e inflava o WIP
   * com item que ninguém está tocando, além de estragar o tempo médio de etapa.
   * Nenhuma ferramenta de mercado conta espera como trabalho.
   */
  espera: {
    label: "Em espera",
    hint: "Parado por algo de fora — cliente, fornecedor, aprovação. Não conta no limite.",
    progressWeight: null,
    dotClass: "bg-warning",
  },
  /**
   * Trabalho feito, sendo conferido — QA, validação, aprovação interna.
   *
   * Conta como andamento (é trabalho, e ocupa o limite), mas se distingue nos
   * indicadores: sem a separação não dá para medir quanto tempo se gasta
   * conferindo. Azure DevOps chama isso de "Resolved".
   */
  revisao: {
    label: "Em revisão",
    hint: "Trabalho feito, sendo conferido — QA, validação, aprovação.",
    progressWeight: 25,
    dotClass: "bg-violet-500",
  },
  concluida: {
    label: "Concluída",
    hint: "Entregue. Só uma coluna do projeto pode ter esta categoria.",
    progressWeight: 100,
    dotClass: "bg-emerald-600",
  },
  cancelada: {
    label: "Cancelada",
    hint: "Encerrada sem entrega. Fica fora dos indicadores.",
    progressWeight: null,
    dotClass: "bg-muted-foreground/35",
  },
};

/**
 * Categorias que representam TRABALHO EM CURSO — as que formam o fluxo e
 * dividem o percentual entre si.
 *
 * "Em revisão" entra: conferir é trabalho, ocupa pessoa e ocupa o limite.
 * "Em espera" NÃO entra: o item está parado esperando alguém de fora, e contá-
 * lo como andamento inflaria o WIP e o tempo médio de etapa com item que
 * ninguém está tocando.
 */
export function ehTrabalhoEmCurso(c: WorkflowCategory): boolean {
  return c === "andamento" || c === "revisao";
}

/** Categorias que encerram a atividade — nenhuma delas conta como atraso. */
export function isClosingCategory(c: WorkflowCategory): boolean {
  return c === "concluida" || c === "cancelada";
}

/** `true` quando a categoria não deve entrar em indicadores de entrega. */
export function isExcludedFromMetrics(c: WorkflowCategory): boolean {
  return WORKFLOW_CATEGORY_META[c].progressWeight === null;
}

/** Aceita o valor vindo do banco e garante um membro válido do enum. */
export function parseWorkflowCategory(value: unknown): WorkflowCategory | null {
  return typeof value === "string" && (WORKFLOW_CATEGORIES as string[]).includes(value)
    ? (value as WorkflowCategory)
    : null;
}

/**
 * Deriva a categoria a partir das flags antigas — usado no backfill da
 * migration e como leitura de compatibilidade enquanto houver linhas sem
 * `categoria` preenchida.
 */
export function categoryFromLegacyFlags(stage: {
  title?: string | null;
  is_final?: boolean | null;
  is_blocked?: boolean | null;
  is_exception?: boolean | null;
  contributes_to_progress?: boolean | null;
  display_order?: number | null;
}): WorkflowCategory {
  if (stage.is_final) return "concluida";
  if (stage.display_order === 0) return "backlog";
  // Bloqueio/exceção eram colunas fora do fluxo; a atividade segue em curso,
  // então a categoria correta é "andamento" — o bloqueio vira flag no item.
  if (stage.is_blocked || stage.is_exception) return "andamento";
  if (stage.contributes_to_progress === false) return "a_iniciar";
  // Último critério: o nome. "A Fazer" e "Em Andamento" nunca se
  // distinguiram por nenhuma flag — sem isto, as duas cairiam em
  // "andamento" e o quadro exibiria quase tudo como em curso.
  return suggestCategoryFromTitle(stage.title || "");
}

/**
 * Sugestão de categoria a partir do nome, para PRÉ-SELECIONAR o campo ao criar
 * uma coluna. É só um atalho de digitação: o valor gravado é o que o usuário
 * confirmar, e renomear depois nunca altera a categoria.
 */
export function suggestCategoryFromTitle(title: string): WorkflowCategory {
  const n = (title || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (/\b(backlog|ideias?|capta(cao|do))\b/.test(n)) return "backlog";
  if (/\b(cancelad[oa]|descartad[oa]|arquivad[oa])\b/.test(n)) return "cancelada";
  if (/\b(concluid[oa]|final|finalizad[oa]|encerrad[oa]|entregue|feito|done)\b/.test(n)) return "concluida";
  if (/\b(a fazer|todo|to do|pendente|aguardando|fila|priorizad[oa])\b/.test(n)) return "a_iniciar";
  return "andamento";
}
