#!/usr/bin/env node
/**
 * O MARCO SÓ DEVE A DATA — guarda de `lib/prontidao`.
 *
 * Marco é ponto no tempo: não tem responsável, esforço, custo nem GUT. "Não
 * tem" é diferente de "está vazio", e a diferença tem consequência prática:
 * cobrar do marco um campo que ele não pode ter cria uma pendência que **nunca
 * fecha**, e o item fica para sempre na lista de incompletos — poluindo
 * exatamente a fila que existe para organizar trabalho.
 *
 * Medido em 26/08/2026: dos 53 marcos vivos, **42 estavam sem responsável** e
 * eram contados como incompletos por causa disso.
 *
 * Roda o CÓDIGO REAL, compilado na hora — não uma reimplementação da regra.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const saida = path.join(raiz, "node_modules", ".cache", "verificar-prontidao");

fs.mkdirSync(saida, { recursive: true });

const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(
    process.execPath,
    [tsc, "src/lib/prontidao.ts", "--outDir", saida, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" },
  );
} catch (e) {
  // tsc devolve não-zero por erro de tipo em arquivo solto; se o .js saiu, segue.
  if (!fs.existsSync(path.join(saida, "prontidao.js"))) {
    console.error("não foi possível compilar lib/prontidao.ts");
    console.error(String(e.stdout || e.message).slice(0, 800));
    process.exit(1);
  }
}

const { avaliarProntidao } = require(path.join(saida, "prontidao.js"));

let ok = 0;
let falhou = 0;
const check = (nome, condicao) => {
  console.log(`  ${condicao ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  condicao ? ok++ : falhou++;
};

console.log("\nO MARCO SÓ DEVE A DATA\n");

// ── Marco ─────────────────────────────────────────────────────────────────
const marcoComData = avaliarProntidao(
  { is_milestone: true, end_date: "2026-09-01", assigned_to: null, hours: null, gravity: null, description: null },
);
check(
  "marco COM data está pronto, mesmo sem responsável, horas, GUT e descrição",
  marcoComData.pronta === true && marcoComData.faltando.length === 0,
);

const marcoSemData = avaliarProntidao(
  { is_milestone: true, end_date: null, assigned_to: null, hours: null, gravity: null, description: null },
);
check(
  "marco SEM data não está pronto — a data é o campo dele",
  marcoSemData.pronta === false && marcoSemData.faltando.includes("prazo"),
);
check(
  "e a ÚNICA carência do marco sem data é o prazo",
  marcoSemData.faltando.length === 1,
);

for (const campo of ["responsavel", "prioridade", "estimativa", "descricao"]) {
  check(
    `marco nunca é cobrado por "${campo}"`,
    !marcoSemData.faltando.includes(campo) && !marcoComData.faltando.includes(campo),
  );
}

check(
  "marco continua avaliável (não some da conta de prontidão)",
  marcoComData.avaliavel === true && marcoSemData.avaliavel === true,
);

// ── Atividade: a régua NÃO afrouxou ───────────────────────────────────────
const atividadeVazia = avaliarProntidao(
  { is_milestone: false, end_date: null, assigned_to: null, hours: null, gravity: null, description: null },
);
for (const campo of ["responsavel", "prazo", "prioridade", "estimativa", "descricao"]) {
  check(
    `atividade vazia continua sendo cobrada por "${campo}"`,
    atividadeVazia.faltando.includes(campo),
  );
}

const atividadeCompleta = avaliarProntidao(
  { is_milestone: false, end_date: "2026-09-01", assigned_to: "Fulano", hours: 8, gravity: 4, description: "algo" },
);
check(
  "atividade completa está pronta",
  atividadeCompleta.pronta === true,
);

// ── Agrupador e concluída seguem fora da avaliação ────────────────────────
const agrupador = avaliarProntidao({ is_milestone: false, status: "pending" }, true);
check(
  "item com filhas não é avaliado (horas e datas dele são rollup)",
  agrupador.avaliavel === false && agrupador.pronta === true,
);

const concluida = avaliarProntidao({ is_milestone: false, status: "completed" });
check(
  "concluída não é avaliada — não há o que preparar",
  concluida.avaliavel === false,
);

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
