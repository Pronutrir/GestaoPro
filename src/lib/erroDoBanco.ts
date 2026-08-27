/**
 * O ERRO DO BANCO, DITO PARA GENTE.
 *
 * ============================================================================
 * O QUE CHEGAVA À TELA
 *
 *   "usuario 0eb3047e-... nao esta na equipe do projeto dcf977e9-... | P0001"
 *
 * Três coisas erradas numa frase só: dois UUIDs, um código do Postgres, e
 * nenhuma indicação do que fazer a seguir. Quem lê não sabe **quem** não está
 * na equipe, **qual** projeto é, nem qual é o passo seguinte.
 *
 * É a regra do CLAUDE.md, e ela vale aqui como em qualquer lugar:
 *
 *   *"Nunca escrever UUID ou enum em inglês em qualquer texto que um usuário
 *   lê. Resolver o rótulo na origem, não com um de-para no componente."*
 *
 * ============================================================================
 * POR QUE A TRADUÇÃO MORA AQUI, E NÃO NO TRIGGER
 *
 * O trigger poderia montar a frase bonita — ele tem os ids em mãos. Mas a
 * mensagem dele serve a mais de um público: o log do servidor, a API, o
 * próximo script de migração. Trocar `%` por nome resolveria a tela e pioraria
 * o log, onde o id é a informação útil.
 *
 * Então o banco continua dizendo o que aconteceu com precisão, e esta camada
 * traduz para quem está olhando. É o mesmo par de `activity_feed_events`: o
 * dado guarda o fato, a tela resolve o rótulo.
 *
 * ============================================================================
 * A VARREDURA — 77 LUGARES DA MESMA FAMÍLIA
 *
 * `description: error.message` aparece em **77 pontos** do código. Todos
 * despejam o que o banco disser, cru. Este módulo é o funil por onde eles
 * passam a falar.
 *
 * Não converti os 77 num commit: seria uma mudança mecânica gigante com risco
 * de esconder erro legítimo. O funil existe, os pontos que importam foram
 * ligados, e o restante migra quando for tocado.
 * ============================================================================
 */

/** O que a tela precisa para nomear as coisas em vez de mostrar id. */
export interface DicionarioDeNomes {
  /** id → nome da pessoa. */
  pessoas?: Record<string, string>;
  /** id → nome do projeto. */
  projetos?: Record<string, string>;
  /** id → título da atividade. */
  atividades?: Record<string, string>;
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** `P0001`, `23503`, `42703` — códigos do Postgres/PostgREST. */
const CODIGO = /\s*[|(]?\s*\b(P\d{4}|\d{5}|PGRST\d{3})\b\s*[)|]?\s*/g;

/** Um id qualquer virou nome? Devolve o nome, ou um rótulo curto e honesto. */
function nomear(id: string, d: DicionarioDeNomes): string | null {
  return d.pessoas?.[id] ?? d.projetos?.[id] ?? d.atividades?.[id] ?? null;
}

/**
 * As traduções conhecidas.
 *
 * Cada uma reconhece a mensagem do banco e devolve a frase de gente — com o
 * que fazer a seguir, que é a parte que falta em toda mensagem de erro ruim.
 */
const TRADUCOES: {
  reconhece: RegExp;
  traduz: (m: RegExpMatchArray, d: DicionarioDeNomes) => { titulo: string; detalhe?: string };
}[] = [
  {
    // "usuario <uuid> nao esta na equipe do projeto <uuid> -- adicione a equipe"
    reconhece: /usuario\s+([0-9a-f-]{36})\s+nao esta na equipe do projeto\s+([0-9a-f-]{36})/i,
    traduz: (m, d) => {
      const pessoa = d.pessoas?.[m[1]] ?? "Essa pessoa";
      const projeto = d.projetos?.[m[2]];
      return {
        titulo: `${pessoa} não está na equipe ${projeto ? `de "${projeto}"` : "deste projeto"}.`,
        // O passo seguinte, que é o que falta em toda mensagem de erro ruim.
        detalhe: "Inclua na equipe para poder atribuir.",
      };
    },
  },
  {
    reconhece: /Atividade pai \(([0-9a-f-]{36})\) n[ãa]o encontrada/i,
    traduz: (m, d) => ({
      titulo: d.atividades?.[m[1]]
        ? `A atividade "${d.atividades[m[1]]}" não existe mais.`
        : "A atividade de destino não existe mais.",
      detalhe: "Ela pode ter sido excluída por outra pessoa. Atualize a tela.",
    }),
  },
  {
    reconhece: /Um marco n[ãa]o pode conter subitens/i,
    traduz: () => ({
      titulo: "Marco não agrupa.",
      detalhe: "Ele é um ponto no tempo. Crie o item ao lado, dentro da mesma fase.",
    }),
  },
  {
    reconhece: /Esta atividade tem subitens e n[ãa]o pode ser marcada como marco/i,
    traduz: () => ({
      titulo: "Esta atividade tem subitens.",
      detalhe: "Marco não agrupa — mova ou exclua os subitens antes de convertê-la.",
    }),
  },
  {
    reconhece: /marco e um ponto no tempo: nao agrupa|Marco n[ãa]o agrupa/i,
    traduz: () => ({
      titulo: "Marco não agrupa.",
      detalhe: "Escolha uma fase, entrega ou atividade como destino.",
    }),
  },
  {
    reconhece: /Aninhamento EAP inv[áa]lido/i,
    traduz: () => ({
      titulo: "Esse destino não pode conter subitens.",
      detalhe: "Escolha uma fase, entrega ou atividade.",
    }),
  },
  {
    reconhece: /A atividade pai pertence a outro projeto/i,
    traduz: () => ({
      titulo: "Essa atividade é de outro projeto.",
      detalhe: "Só é possível mover dentro do mesmo projeto.",
    }),
  },
  {
    reconhece: /criaria um ciclo na hierarquia|n[ãa]o pode ser pai de si mesma/i,
    traduz: () => ({
      titulo: "Esse destino está dentro do item que você move.",
      detalhe: "Os dois sumiriam da EAP. Escolha um destino fora dele.",
    }),
  },
  {
    reconhece: /RACI inv[áa]lido.*Accountable/i,
    traduz: () => ({
      titulo: "Só pode haver um Aprovador (A) por atividade.",
      detalhe: "Troque o atual antes de indicar outro.",
    }),
  },
  {
    reconhece: /sem permissao para incluir na equipe/i,
    traduz: () => ({
      titulo: "Você não pode incluir pessoas na equipe deste projeto.",
      detalhe: "Peça a quem gerencia o projeto.",
    }),
  },
  {
    // RLS recusando: a mensagem do Postgres é técnica e não ajuda ninguém.
    reconhece: /violates row-level security|new row violates/i,
    traduz: () => ({
      titulo: "Você não tem permissão para essa alteração.",
      detalhe: "Fale com quem gerencia o projeto se precisar do acesso.",
    }),
  },
  {
    reconhece: /duplicate key value|already exists/i,
    traduz: () => ({
      titulo: "Isso já existe.",
      detalhe: "Atualize a tela — outra pessoa pode ter criado agora.",
    }),
  },
];

/**
 * Traduz o erro do banco para uma frase de gente.
 *
 * Quando não reconhece a mensagem, ela é **limpa**, não escondida: tira UUIDs e
 * códigos e devolve o resto. Esconder o erro desconhecido produziria "algo deu
 * errado", que é pior — não dá para agir nem para relatar.
 */
export function traduzirErroDoBanco(
  erro: unknown,
  nomes: DicionarioDeNomes = {},
): { titulo: string; detalhe?: string } {
  const bruto =
    typeof erro === "string" ? erro
    : erro instanceof Error ? erro.message
    : typeof (erro as { message?: unknown })?.message === "string"
      ? String((erro as { message: string }).message)
      : "";

  if (!bruto.trim()) {
    return { titulo: "Não foi possível concluir a operação." };
  }

  for (const t of TRADUCOES) {
    const m = bruto.match(t.reconhece);
    if (m) return t.traduz(m, nomes);
  }

  /**
   * DESCONHECIDO: limpa em vez de esconder.
   *
   * O UUID vira o nome quando o dicionário conhece; senão sai da frase — ele
   * não ajuda quem lê, e atrapalha quem relata. O código do Postgres sai
   * sempre: `P0001` não significa nada fora do banco.
   */
  const limpo = bruto
    .replace(UUID, (id) => nomear(id, nomes) ?? "")
    .replace(CODIGO, " ")
    .replace(/\s*--\s*/g, " — ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();

  return { titulo: limpo || "Não foi possível concluir a operação." };
}

/** Atalho para o `toast`: uma linha só, já traduzida. */
export function mensagemDeErro(erro: unknown, nomes?: DicionarioDeNomes): string {
  const { titulo, detalhe } = traduzirErroDoBanco(erro, nomes);
  return detalhe ? `${titulo} ${detalhe}` : titulo;
}
