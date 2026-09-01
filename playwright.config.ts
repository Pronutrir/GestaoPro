import { defineConfig, devices } from "@playwright/test";

/**
 * PLAYWRIGHT — teste da persistência de aba no F5 (relato de 01/09/2026).
 *
 * O app não tem backend local: o .env aponta para produção
 * (https://gestaopro.pronutrir.com.br). Então este teste precisa de:
 *   - E2E_BASE_URL   onde o app roda (padrão http://localhost:3000, via `npm run dev`)
 *   - E2E_EMAIL      conta real para logar
 *   - E2E_PASSWORD   senha dessa conta
 *   - E2E_PROJECT_ID (opcional) projeto a abrir; sem ele, usa o primeiro da lista
 *
 * Roda: npx playwright test        (usa o storageState salvo pelo setup)
 */
// Porta 3000 nesta máquina está ocupada (VS Code/Grafana). Fixamos uma porta
// própria e NÃO reusamos servidor alheio — senão o teste conversa com o Grafana.
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3123";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  // Só sobe o dev server quando o teste vai rodar contra localhost; se
  // E2E_BASE_URL apontar para um host remoto, não tenta subir nada.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- -p 3123",
        url: "http://localhost:3123/login",
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
