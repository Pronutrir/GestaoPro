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

  /**
   * A RAIZ JÁ ESTÁ OCUPADA POR UM IRMÃO DE TOPO (ex.: uma fase criada antes da
   * convenção mudar, com código "1" em vez de "1.1") — achado em 09/09/2026.
   *
   * Sem esta checagem, o ramo abaixo tratava TODO item de topo como filho da
   * raiz e chamava getNextSubWbs("1", siblingWbs). Mas os siblings aqui são
   * outros itens de TOPO (parent_id null), não os FILHOS de quem já tem
   * código "1" — então a função nunca via que "1.1" já pertencia a uma
   * subatividade (filha de "1" por parent_id, não por ser sibling de topo) e
   * devolvia "1.1" de novo, duplicando o código EAP entre duas atividades
   * diferentes (achado do plano de teste E2E de 09/09/2026).
   *
   * Se um irmão de topo já ocupa literalmente o código da raiz, esta EAP
   * ainda está na convenção antiga (fase = inteiro solto, sem o projeto
   * contado). Nesse caso o próximo item de topo é IRMÃO dessa fase, não
   * filho — cai na "convenção antiga" abaixo, que devolve o próximo inteiro
   * livre (ex.: "2"), nunca "1.x".
   */
  const raizJaOcupadaPorIrmaoDeTopo =
    !!raiz && siblingWbs.some((s) => !!s && String(s).trim() === raiz);
  if (raiz && !raizJaOcupadaPorIrmaoDeTopo) {
    return getNextSubWbs(raiz, siblingWbs) || `${raiz}.1`;
  }

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
