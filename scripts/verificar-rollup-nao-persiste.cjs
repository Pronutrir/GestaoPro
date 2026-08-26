#!/usr/bin/env node
/**
 * GUARDA: o cliente não pode PERSISTIR agregado derivado do pai.
 *
 * Contexto (achado no inventário de 25/08/2026):
 *
 *   `EditActivityDialog` gravava `hours` e `cost` do pai com a soma de
 *   `ownSubActivities` — uma lista vinda de um `select` que PASSA PELA RLS.
 *   Quem enxergasse 1 de 8 subatividades gravava no banco o total daquela
 *   única filha; as outras 7 sumiam da conta, sem clique e sem rastro.
 *
 *   Eram DOIS caminhos: um `useEffect` que gravava sozinho ao abrir o
 *   diálogo, e o payload do salvar explícito.
 *
 * Este verificador é textual de propósito — não há framework de teste no
 * projeto, e o que precisa ser travado é a FORMA da escrita, não um valor de
 * retorno. Roda com o Node que o projeto já usa:
 *
 *   node scripts/verificar-rollup-nao-persiste.cjs
 *
 * A regra de exibição (pai com filhas mostra a soma) continua valendo — o que
 * este arquivo proíbe é gravar essa soma. A derivação de verdade é a fase 09,
 * no servidor, sobre a árvore inteira.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const ALVO = path.join(RAIZ, "src", "components", "EditActivityDialog.tsx");

const fonte = fs.readFileSync(ALVO, "utf8");
// Comentários explicam o defeito e citam os nomes; olhar só o código executável
// evita que a própria explicação dispare o alarme.
const codigo = fonte
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

const CASOS = [
  {
    nome: "não existe update({ hours: <soma das subs> })",
    falhaSe: /update\(\s*\{[^}]*\bhours\s*:\s*subHoursTotal/,
    porque: "voltou o useEffect que persistia o rollup de horas",
  },
  {
    nome: "não existe update({ cost: <soma das subs> })",
    falhaSe: /update\(\s*\{[^}]*\bcost\s*:\s*subCostTotal/,
    porque: "voltou o useEffect que persistia o rollup de custo",
  },
  {
    nome: "o payload do salvar não escreve hours quando há filhas",
    falhaSe: /\bhours\s*:\s*hasSubActivities\s*\?\s*subHoursTotal/,
    porque: "o salvar explícito voltou a gravar a soma parcial",
  },
  {
    nome: "o payload do salvar não escreve cost quando há filhas",
    falhaSe: /\bcost\s*:\s*hasSubActivities\s*\?\s*subCostTotal/,
    porque: "o salvar explícito voltou a gravar a soma parcial",
  },
];

// Contraprova: se estes sumirem, o teste virou decorativo — ele estaria
// passando porque as variáveis deixaram de existir, não porque a regra vale.
const PRECISAM_EXISTIR = [
  { nome: "subHoursTotal ainda é calculado (exibição)", re: /const\s+subHoursTotal\s*=/ },
  { nome: "subCostTotal ainda é calculado (exibição)", re: /const\s+subCostTotal\s*=/ },
  { nome: "o salvar omite hours com filhas", re: /hours\s*:\s*hasSubActivities\s*\?\s*undefined/ },
  { nome: "o salvar omite cost com filhas", re: /cost\s*:\s*hasSubActivities\s*\?\s*undefined/ },
];

let ok = 0, falhou = 0;
console.log("\n  O cliente não persiste agregado do pai");
console.log("  (src/components/EditActivityDialog.tsx)\n");

for (const c of CASOS) {
  if (c.falhaSe.test(codigo)) {
    falhou++;
    console.log("  \x1b[31m✗\x1b[0m " + c.nome);
    console.log("      " + c.porque);
  } else {
    ok++;
    console.log("  \x1b[32m✓\x1b[0m " + c.nome);
  }
}

for (const c of PRECISAM_EXISTIR) {
  if (c.re.test(codigo)) {
    ok++;
    console.log("  \x1b[32m✓\x1b[0m " + c.nome);
  } else {
    falhou++;
    console.log("  \x1b[31m✗\x1b[0m " + c.nome);
    console.log("      o alvo mudou de forma — reveja este verificador antes de confiar nele");
  }
}

console.log("\n  " + ok + " passaram, " + falhou + " falharam\n");
process.exit(falhou > 0 ? 1 : 0);
