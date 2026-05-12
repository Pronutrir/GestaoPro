/**
 * Valida se a data de início é posterior à data de término.
 * Retorna true quando há inconsistência (start > end).
 * Aceita strings 'YYYY-MM-DD' ou null/undefined/vazio.
 */
export function isDateRangeInvalid(
  start?: string | null,
  end?: string | null,
): boolean {
  if (!start || !end) return false;
  return start > end;
}

export const DATE_RANGE_ERROR =
  "Data de início não pode ser posterior à data de término.";
