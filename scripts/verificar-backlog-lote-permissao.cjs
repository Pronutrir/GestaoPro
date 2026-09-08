#!/usr/bin/env node
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-backlog-lote-permissao");

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

const { podeMutarAtividade } = compilar();

let ok = 0, falhou = 0;
function check(nome, cond) {
  if (cond) { ok++; console.log(`  ok - ${nome}`); }
  else { falhou++; console.log(`  FALHOU - ${nome}`); }
}

console.log("\nBACKLOG: GATE DE PERMISSAO NAS ACOES EM LOTE (04/09/2026)\n");

const RESP = { id: "id-resp", fullName: "E2E Resp", email: "resp@ex.com" };
const PROJETO_ALHEIO = { owner: "Lider", manager: "Gestor" };

// Cenario exato do achado: e2e-resp responde por A (ramo A -> A1), mas
// seleciona B e C, que estao FORA do ramo dele.
const A = { id: "A", parent_id: null, assigned_to_id: "id-resp", assigned_to: "E2E Resp" };
const B = { id: "B", parent_id: null, assigned_to_id: null, assigned_to: null, participants: [] };
const C = { id: "C", parent_id: null, assigned_to_id: null, assigned_to: null, participants: [] };

// Mesma logica que aplicarEmLote/ligarEmSequencia agora usam: filtra por
// podeMexer antes de gravar.
function filtrarPorPermissao(atividades, usuario) {
  return atividades.filter((a) =>
    podeMutarAtividade(a, PROJETO_ALHEIO, { ...usuario, naEquipe: false }));
}

const selecaoDeResp = filtrarPorPermissao([A, B, C], RESP);
check("RESP: filtro mantem A (responsavel direto)", selecaoDeResp.some((a) => a.id === "A"));
check("RESP: filtro descarta B (fora do alcance)", !selecaoDeResp.some((a) => a.id === "B"));
check("RESP: filtro descarta C (fora do alcance)", !selecaoDeResp.some((a) => a.id === "C"));
check("RESP: sobra so 1 de 3 -- e o que a barra deveria aplicar, nao 3", selecaoDeResp.length === 1);

// Controle: quem edita tudo (isAdmin) nao perde nada no filtro.
const TUDO = { id: "id-tudo", fullName: "E2E Tudo", email: "tudo@ex.com", isAdmin: true };
const selecaoDeTudo = filtrarPorPermissao([A, B, C], TUDO);
check("(controle) admin/editar-tudo mantem os 3", selecaoDeTudo.length === 3);

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
