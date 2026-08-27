/**
 * TEXTO RICO DA DESCRIÇÃO — lista de conferência, link e @menção.
 *
 * ============================================================================
 * POR QUE MARCAÇÃO EM TEXTO, E NÃO UM EDITOR
 *
 * O desenho pede *"lista de conferência, link e @menção"*. A resposta óbvia
 * seria um editor rico (Tiptap, Slate), e ela é errada aqui por três motivos
 * concretos:
 *
 *   1. `description` é `text` e já tem conteúdo escrito por gente. Um editor
 *      gravaria HTML ou JSON, e as descrições antigas virariam texto cru dentro
 *      da nova estrutura — ou pior, seriam reescritas na primeira abertura.
 *   2. O mesmo texto aparece no Backlog, no cartão do Kanban e na exportação.
 *      Três lugares teriam de aprender a renderizar a estrutura nova.
 *   3. Editor rico é uma dependência grande para resolver três marcações.
 *
 * Então a descrição continua **texto puro**, e o que muda é a LEITURA: três
 * padrões reconhecidos na hora de exibir. Quem editar vê o texto como digitou;
 * quem ler vê a caixa, o link e a menção.
 *
 * O custo, declarado: a marcação é visível na edição (`[ ]`, `@nome`). É o
 * mesmo trato do Markdown, e é o que mantém o dado legível fora daqui.
 *
 * ============================================================================
 * OS TRÊS PADRÕES
 *
 *   [ ] tarefa       lista de conferência, aberta
 *   [x] tarefa       lista de conferência, feita
 *   https://…        link
 *   @nome            menção
 * ============================================================================
 */

export type PedacoDeTexto =
  | { tipo: "texto"; valor: string }
  | { tipo: "link"; valor: string }
  | { tipo: "mencao"; valor: string };

export interface LinhaDoTexto {
  /** `null` quando a linha não é item de lista. */
  conferencia: { feito: boolean } | null;
  pedacos: PedacoDeTexto[];
}

/** `[ ]` ou `[x]` no início da linha, com espaço depois. */
const ITEM = /^\s*\[([ xX])\]\s+(.*)$/;

/**
 * Links e menções dentro de uma linha.
 *
 * O link para no primeiro caractere que quase nunca faz parte de URL mas
 * costuma encostar nela — vírgula, ponto final, parêntese de fechamento. Sem
 * isso, "veja https://exemplo.com." levaria o ponto junto e o link quebraria.
 */
const ACHADOS = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])|(@[\p{L}][\p{L}\p{N}._-]*)/gu;

export function lerTextoRico(bruto: string | null | undefined): LinhaDoTexto[] {
  const texto = String(bruto ?? "");
  if (!texto.trim()) return [];

  return texto.split(/\r?\n/).map((linha) => {
    const m = linha.match(ITEM);
    const conferencia = m ? { feito: m[1].toLowerCase() === "x" } : null;
    const corpo = m ? m[2] : linha;

    const pedacos: PedacoDeTexto[] = [];
    let ultimo = 0;
    for (const achado of corpo.matchAll(ACHADOS)) {
      const i = achado.index ?? 0;
      if (i > ultimo) pedacos.push({ tipo: "texto", valor: corpo.slice(ultimo, i) });
      pedacos.push(
        achado[1]
          ? { tipo: "link", valor: achado[1] }
          : { tipo: "mencao", valor: achado[2].slice(1) },
      );
      ultimo = i + achado[0].length;
    }
    if (ultimo < corpo.length) pedacos.push({ tipo: "texto", valor: corpo.slice(ultimo) });
    // Linha vazia vira um pedaço vazio, para o parágrafo em branco sobreviver.
    if (pedacos.length === 0) pedacos.push({ tipo: "texto", valor: corpo });

    return { conferencia, pedacos };
  });
}

/**
 * Quantos itens da lista já foram feitos.
 *
 * Devolve `null` quando não há lista — e isso é diferente de `0 de 0`. O vazio
 * precisa dizer "não há lista", não "nada foi feito".
 */
export function progressoDaConferencia(
  linhas: LinhaDoTexto[],
): { feitos: number; total: number } | null {
  const itens = linhas.filter((l) => l.conferencia !== null);
  if (itens.length === 0) return null;
  return { feitos: itens.filter((l) => l.conferencia!.feito).length, total: itens.length };
}

/**
 * Marca ou desmarca o item N, devolvendo o texto novo.
 *
 * Trabalha sobre o TEXTO ORIGINAL, não sobre o que foi lido: reconstruir a
 * partir da estrutura perderia espaçamento e qualquer coisa que o leitor não
 * tenha entendido. Clicar numa caixa não pode reescrever o resto da descrição.
 */
export function alternarItem(bruto: string, indice: number): string {
  const linhas = String(bruto ?? "").split(/\r?\n/);
  let n = -1;
  return linhas
    .map((linha) => {
      const m = linha.match(ITEM);
      if (!m) return linha;
      n++;
      if (n !== indice) return linha;
      const marca = m[1].toLowerCase() === "x" ? " " : "x";
      return linha.replace(/\[([ xX])\]/, `[${marca}]`);
    })
    .join("\n");
}
