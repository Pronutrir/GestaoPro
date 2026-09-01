import { test as setup, expect } from "@playwright/test";

/**
 * Loga uma vez com email+senha e salva a sessão em e2e/.auth/user.json.
 * Os testes reusam esse storageState — não relogam a cada spec.
 *
 * A conta vem de E2E_EMAIL / E2E_PASSWORD (nunca hardcodada no repo).
 */
const AUTH_FILE = "e2e/.auth/user.json";

setup("autentica e salva a sessão", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Defina E2E_EMAIL e E2E_PASSWORD (conta real) — o app autentica contra produção.",
    );
  }

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  // Login bem-sucedido: sai da /login. O toast "Login realizado" e o push("/")
  // acontecem juntos; esperamos a URL deixar de ser /login.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  await page.context().storageState({ path: AUTH_FILE });
});
