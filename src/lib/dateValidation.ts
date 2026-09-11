/**
 * A REGRA: início não pode ser depois do término.
 *
 * Este módulo existia desde antes, correto, e **sem um único import no
 * repositório inteiro** — código morto. Cada tela reimplementou a comparação
 * inline: três cópias no `EditActivityDialog`, uma no `ProjectCronogramaPanel`.
 * A tela v2 da atividade, a mais nova, simplesmente não recebeu nenhuma cópia,
 * e por isso aceitava a janela invertida: medido em produção em 11/09/2026,
 * digitei `Previsto 14/09 → 10/09` e o valor gravou, sobreviveu ao F5 e não
 * gerou aviso nenhum.
 *
 * Regra extraída para cá, cópias apagadas. Quem valida intervalo de datas
 * importa daqui.
 *
 * POR QUE O `slice(0, 10)`
 *
 * A comparação lexicográfica de `YYYY-MM-DD` é correta e não passa por `Date`,
 * então não há fuso para errar. Mas os campos "real" (`actual_start_date`,
 * `actual_end_date`) chegam de algumas telas como timestamp completo
 * (`2026-09-14T00:00:00+00:00`). Comparar `"2026-09-14T00:00:00+00:00"` com
 * `"2026-09-14"` dá "maior" por causa do sufixo, e a validação acusaria uma
 * inversão que não existe — no mesmo dia. Recortar o dia dos dois lados iguala
 * o formato antes de comparar.
 */

/** Início depois do término? Vazio/nulo de qualquer lado nunca é inválido. */
export function isDateRangeInvalid(
  start?: string | null,
  end?: string | null,
): boolean {
  if (!start || !end) return false;
  return start.slice(0, 10) > end.slice(0, 10);
}

export const DATE_RANGE_ERROR =
  "Data de início não pode ser posterior à data de término.";
