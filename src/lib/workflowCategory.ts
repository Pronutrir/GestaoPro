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
  | "concluida"
  | "cancelada";

export const WORKFLOW_CATEGORIES: WorkflowCategory[] = [
  "backlog", "a_iniciar", "andamento", "concluida", "cancelada",
];

export interface WorkflowCategoryMeta {
  label: string;
  /** Frase curta usada em menus e na legenda. */
  hint: string;
  /**
   * Peso no cálculo de andamento. É constante do sistema, não campo por
   * projeto: percentual por coluna é subjetivo e impede comparar projetos —
   * razão pela qual nenhuma ferramenta de referência o usa. O crédito parcial
   * de 25% em "andamento" segue o modelo do Linear.
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
    hint: "Trabalho em curso. Conta no limite de WIP.",
    progressWeight: 25,
    dotClass: "bg-primary",
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
