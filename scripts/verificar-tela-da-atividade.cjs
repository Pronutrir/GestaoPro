#!/usr/bin/env node
/**
 * FASE 07 — a tela única: quem edita o quê, e o que "salvo" significa.
 *
 *   node scripts/verificar-tela-da-atividade.cjs
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-tela");

function compilar() {
  fs.mkdirSync(SAIDA, { recursive: true });
  let erro = "";
  try {
    const tsc = path.join(RAIZ, "node_modules", "typescript", "bin", "tsc");
    execFileSync(process.execPath, [tsc, "src/lib/telaDaAtividade.ts",
      "--outDir", SAIDA, "--module", "commonjs", "--target", "es2019",
      "--moduleResolution", "node", "--skipLibCheck"],
      { cwd: RAIZ, stdio: "pipe" });
  } catch (e) { erro = String((e && (e.stdout || e.message)) || ""); }
  const alvo = path.join(SAIDA, "telaDaAtividade.js");
  if (!fs.existsSync(alvo)) {
    console.error("FALHOU: não compilou src/lib/telaDaAtividade.ts");
    if (erro) console.error(erro);
    process.exit(1);
  }
  return require(alvo);
}

const T = compilar();

const SO_EXECUCAO = { canView: true, canEditExecucao: true };
const SO_PLANEJA  = { canView: true, canEditPlanejamento: true };
const TUDO        = { canView: true, canEditExecucao: true, canEditPlanejamento: true, canAssign: true };
const SO_LEITURA  = { canView: true };

const CASOS = [
  // ── execução × planejamento: a divisão que organiza a tela ──
  ["quem edita execução muda o status",
    () => T.modoDoCampo("status", SO_EXECUCAO), "editavel"],
  ["quem edita execução NÃO muda o custo",
    () => T.modoDoCampo("custo", SO_EXECUCAO), "texto"],
  ["quem edita execução NÃO muda o GUT",
    () => T.modoDoCampo("gut", SO_EXECUCAO), "texto"],
  ["quem planeja muda o custo",
    () => T.modoDoCampo("custo", SO_PLANEJA), "editavel"],
  ["quem planeja NÃO muda o status (é execução)",
    () => T.modoDoCampo("status", SO_PLANEJA), "texto"],
  ["horas apontadas são execução",
    () => T.modoDoCampo("horas_apontadas", SO_EXECUCAO), "editavel"],
  ["horas previstas são planejamento",
    () => T.modoDoCampo("horas_previstas", SO_EXECUCAO), "texto"],

  // ── sem permissão vira TEXTO, nunca controle desabilitado ──
  ["só leitura: título vira texto",
    () => T.modoDoCampo("titulo", SO_LEITURA), "texto"],
  ["só leitura: status vira texto",
    () => T.modoDoCampo("status", SO_LEITURA), "texto"],
  ["sem canView, tudo some",
    () => T.modoDoCampo("titulo", {}), "oculto"],

  // ── atribuição é a terceira capacidade ──
  ["quem atribui muda o responsável",
    () => T.modoDoCampo("responsavel", TUDO), "editavel"],
  ["sem canAssign, responsável vira texto",
    () => T.modoDoCampo("responsavel", SO_EXECUCAO), "texto"],
  ["observador é sempre editável — não concede nada",
    () => T.modoDoCampo("observadores", SO_LEITURA), "editavel"],

  // ── MARCO: os campos não existem, não ficam vazios ──
  ["marco OCULTA custo (não é 'vazio', é 'não existe')",
    () => T.modoDoCampo("custo", TUDO, { ehMarco: true }), "oculto"],
  ["marco oculta horas previstas",
    () => T.modoDoCampo("horas_previstas", TUDO, { ehMarco: true }), "oculto"],
  ["marco oculta GUT",
    () => T.modoDoCampo("gut", TUDO, { ehMarco: true }), "oculto"],
  ["marco oculta responsável",
    () => T.modoDoCampo("responsavel", TUDO, { ehMarco: true }), "oculto"],
  ["mas marco MANTÉM a data prevista — é o campo dele",
    () => T.modoDoCampo("data_fim_prevista", TUDO, { ehMarco: true }), "editavel"],
  ["e mantém o título",
    () => T.modoDoCampo("titulo", TUDO, { ehMarco: true }), "editavel"],

  // ── pai com filhas: derivado é só leitura ──
  ["pai com filhas: horas viram texto (derivado da fase 09)",
    () => T.modoDoCampo("horas_previstas", TUDO, { temFilhas: true }), "texto"],
  ["pai com filhas: custo vira texto",
    () => T.modoDoCampo("custo", TUDO, { temFilhas: true }), "texto"],
  ["pai com filhas: datas previstas viram texto",
    () => T.modoDoCampo("data_fim_prevista", TUDO, { temFilhas: true }), "texto"],
  ["pai com filhas: o TÍTULO continua editável",
    () => T.modoDoCampo("titulo", TUDO, { temFilhas: true }), "editavel"],
  ["pai com filhas: o status continua editável",
    () => T.modoDoCampo("status", TUDO, { temFilhas: true }), "editavel"],

  // ── Externo não vê custo: é escopo, não permissão ──
  ["externo NÃO VÊ custo, mesmo podendo planejar",
    () => T.modoDoCampo("custo", SO_PLANEJA, { ehExterno: true }), "oculto"],
  ["externo vê o resto normalmente",
    () => T.modoDoCampo("titulo", SO_PLANEJA, { ehExterno: true }), "editavel"],

  // ── a barra de resumo ──
  ["a barra tem oito campos", () => T.CAMPOS_DO_RESUMO.length, 8],
  ["e começa pelo responsável", () => T.CAMPOS_DO_RESUMO[0], "responsavel"],

  // ── a rota ──
  ["a rota da atividade",
    () => T.rotaDaAtividade("p1", "a1"), "/project/p1/atividade/a1"],
  ["e volta a ser lida",
    () => JSON.stringify(T.lerRotaDaAtividade("/project/p1/atividade/a1")),
       JSON.stringify({ projectId: "p1", activityId: "a1" })],
  ["com query string também",
    () => T.lerRotaDaAtividade("/project/p1/atividade/a1?tab=historico").activityId, "a1"],
  ["rota de outra tela devolve null",
    () => T.lerRotaDaAtividade("/project/p1"), null],

  // ── "salvo" só depois de o banco confirmar ──
  ["zero linha afetada é RECUSA, não sucesso",
    () => T.estadoAposEscrita(null, 0), "recusado"],
  ["uma linha afetada é salvo",
    () => T.estadoAposEscrita(null, 1), "salvo"],
  ["erro é erro",
    () => T.estadoAposEscrita(new Error("x"), null), "erro"],
  ["a recusa NÃO diz 'salvo'",
    () => /[Ss]alvo/.test(T.mensagemDeSalvamento("recusado")), false],
  ["a recusa fala de permissão",
    () => /permiss/i.test(T.mensagemDeSalvamento("recusado")), true],
];

let ok = 0, falhou = 0;
console.log("\n  A tela única da atividade — quem edita o quê");
console.log("  (src/lib/telaDaAtividade.ts)\n");

for (const [nome, fn, esperado] of CASOS) {
  let obtido;
  try { obtido = fn(); } catch (e) { obtido = "ERRO: " + e.message; }
  if (obtido === esperado) {
    ok++; console.log("  \x1b[32m✓\x1b[0m " + nome);
  } else {
    falhou++;
    console.log("  \x1b[31m✗\x1b[0m " + nome);
    console.log(`      esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`);
  }
}

console.log("\n  " + ok + " passaram, " + falhou + " falharam\n");
process.exit(falhou > 0 ? 1 : 0);
