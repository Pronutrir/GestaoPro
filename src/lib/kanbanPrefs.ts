/**
 * Preferências de EXIBIÇÃO do Kanban — fonte ÚNICA de leitura e escrita.
 *
 * Antes, cada preferência tinha seu próprio `localStorage.getItem` espalhado
 * pelo componente (nove chaves em dois arquivos). Elas não seguiam a pessoa:
 * configurar o quadro no trabalho e abrir em casa devolvia tudo ao padrão.
 *
 * Agora o navegador é CACHE e o banco é a verdade:
 *
 *   1. monta  → lê o localStorage e pinta na hora (sem tela pulando)
 *   2. depois → busca no banco; se houver linha, ela vence e regrava o cache
 *   3. mexeu  → grava local na hora e no banco com atraso (debounce)
 *
 * Se a migration não estiver aplicada, ou a rede cair, tudo continua
 * funcionando exatamente como antes — o banco é um espelho, nunca um
 * requisito. É por isso que a leitura remota trata erro como "não achei".
 *
 * FILTRO NÃO ENTRA AQUI. Decisão de 12/08/2026: filtro é busca do momento, e
 * abrir o quadro filtrado de dias atrás faria a pessoa ver poucos cartões e
 * achar que sumiu tarefa. Ele segue no localStorage, por navegador.
 *
 * Ver também: lib/kanbanTokens.ts (medidas), migration 20260812120000.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  CardFields,
  DEFAULT_CARD_FIELDS,
  GROUP_BY_VALUES,
  GroupByValue,
  isValidSortValue,
} from "@/components/kanban/shared";

/** O conjunto que viaja com a pessoa. Filtros ficam de fora de propósito. */
export type KanbanPrefs = {
  cardFields: CardFields;
  groupBy: GroupByValue;
  /** stageId -> largura em px */
  columnWidths: Record<string, number>;
  /** ids das colunas recolhidas */
  collapsedStages: string[];
  /**
   * stageId -> "criterio:dir". Cada coluna ordena por conta própria; não há
   * ordenação única do quadro no código (a memória do plano dizia que sim — o
   * componente desmente).
   */
  columnSorts: Record<string, string>;
  /**
   * O usuario ja DECIDIU sobre o resumo de subatividades?
   *
   * `subSummary` virou ligado por padrao, mas quem ja usava o quadro tinha um
   * `false` gravado que nunca escolheu. Enquanto esta marca nao existe, aquele
   * `false` e ignorado na leitura; depois dela, a escolha do usuario manda.
   */
  subSummaryVisto?: boolean;
  /**
   * DENSIDADE DA LISTA DO BACKLOG — "compacto" (30px) ou "confortavel" (36px).
   *
   * Vive aqui, e nao num armazenamento proprio, porque a fase 06 e explicita:
   * "as preferencias de exibicao ja vivem no banco (useKanbanPrefs) — siga o
   * mesmo caminho, nao invente um segundo". Duas fontes de preferencia e o
   * comeco de duas telas discordando sobre o que a pessoa escolheu.
   *
   * Ausente = "confortavel", que e o comportamento de sempre.
   */
  densidadeBacklog?: DensidadeBacklog;
};

/** As duas densidades da fase 06. Numeros em `ALTURA_DA_LINHA`. */
export type DensidadeBacklog = "compacto" | "confortavel";

/** A altura da linha, em px, de cada densidade. */
export const ALTURA_DA_LINHA: Record<DensidadeBacklog, number> = {
  compacto: 30,
  confortavel: 36,
};

export const DEFAULT_PREFS: KanbanPrefs = {
  cardFields: DEFAULT_CARD_FIELDS,
  groupBy: "none",
  columnWidths: {},
  collapsedStages: [],
  columnSorts: {},
};

/**
 * Chave do cache local. Versionada (v3) porque o formato mudou: antes eram
 * nove chaves soltas, agora é um blob só.
 *
 * A lição que obriga a versionar está registrada na Fase 1: quando um
 * DEFAULT_* persistido muda de valor, o merge `{...DEFAULT, ...salvo}` faz o
 * valor antigo vencer e a mudança fica invisível para quem já usou a tela. Foi
 * o que aconteceu com kanban-card-fields v1→v2. Bump de chave zera todo mundo
 * uma vez; a chave órfã é limpa em `limparChavesAntigas`.
 */
export const prefsKey = (projectId: string) => `kanban-prefs:v3:${projectId}`;

/** Chaves da era "uma por preferência" — limpas para não acumular lixo. */
const CHAVES_ANTIGAS = (projectId: string) => [
  `kanban-card-fields:v2:${projectId}`,
  `kanban-group-by:${projectId}`,
  `kanban-col-widths:${projectId}`,
  `kanban-collapsed-stages:${projectId}`,
];

/**
 * Saneia o que veio do cache ou do banco. Nada aqui confia na origem: o
 * localStorage é editável pelo usuário e o jsonb do banco aceita qualquer
 * forma. Campo inválido cai no default em vez de contaminar o estado — um
 * groupBy lixo quebraria o agrupamento, e uma largura NaN colapsaria a coluna.
 */
export function sanearPrefs(raw: unknown): KanbanPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const cardFields = { ...DEFAULT_CARD_FIELDS };
  const cf = o.cardFields;
  if (cf && typeof cf === "object") {
    for (const k of Object.keys(DEFAULT_CARD_FIELDS) as (keyof CardFields)[]) {
      /**
       * CAMPO NOVO NÃO HERDA O `false` ANTIGO.
       *
       * A preferência gravada sobrescreve o padrão — é o que se espera de uma
       * escolha do usuário. Mas `subSummary` passou de desligado a LIGADO por
       * padrão (14/08/2026), e quem já tinha usado o quadro carregava um
       * `false` que nunca escolheu: ele foi salvo junto com os outros campos
       * na primeira vez que qualquer coisa mudou.
       *
       * Aqui o `false` gravado desse campo é ignorado UMA vez, para o novo
       * padrão valer. Desligar de propósito continua funcionando: a partir do
       * momento em que `subSummaryVisto` é gravado, a escolha manda.
       */
      if (k === "subSummary" && !(o as { subSummaryVisto?: boolean }).subSummaryVisto) continue;
      const v = (cf as Record<string, unknown>)[k];
      if (typeof v === "boolean") cardFields[k] = v;
    }
  }

  const groupBy = (GROUP_BY_VALUES as readonly string[]).includes(o.groupBy as string)
    ? (o.groupBy as GroupByValue)
    : DEFAULT_PREFS.groupBy;

  // Largura só entra se for número finito e positivo. O clamp por coluna fica
  // com quem desenha (MIN_COL_WIDTH), aqui só barra o que não é medida.
  const columnWidths: Record<string, number> = {};
  if (o.columnWidths && typeof o.columnWidths === "object") {
    for (const [id, v] of Object.entries(o.columnWidths as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) columnWidths[id] = v;
    }
  }

  const collapsedStages = Array.isArray(o.collapsedStages)
    ? (o.collapsedStages as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const columnSorts: Record<string, string> = {};
  if (o.columnSorts && typeof o.columnSorts === "object") {
    for (const [id, v] of Object.entries(o.columnSorts as Record<string, unknown>)) {
      if (typeof v === "string" && isValidSortValue(v)) columnSorts[id] = v;
    }
  }

  // `subSummaryVisto` viaja de volta: sem isso a marca se perderia a cada
  // saneamento, e o `false` do usuário nunca chegaria a valer.
  //
  // `densidadeBacklog` idem — e só os dois valores conhecidos passam: um valor
  // estranho vindo do banco viraria uma altura de linha inexistente.
  const densidadeBacklog =
    o.densidadeBacklog === "compacto" || o.densidadeBacklog === "confortavel"
      ? (o.densidadeBacklog as DensidadeBacklog)
      : undefined;

  return {
    cardFields, groupBy, columnWidths, collapsedStages, columnSorts,
    ...(o.subSummaryVisto === true ? { subSummaryVisto: true } : {}),
    ...(densidadeBacklog ? { densidadeBacklog } : {}),
  };
}

/** Lê o cache local. Nunca lança — cache corrompido vira default. */
export function lerPrefsLocais(projectId: string): KanbanPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(prefsKey(projectId));
    return raw ? sanearPrefs(JSON.parse(raw)) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function gravarPrefsLocais(projectId: string, prefs: KanbanPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(prefsKey(projectId), JSON.stringify(prefs));
  } catch { /* quota estourada: o banco ainda guarda */ }
}

/**
 * Migra as nove chaves antigas para o blob novo, uma vez por projeto.
 *
 * Sem isso, quem já usava o quadro perderia as larguras e os campos que
 * escolheu no dia em que esta versão subir — a mudança seria uma regressão
 * disfarçada de recurso novo. Roda só quando ainda não existe blob v3.
 */
export function migrarChavesAntigas(projectId: string): KanbanPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    if (window.localStorage.getItem(prefsKey(projectId))) return null; // já migrado

    const ler = (k: string) => window.localStorage.getItem(k);
    const json = (k: string) => { try { const r = ler(k); return r ? JSON.parse(r) : undefined; } catch { return undefined; } };

    const antigo = {
      cardFields: json(`kanban-card-fields:v2:${projectId}`),
      groupBy: ler(`kanban-group-by:${projectId}`) ?? undefined,
      columnWidths: json(`kanban-col-widths:${projectId}`),
      collapsedStages: json(`kanban-collapsed-stages:${projectId}`),
      // columnSorts era uma chave por COLUNA (kanban-col-sort:{stageId}), sem
      // o projectId no nome. Migradas em `migrarOrdenacaoDasColunas`, que
      // recebe os ids das colunas — aqui não há como saber quais são.
    };

    const nada = Object.values(antigo).every((v) => v === undefined);
    if (nada) return null;

    const prefs = sanearPrefs(antigo);
    gravarPrefsLocais(projectId, prefs);
    return prefs;
  } catch {
    return null;
  }
}

/**
 * Migra `kanban-col-sort:{stageId}` para dentro do blob.
 *
 * Separada de `migrarChavesAntigas` porque a chave não carrega o projectId:
 * só dá para achá-la conhecendo as colunas, que o hook recebe depois do fetch
 * dos stages. Devolve o que precisa entrar, ou null se não houver nada.
 */
export function migrarOrdenacaoDasColunas(
  stageIds: string[],
  jaMigradas: Record<string, string>,
): Record<string, string> | null {
  if (typeof window === "undefined" || stageIds.length === 0) return null;
  try {
    const achadas: Record<string, string> = {};
    for (const id of stageIds) {
      if (jaMigradas[id]) continue; // o blob já manda nesta coluna
      const v = window.localStorage.getItem(`kanban-col-sort:${id}`);
      if (v && isValidSortValue(v)) achadas[id] = v;
    }
    return Object.keys(achadas).length ? achadas : null;
  } catch {
    return null;
  }
}

/** Remove as chaves da era anterior. Idempotente. */
export function limparChavesAntigas(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    for (const k of CHAVES_ANTIGAS(projectId)) window.localStorage.removeItem(k);
    // Restos das fases 0 e 1, já sem uso.
    window.localStorage.removeItem(`kanban-density:${projectId}`);
    window.localStorage.removeItem(`kanban-card-fields:${projectId}`);
  } catch { /* ignore */ }
}

// A tabela não está nos tipos gerados até a migration rodar na VM — mesmo
// acessor documentado que kanban_teams usa em ActivityKanban.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prefsTable = () => (supabase as any).from("kanban_user_prefs");

/** true quando o erro é "a migration ainda não rodou" e não uma falha real. */
export const ehTabelaAusente = (msg?: string): boolean =>
  /kanban_user_prefs|relation|does not exist|schema cache/i.test(msg || "");

/**
 * Busca as preferências do usuário no banco.
 *
 * Devolve `null` para "não achei" E para qualquer erro — incluindo a tabela
 * ausente. O chamador não deve distinguir: em ambos os casos o certo é ficar
 * com o que o cache local já pintou.
 */
export async function buscarPrefsRemotas(
  projectId: string,
  userId: string,
): Promise<KanbanPrefs | null> {
  try {
    const { data, error } = await prefsTable()
      .select("prefs")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data?.prefs) return null;
    return sanearPrefs(data.prefs);
  } catch {
    return null;
  }
}

/**
 * Grava no banco. Silenciosa por desenho: preferência é ajuste fino, e um toast
 * de erro a cada toggle seria mais barulho do que a falha merece — o valor já
 * está salvo no navegador de qualquer forma.
 *
 * Devolve false quando a tabela não existe, para o chamador parar de tentar.
 */
export async function salvarPrefsRemotas(
  projectId: string,
  userId: string,
  prefs: KanbanPrefs,
): Promise<boolean> {
  try {
    const { error } = await prefsTable().upsert(
      {
        user_id: userId,
        project_id: projectId,
        prefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,project_id" },
    );
    if (error) return !ehTabelaAusente(error.message);
    return true;
  } catch {
    return true; // falha de rede não é motivo para desistir do recurso
  }
}
