#!/usr/bin/env node
/**
 * FASE 09 — o agregado do pai, contra o código real.
 *
 *   node scripts/verificar-agregado-do-pai.cjs
 *
 * Cobre as regras decididas em 26/08/2026, com atenção ao MARCO:
 * peso zero em horas, custo e progresso — mas DENTRO da janela de datas.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-agregado");

function compilar() {
  fs.mkdirSync(SAIDA, { recursive: true });
  let erro = "";
  try {
    const tsc = path.join(RAIZ, "node_modules", "typescript", "bin", "tsc");
    execFileSync(process.execPath, [tsc, "src/lib/agregadoDoPai.ts",
      "--outDir", SAIDA, "--module", "commonjs", "--target", "es2019",
      "--moduleResolution", "node", "--skipLibCheck"],
      { cwd: RAIZ, stdio: "pipe" });
  } catch (e) { erro = String((e && (e.stdout || e.message)) || ""); }
  const alvo = path.join(SAIDA, "agregadoDoPai.js");
  if (!fs.existsSync(alvo)) {
    console.error("FALHOU: não compilou src/lib/agregadoDoPai.ts");
    if (erro) console.error(erro);
    process.exit(1);
  }
  return require(alvo);
}

const { agregadoDoPai, somarIrmaos, janelaDeDatas } = compilar();

// Um pai derivado pelo servidor: 3 filhas, 24h, janela até o marco.
const PAI = {
  hours: 999, cost: 999, start_date: "2026-09-01", end_date: "2026-09-09",
  status: "pending",
  derived_hours: 24, derived_cost: 3600,
  derived_start: "2026-08-25", derived_end: "2026-09-12",
  derived_progress: 37.5, derived_children: 3,
};
const FOLHA = { hours: 8, cost: 1200, start_date: "2026-09-01", end_date: "2026-09-03", status: "pending" };
const FOLHA_FEITA = { hours: 8, cost: 1200, status: "completed" };
const MARCO = { is_milestone: true, hours: 5, cost: 500, start_date: "2026-09-12", end_date: "2026-09-12", status: "pending" };

const CASOS = [
  // --- o pai usa o que o servidor derivou, NUNCA o valor proprio ---
  ["pai derivado usa derived_hours, e ignora o hours proprio",
    () => agregadoDoPai(PAI).horas, 24],
  ["pai derivado usa derived_cost",
    () => agregadoDoPai(PAI).custo, 3600],
  ["pai derivado marca derivado = true",
    () => agregadoDoPai(PAI).derivado, true],
  ["pai derivado expõe a contagem de filhas",
    () => agregadoDoPai(PAI).filhas, 3],
  ["a janela do pai vem do servidor (vai ate o marco)",
    () => agregadoDoPai(PAI).fim, "2026-09-12"],
  ["progresso vem do servidor",
    () => agregadoDoPai(PAI).progresso, 37.5],

  // --- folha usa o valor dela ---
  ["folha usa as proprias horas",
    () => agregadoDoPai(FOLHA).horas, 8],
  ["folha nao e derivada",
    () => agregadoDoPai(FOLHA).derivado, false],
  ["folha concluida vale 100",
    () => agregadoDoPai(FOLHA_FEITA).progresso, 100],
  ["folha aberta vale 0",
    () => agregadoDoPai(FOLHA).progresso, 0],

  // --- MARCO: peso zero em esforco, presente nas datas ---
  ["marco tem ZERO horas, mesmo com dado antigo no banco",
    () => agregadoDoPai(MARCO).horas, 0],
  ["marco tem ZERO custo",
    () => agregadoDoPai(MARCO).custo, 0],
  ["marco mantem a data (entra na janela do pai)",
    () => agregadoDoPai(MARCO).fim, "2026-09-12"],
  ["marco nao soma horas num conjunto",
    () => somarIrmaos([FOLHA, MARCO]).horas, 8],
  ["marco nao soma custo num conjunto",
    () => somarIrmaos([FOLHA, MARCO]).custo, 1200],
  ["mas o marco ESTENDE a janela do conjunto",
    () => janelaDeDatas([FOLHA, MARCO]).fim, "2026-09-12"],

  // --- soma de irmaos usa o derivado, sem descer na arvore ---
  ["somar irmaos usa o derivado do pai (nao conta neto duas vezes)",
    () => somarIrmaos([PAI, FOLHA]).horas, 32],
  ["janela de um conjunto pega o mais cedo e o mais tarde",
    () => JSON.stringify(janelaDeDatas([PAI, FOLHA])),
       JSON.stringify({ inicio: "2026-08-25", fim: "2026-09-12" })],

  // --- pai concluido vale 100, qualquer que seja o derivado ---
  ["pai concluido vale 100",
    () => agregadoDoPai({ ...PAI, status: "completed" }).progresso, 100],

  // --- bordas ---
  ["item nulo nao quebra",
    () => agregadoDoPai(null).horas, 0],
  ["conjunto vazio soma zero",
    () => somarIrmaos([]).horas, 0],
  ["janela de conjunto vazio e nula",
    () => janelaDeDatas([]).fim, null],
  ["horas em texto com virgula viram numero",
    () => agregadoDoPai({ hours: "7,5" }).horas, 7.5],
  ["derived_children = 0 conta como folha",
    () => agregadoDoPai({ hours: 3, derived_children: 0, derived_hours: 99 }).horas, 3],
];

let ok = 0, falhou = 0;
console.log("\n  Agregado do pai — leitura do que o servidor derivou");
console.log("  (src/lib/agregadoDoPai.ts)\n");

for (const [nome, fn, esperado] of CASOS) {
  let obtido;
  try { obtido = fn(); } catch (e) { obtido = "ERRO: " + e.message; }
  if (obtido === esperado) {
    ok++;
    console.log("  \x1b[32m✓\x1b[0m " + nome);
  } else {
    falhou++;
    console.log("  \x1b[31m✗\x1b[0m " + nome);
    console.log("      esperado " + esperado + ", obtido " + obtido);
  }
}

console.log("\n  " + ok + " passaram, " + falhou + " falharam\n");
process.exit(falhou > 0 ? 1 : 0);
