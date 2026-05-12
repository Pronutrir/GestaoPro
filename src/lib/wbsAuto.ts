/**
 * EAP/WBS automática para subatividades.
 * Regra: parentWbs + "." + (maior sufixo numérico encontrado entre irmãos + 1).
 * Se nenhum irmão tiver código, começa em 1.
 */
export function getNextSubWbs(parentWbs: string | null | undefined, siblingWbs: (string | null | undefined)[]): string | null {
  const parent = (parentWbs || "").trim();
  if (!parent) return null;
  const prefix = parent + ".";
  let max = 0;
  for (const s of siblingWbs) {
    if (!s) continue;
    const code = String(s).trim();
    if (!code.startsWith(prefix)) continue;
    const tail = code.slice(prefix.length);
    // pega apenas o primeiro segmento após o pai (caso existam netos no array)
    const first = tail.split(".")[0];
    const n = parseInt(first, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}
