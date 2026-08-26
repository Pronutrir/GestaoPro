/**
 * ÚLTIMA VISITA A UMA ATIVIDADE — para o sino do feed.
 *
 * ============================================================================
 * POR QUE localStorage, E NÃO UMA TABELA
 *
 * A fase 08 pede "persista a última leitura por usuário e atividade". Uma
 * tabela seria o certo se o dado precisasse atravessar dispositivos — mas ele
 * não precisa: o sino responde "o que mudou desde que EU olhei nesta máquina".
 * Ler no celular e o desktop zerar junto seria até indesejado.
 *
 * O que uma tabela custaria: uma migration, RLS própria, uma escrita a cada
 * abertura de atividade (são muitas), e um caminho a mais para "salvou mas não
 * salvou" — o defeito que esta revisão inteira vem fechando.
 *
 * Se algum dia o sino precisar ser compartilhado, esta é a fronteira a trocar:
 * as duas funções abaixo, e nada mais no código sabe onde o dado mora.
 * ============================================================================
 *
 * A chave inclui o usuário porque duas pessoas podem usar o mesmo navegador —
 * acontece em máquina compartilhada de setor.
 */

const PREFIXO = "gp:ultima-leitura";

const chave = (userId: string | null | undefined, activityId: string) =>
  `${PREFIXO}:${userId || "anon"}:${activityId}`;

/**
 * Quando esta pessoa viu esta atividade pela última vez.
 *
 * `null` = nunca viu. Quem chama trata isso como "tudo é novo" ou como "nada
 * é novo", conforme o caso — o sino escolhe **nada**, senão toda atividade
 * nasceria com o contador cheio.
 */
export function lerUltimaVisita(
  userId: string | null | undefined,
  activityId: string,
): string | null {
  if (typeof window === "undefined" || !activityId) return null;
  try {
    return window.localStorage.getItem(chave(userId, activityId));
  } catch {
    // Modo privado, cota estourada, storage desabilitado. Sem sino é melhor
    // que tela quebrada.
    return null;
  }
}

/** Marca agora como a última visita. */
export function marcarVisita(
  userId: string | null | undefined,
  activityId: string,
): void {
  if (typeof window === "undefined" || !activityId) return;
  try {
    window.localStorage.setItem(chave(userId, activityId), new Date().toISOString());
  } catch {
    /* idem */
  }
}

/**
 * Quantos eventos são NOVOS desde a última visita.
 *
 * `datas` são ISO strings — comparadas como Date porque aqui é INSTANTE
 * (`timestamptz`), não coluna `date`. A regra de `lib/dataLocal` (nunca passar
 * coluna `date` por `new Date()`) vale para dia, não para carimbo de tempo.
 *
 * Sem visita registrada devolve **0**: uma atividade aberta pela primeira vez
 * não deve gritar. O sino serve para "mudou desde que olhei", e quem nunca
 * olhou não tem referência.
 */
export function contarNovos(
  datas: (string | null | undefined)[],
  ultimaVisita: string | null,
  /** Eventos do próprio usuário não contam — ele acabou de causá-los. */
  ignorar?: (i: number) => boolean,
): number {
  if (!ultimaVisita) return 0;
  const corte = new Date(ultimaVisita).getTime();
  if (!Number.isFinite(corte)) return 0;

  let n = 0;
  for (let i = 0; i < datas.length; i++) {
    const d = datas[i];
    if (!d) continue;
    if (ignorar?.(i)) continue;
    const t = new Date(d).getTime();
    if (Number.isFinite(t) && t > corte) n++;
  }
  return n;
}
