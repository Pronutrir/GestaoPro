import type { CapacidadesDaTela } from "@/components/atividade/TelaDaAtividade";

/**
 * DAS CAPACIDADES DO `lib/` PARA AS DA TELA.
 *
 * ============================================================================
 * POR QUE UM TRADUTOR, E NÃO A TELA LENDO `canEditPlanejamento` DIRETO
 *
 * `capacidadesNaAtividade` responde em termos de DOMÍNIO — execução ×
 * planejamento —, e a tela pergunta em termos de CAMPO. Sem esta função, cada
 * campo faria a sua própria tradução, e a primeira divergência apareceria no
 * dia em que alguém escrevesse `canEditExecucao` onde o certo era
 * `canEditPlanejamento`.
 *
 * A distinção não é sutil, e está no CLAUDE.md:
 *
 *   execução      status, datas REAIS, horas apontadas, anexos
 *   planejamento  previsto, GUT, custo, posição na EAP
 *
 * Ou seja: quem executa aponta o que fez; quem planeja decide o que se espera.
 * Um responsável pode registrar 9h apontadas sem poder mudar as 24h previstas —
 * e é exatamente essa fronteira que a tela precisa respeitar campo a campo.
 *
 * O NOME é caso à parte: renomear uma atividade é mudar o escopo dela, não
 * executá-la. Por isso vai em planejamento.
 * ============================================================================
 */
export function capacidadesDaTela(c: {
  canView: boolean;
  canComment: boolean;
  canEditExecucao: boolean;
  canEditPlanejamento: boolean;
  canAssign: boolean;
}): CapacidadesDaTela {
  return {
    // Renomear é decidir o que a atividade É — escopo, não execução.
    editarNome: c.canEditPlanejamento,
    // A descrição diz o que conta como pronto: quem executa também escreve.
    editarDescricao: c.canEditExecucao || c.canEditPlanejamento,
    // "Previsto" é planejamento por definição. O realizado não é editável em
    // campo nenhum — ele nasce do trabalho, não da digitação.
    editarDatas: c.canEditPlanejamento,
    // Horas PREVISTAS são estimativa (planejamento). O apontamento tem via
    // própria e não passa por aqui.
    editarEsforco: c.canEditPlanejamento,
    editarGut: c.canEditPlanejamento,
    editarPessoas: c.canAssign,
    // Criar subatividade é decidir escopo: quebra o trabalho em partes.
    criarSubatividade: c.canEditPlanejamento,
    concluir: c.canEditExecucao,
    comentar: c.canComment,
  };
}
