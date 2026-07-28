/**
 * Flags de recurso — FONTE ÚNICA.
 *
 * Pontos onde a plataforma liga/desliga recursos sem remover código nem dados.
 */

/**
 * "Histórias de usuário" é um artefato de metodologia ágil (Scrum/XP). Como o
 * fluxo de trabalho é por atividades/EAP + prazos, a aba fica OCULTA por padrão
 * — os dados permanecem intactos na tabela user_stories e o recurso pode ser
 * reativado aqui. O acompanhamento do trabalho acontece no Registro da
 * atividade (ver ActivityRegistro).
 */
export const SHOW_USER_STORIES = false;

/**
 * "Calendário" (react-big-calendar) mostrava atividades por data com feriados e
 * férias. ~70% do que fazia já é coberto pelo Cronograma/Gantt (que agora também
 * arrasta datas). O que era exclusivo — sombrear feriados/férias — foi ABSORVIDO
 * pelo Gantt (ver ProjectCronogramaPanel). Por isso a aba do projeto e a página
 * /calendar ficam OCULTAS. Código e dados intactos; reativável aqui.
 */
export const SHOW_CALENDAR = false;
