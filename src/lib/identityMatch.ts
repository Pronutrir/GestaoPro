/**
 * Identity matching utilities for permission checks.
 *
 * Background: project records frequently store free-text identifiers
 * (`owner`, `manager`, `assignees[]`) using a short version of a person's
 * name (e.g. "Williame Correia"), while the user profile has the full name
 * ("Williame Correia de Lima") and the auth account has an email
 * ("williame.correia@pronutrir.com.br"). A naive equality comparison after
 * normalizing the strings misses these cases and silently hides the project
 * from the rightful user.
 *
 * The helpers below provide a tolerant comparison that combines:
 *   1. Exact normalized equality
 *   2. Substring containment
 *   3. Token overlap (two or more meaningful tokens shared)
 *   4. Email local-part containment / token overlap
 */

const STOP_TOKENS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "y",
  "del",
  "la",
  "le",
  "the",
]);

export const normalizeIdentity = (value: string | null | undefined): string => {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

const tokenize = (value: string): string[] => {
  if (!value) return [];
  return value
    .split(/[\s._\-+@]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_TOKENS.has(token));
};

export interface IdentityCandidate {
  /** Full normalized string (e.g. "williame correia de lima"). */
  normalized: string;
  /** Significant tokens extracted from the source. */
  tokens: Set<string>;
}

export const buildCandidate = (value: string | null | undefined): IdentityCandidate | null => {
  const normalized = normalizeIdentity(value);
  if (!normalized) return null;
  return { normalized, tokens: new Set(tokenize(normalized)) };
};

/**
 * Builds the bag of identity candidates for a user from every available
 * source: profile name, profile/auth email, email local-part. Each source
 * becomes its own candidate so the per-token comparison stays meaningful.
 */
export const buildUserCandidates = (sources: Array<string | null | undefined>): IdentityCandidate[] => {
  const map = new Map<string, IdentityCandidate>();
  for (const raw of sources) {
    const candidate = buildCandidate(raw);
    if (!candidate) continue;
    if (!map.has(candidate.normalized)) {
      map.set(candidate.normalized, candidate);
    }
    // Email special case: also register the local-part (before "@") as its
    // own candidate so "Williame Correia" can match "williame.correia".
    if (raw && raw.includes("@")) {
      const local = raw.split("@")[0];
      const localCandidate = buildCandidate(local);
      if (localCandidate && !map.has(localCandidate.normalized)) {
        map.set(localCandidate.normalized, localCandidate);
      }
    }
  }
  return Array.from(map.values());
};

const candidatesShareTokens = (a: IdentityCandidate, b: IdentityCandidate, minOverlap = 2): boolean => {
  if (a.tokens.size === 0 || b.tokens.size === 0) return false;
  let shared = 0;
  for (const token of a.tokens) {
    if (b.tokens.has(token)) {
      shared++;
      if (shared >= minOverlap) return true;
    }
  }
  // Single distinctive token is enough when one side only has one token
  // (e.g. owner stored just as "williame" or just an email local-part).
  if (shared >= 1 && (a.tokens.size === 1 || b.tokens.size === 1)) {
    return true;
  }
  return false;
};

/**
 * NOMES QUE PERTENCEM A MAIS DE UMA PESSOA — a permissão não os aceita.
 *
 * Medido em 26/08/2026: existem DOIS perfis ativos chamados "Williame Correia
 * de Lima", ids diferentes, os dois ativos e os dois editando. Como `owner`,
 * `manager`, `assigned_to` e `participants` guardam NOME, os dois casavam com
 * as mesmas 450 atividades e com os mesmos 2 projetos — cada um recebendo o
 * acesso do outro.
 *
 * A comparação aqui é tolerante de propósito (nome curto × nome longo), o que
 * torna homônimo indistinguível por construção: nenhuma heurística de string
 * separa duas pessoas com o mesmo nome. A única saída correta é **não
 * conceder** e deixar a via do identificador decidir.
 *
 * Errar para "ninguém" é visível — a pessoa reclama que perdeu acesso. Errar
 * para "os dois" é invisível, e é escalação de privilégio.
 *
 * Espelha `nome_e_ambiguo` na migration 20260826180000. Quem popula este
 * conjunto é a página, a partir de `profiles` — o mesmo lugar de onde vêm as
 * identidades.
 */
let nomesAmbiguos: Set<string> = new Set();

/** Registra os nomes que pertencem a mais de um perfil. Idempotente. */
export const definirNomesAmbiguos = (nomes: Array<string | null | undefined>): void => {
  nomesAmbiguos = new Set(
    nomes.map((n) => normalizeIdentity(n)).filter((n) => n.length > 0),
  );
};

/** Os nomes ambíguos registrados — para a tela poder avisar. */
export const obterNomesAmbiguos = (): string[] => Array.from(nomesAmbiguos);

/**
 * A MESMA TRAVA, NO SERVIDOR.
 *
 * `nomesAmbiguos` é módulo-global, e no browser a página do projeto o preenche
 * uma vez. **No servidor ninguém preenchia** — cada rota de API é um contexto
 * próprio, e `matchesIdentity` rodava lá com o conjunto vazio, ou seja, sem a
 * trava. As rotas de notificação decidem quem enxerga o quê, então era o furo
 * do homônimo de volta pela porta do servidor.
 *
 * Recebe o cliente já autenticado (evita import de supabase aqui, que
 * arrastaria dependência de browser para dentro de uma função pura).
 * Falha em silêncio: sem a trava, a comparação volta a ser tolerante — e o
 * banco continua barrando, que é onde a decisão final vive.
 */
export const carregarNomesAmbiguos = async (
  cliente: { from: (t: string) => { select: (c: string) => Promise<{ data: Array<{ full_name: string | null }> | null }> } },
): Promise<void> => {
  try {
    const { data } = await cliente.from("profiles").select("full_name");
    if (data) definirNomesAmbiguos(nomesRepetidosEm(data));
  } catch {
    // Ver o comentário acima: o banco é a última linha de defesa, não isto.
  }
};

/**
 * Deriva os nomes ambíguos de uma lista de perfis: os `full_name` que
 * aparecem mais de uma vez. É a mesma pergunta que `nome_e_ambiguo` faz no
 * banco, feita sobre a lista que a página já carregou.
 */
export const nomesRepetidosEm = (
  perfis: Array<{ full_name?: string | null }>,
): string[] => {
  const contagem = new Map<string, number>();
  for (const p of perfis) {
    const n = normalizeIdentity(p.full_name);
    if (!n) continue;
    contagem.set(n, (contagem.get(n) ?? 0) + 1);
  }
  return Array.from(contagem.entries()).filter(([, q]) => q > 1).map(([n]) => n);
};

/** O texto é um nome que pertence a mais de uma pessoa? */
export const ehNomeAmbiguo = (value: string | null | undefined): boolean => {
  const n = normalizeIdentity(value);
  return n.length > 0 && nomesAmbiguos.has(n);
};

/**
 * True when `value` plausibly identifies the same person as one of the
 * `candidates`. Comparison is case/diacritics-insensitive and tolerant to
 * short vs. long forms of the name.
 *
 * Devolve `false` para nome ambíguo, sempre — ver `definirNomesAmbiguos`.
 */
export const matchesIdentity = (
  value: string | null | undefined,
  candidates: IdentityCandidate[],
): boolean => {
  const target = buildCandidate(value);
  if (!target || candidates.length === 0) return false;

  // Nome de mais de uma pessoa não identifica ninguém. Antes de qualquer
  // comparação: a tolerância abaixo casaria com os dois homônimos.
  if (nomesAmbiguos.has(target.normalized)) return false;

  /**
   * E-MAIL É EXATO OU NÃO É NADA.
   *
   * O valor comparado é um e-mail (tem "@"), e e-mail identifica uma pessoa
   * só — não existe homonímia em endereço. Mas a comparação tolerante abaixo
   * é por TOKEN, e `williame_lima@hotmail.com` divide em
   * ["williame", "lima", "hotmail"], que compartilha dois tokens com o nome
   * "Williame Correia de Lima" — o do OUTRO perfil.
   *
   * Isto foi encontrado pelo próprio teste desta mudança: o e-mail de um
   * homônimo casava com o outro, que é o mesmo furo por outra porta. Com dois
   * endereços diferentes, a tolerância deixava de distinguir exatamente onde
   * havia informação para distinguir.
   *
   * Então: e-mail casa por igualdade normalizada (com o endereço inteiro ou
   * com a parte local registrada em `buildUserCandidates`) e para por aí.
   */
  if (target.normalized.includes("@")) {
    const local = target.normalized.split("@")[0];
    return candidates.some(
      (c) => c.normalized === target.normalized || c.normalized === local,
    );
  }

  for (const candidate of candidates) {
    if (candidate.normalized === target.normalized) return true;
    if (
      candidate.normalized.length >= 3 &&
      target.normalized.length >= 3 &&
      (candidate.normalized.includes(target.normalized) ||
        target.normalized.includes(candidate.normalized))
    ) {
      return true;
    }
    if (candidatesShareTokens(candidate, target)) return true;
  }
  return false;
};

/** Convenience: any of the strings matches any of the candidates. */
export const anyMatchesIdentity = (
  values: Array<string | null | undefined>,
  candidates: IdentityCandidate[],
): boolean => values.some((value) => matchesIdentity(value, candidates));
