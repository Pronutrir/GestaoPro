/**
 * Normalização do TÍTULO da coluna do Kanban.
 *
 * Este arquivo já inferiu a semântica da coluna (is_final/is_blocked/
 * is_exception) por regex sobre o nome — inclusive ao renomear, o que fazia
 * "Concluída" → "Entregue ao cliente" desmarcar is_final em silêncio e
 * derrubar o progresso de todas as atividades da coluna.
 *
 * Essa responsabilidade saiu daqui: a semântica agora é a `categoria`,
 * escolhida explicitamente (ver `lib/workflowCategory.ts`). O que restou é
 * apenas o conserto de títulos legados com encoding ruim.
 */

function normalize(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Conserta grafias corrompidas de "Concluída" (ex.: "Concluãda", "ConcluÃda")
 * vindas de importações antigas com encoding errado. Qualquer outro título é
 * devolvido apenas com as pontas aparadas — nomes de coluna são livres.
 */
export function normalizeStageTitle(title: string): string {
  const normalized = normalize(title);
  const lettersOnly = normalized.replace(/[^a-z]/g, "");

  if (
    normalized === "concluida" ||
    normalized === "concluada" ||
    lettersOnly === "concluida" ||
    lettersOnly === "concluada" ||
    (lettersOnly.startsWith("conclu") && lettersOnly.endsWith("da"))
  ) {
    return "Concluída";
  }

  return (title || "").trim();
}
