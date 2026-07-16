import type { RoadmapItem } from "@/components/roadmap/types";

/**
 * Modelo de priorização por 5 critérios objetivos (escala 1-5 cada).
 * O índice de prioridade é a soma normalizada em % (soma / 25 * 100) e é
 * calculado pelo banco na coluna gerada `score`. As funções abaixo replicam o
 * cálculo no cliente para preview em tempo real.
 */

export type CriterioKey =
  | "alinhamento_estrategico"
  | "valor_economico"
  | "impacto_paciente"
  | "urgencia_risco"
  | "facilidade_desenvolvimento";

export interface Criterio {
  key: CriterioKey;
  label: string;
  /** Rótulo curto, para tabelas e gráficos. */
  short: string;
  description: string;
  /** Rótulo de cada nota, de 1 a 5. */
  options: [string, string, string, string, string];
}

export const CRITERIOS: Criterio[] = [
  {
    key: "alinhamento_estrategico",
    label: "Alinhamento Estratégico",
    short: "Alinhamento",
    description: "Grau de aderência aos objetivos estratégicos da empresa.",
    options: [
      "Não alinhado",
      "Baixo alinhamento",
      "Médio alinhamento",
      "Alto alinhamento",
      "Crítico para a estratégia",
    ],
  },
  {
    key: "valor_economico",
    label: "Valor Econômico",
    short: "Valor",
    description: "Impacto em receita ou redução de custos.",
    options: [
      "Sem impacto financeiro",
      "Baixo impacto",
      "Impacto moderado",
      "Alto impacto",
      "Muito alto impacto",
    ],
  },
  {
    key: "impacto_paciente",
    label: "Impacto no Paciente",
    short: "Paciente",
    description: "Experiência do cliente / paciente.",
    options: [
      "Impacto mínimo",
      "Baixo impacto",
      "Médio impacto",
      "Alto impacto",
      "Impacto muito alto / crítico",
    ],
  },
  {
    key: "urgencia_risco",
    label: "Urgência e Risco",
    short: "Urgência",
    description:
      "Considera conjuntamente a existência de prazo regulatório ou contratual e o risco operacional, de segurança ou compliance caso a demanda não seja atendida.",
    options: [
      "Sem prazo e risco baixo",
      "Prazo flexível e risco baixo-moderado",
      "Prazo trimestral ou risco moderado",
      "Prazo próximo e/ou risco alto",
      "Prazo fixo imediato e/ou risco crítico",
    ],
  },
  {
    key: "facilidade_desenvolvimento",
    label: "Facilidade em Desenvolvimento",
    short: "Facilidade",
    description: "Esforço técnico e impacto econômico da entrega.",
    options: [
      "Muito difícil / alto custo",
      "Difícil",
      "Moderado",
      "Fácil",
      "Muito fácil / baixo custo",
    ],
  },
];

export const NOTA_MAX = 5;
export const PONTUACAO_MAXIMA = CRITERIOS.length * NOTA_MAX; // 25

/** Soma bruta dos critérios (0-25). */
export function pontuacaoTotal(valores: Record<CriterioKey, number>): number {
  return CRITERIOS.reduce((sum, c) => sum + (valores[c.key] || 0), 0);
}

/** Índice de prioridade em % (0-100) — mesmo cálculo da coluna gerada no banco. */
export function indicePrioridade(valores: Record<CriterioKey, number>): number {
  return Math.round((pontuacaoTotal(valores) * 100) / PONTUACAO_MAXIMA);
}

export type Faixa = "alta" | "media" | "baixa";

export interface Classificacao {
  faixa: Faixa;
  label: string;
  /** Classes Tailwind para o "pill" de prioridade. */
  className: string;
  /** Cor sólida (para barras de progresso). */
  color: string;
}

/** Faixas: Alta >= 70%, Média >= 40%, Baixa < 40%. */
export function classificar(pct: number): Classificacao {
  if (pct >= 70) {
    return {
      faixa: "alta",
      label: "Alta",
      className:
        "bg-destructive/10 text-destructive border-destructive/30",
      color: "hsl(var(--destructive))",
    };
  }
  if (pct >= 40) {
    return {
      faixa: "media",
      label: "Média",
      className:
        "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
      color: "hsl(var(--warning))",
    };
  }
  return {
    faixa: "baixa",
    label: "Baixa",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700",
    color: "hsl(var(--success))",
  };
}

/** Rótulos e cores de tema/status, compartilhados pelos componentes do Roadmap. */
export const themeLabels: Record<string, string> = {
  produto: "Produto",
  mercado: "Mercado",
  operacoes: "Operações",
};

export const statusLabels: Record<string, string> = {
  backlog: "Backlog",
  em_analise: "Em Análise",
  aprovado: "Aprovado",
  descartado: "Arquivado",
  em_execucao: "Em Execução",
};

export const statusColors: Record<string, string> = {
  backlog: "bg-muted text-muted-foreground",
  em_analise:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  aprovado:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  descartado: "bg-destructive/10 text-destructive",
  em_execucao: "bg-primary/10 text-primary",
};

/**
 * Estágios do fluxo de triagem, na ordem em que a solicitação avança.
 * `next` é o estágio para onde o botão de ação da linha move o item;
 * `prev` permite devolver a demanda ao estágio anterior.
 */
export const ESTAGIOS = [
  {
    value: "backlog",
    label: "Backlog",
    next: "em_analise",
    nextLabel: "Analisar",
    prev: null,
    prevLabel: null,
  },
  {
    value: "em_analise",
    label: "Em Análise",
    next: "aprovado",
    nextLabel: "Aprovar",
    prev: "backlog",
    prevLabel: "Devolver ao Backlog",
  },
  {
    value: "aprovado",
    label: "Aprovado",
    next: null,
    nextLabel: null,
    prev: "em_analise",
    prevLabel: "Voltar para Em Análise",
  },
] as const;

/** Nota usada como ponto de partida quando o item ainda não foi classificado. */
export const NOTA_INICIAL = 3;

/**
 * Extrai os critérios de um item. Itens ainda não classificados têm notas nulas
 * no banco; aqui caem para a nota inicial apenas para o formulário de
 * classificação ter um ponto de partida — use `item.classificado_em` para saber
 * se a avaliação de fato existe.
 */
export function criteriosDoItem(item: RoadmapItem): Record<CriterioKey, number> {
  return {
    alinhamento_estrategico: item.alinhamento_estrategico ?? NOTA_INICIAL,
    valor_economico: item.valor_economico ?? NOTA_INICIAL,
    impacto_paciente: item.impacto_paciente ?? NOTA_INICIAL,
    urgencia_risco: item.urgencia_risco ?? NOTA_INICIAL,
    facilidade_desenvolvimento: item.facilidade_desenvolvimento ?? NOTA_INICIAL,
  };
}
