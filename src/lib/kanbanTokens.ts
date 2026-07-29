/**
 * Tokens visuais do Kanban — fonte ÚNICA de medidas.
 *
 * Os valores vêm da captura aprovada em 29/07/2026 (coluna "Em Andamento",
 * card "Modelar banco de dados"), medida elemento por elemento:
 *
 *   cabeçalho da coluna  14px / 600        (.chead h3)
 *   título do card       13px / 500 / 1.375
 *   padding do card      10px              (p-2.5)
 *   corpo da coluna      8px + gap 8px     (p-2 / space-y-2)
 *   cabeçalho da coluna  8px 10px          (px-2.5 py-2)
 *   barra de progresso   5px
 *   avatar               20px (fonte 8.5px)
 *   prazo                11px tabular
 *   chip EAP             10px mono, h 17px
 *
 * O quadro tem UM tamanho. O seletor de densidade (S/M/G) foi removido
 * porque era a raiz do "corrigi mas continua grande": três escalas, uma
 * mantida, e a escolha presa ao localStorage de cada navegador.
 * Mudou uma medida? Muda AQUI — nunca inline no componente.
 */
export const KANBAN_TOKENS = {
  /** Card: padding 10px (réplica: .k{padding:10px}) */
  card: "p-2.5",
  /** Título 13px, peso aplicado no uso (font-medium), lh 1.375 (.ttl) */
  title: "text-[13px] leading-[1.375]",
  /** Descrição opcional (desligada de fábrica) */
  desc: "text-[11px]",
  showDesc: true,
  showProgress: true,
  showBadges: true,
  descClamp: "line-clamp-1",
  /** Folga horizontal interna da linha do título */
  gap: "gap-1.5",
  /** Cabeçalho da coluna: 8px 10px (.chead{padding:8px 10px}) */
  colHeaderPad: "px-2.5 py-2",
  /** Corpo da coluna: 8px + 8px entre cards (.cbody{padding:8px;gap:8px}) */
  colBodyPad: "p-2 space-y-2",
  colBodyGap: "space-y-2",
  /** Título da coluna: 14px (.chead h3{font-size:14px}), peso no uso */
  colHeaderTitle: "text-sm",
} as const;

export type KanbanTokens = typeof KANBAN_TOKENS;
