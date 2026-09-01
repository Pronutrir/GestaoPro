#!/usr/bin/env node
/**
 * O RESPONSÁVEL EDITA A SUBÁRVORE (01/09/2026).
 *
 * A matriz dos 108 casos modela o vínculo DIRETO com a atividade
 * (nenhum/participante/responsavel). A subárvore é outra dimensão — "sou
 * responsável de um ANCESTRAL desta atividade" — e é o que este guard trava,
 * contra o código real (capacidadesNaAtividade), espelhando a RLS
 * (eh_descendente_de_atividade_do_responsavel, migration 20260901120000).
 *
 * A regra (decisão do dono do produto): quem responde por um ramo edita o plano
 * E atribui em toda a subárvore. Participante NÃO ganha isso. Excluir, nunca.
 *
 *   node scripts/verificar-responsavel-da-subarvore.cjs
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-subarvore");

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
    console.error("FALHOU: não compilou src/lib/activityAccess.ts");
    if (erro) console.error(erro);
    process.exit(1);
  }
  fs.writeFileSync(alvo, fs.readFileSync(alvo, "utf8")
    .replace(/@\/lib\/identityMatch/g, "./identityMatch"));
  return require(alvo);
}

const { capacidadesNaAtividade } = compilar();

const EU = { id: "id-eu", fullName: "Fulano de Teste", email: "fulano@ex.com" };
const PROJETO_ALHEIO = { owner: "Outra Pessoa", manager: "Terceiro Alguem" };

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nO RESPONSÁVEL EDITA A SUBÁRVORE\n");

// Uma FILHA de que EU não sou ator, mas respondo por um ancestral dela.
const filhaComoResponsavelDeAncestral = {
  created_by: "id-outro",
  assigned_to: "Outra Pessoa",   // o responsável DELA é outro
  participants: [],
  souResponsavelDeAncestral: true, // ...mas eu respondo por um ancestral
};
const cSub = capacidadesNaAtividade(filhaComoResponsavelDeAncestral, PROJETO_ALHEIO,
  { ...EU, naEquipe: false });

check("responsável de um ancestral EDITA a filha (execução)", cSub.canEditExecucao);
check("responsável de um ancestral EDITA o plano da filha", cSub.canEditPlanejamento);
check("responsável de um ancestral ATRIBUI na filha", cSub.canAssign);
check("...decidido no passo 5 (ator/subárvore)", cSub.passoQueDecidiu === "5-ator-da-atividade",
  `passo obtido: ${cSub.passoQueDecidiu}`);
check("...com escopo de leitura atividade_e_trilha", cSub.escopoDeLeitura === "atividade_e_trilha",
  `escopo obtido: ${cSub.escopoDeLeitura}`);
check("mas NÃO exclui (a via do ator não vale para DELETE)", cSub.canDelete === false);
check("e NÃO gerencia a equipe do projeto", cSub.canManageTeam === false);

// PARTICIPANTE de um ancestral NÃO herda nada da subárvore.
const filhaComoParticipanteDeAncestral = {
  created_by: "id-outro",
  assigned_to: "Outra Pessoa",
  participants: [],
  souResponsavelDeAncestral: false, // sou só participante lá em cima
};
const cPart = capacidadesNaAtividade(filhaComoParticipanteDeAncestral, PROJETO_ALHEIO,
  { ...EU, naEquipe: false });
check("participante de um ancestral NÃO edita a filha", cPart.canEditExecucao === false && cPart.canEditPlanejamento === false);
check("participante de um ancestral NÃO atribui na filha", cPart.canAssign === false);
check("participante de um ancestral: sem acesso a esta filha (passo 6)", cPart.passoQueDecidiu === "6-sem-acesso",
  `passo obtido: ${cPart.passoQueDecidiu}`);

// O ATALHO do pai DIRETO (responsavel_do_pai) continua valendo.
const filhaComResponsavelDoPai = {
  created_by: "id-outro",
  assigned_to: null,
  participants: [],
  responsavel_do_pai: "Fulano de Teste",
};
const cPai = capacidadesNaAtividade(filhaComResponsavelDoPai, PROJETO_ALHEIO,
  { ...EU, naEquipe: false });
check("atalho do pai direto (responsavel_do_pai) ainda concede a subárvore", cPai.canAssign && cPai.canEditPlanejamento);

// RESPONSÁVEL da PRÓPRIA atividade (sem ancestral) já vinha coberto pela matriz,
// mas confirmamos que o novo caminho não regrediu esse caso.
const propria = {
  created_by: "id-outro",
  assigned_to: "Fulano de Teste",
  participants: [],
};
const cProp = capacidadesNaAtividade(propria, PROJETO_ALHEIO, { ...EU, naEquipe: false });
check("responsável da própria atividade edita o plano e atribui", cProp.canEditPlanejamento && cProp.canAssign);

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
