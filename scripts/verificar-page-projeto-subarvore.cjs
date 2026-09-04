#!/usr/bin/env node
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-page-subarvore");

function compilar() {
  fs.mkdirSync(SAIDA, { recursive: true });
  let erro = "";
  try {
    const tsc = path.join(RAIZ, "node_modules", "typescript", "bin", "tsc");
    execFileSync(process.execPath, [tsc,
      "src/lib/activityAccess.ts", "src/lib/identityMatch.ts",
      "--outDir", SAIDA, "--module", "commonjs", "--target", "es2019",
      "--moduleResolution", "node", "--skipLibCheck"],
      { cwd: RAIZ, stdio: "pipe" });
  } catch (e) { erro = String((e && (e.stdout || e.message)) || ""); }
  const alvo = path.join(SAIDA, "activityAccess.js");
  if (!fs.existsSync(alvo)) {
    console.error("FALHOU: nao compilou src/lib/activityAccess.ts");
    if (erro) console.error(erro);
    process.exit(1);
  }
  fs.writeFileSync(alvo, fs.readFileSync(alvo, "utf8")
    .replace(/@\/lib\/identityMatch/g, "./identityMatch"));
  return require(alvo);
}

const { podeMutarAtividade, souResponsavelDeAncestralNaArvore } = compilar();

const RESP = { id: "id-resp", fullName: "E2E Resp", email: "resp@ex.com" };
const PROJETO_ALHEIO = { owner: "Lider do Projeto", manager: "Gestor do Projeto" };

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m\u2713" : "\x1b[31m\u2717"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nPAGINA DO PROJETO: OS 4 PORTOES PRECISAM DO SINAL DE SUBARVORE (04/09/2026, reteste 2.4)\n");

// A.1, neto de A (que RESP responde), sem vinculo direto com A.1.
const A = { id: "A", parent_id: null, assigned_to_id: "id-resp", assigned_to: "E2E Resp" };
const A1 = { id: "A1", parent_id: "A", assigned_to_id: null, assigned_to: null, participants: [] };
const porId = new Map([["A", A], ["A1", A1]]);

const souAncestral = souResponsavelDeAncestralNaArvore(A1, porId, RESP);
check("souResponsavelDeAncestralNaArvore reconhece RESP como responsavel de A1 (via A)", souAncestral === true);

// Simula EXATAMENTE o que page.tsx faz agora: injeta o sinal antes de chamar
// podeMutarAtividade -- a mesma funcao usada por editar/concluir/arquivar/reordenar.
const a1ComSinal = { ...A1, souResponsavelDeAncestral: souAncestral };
const resultado = podeMutarAtividade(a1ComSinal, PROJETO_ALHEIO, { ...RESP, naEquipe: false });
check("canMutateActivity(A1) com o sinal injetado = true (arquivar/concluir/editar/reordenar liberados)", resultado === true);

// Prova do bug original: SEM o sinal (como estava antes desta correcao), a
// mesma atividade tinha que dar false -- reproduz exatamente o 403 relatado.
const semSinal = podeMutarAtividade(A1, PROJETO_ALHEIO, { ...RESP, naEquipe: false });
check("(regressao) SEM o sinal, canMutateActivity(A1) = false -- prova do bug do reteste", semSinal === false);

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
