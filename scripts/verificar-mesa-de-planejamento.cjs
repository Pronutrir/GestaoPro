#!/usr/bin/env node
/**
 * FASE 06 — as sete decisões da mesa de planejamento, na parte que é regra.
 *
 *   node scripts/verificar-mesa-de-planejamento.cjs
 *
 * A pintura (faixa de grupo, barra flutuante, teclado) não dá para verificar
 * daqui. A REGRA por trás de cada decisão, dá — e é o que este arquivo trava.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-mesa");

function compilar() {
  fs.mkdirSync(SAIDA, { recursive: true });
  let erro = "";
  try {
    const tsc = path.join(RAIZ, "node_modules", "typescript", "bin", "tsc");
    execFileSync(process.execPath, [tsc,
      "src/lib/mesaDePlanejamento.ts", "src/lib/agregadoDoPai.ts",
      "--outDir", SAIDA, "--module", "commonjs", "--target", "es2019",
      "--moduleResolution", "node", "--skipLibCheck"],
      { cwd: RAIZ, stdio: "pipe" });
  } catch (e) { erro = String((e && (e.stdout || e.message)) || ""); }
  const alvo = path.join(SAIDA, "mesaDePlanejamento.js");
  if (!fs.existsSync(alvo)) {
    console.error("FALHOU: não compilou src/lib/mesaDePlanejamento.ts");
    if (erro) console.error(erro);
    process.exit(1);
  }
  fs.writeFileSync(alvo, fs.readFileSync(alvo, "utf8")
    .replace(/@\/lib\/agregadoDoPai/g, "./agregadoDoPai"));
  return require(alvo);
}

const M = compilar();

const FOLHA = { hours: 8, cost: 1200, start_date: "2026-09-01", end_date: "2026-09-03" };
const MARCO = { is_milestone: true, hours: 5, cost: 500, start_date: "2026-09-12", end_date: "2026-09-12" };
const PAI = { derived_hours: 24, derived_cost: 3600, derived_start: "2026-08-25", derived_end: "2026-09-12", derived_children: 3 };

const CASOS = [
  // ── Decisão 3: GUT só colore a partir de 60 ──
  ["GUT 125 é crítico", () => M.faixaDoGut(125), "critico"],
  ["GUT 100 é crítico (limite)", () => M.faixaDoGut(100), "critico"],
  ["GUT 99 é alto", () => M.faixaDoGut(99), "alto"],
  ["GUT 60 é alto (limite)", () => M.faixaDoGut(60), "alto"],
  ["GUT 59 é NEUTRO — não colore", () => M.faixaDoGut(59), "neutro"],
  ["GUT 1 é neutro", () => M.faixaDoGut(1), "neutro"],
  ["GUT nulo é não-avaliado", () => M.faixaDoGut(null), "nao-avaliado"],
  ["GUT zero é não-avaliado", () => M.faixaDoGut(0), "nao-avaliado"],
  ["a faixa neutra NÃO tem cor de GUT",
    () => /gut-/.test(M.corDoGut("neutro")), false],
  ["a faixa crítica TEM cor",
    () => /gut-critico/.test(M.corDoGut("critico")), true],
  ["o rótulo do vazio fala de prioridade, não do campo",
    () => M.ROTULO_GUT_VAZIO, "Prioridade não avaliada"],

  // ── Decisão 5: vazio diz o que falta ──
  ["atividade sem responsável: a definir",
    () => M.comoMostrarVazio(null, "responsavel", false).texto, "a definir"],
  ["MARCO sem responsável: não se aplica (célula vazia)",
    () => M.comoMostrarVazio(null, "responsavel", true).tipo, "nao-se-aplica"],
  ["MARCO sem esforço: não se aplica",
    () => M.comoMostrarVazio(0, "esforco", true).tipo, "nao-se-aplica"],
  ["MARCO SEM DATA é lacuna de verdade, não 'não se aplica'",
    () => M.comoMostrarVazio(null, "data", true).tipo, "a-definir"],
  ["preenchido continua preenchido",
    () => M.comoMostrarVazio("Ana", "responsavel", false).tipo, "preenchido"],

  // ── Decisão 6/7: o resumo do grupo consome o agregado ──
  ["o subtotal ignora as horas do marco",
    () => M.resumoDoGrupo([FOLHA, MARCO]).horas, 8],
  ["mas a janela do grupo vai ATÉ o marco",
    () => M.resumoDoGrupo([FOLHA, MARCO]).fim, "2026-09-12"],
  ["o subtotal usa o derivado do pai, sem descer na árvore",
    () => M.resumoDoGrupo([PAI, FOLHA]).horas, 32],
  ["a contagem é de itens do grupo",
    () => M.resumoDoGrupo([FOLHA, MARCO, PAI]).itens, 3],
  ["grupo vazio não quebra",
    () => M.resumoDoGrupo([]).horas, 0],

  // ── Decisão 4: número à direita, tabular ──
  ["a classe de número tem tabular-nums",
    () => /tabular-nums/.test(M.CLASSE_NUMERO), true],
  ["a classe de número alinha à direita",
    () => /text-right/.test(M.CLASSE_NUMERO), true],
  ["24 horas viram 24h", () => M.formatarHoras(24), "24h"],
  ["7,5 horas usam vírgula", () => M.formatarHoras(7.5), "7,5h"],
  ["zero hora vira vazio, não 0h", () => M.formatarHoras(0), ""],
  ["custo sem R$ em cada linha", () => M.formatarCusto(3600), "3.600"],
  ["custo zero vira vazio", () => M.formatarCusto(0), ""],

  // ── Atraso ──
  ["3 dias de atraso", () => M.diasDeAtraso("2026-09-01", "2026-09-04"), 3],
  ["no prazo é zero", () => M.diasDeAtraso("2026-09-10", "2026-09-04"), 0],
  ["hoje não é atraso", () => M.diasDeAtraso("2026-09-04", "2026-09-04"), 0],
  ["sem data não é atraso", () => M.diasDeAtraso(null, "2026-09-04"), 0],
  ["timestamp completo não quebra a conta",
    () => M.diasDeAtraso("2026-09-01T23:00:00Z", "2026-09-04T01:00:00Z"), 3],

  // ── Decisão 1: sem badge de tipo em atividade ──
  ["atividade NÃO tem badge de tipo",
    () => M.mostrarBadgeDeTipo({}, false), false],
  ["agrupador não tem badge (vira faixa)",
    () => M.mostrarBadgeDeTipo({}, true), false],
  ["MARCO tem, porque se identifica",
    () => M.mostrarBadgeDeTipo({ is_milestone: true }, false), true],

  // ── Presets de coluna ──
  ["quem executa não vê custo",
    () => M.colunasPorPapel("executa").includes("custo"), false],
  ["quem planeja vê custo",
    () => M.colunasPorPapel("planeja").includes("custo"), true],
  ["externo não vê custo nem esforço",
    () => M.colunasPorPapel("externo").some((c) => c === "custo" || c === "esforco"), false],

  // ── Código do marco ──
  ["atividade mostra o próprio código",
    () => M.codigoParaExibir({ wbs_code: "1.1.2" }), "1.1.2"],
  ["MARCO mostra a âncora do pai, nunca um código inventado",
    () => M.codigoParaExibir({ is_milestone: true, wbs_code: null }, "1.1"), "1.1 ·"],
  ["marco sem pai fica sem código, e não inventa",
    () => M.codigoParaExibir({ is_milestone: true, wbs_code: null }), ""],
];

let ok = 0, falhou = 0;
console.log("\n  Mesa de planejamento — as sete decisões, na parte que é regra");
console.log("  (src/lib/mesaDePlanejamento.ts)\n");

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
