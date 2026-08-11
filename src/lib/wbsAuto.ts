import { eapRootCode } from "./eapModel";

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

/**
 * EAP/WBS automática para itens de TOPO (sem item pai).
 * - Com fase (phaseWbs definido): gera o próximo sob a fase — ex.: fase "2" → 2.1, 2.2...
 *   (reusa getNextSubWbs, tratando a fase como "pai").
 * - Sem fase: gera o próximo código livre na RAIZ da EAP.
 *
 * A raiz depende da convenção. Com o projeto no nível 1 (EAP_PROJECT_LEVEL),
 * "topo" não é mais um inteiro solto: um item de topo é filho do projeto, então
 * o código é "1.<n>" e não "<n>". Emitir inteiros soltos criaria um segundo
 * projeto ao lado do primeiro — um "2" irmão do "1" — e a EAP nasceria achatada
 * já no primeiro item criado à mão.
 *
 * @param phaseWbs   código da fase do item (ou null/"" se não houver)
 * @param siblingWbs códigos dos demais itens no mesmo nível (mesma fase, ou topo sem fase)
 */
export function getNextTopWbs(
  phaseWbs: string | null | undefined,
  siblingWbs: (string | null | undefined)[],
): string {
  const phase = (phaseWbs || "").trim();
  if (phase) {
    return getNextSubWbs(phase, siblingWbs) || `${phase}.1`;
  }

  // Sem fase: o topo pende da raiz da EAP, que é o projeto quando ele está na
  // numeração. `eapRootCode` devolve "1" nesse caso e null na convenção antiga.
  const raiz = eapRootCode();
  if (raiz) return getNextSubWbs(raiz, siblingWbs) || `${raiz}.1`;

  // Convenção antiga: maior inteiro de topo (primeiro segmento) + 1.
  let max = 0;
  for (const s of siblingWbs) {
    if (!s) continue;
    const first = String(s).trim().split(".")[0];
    const n = parseInt(first, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}
