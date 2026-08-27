/**
 * HOMÔNIMOS — a marcação, como regra testável.
 *
 * ============================================================================
 * A DECISÃO: MARCAR, NÃO UNIFICAR
 *
 * Existem dois perfis ATIVOS chamados "Williame Correia de Lima", e os dois
 * trabalham. Fundir seria escolher por eles; desativar um tiraria alguém do ar.
 * A decisão foi manter os dois e **dizer que são dois**, onde o sistema mostra
 * ou oferece pessoas.
 *
 * Isto vive em `lib/` e não dentro do componente porque a regra é a mesma em
 * quatro telas — seletor de responsável, participantes, equipe, filtros — e
 * porque só assim dá para testá-la sem um navegador.
 * ============================================================================
 */

const norm = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Os nomes que se repetem NA LISTA RECEBIDA.
 *
 * O recorte é a lista, não um catálogo global: é entre estas pessoas que
 * alguém vai escolher, e avisar sobre uma ambiguidade que a pessoa não está
 * vendo é ruído.
 */
export function nomesRepetidos(pessoas: Array<{ full_name?: string | null }>): Set<string> {
  const contagem = new Map<string, number>();
  for (const p of pessoas) {
    const n = norm(p.full_name);
    if (!n) continue;
    contagem.set(n, (contagem.get(n) ?? 0) + 1);
  }
  const repetidos = new Set<string>();
  for (const [nome, quantos] of contagem) if (quantos > 1) repetidos.add(nome);
  return repetidos;
}

/** O nome desta pessoa pertence a mais de uma da lista? */
export function ehHomonimo(
  pessoa: { full_name?: string | null },
  repetidos: Set<string>,
): boolean {
  const n = norm(pessoa.full_name);
  return n.length > 0 && repetidos.has(n);
}

/**
 * O que distingue esta pessoa das homônimas.
 *
 * **E-mail primeiro**, e não é preferência: os dois "Williame Correia de Lima"
 * são do MESMO setor (TI), então setor não separa nada — e cargo ("Analista de
 * sistemas" × "Desenvolvedor") separa, mas ninguém decora o cargo do colega.
 * O e-mail é o que a própria pessoa reconhece como seu.
 *
 * `null` quando não há nada que diferencie: melhor não mostrar rótulo nenhum
 * do que mostrar um que se repete nos dois.
 */
export function diferenciador(pessoa: {
  email?: string | null;
  role_title?: string | null;
  sector?: string | null;
}): string | null {
  if (pessoa.email && pessoa.email.trim()) return pessoa.email.trim();
  const partes = [pessoa.role_title, pessoa.sector]
    .filter((x): x is string => !!x && !!x.trim())
    .map((x) => x.trim());
  return partes.length ? partes.join(" · ") : null;
}

/** O texto do aviso — um só, no topo da lista, nunca repetido por linha. */
export const AVISO_HOMONIMO =
  "Há pessoas com o mesmo nome nesta lista. Confira o e-mail antes de escolher.";

/** O selo curto que acompanha o nome. */
export function seloDeHomonimo(quantos: number): string {
  return `${quantos} perfis`;
}
