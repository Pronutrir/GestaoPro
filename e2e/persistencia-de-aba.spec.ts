import { test, expect, type Page } from "@playwright/test";

/**
 * PERSISTÊNCIA DE ABA NO F5 — relato de 01/09/2026:
 * "Estou no Backlog, atualizo a página, e cai sempre no Kanban."
 *
 * A causa era o efeito que grava `?tab=` na URL: no mount, activeTab e
 * visibleTabs são ambos o padrão "kanban"/["kanban"], então a guarda antiga
 * passava e ele gravava `?tab=kanban` por cima do `?tab=backlog` que veio da
 * sessão — ANTES de o efeito de leitura restaurar a aba. Valia para TODA aba
 * ≠ Kanban, não só o Backlog.
 *
 * A barra de abas é um componente custom arrastável (DraggableTabBar): cada aba
 * é um <div onClick>, sem role="tab"; a ATIVA ganha as classes
 * `border-b-2 border-primary`. E as abas VISÍVEIS são preferência por
 * usuário+projeto no localStorage — sessão nova mostra só o Kanban. Por isso o
 * teste SEMEIA as abas visíveis antes de navegar, e dirige por URL (?tab=),
 * que é exatamente o eixo do bug: a aba tem de sobreviver ao mount e ao reload.
 */

/** Rótulos como aparecem na barra (allDefinitions em project/[id]/page.tsx). */
const CANDIDATOS: { value: string; label: string }[] = [
  { value: "kanban", label: "Kanban" },
  { value: "backlog", label: "Backlog" },
  { value: "timeline", label: "Cronograma" },
  { value: "documents", label: "Documentos" },
  { value: "registros", label: "Registros" },
  { value: "tap", label: "TAP" },
  { value: "meetings", label: "Reuniões" },
  { value: "risks", label: "Riscos" },
  { value: "changes", label: "Mudanças" },
  { value: "financials", label: "Financeiro" },
  { value: "lessons", label: "Lições" },
];

async function descobrirProjectId(page: Page): Promise<string> {
  const fromEnv = process.env.E2E_PROJECT_ID;
  if (fromEnv) return fromEnv;

  // Os cards de /projects navegam por router.push, não por <a href> — então
  // não há âncora para ler. Pegamos o id pela resposta de rede: a lista faz
  // GET /rest/v1/projects?select=... e devolve um array com os projetos.
  let achado: string | undefined;
  page.on("response", async (r) => {
    if (achado) return;
    if (!/\/rest\/v1\/projects\?/.test(r.url())) return;
    if (r.request().method() !== "GET" || !r.ok()) return;
    try {
      const body = await r.json();
      if (Array.isArray(body)) {
        const hit = body.find((x) => x && typeof x.id === "string");
        if (hit) achado = hit.id as string;
      }
    } catch {
      /* resposta não-JSON — ignora */
    }
  });

  await page.goto("/projects");
  await expect
    .poll(() => achado, {
      timeout: 30_000,
      message: "a lista /projects não retornou nenhum projeto — defina E2E_PROJECT_ID",
    })
    .toBeTruthy();
  return achado!;
}

/**
 * O userId vem do JWT da sessão — que este app guarda em COOKIES
 * (sb-<ref>-auth-token.0/.1, formato @supabase/ssr: "base64-<...>", possivelmente
 * fatiado), não em localStorage. Reconstrói, decodifica e lê o `sub`.
 */
async function userIdDosCookies(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const chunks = cookies
    .filter((c) => /sb-.*-auth-token\.\d+$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value);
  if (chunks.length === 0) throw new Error("sessão não encontrada nos cookies (login falhou?)");

  let raw = decodeURIComponent(chunks.join(""));
  if (raw.startsWith("base64-")) raw = raw.slice("base64-".length);
  const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const session = JSON.parse(b64(raw)) as { access_token: string };
  const payload = JSON.parse(b64(session.access_token.split(".")[1])) as { sub: string };
  return payload.sub;
}

/**
 * Semeia as abas visíveis no localStorage ANTES de a página carregar — a
 * preferência é por usuário+projeto (project-visible-tabs-<userId>-<projectId>).
 * addInitScript roda a cada navegação (inclusive no reload), mantendo o conjunto
 * estável mesmo se o app tentar encolher.
 */
async function semearAbasVisiveis(page: Page, userId: string, projectId: string, values: string[]) {
  await page.addInitScript(
    ({ key, values }) => {
      try {
        localStorage.setItem(key, JSON.stringify(values));
      } catch {
        /* quota — o teste falha adiante, com mensagem clara */
      }
    },
    { key: `project-visible-tabs-${userId}-${projectId}`, values },
  );
}

/** As abas só renderizam depois de permissionsLoading virar false. */
async function abasRenderizadas(page: Page) {
  await expect(
    page.getByRole("button", { name: "Adicionar visualização" }),
  ).toBeVisible({ timeout: 45_000 });
}

const tabDaUrl = (page: Page) => new URL(page.url()).searchParams.get("tab");

test("cada view continua na mesma aba depois do F5", async ({ page }) => {
  test.setTimeout(300_000); // varre ~11 candidatos + abre e recarrega cada view
  const projectId = await descobrirProjectId(page);
  const userId = await userIdDosCookies(page);
  await semearAbasVisiveis(page, userId, projectId, CANDIDATOS.map((c) => c.value));

  // Abre o projeto e descobre quais views ficaram de fato disponíveis
  // (allowed ∩ semeadas): abrir ?tab=<v> e ver se GRUDOU. Se a view não é
  // permitida, o app reseta para o Kanban e a URL não fica no valor pedido.
  const disponiveis: { value: string; label: string }[] = [];
  for (const c of CANDIDATOS) {
    await page.goto(`/project/${projectId}?tab=${c.value}`);
    await abasRenderizadas(page);
    const grudou = await expect
      .poll(() => tabDaUrl(page), { timeout: 6_000 })
      .toBe(c.value)
      .then(() => true)
      .catch(() => false);
    if (grudou) disponiveis.push(c);
    else console.log(`view "${c.label}" (${c.value}) não disponível neste projeto — pulada`);
  }

  expect(
    disponiveis.map((d) => d.value),
    "esperava ao menos Kanban + Backlog disponíveis após semear",
  ).toEqual(expect.arrayContaining(["kanban", "backlog"]));
  console.log("Views testadas:", disponiveis.map((d) => `${d.label}=${d.value}`).join(", "));

  for (const { value, label } of disponiveis) {
    await test.step(`view "${label}" (?tab=${value}) sobrevive ao F5`, async () => {
      // 1. estar na view (o próprio abrir já exercita o mount que causava o bug)
      await page.goto(`/project/${projectId}?tab=${value}`);
      await abasRenderizadas(page);
      await expect
        .poll(() => tabDaUrl(page), {
          timeout: 12_000,
          message: `abrir ?tab=${value} deveria manter a URL, não cair no Kanban`,
        })
        .toBe(value);
      await expect(
        page.locator("div.border-b-2.border-primary"),
        `a aba ativa ao abrir ?tab=${value} deveria ser "${label}"`,
      ).toContainText(label);

      // 2. o F5
      await page.reload();
      await abasRenderizadas(page);

      // 3. continua na mesma view — na URL E na aba ativa
      await expect
        .poll(() => tabDaUrl(page), {
          timeout: 12_000,
          message: `depois do F5, a URL saiu de ?tab=${value} (o bug jogava tudo pro Kanban)`,
        })
        .toBe(value);
      await expect(
        page.locator("div.border-b-2.border-primary"),
        `depois do F5 a aba ativa deveria seguir "${label}"`,
      ).toContainText(label);
    });
  }
});
