/**
 * A TELA ÚNICA DA ATIVIDADE — quem edita o quê, campo a campo.
 *
 * ============================================================================
 * A REGRA QUE ORGANIZA A TELA
 *
 * "Sem modo Editar": cada campo é editável no lugar conforme as capacidades, e
 * **campo sem permissão vira TEXTO, não controle desabilitado**.
 *
 * A diferença não é estética. Um controle desabilitado promete que existe um
 * caminho — a pessoa procura o botão que destrava, e não há. Texto simples diz
 * a verdade: aqui você lê.
 *
 * O que decide é a capacidade da fase 03, e a divisão é entre EXECUÇÃO e
 * PLANEJAMENTO:
 *
 *   execução     — como o trabalho está indo: status, datas reais, horas
 *                  apontadas, anexos. Quem faz, informa.
 *   planejamento — o que o trabalho é: previsto, GUT, custo, posição na EAP.
 *                  Quem decide escopo, decide.
 *
 * É por isso que alguém pode marcar a própria atividade como concluída sem
 * poder mudar o orçamento dela.
 * ============================================================================
 */

/** Os campos da tela de atividade que têm regra de edição própria. */
export type CampoDaAtividade =
  | "titulo" | "descricao" | "status"
  | "data_inicio_real" | "data_fim_real" | "horas_apontadas" | "anexos"
  | "data_inicio_prevista" | "data_fim_prevista" | "horas_previstas"
  | "custo" | "gut" | "dentro_de" | "etiquetas"
  | "responsavel" | "participantes" | "observadores";

/** O que a fase 03 respondeu para esta atividade. */
export interface CapacidadesDoCampo {
  canView?: boolean;
  canComment?: boolean;
  canEditExecucao?: boolean;
  canEditPlanejamento?: boolean;
  canAssign?: boolean;
}

export type ModoDoCampo = "editavel" | "texto" | "oculto";

/**
 * Como este campo se apresenta.
 *
 * `oculto` é raro e proposital: custo some para o perfil Externo, porque não é
 * "não pode editar" — é "não é da conta dele". Esconder o que não se pode ver
 * é diferente de esconder o que não se pode mudar.
 */
export function modoDoCampo(
  campo: CampoDaAtividade,
  caps: CapacidadesDoCampo,
  opcoes?: { ehMarco?: boolean; ehExterno?: boolean; temFilhas?: boolean },
): ModoDoCampo {
  if (!caps.canView) return "oculto";

  const ehMarco = !!opcoes?.ehMarco;
  const ehExterno = !!opcoes?.ehExterno;
  const temFilhas = !!opcoes?.temFilhas;

  // Externo não vê custo. Não é permissão de edição — é escopo de leitura.
  if (ehExterno && campo === "custo") return "oculto";

  /**
   * MARCO não tem esforço, custo, GUT nem responsável de execução.
   *
   * `oculto`, e não `texto`: mostrar "Custo: —" num marco sugere um campo que
   * ficou por preencher. Ele não existe ali. (Ver `comoMostrarVazio` na mesa
   * de planejamento — mesma decisão, do outro lado da tela.)
   */
  if (ehMarco && ["horas_previstas", "horas_apontadas", "custo", "gut", "responsavel"].includes(campo)) {
    return "oculto";
  }

  /**
   * Pai com filhas: horas e custo são DERIVADOS (fase 09) — só leitura.
   *
   * Deixar editável seria mentir duas vezes: o valor digitado não sobrevive à
   * próxima derivação, e a gravação partiria da fatia que o cliente carregou.
   */
  if (temFilhas && ["horas_previstas", "custo", "data_inicio_prevista", "data_fim_prevista"].includes(campo)) {
    return "texto";
  }

  switch (campo) {
    // ── execução ──
    case "status":
    case "data_inicio_real":
    case "data_fim_real":
    case "horas_apontadas":
    case "anexos":
      return caps.canEditExecucao ? "editavel" : "texto";

    // ── planejamento ──
    case "titulo":
    case "descricao":
    case "data_inicio_prevista":
    case "data_fim_prevista":
    case "horas_previstas":
    case "custo":
    case "gut":
    case "dentro_de":
    case "etiquetas":
      return caps.canEditPlanejamento ? "editavel" : "texto";

    // ── atribuição ──
    case "responsavel":
    case "participantes":
      return caps.canAssign ? "editavel" : "texto";

    /**
     * Observador é do próprio usuário: qualquer um que enxergue a atividade
     * escolhe se quer acompanhá-la. Não concede nada, então não há o que
     * proteger.
     */
    case "observadores":
      return "editavel";
  }
}

/**
 * A ordem da barra de resumo — os oito campos à vista.
 *
 * Fixa de propósito: a barra é lida de relance, e ordem que muda por contexto
 * obriga a procurar. O que varia é o modo de cada campo, não a posição.
 */
export const CAMPOS_DO_RESUMO: CampoDaAtividade[] = [
  "responsavel",
  "data_fim_prevista",
  "data_fim_real",
  "gut",
  "horas_previstas",
  "horas_apontadas",
  "custo",
  "dentro_de",
];

/**
 * A rota da atividade.
 *
 * Rota própria (e não estado local do modal) é o que faz o link funcionar, o
 * F5 manter, e o voltar do navegador fechar. Um modal sem rota some ao
 * recarregar, e o link colado no chat abre o projeto na aba errada.
 */
export function rotaDaAtividade(projectId: string, activityId: string): string {
  return `/project/${projectId}/atividade/${activityId}`;
}

/** Extrai os ids de uma rota de atividade. `null` quando não é uma. */
export function lerRotaDaAtividade(caminho: string): { projectId: string; activityId: string } | null {
  const m = /^\/project\/([^/]+)\/atividade\/([^/?#]+)/.exec(caminho || "");
  if (!m) return null;
  return { projectId: m[1], activityId: m[2] };
}

/**
 * O que o indicador de salvamento diz.
 *
 * "Salvo" só aparece depois de o banco CONFIRMAR. No PostgREST, um UPDATE que
 * não casa nenhuma linha volta sem erro — e é assim que a recusa da RLS vira
 * silêncio. Quem chama tem de passar `linhasAfetadas`, não só "não deu erro".
 */
export type EstadoDeSalvamento = "parado" | "salvando" | "salvo" | "recusado" | "erro";

export function estadoAposEscrita(
  erro: unknown,
  linhasAfetadas: number | null | undefined,
): EstadoDeSalvamento {
  if (erro) return "erro";
  if (linhasAfetadas === 0) return "recusado";
  return "salvo";
}

/** A mensagem para cada estado. Recusa não é erro — e não pode virar "salvo". */
export function mensagemDeSalvamento(estado: EstadoDeSalvamento): string {
  switch (estado) {
    case "salvando":  return "Salvando…";
    case "salvo":     return "Salvo";
    case "recusado":  return "Você não tem permissão para alterar este campo";
    case "erro":      return "Não foi possível salvar";
    case "parado":    return "";
  }
}
