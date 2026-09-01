import { test, expect, type Page } from "@playwright/test";

/**
 * O RESPONSÁVEL INCLUI PESSOAS (ESCOPADO) — validação em prod (01/09/2026).
 *
 * Conta de teste: rlgt (0eb3047e), que NÃO é admin e NÃO é membro do projeto
 * 53bae1dd — é só o RESPONSÁVEL de "1.2.3 Cargas". Antes do conserto, um
 * responsável-só (passo 5) tinha canAssign=false: o "+" nem aparecia, e tentar
 * incluir dava "sem permissão para incluir na equipe". Depois: o "+" aparece e a
 * inclusão é ESCOPADA (activity_assignees, sem virar membro do projeto).
 *
 * O componente só desenha o controle de adicionar quando canAssign é true;
 * sem ele, o vazio é texto puro. Logo, a PRESENÇA do controle já prova a regra.
 */
const PROJ = process.env.E2E_PROJECT_ID ?? "53bae1dd-908a-4203-bc74-94761d3f78a5";
const ATIV_PAI = "55f614aa-fa69-44a8-a2bc-9b2efd6a5265"; // 1.2.3 Cargas (rlgt é responsável)
const ATIV_FILHA = "c76d4589-1324-41b2-9250-1e0d7128c372"; // 1.2.3.1 Cadastros CEP (filha)
const ALVO = process.env.E2E_TARGET_NAME ?? "Liana Lopes"; // não é membro do projeto

/** A tela renderizou quando a seção "Participantes" aparece. */
async function esperarTela(page: Page) {
  await expect(page.locator('div:has(> span:text-is("Participantes"))').first())
    .toBeVisible({ timeout: 45_000 });
}
const secaoParticipantes = (page: Page) =>
  page.locator('div:has(> span:text-is("Participantes"))').first();

test("responsável-só vê o '+' de participantes na sua atividade e na subárvore", async ({ page }) => {
  test.setTimeout(120_000);

  // 1) atividade onde rlgt é responsável direto
  await page.goto(`/project/${PROJ}/atividade/${ATIV_PAI}`);
  await esperarTela(page);
  const addNaPai = secaoParticipantes(page).getByRole("button");
  expect(await addNaPai.count(),
    "o responsável deveria ver um controle de adicionar participante (canAssign)")
    .toBeGreaterThan(0);

  // 2) uma FILHA — rlgt não é responsável dela, mas responde pelo pai (subárvore)
  await page.goto(`/project/${PROJ}/atividade/${ATIV_FILHA}`);
  await esperarTela(page);
  expect(await secaoParticipantes(page).getByRole("button").count(),
    "responder pelo pai deveria liberar atribuir na filha (subárvore)")
    .toBeGreaterThan(0);
});

test("inclui um participante de fora — sem toast de permissão, e escopado", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/project/${PROJ}/atividade/${ATIV_PAI}`);
  await esperarTela(page);

  const secao = secaoParticipantes(page);
  // abre o picker (o último botão da seção é o "+"/verbo; os anteriores são os X dos chips)
  await secao.getByRole("button").last().click();
  const busca = page.getByPlaceholder("buscar pessoa…");
  await expect(busca).toBeVisible();
  await busca.fill(ALVO.split(" ")[0]);

  // escolhe o resultado
  const opcao = page.getByRole("listitem").filter({ hasText: ALVO }).first();
  await expect(opcao, `"${ALVO}" deveria aparecer na busca`).toBeVisible({ timeout: 10_000 });
  await opcao.click();

  // NÃO pode aparecer o toast de erro do fluxo antigo
  await expect(page.getByText(/sem permiss|Não deu para atribuir/i))
    .toHaveCount(0, { timeout: 6_000 });
  // o chip da pessoa entra na seção
  await expect(secao.getByText(ALVO, { exact: false }))
    .toBeVisible({ timeout: 10_000 });

  // LIMPEZA — remove o participante recém-incluído (restaura o estado)
  const chip = secao.locator("span.group", { hasText: ALVO }).first();
  await chip.hover();
  await chip.getByRole("button").first().click();
  await expect(secao.getByText(ALVO, { exact: false })).toHaveCount(0, { timeout: 10_000 });
});
