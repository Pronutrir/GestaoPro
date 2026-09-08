#!/usr/bin/env node
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-eap-codigo");

function compilar() {
  fs.mkdirSync(SAIDA, { recursive: true });
  let erro = "";
  try {
    const tsc = path.join(RAIZ, "node_modules", "typescript", "bin", "tsc");
    execFileSync(process.execPath, [tsc,
      "src/lib/eapModel.ts",
      "--outDir", SAIDA, "--module", "commonjs", "--target", "es2019",
      "--moduleResolution", "node", "--skipLibCheck"],
      { cwd: RAIZ, stdio: "pipe" });
  } catch (e) { erro = String((e && (e.stdout || e.message)) || ""); }
  const alvo = path.join(SAIDA, "eapModel.js");
  if (!fs.existsSync(alvo)) {
    console.error("FALHOU: nao compilou src/lib/eapModel.ts");
    if (erro) console.error(erro);
    process.exit(1);
  }
  return require(alvo);
}

const { eapProximoCodigoFilho, eapPlanoRenumerarAoMover } = compilar();

let ok = 0, falhou = 0;
function check(nome, cond) {
  if (cond) { ok++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}`); }
}

console.log("\nEAP: PROXIMO CODIGO E RENUMERACAO AO MOVER (04/09/2026)\n");

// CENARIO 1: proximo codigo sob um pai, com irmaos existentes.
check(
  "proximo filho de 1.2.3 com 1.2.3.1 e 1.2.3.2 ocupados -> 1.2.3.3",
  eapProximoCodigoFilho("1.2.3", [{ wbs_code: "1.2.3.1" }, { wbs_code: "1.2.3.2" }]) === "1.2.3.3",
);
check(
  "proximo filho sem irmaos -> 1.2.3.1",
  eapProximoCodigoFilho("1.2.3", []) === "1.2.3.1",
);
check(
  "proximo na RAIZ (sem pai) com 1 e 2 ocupados -> 3",
  eapProximoCodigoFilho(null, [{ wbs_code: "1" }, { wbs_code: "2" }]) === "3",
);

// CENARIO 2 (o achado do reteste do Bloco B): mover "1.3" com filha "1.3.1"
// para dentro de "1.1" (que ja tem 1.1.1, 1.1.2, 1.1.3) -> 1.1.4 + 1.1.4.1.
const itensCenario2 = [
  { id: "pai-1-1", wbs_code: "1.1", parent_id: null },
  { id: "irmao-1", wbs_code: "1.1.1", parent_id: "pai-1-1" },
  { id: "irmao-2", wbs_code: "1.1.2", parent_id: "pai-1-1" },
  { id: "irmao-3", wbs_code: "1.1.3", parent_id: "pai-1-1" },
  { id: "movido", wbs_code: "1.3", parent_id: null },
  { id: "filha-do-movido", wbs_code: "1.3.1", parent_id: "movido" },
  { id: "neta-do-movido", wbs_code: "1.3.1.5", parent_id: "filha-do-movido" },
];
const irmaosDoNovoPai2 = itensCenario2.filter((i) => i.parent_id === "pai-1-1");
const plano2 = eapPlanoRenumerarAoMover("movido", itensCenario2, "1.1", irmaosDoNovoPai2);
const porId2 = Object.fromEntries(plano2.map((p) => [p.id, p.wbs_code]));
check("item movido ganha 1.1.4 (proximo livre sob o novo pai)", porId2["movido"] === "1.1.4");
check("filha segue a mudanca de prefixo: 1.3.1 -> 1.1.4.1", porId2["filha-do-movido"] === "1.1.4.1");
check("neta tambem segue: 1.3.1.5 -> 1.1.4.1.5", porId2["neta-do-movido"] === "1.1.4.1.5");
check("irmaos antigos do novo pai NAO aparecem no plano (nao mudam)", !("irmao-1" in porId2) && !("irmao-2" in porId2) && !("irmao-3" in porId2));

// CENARIO 3: item sem wbs_code nao entra no plano (nada a renumerar).
const itensCenario3 = [
  { id: "sem-codigo", wbs_code: null, parent_id: null },
];
const plano3 = eapPlanoRenumerarAoMover("sem-codigo", itensCenario3, "1.1", []);
check("item sem wbs_code: plano vazio, nao inventa codigo", plano3.length === 0);

// CENARIO 4: mover DOIS itens do mesmo lote para o mesmo novo pai -- nao
// podem colidir no mesmo codigo (a correcao do LinkParentDialog empilha os
// codigos ja usados a cada item do lote).
const itensCenario4 = [
  { id: "movido-a", wbs_code: "2.1", parent_id: null },
  { id: "movido-b", wbs_code: "2.2", parent_id: null },
];
const planoA = eapPlanoRenumerarAoMover("movido-a", itensCenario4, "1.1", []);
const codigoA = planoA.find((p) => p.id === "movido-a").wbs_code;
const planoB = eapPlanoRenumerarAoMover("movido-b", itensCenario4, "1.1", [{ wbs_code: codigoA }]);
const codigoB = planoB.find((p) => p.id === "movido-b").wbs_code;
check("dois itens do mesmo lote recebem codigos DIFERENTES (1.1.1 e 1.1.2)", codigoA === "1.1.1" && codigoB === "1.1.2");

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
