/**
 * QUEM TRABALHA NA ATIVIDADE — a leitura, com identificador.
 *
 * ============================================================================
 * POR QUE ESTA CAMADA EXISTE
 *
 * `activities.assigned_to` e `activities.participants` guardam **nome, em
 * texto livre**. São 284 leituras espalhadas pelo front, e todas fazem a mesma
 * coisa: pegam o texto e tentam adivinhar de quem é.
 *
 * Adivinhar falha de um jeito específico e medido: existem **dois perfis
 * ativos** chamados "Williame Correia de Lima", e **450 atividades** com esse
 * nome em `assigned_to`. Nenhuma heurística de string separa duas pessoas com
 * o mesmo nome — a informação simplesmente não está lá.
 *
 * `activity_assignees` tem `user_id` com FK de verdade. Esta camada lê de lá
 * quando pode, e cai no texto quando a tabela ainda não respondeu.
 *
 * ============================================================================
 * O FALLBACK É EXPLÍCITO, E DIZ QUE É FALLBACK
 *
 * Enquanto a migration `20260826160000` não estiver aplicada, a tabela é um
 * retrato do backfill e envelhece. Por isso `origem` acompanha cada resposta:
 *
 *   "tabela" — veio de `activity_assignees`, por `user_id`. Confiável.
 *   "texto"  — veio de `assigned_to`/`participants`. Pode ser homônimo.
 *   "ausente"— não há responsável.
 *
 * Quem exibe pode decidir o que fazer com `origem`; quem decide **permissão**
 * não pode usar "texto" para nome ambíguo — e não usa: a RLS e
 * `lib/identityMatch` já recusam (migration `20260826180000`).
 * ============================================================================
 */

export type OrigemDoResponsavel = "tabela" | "texto" | "ausente";

export interface PessoaDaAtividade {
  /** `user_id` quando a fonte é a tabela; `null` quando veio do texto. */
  id: string | null;
  /** O nome a exibir. Nunca UUID — ver `nomeParaExibir`. */
  nome: string;
  origem: OrigemDoResponsavel;
  /** true quando o nome pertence a mais de um perfil e a fonte é texto. */
  ambiguo: boolean;
}

/** Uma linha de `activity_assignees`, como o PostgREST devolve. */
export interface LinhaDeAtribuicao {
  activity_id: string;
  user_id: string;
  papel: "responsavel" | "participante";
}

export interface PerfilMinimo {
  id: string;
  full_name?: string | null;
  email?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizar = (v: string | null | undefined): string =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * O nome a exibir a partir do texto livre.
 *
 * **Nunca devolve UUID.** `assigned_to` guarda uuid em parte da base, e um
 * identificador na tela é ruído que ninguém sabe ler — a regra do projeto é
 * resolver o rótulo na origem, não com um de-para no componente.
 */
export function nomeParaExibir(
  texto: string | null | undefined,
  perfis: Map<string, PerfilMinimo>,
): string | null {
  const raw = (texto ?? "").trim();
  if (!raw) return null;

  const porId = perfis.get(raw);
  if (porId) return porId.full_name || porId.email || null;

  // Parece uuid e não achamos o perfil: some, não vira texto na tela.
  if (UUID.test(raw)) return null;

  return raw;
}

/** Índice `nome normalizado -> perfis`, para detectar homônimo. */
export function indexarPorNome(perfis: PerfilMinimo[]): Map<string, PerfilMinimo[]> {
  const m = new Map<string, PerfilMinimo[]>();
  for (const p of perfis) {
    const n = normalizar(p.full_name);
    if (!n) continue;
    const arr = m.get(n) ?? [];
    arr.push(p);
    m.set(n, arr);
  }
  return m;
}

/**
 * O RESPONSÁVEL de uma atividade.
 *
 * A tabela ganha do texto sempre que responde — é `user_id`, não palpite.
 */
export function responsavelDaAtividade(
  atividade: { id: string; assigned_to?: string | null },
  atribuicoes: Map<string, LinhaDeAtribuicao[]>,
  perfis: Map<string, PerfilMinimo>,
  porNome?: Map<string, PerfilMinimo[]>,
): PessoaDaAtividade {
  const linhas = atribuicoes.get(atividade.id) ?? [];
  const resp = linhas.find((l) => l.papel === "responsavel");

  if (resp) {
    const p = perfis.get(resp.user_id);
    return {
      id: resp.user_id,
      nome: p?.full_name || p?.email || "—",
      origem: "tabela",
      ambiguo: false,
    };
  }

  const nome = nomeParaExibir(atividade.assigned_to, perfis);
  if (!nome) return { id: null, nome: "—", origem: "ausente", ambiguo: false };

  const homonimos = porNome?.get(normalizar(nome)) ?? [];
  return {
    id: homonimos.length === 1 ? homonimos[0].id : null,
    nome,
    origem: "texto",
    ambiguo: homonimos.length > 1,
  };
}

/**
 * Os PARTICIPANTES de uma atividade.
 *
 * O responsável não entra: são papéis distintos, e a tabela já os separa por
 * `papel`. Ordena por nome para a lista não mudar de ordem a cada leitura.
 */
export function participantesDaAtividade(
  atividade: { id: string; participants?: string[] | null },
  atribuicoes: Map<string, LinhaDeAtribuicao[]>,
  perfis: Map<string, PerfilMinimo>,
  porNome?: Map<string, PerfilMinimo[]>,
): PessoaDaAtividade[] {
  const linhas = (atribuicoes.get(atividade.id) ?? []).filter((l) => l.papel === "participante");

  if (linhas.length > 0) {
    return linhas
      .map((l) => {
        const p = perfis.get(l.user_id);
        return {
          id: l.user_id,
          nome: p?.full_name || p?.email || "—",
          origem: "tabela" as const,
          ambiguo: false,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  const nomes = Array.isArray(atividade.participants) ? atividade.participants : [];
  return nomes
    .map((t) => nomeParaExibir(t, perfis))
    .filter((n): n is string => !!n)
    .map((nome) => {
      const homonimos = porNome?.get(normalizar(nome)) ?? [];
      return {
        id: homonimos.length === 1 ? homonimos[0].id : null,
        nome,
        origem: "texto" as const,
        ambiguo: homonimos.length > 1,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Agrupa as linhas de `activity_assignees` por atividade. */
export function agruparAtribuicoes(linhas: LinhaDeAtribuicao[]): Map<string, LinhaDeAtribuicao[]> {
  const m = new Map<string, LinhaDeAtribuicao[]>();
  for (const l of linhas) {
    const arr = m.get(l.activity_id) ?? [];
    arr.push(l);
    m.set(l.activity_id, arr);
  }
  return m;
}

/**
 * A atividade é de uma pessoa? — POR IDENTIFICADOR.
 *
 * É a pergunta do filtro "Minhas". Quando a tabela responde, é `user_id` puro
 * e homônimo não confunde. Sem a tabela, cai no texto — e aí **nome ambíguo
 * devolve `false`**, pela mesma razão de sempre: nome de duas pessoas não
 * identifica ninguém, e mostrar a tarefa do outro como "minha" é pior que não
 * mostrar.
 */
export function ehDaPessoa(
  atividade: { id: string; assigned_to?: string | null; participants?: string[] | null; created_by?: string | null },
  userId: string,
  atribuicoes: Map<string, LinhaDeAtribuicao[]>,
  perfis: Map<string, PerfilMinimo>,
  porNome?: Map<string, PerfilMinimo[]>,
): boolean {
  const linhas = atribuicoes.get(atividade.id) ?? [];
  if (linhas.some((l) => l.user_id === userId)) return true;

  if (atividade.created_by && atividade.created_by === userId) return true;

  // A tabela respondeu para esta atividade e a pessoa não está lá: é resposta,
  // não silêncio. Não cai no texto.
  if (linhas.length > 0) return false;

  const eu = perfis.get(userId);
  if (!eu) return false;
  const meuNome = normalizar(eu.full_name);
  if (!meuNome) return false;
  if ((porNome?.get(meuNome)?.length ?? 0) > 1) return false;

  const resp = normalizar(nomeParaExibir(atividade.assigned_to, perfis));
  if (resp && resp === meuNome) return true;

  const parts = Array.isArray(atividade.participants) ? atividade.participants : [];
  return parts.some((t) => normalizar(nomeParaExibir(t, perfis)) === meuNome);
}
