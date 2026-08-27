/**
 * O QUADRO DE EXECUÇÃO — quem vira cartão, o que a promoção move, e o que
 * mover de coluna pode tocar.
 *
 * ============================================================================
 * O DEFEITO QUE ORIGINOU ESTE MÓDULO — reproduzido em 26/08/2026
 *
 * Relato: promove um pacote → só ele aparece; move o pacote para "Em
 * andamento" → a fase inteira vai junto; move de volta → parte fica, parte
 * volta, e o agrupamento se perde.
 *
 * Medido na base, e bate com o relato:
 *
 *   - **142 agrupadores** estão no quadro como cartão hoje;
 *   - **39 famílias** têm filhas em colunas diferentes — uma delas com 16
 *     filhas partidas entre "Em Andamento" e "Backlog", que é exatamente o
 *     "parte fica, parte volta";
 *   - **97 casos** de pai no Backlog com filha no quadro.
 *
 * A causa são DOIS caminhos de escrita que fazem coisas diferentes:
 *
 *   1. `subirPaisCompletos` — ao mover um cartão, SOBE O ANCESTRAL quando
 *      todos os irmãos chegam à mesma coluna. Escreve em quem ninguém moveu.
 *   2. o diálogo "levar os N junto" — ao mover um agrupador, CASCATEIA para
 *      os descendentes, gravando coluna e status em bloco.
 *
 * Juntos produzem o vaivém: a ida leva os filhos (2), a volta traz o pai
 * atrás deles (1), e quem estava em outra coluna fica onde estava.
 *
 * ============================================================================
 * A REGRA
 *
 *   - **Estágio** (backlog | quadro) muda SOMENTE por promoção explícita,
 *     item a item. Levar as subatividades é opção PERGUNTADA, nunca automática.
 *   - **Mudar de coluna** altera SOMENTE o status do cartão movido. Nunca toca
 *     em estágio, nunca em descendente, nunca escreve no ancestral.
 *   - **Status de agrupador é DERIVADO** das filhas, no servidor. Agrupador não
 *     é cartão arrastável: é faixa de agrupamento.
 *   - **Só Atividade vira cartão.**
 * ============================================================================
 */

import { resolveEapKind, eapCanGroup } from "./eapModel";

export type Estagio = "backlog" | "quadro";

/** O mínimo que precisamos saber de um item para decidir o papel dele. */
export interface ItemDoQuadro {
  id: string;
  parent_id?: string | null;
  is_milestone?: boolean | null;
  /**
   * O papel gravado. Desde o congelamento (27/08/2026) é confiável, e é ele
   * que decide se o item é caixa ou trabalho — ver `ehAgrupadorDoQuadro`.
   */
  item_type?: string | null;
  /** Só para `resolveEapKind` ler o nível: o código EAP vence o campo. */
  wbs_code?: string | null;
  /** A coluna onde está. `null` = ainda não posicionado. */
  workflow_stage_id?: string | null;
  status?: string | null;
}

/** O mínimo de uma coluna. */
export interface ColunaDoQuadro {
  id: string;
  categoria?: string | null;
  title?: string | null;
  is_final?: boolean | null;
}

const ehColunaDeBacklog = (c: ColunaDoQuadro | undefined | null): boolean =>
  !!c && (c.categoria ?? "").trim() === "backlog";

/**
 * O ESTÁGIO de um item: está na fila ou no quadro?
 *
 * Deriva da COLUNA, que é onde o dado vive hoje — não de um campo próprio. A
 * coluna `estagio` existe no banco (migration 20260826140000) mas nasceu como
 * espelho e nenhum código a lê; ler dois lugares seria criar a divergência que
 * este módulo existe para evitar.
 */
export function estagioDoItem(
  item: ItemDoQuadro,
  colunaPorId: Map<string, ColunaDoQuadro>,
): Estagio {
  const c = item.workflow_stage_id ? colunaPorId.get(item.workflow_stage_id) : null;
  // Sem coluna, o item ainda não foi promovido: fila.
  if (!c) return "backlog";
  return ehColunaDeBacklog(c) ? "backlog" : "quadro";
}

/**
 * É AGRUPADOR? — o TIPO diz que agrupa, e não é marco.
 *
 * ============================================================================
 * ESTA REGRA JÁ FOI ESTRUTURAL, E O MOTIVO DE TER MUDADO IMPORTA
 *
 * Até 27/08/2026 a definição era: "tem filhas vivas". O comentário de então
 * dizia, e estava certo para o seu contexto:
 *
 *   > A definição é estrutural de propósito. `item_type` e `wbs_code` descrevem
 *   > a intenção; ter filhas descreve o fato, e é o fato que decide se a coisa
 *   > é uma caixa ou um trabalho.
 *
 * Ele não está sendo apagado porque não estava errado — estava **certo enquanto
 * `item_type` era lixo de importação**. Naquele banco, 1.591 linhas gravadas
 * como 'fase' eram atividades comuns que receberam o rótulo porque
 * `fase`/`atividade` eram os únicos valores disponíveis. A intenção era mentira
 * e só o fato era confiável, então ler o fato era a decisão correta.
 *
 * O congelamento (migration 20260827130000) derrubou essa premissa: `item_type`
 * passou a valer o que a tela mostrava, com ponto fixo provado. A intenção
 * virou confiável, e ler o fato deixou de ser a opção segura para virar a
 * insegura — porque "ter filhas" muda sozinho.
 *
 * O QUE A REGRA ANTIGA PROVOCARIA HOJE: no instante em que alguém criasse a
 * primeira subatividade sob uma Atividade, ela sumiria do quadro, viraria faixa
 * e deixaria de ser arrastável — sem ninguém ter decidido isso. É exatamente o
 * defeito que o congelamento matou (o tipo mudando sozinho ao ganhar filha),
 * reaparecendo pela porta estrutural.
 *
 * A REGRA COMPLETA, de 27/08:
 *
 *   atividade promovida ...... cartão, SEMPRE, mesmo com filhas
 *   subatividade ............. NÃO vira cartão por ter nascido; aparece dentro
 *                              do cartão do pai como contador
 *   subatividade promovida ... ganha cartão próprio, e pai e filha convivem no
 *                              quadro — foi decisão de gente
 *   fase, entrega, pacote .... faixa
 *   marco .................... o único que nunca tem filha
 *
 * `filhasPorPai` continua na assinatura, e ignorado: são três pontos de
 * chamada, e o parâmetro documenta que ter filhas **não decide mais** se algo é
 * caixa. Mesma escolha feita em `resolveEapKind`.
 * ============================================================================
 */
export function ehAgrupadorDoQuadro(
  item: ItemDoQuadro,
  _filhasPorPai?: Map<string, ItemDoQuadro[]>,
): boolean {
  if (item.is_milestone) return false;
  return eapCanGroup(resolveEapKind(item));
}

/**
 * VIRA CARTÃO NO KANBAN?
 *
 * Só Atividade: nem marco (ponto no tempo, vive no Cronograma), nem agrupador
 * (é faixa), nem quem ainda está na fila.
 */
export function viraCartao(
  item: ItemDoQuadro,
  filhasPorPai: Map<string, ItemDoQuadro[]>,
  colunaPorId: Map<string, ColunaDoQuadro>,
): boolean {
  if (item.is_milestone) return false;
  if (ehAgrupadorDoQuadro(item, filhasPorPai)) return false;
  return estagioDoItem(item, colunaPorId) === "quadro";
}

/**
 * A FAIXA de um cartão — o agrupador mais próximo, subindo por `parent_id`.
 *
 * `null` para cartão de raiz. Sobe até achar um agrupador **que esteja no
 * quadro**: um pacote ainda na fila não desenha faixa, senão o quadro
 * anunciaria uma caixa que ninguém promoveu.
 */
export function faixaDoCartao(
  item: ItemDoQuadro,
  itemPorId: Map<string, ItemDoQuadro>,
  filhasPorPai: Map<string, ItemDoQuadro[]>,
  colunaPorId: Map<string, ColunaDoQuadro>,
): string | null {
  const visto = new Set<string>([item.id]);
  let paiId = item.parent_id ?? null;
  while (paiId && !visto.has(paiId)) {
    visto.add(paiId);
    const pai = itemPorId.get(paiId);
    if (!pai) return null;
    if (ehAgrupadorDoQuadro(pai, filhasPorPai) && estagioDoItem(pai, colunaPorId) === "quadro") {
      return pai.id;
    }
    paiId = pai.parent_id ?? null;
  }
  return null;
}

/* ── O QUE CADA GESTO PODE ESCREVER ────────────────────────────────────────
 *
 * Devolver a lista de escritas, em vez de executá-las, é o que torna a regra
 * testável sem banco — e é o que permite o teste "mover ida e volta N vezes"
 * comparar conjuntos.
 */

export interface Escrita {
  id: string;
  campos: Partial<{
    workflow_stage_id: string | null;
    status: string;
    completed_at: string | null;
  }>;
}

/**
 * MOVER DE COLUNA — o que pode ser escrito.
 *
 * **Exatamente uma escrita, no item movido.** Sem ancestral, sem descendente.
 *
 * O status acompanha a coluna porque status e coluna são a mesma informação em
 * dois lugares (a coluna final define `completed`); o que não acompanha é
 * *outra linha*.
 *
 * Agrupador devolve **lista vazia**: ele não é cartão, e o status dele é
 * derivado das filhas no servidor. Se a interface tentar mover um, a regra
 * recusa em vez de gravar.
 */
export function escritasDeMoverColuna(
  item: ItemDoQuadro,
  destino: ColunaDoQuadro,
  filhasPorPai: Map<string, ItemDoQuadro[]>,
  agora: string,
): Escrita[] {
  if (ehAgrupadorDoQuadro(item, filhasPorPai)) return [];
  if (item.is_milestone) return [];

  const final = destino.is_final === true || (destino.categoria ?? "").trim() === "concluida";
  return [{
    id: item.id,
    campos: {
      workflow_stage_id: destino.id,
      status: final ? "completed" : "pending",
      completed_at: final ? agora : null,
    },
  }];
}

/**
 * PROMOVER — tirar da fila e pôr no quadro.
 *
 * `levarSubatividades` é decisão de quem promove, e a interface **pergunta**.
 * `false` move só o item; `true` move ele e a subárvore de atividades.
 *
 * Marco nunca é promovido: ele não entra no quadro. Vem junto na varredura
 * para não sumir da árvore, mas sai da lista de escritas.
 *
 * O status vai para `pending` de propósito: promover é começar a acompanhar,
 * não concluir. Quem já estava `completed` mantém — reabrir por engano seria
 * apagar trabalho feito.
 */
export function escritasDePromover(
  item: ItemDoQuadro,
  destino: ColunaDoQuadro,
  filhasPorPai: Map<string, ItemDoQuadro[]>,
  levarSubatividades: boolean,
): Escrita[] {
  const alvos: ItemDoQuadro[] = [];

  const visitar = (it: ItemDoQuadro, raiz: boolean) => {
    if (!it.is_milestone) alvos.push(it);
    if (!raiz && !levarSubatividades) return;
    if (!levarSubatividades) return;
    for (const f of filhasPorPai.get(it.id) ?? []) visitar(f, false);
  };
  visitar(item, true);

  return alvos.map((a) => ({
    id: a.id,
    campos: {
      workflow_stage_id: destino.id,
      status: a.status === "completed" ? "completed" : "pending",
    },
  }));
}

/**
 * Quantas subatividades a promoção levaria — o número que a pergunta mostra.
 *
 * Conta só o que VIRARIA cartão: marco fora, e agrupador intermediário conta
 * como faixa, não como trabalho. Sem isso a pergunta diria "levar 20 junto"
 * para um pacote com 12 atividades e 8 caixas.
 */
export function subatividadesPromoviveis(
  item: ItemDoQuadro,
  filhasPorPai: Map<string, ItemDoQuadro[]>,
): { atividades: number; agrupadores: number } {
  let atividades = 0;
  let agrupadores = 0;
  const visto = new Set<string>([item.id]);

  const descer = (it: ItemDoQuadro) => {
    for (const f of filhasPorPai.get(it.id) ?? []) {
      if (visto.has(f.id) || f.is_milestone) continue;
      visto.add(f.id);
      if (ehAgrupadorDoQuadro(f, filhasPorPai)) agrupadores++;
      else atividades++;
      descer(f);
    }
  };
  descer(item);
  return { atividades, agrupadores };
}

/**
 * O STATUS DE UM AGRUPADOR é derivado — nunca escrito.
 *
 * Existe como função para a tela ter o que exibir sem inventar, e para o teste
 * "nenhuma tela grava status em agrupador" ter um alvo legítimo a apontar.
 *
 * `completed` só quando TODAS as filhas de trabalho estão concluídas. Sem
 * filhas mensuráveis, devolve o próprio status — não há o que derivar.
 */
export function statusDerivadoDoAgrupador(
  item: ItemDoQuadro,
  filhasPorPai: Map<string, ItemDoQuadro[]>,
): string {
  const filhas = (filhasPorPai.get(item.id) ?? []).filter((f) => !f.is_milestone);
  if (filhas.length === 0) return item.status ?? "pending";
  return filhas.every((f) => f.status === "completed") ? "completed" : "pending";
}
