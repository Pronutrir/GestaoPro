import { test, expect, type Page } from "@playwright/test";

/**
 * RESPONSÁVEL SÓ DA EQUIPE, SEM PARTICIPANTES — validação em prod (01/09/2026).
 *
 * Conta de teste: rlgt (0eb3047e), NÃO admin, NÃO membro do projeto 53bae1dd —
 * é só o RESPONSÁVEL de "1.2.3 Cargas" (pela coluna legada assigned_to). Logo
 * tem canAssign (passo 5) e vê o "+", mas o seletor só oferece a EQUIPE.
 *
 * Verifica a regra nova:
 *   - a seção "Participantes" NÃO existe mais (só "Responsáveis");
 *   - o seletor de responsável lista a EQUIPE e NÃO oferece quem é de fora;
 *   - incluir um membro da equipe passa sem toast de permissão (e "vários"
 *     responsáveis é permitido — o índice de um-só saiu); depois remove (limpeza).
 */
const PROJ = process.env.E2E_PROJECT_ID ?? "53bae1dd-908a-4203-bc74-94761d3f78a5";
const ATIV = "55f614aa-fa69-44a8-a2bc-9b2efd6a5265"; // 1.2.3 Cargas (rlgt é responsável)
const MEMBRO = process.env.E2E_TEAM_MEMBER ?? "Admin";       // membro da equipe do projeto
const FORA = process.env.E2E_NONTEAM ?? "Liana Lopes";       // NÃO é da equipe

async function esperarTela(page: Page) {
  await expect(page.locator('div:has(> span:text-is("Responsáveis"))').first())
    .toBeVisible({ timeout: 45_000 });
}
const secaoResponsaveis = (page: Page) =>
  page.locator('div:has(> span:text-is("Responsáveis"))').first();

test("a tela tem só Responsáveis — Participantes saiu", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/project/${PROJ}/atividade/${ATIV}`);
  await esperarTela(page);
  await expect(secaoResponsaveis(page)).toBeVisible();
  await expect(page.getByText("Participantes", { exact: true }),
    "o campo Participantes deveria ter saído da tela").toHaveCount(0);
});

// (o dialog "Editar" vive na página do projeto, que rlgt — só responsável, não
//  membro — não acessa. Ele é validado em e2e/editar-sem-participantes.spec.ts,
//  com uma conta que alcança a página do projeto.)

test("o seletor de responsável só oferece a equipe, e inclui sem toast (vários)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/project/${PROJ}/atividade/${ATIV}`);
  await esperarTela(page);

  const secao = secaoResponsaveis(page);
  // canAssign: existe controle de adicionar (o responsável-só vê o "+")
  expect(await secao.getByRole("button").count(),
    "o responsável deveria ver o controle de adicionar (canAssign)").toBeGreaterThan(0);

  // abre o picker
  await secao.getByRole("button").last().click();
  const busca = page.getByPlaceholder("buscar pessoa…");
  await expect(busca).toBeVisible();

  // NEGATIVO: quem é de fora da equipe NÃO aparece
  await busca.fill(FORA.split(" ")[0]);
  await expect(page.getByRole("listitem").filter({ hasText: FORA }),
    `"${FORA}" é de fora da equipe e não pode ser oferecido`).toHaveCount(0);

  // POSITIVO: um membro da equipe aparece e entra sem toast de permissão
  await busca.fill(MEMBRO);
  const opcao = page.getByRole("listitem").filter({ hasText: MEMBRO }).first();
  await expect(opcao, `"${MEMBRO}" (equipe) deveria aparecer`).toBeVisible({ timeout: 10_000 });
  await opcao.click();

  await expect(page.getByText(/sem permiss|Não deu para atribuir/i)).toHaveCount(0, { timeout: 6_000 });
  await expect(secao.getByText(MEMBRO, { exact: false })).toBeVisible({ timeout: 10_000 });

  // LIMPEZA — remove o responsável recém-incluído
  const chip = secao.locator("span.group", { hasText: MEMBRO }).first();
  await chip.hover();
  await chip.getByRole("button").first().click();
  await expect(secao.getByText(MEMBRO, { exact: false })).toHaveCount(0, { timeout: 10_000 });
});
