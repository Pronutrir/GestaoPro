import { test, expect } from "@playwright/test";

/**
 * O DIALOG "EDITAR" NÃO TEM MAIS ABA PARTICIPANTES (01/09/2026).
 *
 * Roda com uma conta que ALCANÇA a página do projeto (o dialog vive lá). O
 * deep-link /project/{id}?activity={id} abre o EditActivityDialog direto.
 * Alvo: projeto de teste "Teste - Gestão Pro" + uma atividade dele.
 */
const PROJ = process.env.E2E_PROJECT_ID ?? "2e5a562e-d355-4bb5-884a-cc63a4760c2f";
const ATIV = process.env.E2E_ACTIVITY_ID ?? "c04d947a-40b0-4bb9-be88-087864b7b64f";

test("o dialog Editar abre sem a aba Participantes", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/project/${PROJ}?activity=${ATIV}`);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  // a aba Detalhes existe (o dialog é o EditActivityDialog)
  await expect(dialog.getByRole("tab", { name: /Detalhes/i })).toBeVisible({ timeout: 10_000 });
  // e NÃO existe mais aba Participantes
  await expect(dialog.getByRole("tab", { name: /Participantes/i }),
    "o dialog Editar não pode mais ter a aba Participantes").toHaveCount(0);
});
