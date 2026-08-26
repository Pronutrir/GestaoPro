/**
 * O AGREGADO DO PAI — fonte única de leitura.
 *
 * ============================================================================
 * POR QUE NENHUMA TELA PODE CALCULAR ISTO
 *
 * O inventário de 25/08/2026 achou **21 pontos de rollup, 19 deles no
 * cliente**, e três fórmulas de progresso diferentes vivas ao mesmo tempo —
 * com profundidades diferentes (uma somava um nível, outra a subárvore). Um
 * pai com netos mostrava dois números discordantes no mesmo card.
 *
 * Pior: dois desses pontos **gravavam** o resultado no banco, a partir de uma
 * lista que passa pela RLS. Quem enxergava 1 de 8 filhas persistia o total
 * daquela única filha (corrigido em 26/08, commit `5e05895`).
 *
 * A causa raiz não é aritmética — é de dados: **o cliente nunca tem a árvore
 * inteira**, só a fatia que a RLS deixou passar. Qualquer soma feita aqui está
 * certa por acidente, e só para quem enxerga tudo.
 *
 * Por isso a derivação roda no banco (migration `20260826130000`), como
 * trigger `SECURITY DEFINER` sobre todas as filhas. Este módulo apenas **lê** o
 * que o servidor derivou, com fallback para o valor próprio quando é folha.
 * ============================================================================
 *
 * MARCO (decisão de 26/08/2026):
 *   - fora de horas, custo e progresso — **peso zero**;
 *   - dentro da janela de datas: a fase vai até o marco.
 */

/** O que o servidor derivou, mais o valor próprio do item. */
export interface ItemComAgregado {
  hours?: number | string | null;
  cost?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  is_milestone?: boolean | null;
  derived_hours?: number | string | null;
  derived_cost?: number | string | null;
  derived_start?: string | null;
  derived_end?: string | null;
  derived_progress?: number | string | null;
  derived_children?: number | null;
}

export interface AgregadoDoPai {
  /** horas planejadas — soma das filhas, ou o valor próprio se é folha. */
  horas: number;
  /** custo — mesma regra. */
  custo: number;
  /** início previsto: o mais cedo entre as filhas (marco incluído). */
  inicio: string | null;
  /** término previsto: o mais tarde entre as filhas (marco incluído). */
  fim: string | null;
  /** 0 a 100, ponderado por horas. Marco não pesa. */
  progresso: number;
  /** filhas diretas vivas. 0 = é folha. */
  filhas: number;
  /** true quando os valores vêm da derivação do servidor. */
  derivado: boolean;
}

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/**
 * O agregado de UM item, para exibir.
 *
 * Não recebe as filhas de propósito: se recebesse, alguém acabaria somando —
 * e some-se a fatia, não a árvore. Tudo que esta função precisa já veio do
 * servidor nas colunas `derived_*`.
 */
export function agregadoDoPai(item: ItemComAgregado | null | undefined): AgregadoDoPai {
  const vazio: AgregadoDoPai = {
    horas: 0, custo: 0, inicio: null, fim: null,
    progresso: 0, filhas: 0, derivado: false,
  };
  if (!item) return vazio;

  const filhas = item.derived_children ?? 0;
  const derivado = filhas > 0;

  if (!derivado) {
    // Folha: o valor é o dela. Marco não tem esforço — a trigger
    // `trg_marco_sem_esforco` recusa gravação, mas dado antigo pode ter.
    const ehMarco = !!item.is_milestone;
    return {
      horas: ehMarco ? 0 : num(item.hours),
      custo: ehMarco ? 0 : num(item.cost),
      inicio: item.start_date ?? null,
      fim: item.end_date ?? null,
      progresso: item.status === "completed" ? 100 : 0,
      filhas: 0,
      derivado: false,
    };
  }

  return {
    horas: num(item.derived_hours),
    custo: num(item.derived_cost),
    inicio: item.derived_start ?? item.start_date ?? null,
    fim: item.derived_end ?? item.end_date ?? null,
    progresso: item.status === "completed" ? 100 : num(item.derived_progress),
    filhas,
    derivado: true,
  };
}

/**
 * Soma de um CONJUNTO de itens irmãos — para subtotal de grupo e total de
 * projeto (fase 06).
 *
 * Some `derived_*` quando existe, senão o valor próprio. Nunca desce na
 * árvore: descer aqui seria contar neto duas vezes, já que o derivado do pai
 * **já** inclui a subárvore.
 */
export function somarIrmaos(itens: ItemComAgregado[]): { horas: number; custo: number } {
  let horas = 0;
  let custo = 0;
  for (const i of itens) {
    const a = agregadoDoPai(i);
    horas += a.horas;
    custo += a.custo;
  }
  return { horas, custo };
}

/**
 * A janela de datas de um conjunto — min(início) e max(fim).
 *
 * Compara como TEXTO `YYYY-MM-DD`, sem construir `Date`: colunas `date` não
 * podem passar por `new Date()` (o fuso desloca o dia, e o bug só aparece para
 * quem está a oeste de UTC). Ver `lib/dataLocal`.
 */
export function janelaDeDatas(itens: ItemComAgregado[]): { inicio: string | null; fim: string | null } {
  let inicio: string | null = null;
  let fim: string | null = null;
  for (const i of itens) {
    const a = agregadoDoPai(i);
    if (a.inicio && (!inicio || a.inicio < inicio)) inicio = a.inicio;
    if (a.fim && (!fim || a.fim > fim)) fim = a.fim;
  }
  return { inicio, fim };
}
