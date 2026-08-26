#!/usr/bin/env node
/**
 * FASE 08 — o sino: quantos eventos são novos desde a última visita.
 *
 *   node scripts/verificar-sino-do-feed.cjs
 *
 * Roda contra `src/lib/ultimaLeitura.ts` compilado na hora.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-sino");

function compilar() {
  fs.mkdirSync(SAIDA, { recursive: true });
  let erro = "";
  try {
    const tsc = path.join(RAIZ, "node_modules", "typescript", "bin", "tsc");
    execFileSync(process.execPath, [tsc, "src/lib/ultimaLeitura.ts",
      "--outDir", SAIDA, "--module", "commonjs", "--target", "es2019",
      "--moduleResolution", "node", "--skipLibCheck"],
      { cwd: RAIZ, stdio: "pipe" });
  } catch (e) { erro = String((e && (e.stdout || e.message)) || ""); }
  const alvo = path.join(SAIDA, "ultimaLeitura.js");
  if (!fs.existsSync(alvo)) {
    console.error("FALHOU: não compilou src/lib/ultimaLeitura.ts");
    if (erro) console.error(erro);
    process.exit(1);
  }
  return require(alvo);
}

const { contarNovos } = compilar();

const T = (h) => `2026-08-26T${String(h).padStart(2, "0")}:00:00.000Z`;
const VISITA = T(12);

const CASOS = [
  ["conta só o que veio depois da visita",
    () => contarNovos([T(10), T(11), T(13), T(14)], VISITA), 2],
  ["nada depois da visita = zero",
    () => contarNovos([T(10), T(11)], VISITA), 0],
  ["tudo depois da visita conta tudo",
    () => contarNovos([T(13), T(14), T(15)], VISITA), 3],

  // A regra que evita o sino virar ruído
  ["SEM visita registrada devolve 0 (atividade nova não grita)",
    () => contarNovos([T(13), T(14)], null), 0],

  ["o próprio evento não conta (ignorar)",
    () => contarNovos([T(13), T(14)], VISITA, (i) => i === 0), 1],
  ["se tudo é do próprio usuário, zero",
    () => contarNovos([T(13), T(14)], VISITA, () => true), 0],

  // Bordas
  ["lista vazia = zero",
    () => contarNovos([], VISITA), 0],
  ["datas nulas são ignoradas",
    () => contarNovos([null, undefined, T(13)], VISITA), 1],
  ["visita inválida devolve 0, não NaN",
    () => contarNovos([T(13)], "não é data"), 0],
  ["data inválida na lista não quebra",
    () => contarNovos(["xx", T(13)], VISITA), 1],
  ["evento no MESMO instante da visita não conta (estritamente depois)",
    () => contarNovos([VISITA], VISITA), 0],
];

let ok = 0, falhou = 0;
console.log("\n  O sino do feed — novos desde a última visita");
console.log("  (src/lib/ultimaLeitura.ts)\n");

for (const [nome, fn, esperado] of CASOS) {
  let obtido;
  try { obtido = fn(); } catch (e) { obtido = "ERRO: " + e.message; }
  if (obtido === esperado) {
    ok++; console.log("  \x1b[32m✓\x1b[0m " + nome);
  } else {
    falhou++;
    console.log("  \x1b[31m✗\x1b[0m " + nome);
    console.log(`      esperado ${esperado}, obtido ${obtido}`);
  }
}

console.log("\n  " + ok + " passaram, " + falhou + " falharam\n");
process.exit(falhou > 0 ? 1 : 0);
