#!/usr/bin/env node
/**
 * O PROGRESSO DO PAI VEM DO SERVIDOR — e a régua é a mesma dos dois lados.
 *
 * A decisão foi: **mantém o crédito parcial por coluna**. Então o servidor é
 * que aprendeu a régua da tela (migration 20260826190000), e não o contrário.
 *
 * O que este arquivo trava:
 *   1. `progressoDoPai` troca SÓ o número, preservando paused/label/subs —
 *      o banco não tem esses estados, e perdê-los seria regressão silenciosa.
 *   2. Sem fallback silencioso: derivado nulo mostra ausência, nunca o número
 *      do cliente (que mede a fatia visível, não a árvore).
 *   3. Folha não é afetada: quem não tem filhas segue pela própria coluna.
 *
 * Roda o CÓDIGO REAL, compilado na hora.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const saida = path.join(raiz, "node_modules", ".cache", "verificar-progresso-servidor");
fs.mkdirSync(saida, { recursive: true });

const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(
    process.execPath,
    [tsc, "src/lib/activityProgress.ts", "--outDir", saida, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" },
  );
} catch (e) {
  if (!fs.existsSync(path.join(saida, "activityProgress.js"))) {
    console.error("não foi possível compilar lib/activityProgress.ts");
    process.exit(1);
  }
}
const { progressoDoPai, computeActivityProgress } =
  require(path.join(saida, "activityProgress.js"));

let ok = 0;
let falhou = 0;
const check = (nome, condicao) => {
  console.log(`  ${condicao ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  condicao ? ok++ : falhou++;
};

console.log("\nO PROGRESSO DO PAI VEM DO SERVIDOR\n");

const col = (o) => Object.assign({
  id: "x", title: "", categoria: "andamento", display_order: 1,
  is_final: false, is_blocked: false, is_exception: false,
  contributes_to_progress: true, progress_percent: null,
}, o);

const stages = [
  col({ id: "bk", title: "Backlog", categoria: "backlog", display_order: -1 }),
  col({ id: "ni", title: "Não iniciado", categoria: "a_iniciar", display_order: 0 }),
  col({ id: "em", title: "Em Andamento", categoria: "andamento", display_order: 1 }),
  col({ id: "pe", title: "Pendências", categoria: "espera", display_order: 2 }),
  col({ id: "co", title: "Concluída", categoria: "concluida", display_order: 3, is_final: true, progress_percent: 100 }),
];
const filhas = [
  { id: "a", status: "pending", workflow_stage_id: "em" },
  { id: "b", status: "pending", workflow_stage_id: "bk" },
];

// ── 1. O número vem do servidor ───────────────────────────────────────────
const pai = { workflow_stage_id: "em", derived_children: 2, derived_progress: 77 };
const r = progressoDoPai(pai, stages, filhas, false);
check("o percentual vem de derived_progress", r.percent === 77);

const semServidor = computeActivityProgress("em", stages, null, filhas, false, false);
check(
  "e é DIFERENTE do que o cliente calcularia com a fatia (senão o teste não prova nada)",
  semServidor.percent !== 77,
);

// ── 2. Só o número muda: label/subs sobrevivem ────────────────────────────
check("o label da tela é preservado", r.label === semServidor.label);
check(
  "o contador de subatividades é preservado",
  JSON.stringify(r.subs) === JSON.stringify(semServidor.subs),
);

// ── 3. Sem fallback silencioso ────────────────────────────────────────────
const nulo = progressoDoPai(
  { workflow_stage_id: "em", derived_children: 2, derived_progress: null }, stages, filhas, false,
);
check("derivado nulo num pai vira percent null (ausência)", nulo.percent === null);
check(
  "e NÃO cai no número do cliente",
  nulo.percent !== semServidor.percent,
);

const indefinido = progressoDoPai(
  { workflow_stage_id: "em", derived_children: 2 }, stages, filhas, false,
);
check("coluna não pedida na consulta também vira ausência", indefinido.percent === null);

const lixo = progressoDoPai(
  { workflow_stage_id: "em", derived_children: 2, derived_progress: "nao-e-numero" }, stages, filhas, false,
);
check("valor não numérico vira ausência, não NaN", lixo.percent === null);

// ── 4. Texto numérico do PostgREST é aceito ───────────────────────────────
const texto = progressoDoPai(
  { workflow_stage_id: "em", derived_children: 2, derived_progress: "42" }, stages, filhas, false,
);
check('numeric chega como texto ("42") e é lido', texto.percent === 42);

// ── 5. Folha não é afetada ────────────────────────────────────────────────
const folha = progressoDoPai(
  { workflow_stage_id: "em", derived_children: 0, derived_progress: 99 }, stages, null, false,
);
check(
  "folha ignora derived_progress e segue pela própria coluna",
  folha.percent === computeActivityProgress("em", stages, null, null, false, false).percent,
);

// ── 6. Pausada vence o número ─────────────────────────────────────────────
const stagesPausa = stages.map((s) => (s.id === "em" ? { ...s, is_blocked: true } : s));
const pausado = progressoDoPai(
  { workflow_stage_id: "em", derived_children: 2, derived_progress: 80 }, stagesPausa, filhas, false,
);
check("pausada vence o número do servidor (é estado, não percentual)", pausado.paused === true);
check("e o percentual continua null quando pausada", pausado.percent === null);

// ── 7. Limites ────────────────────────────────────────────────────────────
const acima = progressoDoPai(
  { workflow_stage_id: "em", derived_children: 2, derived_progress: 140 }, stages, filhas, false,
);
check("valor acima de 100 é limitado", acima.percent === 100);
const abaixo = progressoDoPai(
  { workflow_stage_id: "em", derived_children: 2, derived_progress: -5 }, stages, filhas, false,
);
check("valor negativo é limitado a 0", abaixo.percent === 0);

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
