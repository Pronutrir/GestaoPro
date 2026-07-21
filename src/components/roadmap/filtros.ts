import { classificar } from "@/components/roadmap/criterios";
import { TIPOS_NECESSIDADE } from "@/components/roadmap/solicitacaoLabels";
import type { RoadmapItem } from "@/components/roadmap/types";
import type { Faixa, Periodo } from "@/components/roadmap/ColumnFilter";

export type FiltrosRoadmap = {
  tipo: string[];
  solicitante: string[];
  area: string[];
  custoAtual: Faixa;
  custoDev: Faixa;
  prazo: Periodo;
  prioridade: string[];
};

export const FILTROS_VAZIOS: FiltrosRoadmap = {
  tipo: [],
  solicitante: [],
  area: [],
  custoAtual: { min: "", max: "" },
  custoDev: { min: "", max: "" },
  prazo: { de: "", ate: "" },
  prioridade: [],
};

/** Rótulo do tipo de necessidade, resolvendo o caso "outro". */
export const rotuloTipo = (item: RoadmapItem) =>
  item.tipo_necessidade === "outro"
    ? item.tipo_necessidade_outro
    : item.tipo_necessidade
      ? TIPOS_NECESSIDADE[item.tipo_necessidade] ?? item.tipo_necessidade
      : null;

/**
 * Faixa de prioridade do item. Itens sem avaliação ficam em "A priorizar" —
 * uma categoria própria, não "Baixa": ninguém julgou que são de baixa
 * prioridade, apenas ainda não foram avaliados.
 */
export const rotuloPrioridade = (item: RoadmapItem) =>
  item.score == null || !item.classificado_em
    ? "A priorizar"
    : classificar(Math.round(item.score)).label;

/**
 * Faixa percentual de cada classificação, para o filtro deixar explícito o
 * que "Alta" ou "Média" significam em número (os cortes vivem em
 * classificar(): 70+ alta, 40+ média).
 */
export const FAIXA_PRIORIDADE: Record<string, string> = {
  Alta: "70 – 100%",
  Média: "40 – 69%",
  Baixa: "0 – 39%",
  "A priorizar": "sem avaliação",
};

/** Valores distintos de uma coluna, para preencher as opções do filtro. */
export function opcoesDe(
  items: RoadmapItem[],
  extrair: (i: RoadmapItem) => string | null | undefined,
): string[] {
  const vistos = new Set<string>();
  for (const i of items) {
    const v = extrair(i);
    if (v) vistos.add(v);
  }
  return Array.from(vistos).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const dentroDaFaixa = (valor: number | null | undefined, f: Faixa) => {
  if (!f.min && !f.max) return true;
  // Sem valor não há como afirmar que está na faixa — some quando há filtro.
  if (valor == null) return false;
  if (f.min && valor < Number(f.min)) return false;
  if (f.max && valor > Number(f.max)) return false;
  return true;
};

const dentroDoPeriodo = (iso: string | null | undefined, p: Periodo) => {
  if (!p.de && !p.ate) return true;
  if (!iso) return false;
  // Comparação lexicográfica funciona para o formato ISO (AAAA-MM-DD).
  if (p.de && iso < p.de) return false;
  if (p.ate && iso > p.ate) return false;
  return true;
};

/** Aplica todos os filtros; critérios vazios não restringem nada. */
export function aplicarFiltros(
  items: RoadmapItem[],
  f: FiltrosRoadmap,
): RoadmapItem[] {
  return items.filter((i) => {
    if (f.tipo.length) {
      const t = rotuloTipo(i);
      if (!t || !f.tipo.includes(t)) return false;
    }
    if (f.solicitante.length) {
      if (!i.solicitante_nome || !f.solicitante.includes(i.solicitante_nome))
        return false;
    }
    if (f.area.length) {
      if (!i.area || !f.area.includes(i.area)) return false;
    }
    if (!dentroDaFaixa(i.custo_atual, f.custoAtual)) return false;
    if (!dentroDaFaixa(i.custo_desenvolvimento, f.custoDev)) return false;
    if (!dentroDoPeriodo(i.data_necessaria, f.prazo)) return false;
    if (f.prioridade.length && !f.prioridade.includes(rotuloPrioridade(i)))
      return false;
    return true;
  });
}

// ── Ordenação ─────────────────────────────────────────────────────────────

export type ColunaOrdenavel =
  | "tipo"
  | "solicitante"
  | "area"
  | "custoAtual"
  | "custoDev"
  | "prazo"
  | "prioridade";

export type Ordenacao = { coluna: ColunaOrdenavel; asc: boolean } | null;

/**
 * Valor de comparação de cada coluna. Texto compara com localeCompare (para
 * acentos ordenarem certo em pt-BR); número e data comparam numericamente.
 */
const valorDe = (i: RoadmapItem, c: ColunaOrdenavel): string | number | null => {
  switch (c) {
    case "tipo":
      return rotuloTipo(i);
    case "solicitante":
      return i.solicitante_nome ?? null;
    case "area":
      return i.area ?? null;
    case "custoAtual":
      return i.custo_atual ?? null;
    case "custoDev":
      return i.custo_desenvolvimento ?? null;
    case "prazo": {
      if (!i.data_necessaria) return null;
      const t = new Date(`${i.data_necessaria}T00:00:00`).getTime();
      // Data inválida (o banco aceita ano de 5 dígitos) ordena como ausente.
      return Number.isNaN(t) ? null : t;
    }
    case "prioridade":
      // Sem avaliação não é score 0 — vai para o fim, como no padrão da query.
      return i.score == null || !i.classificado_em ? null : i.score;
  }
};

/**
 * Ordena sem alterar o array recebido. Itens sem valor ficam sempre no fim,
 * independentemente da direção: "sem custo informado" não é menor nem maior
 * que qualquer custo, e mantê-los no fim preserva a leitura da lista.
 */
export function aplicarOrdenacao(
  items: RoadmapItem[],
  ord: Ordenacao,
): RoadmapItem[] {
  if (!ord) return items;
  const dir = ord.asc ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = valorDe(a, ord.coluna);
    const vb = valorDe(b, ord.coluna);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" && typeof vb === "string")
      return va.localeCompare(vb, "pt-BR") * dir;
    return ((va as number) - (vb as number)) * dir;
  });
}

/** Quantos filtros estão ativos — para o indicador de "limpar". */
export function contarAtivos(f: FiltrosRoadmap): number {
  return (
    f.tipo.length +
    f.solicitante.length +
    f.area.length +
    f.prioridade.length +
    (f.custoAtual.min || f.custoAtual.max ? 1 : 0) +
    (f.custoDev.min || f.custoDev.max ? 1 : 0) +
    (f.prazo.de || f.prazo.ate ? 1 : 0)
  );
}
