#!/usr/bin/env node
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-kanban-card");

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

const { podeMutarAtividade, podeExcluirAtividade, souResponsavelDeAncestralNaArvore } = compilar();

const RESP = { id: "id-resp", fullName: "E2E Resp", email: "resp@ex.com" };
const PART = { id: "id-part", fullName: "E2E Part", email: "part@ex.com" };
const OUTRO = { id: "id-outro", fullName: "Outra Pessoa", email: "outro@ex.com" };
const PROJETO_ALHEIO = { owner: "Lider do Projeto", manager: "Gestor do Projeto" };

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m\u2713" : "\x1b[31m\u2717"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nDEFEITOS DO CARD DO KANBAN (04/09/2026)\n");

// ---------------------------------------------------------------------------
// CENARIO 1 (teste 1.1.1 / 3.2): A.1, RESP e responsavel do ANCESTRAL (A),
// nao tem vinculo direto com A.1. podeMutarAtividade tem que enxergar isso.
// ---------------------------------------------------------------------------
const A = { id: "A", parent_id: null, assigned_to_id: "id-resp", assigned_to: "E2E Resp" };
const A1 = { id: "A1", parent_id: "A", assigned_to_id: null, assigned_to: null, participants: [] };
const porId = new Map([["A", A], ["A1", A1]]);

const souAncestralResp = souResponsavelDeAncestralNaArvore(A1, porId, RESP);
check("souResponsavelDeAncestralNaArvore reconhece RESP como responsavel de A (ancestral de A1)", souAncestralResp === true);

const a1ComSinal = { ...A1, souResponsavelDeAncestral: souAncestralResp };
const mutaA1 = podeMutarAtividade(a1ComSinal, PROJETO_ALHEIO, { ...RESP, naEquipe: false });
check("RESP MOVE/edita A.1 (drag do Kanban) mesmo sem vinculo direto", mutaA1 === true);

const excluiA1 = podeExcluirAtividade(a1ComSinal, PROJETO_ALHEIO, { ...RESP, naEquipe: false });
check("RESP EXCLUI (arquiva) A.1 pela subarvore", excluiA1 === true);

// Sem o sinal de subarvore (comportamento ANTIGO/quebrado), tem que FALHAR --
// prova de que o bug era real antes da correcao.
const mutaA1SemSinal = podeMutarAtividade(A1, PROJETO_ALHEIO, { ...RESP, naEquipe: false });
check("(regressao) SEM o sinal de subarvore, RESP NAO move A.1 -- prova do bug original", mutaA1SemSinal === false);

// ---------------------------------------------------------------------------
// CENARIO 2 (teste 2.6): B, PART e so PARTICIPANTE (nao responsavel) de B.
// canDelete tem que ser false -- participante nao arquiva.
// ---------------------------------------------------------------------------
const B = { id: "B", parent_id: null, assigned_to_id: "id-outro", assigned_to: "Outra Pessoa", participants: ["id-part"], participant_ids: ["id-part"] };
const excluiBComoPart = podeExcluirAtividade(B, PROJETO_ALHEIO, { ...PART, naEquipe: false, canEditOwn: true });
check("PARTICIPANTE (sem ser responsavel) NAO exclui/arquiva B", excluiBComoPart === false);

const mutaBComoPart = podeMutarAtividade(B, PROJETO_ALHEIO, { ...PART, naEquipe: false, canEditOwn: true });
check("(nao regrediu) PARTICIPANTE continua podendo MOVER a propria B", mutaBComoPart === true);

// ---------------------------------------------------------------------------
// CENARIO 3 (teste 4.1): papel "Editar tudo" (canEdit/canMove=true, sem
// canDelete). Nunca teve exclusao -- so mover/editar.
// ---------------------------------------------------------------------------
const editaTudo = { id: "id-editor-tudo", fullName: "E2E Editor Tudo", email: "editor@ex.com", canEdit: true, canMove: true, canDelete: false, naEquipe: true };
const excluiComoEditarTudo = podeExcluirAtividade(B, PROJETO_ALHEIO, editaTudo);
check("papel \"Editar tudo\" (sem canDelete) NAO exclui/arquiva", excluiComoEditarTudo === false);

const mutaComoEditarTudo = podeMutarAtividade(B, PROJETO_ALHEIO, editaTudo);
check("(nao regrediu) \"Editar tudo\" continua podendo MOVER/editar", mutaComoEditarTudo === true);

// ---------------------------------------------------------------------------
// CONTROLE: membro com canDelete=true continua excluindo (nao regressao).
// ---------------------------------------------------------------------------
const criarExcluir = { id: "id-criar-excluir", fullName: "E2E Criar Excluir", email: "criarexcluir@ex.com", canEdit: true, canMove: true, canDelete: true, naEquipe: true };
const excluiComoCriarExcluir = podeExcluirAtividade(B, PROJETO_ALHEIO, criarExcluir);
check("(controle) papel \"Criar e excluir\" (canDelete=true) continua excluindo", excluiComoCriarExcluir === true);

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
