#!/usr/bin/env node
/**
 * QUEM AGRUPA NA TELA TEM DE AGRUPAR NO BANCO.
 *
 * ============================================================================
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
 *
 * Há duas listas de "quem pode ter filhos", em lugares diferentes:
 *
 *   TELA  `eapCanGroup(resolveEapKind(...))`  — src/lib/eapModel.ts
 *   BANCO `eap_is_group(item_type, ...)`      — migration 20260722160000
 *
 * Enquanto `item_type` era deduzido, elas nunca se encostavam: o banco só via
 * 'fase' e 'atividade', porque era só isso que se gravava. O congelamento
 * (20260827130000) passou a gravar 'entrega' e 'projeto' também — e a lista do
 * banco não os conhecia.
 *
 * O estrago medido antes de aplicar: **1.272 pais** que o trigger passaria a
 * recusar. Ninguém conseguiria criar nem mover uma subatividade sob nenhum
 * deles, e o erro diria "uma entrega não pode conter subitens" — frase que,
 * depois do congelamento, é simplesmente falsa.
 *
 * O TESTE DE PONTO FIXO NÃO PEGA ISSO. O trigger só dispara em escrita; o
 * backfill não insere nem move nada. O defeito só apareceria quando alguém
 * tentasse trabalhar — o pior momento possível para descobrir.
 *
 * Por isso a comparação virou teste: as duas listas têm de concordar, e quem
 * mexer numa vai ser obrigado a olhar a outra.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const raiz = path.join(__dirname, "..");

/* ── a lista da TELA, do código real ─────────────────────────────────────── */
const saida = path.join(raiz, "node_modules", ".cache", "verificar-agrupador");
fs.mkdirSync(saida, { recursive: true });
const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(process.execPath,
    [tsc, "src/lib/eapModel.ts", "--outDir", saida, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" });
} catch (e) {
  if (!fs.existsSync(path.join(saida, "eapModel.js"))) {
    console.error("não foi possível compilar src/lib/eapModel.ts");
    process.exit(1);
  }
}
const { resolveEapKind, eapCanGroup } = require(path.join(saida, "eapModel.js"));

/* ── a lista do BANCO, lida da migration mais recente que a redefine ─────── */
const migDir = path.join(raiz, "supabase", "migrations");
const queDefinem = fs.readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => /FUNCTION\s+public\.eap_is_group/i.test(fs.readFileSync(path.join(migDir, f), "utf8")))
  .filter((f) => !/rollback/i.test(f))
  .sort();

if (queDefinem.length === 0) {
  console.error("nenhuma migration define eap_is_group — a lista do banco não pôde ser lida");
  process.exit(1);
}

const ultima = queDefinem[queDefinem.length - 1];
const sql = fs.readFileSync(path.join(migDir, ultima), "utf8");
// A última ocorrência: uma migration pode citar a versão antiga em comentário.
const todosIn = [...sql.matchAll(/_item_type\s+IN\s*\(([^)]*)\)/gi)];
if (todosIn.length === 0) {
  console.error(`não encontrei a lista IN(...) em ${ultima}`);
  process.exit(1);
}
const doBanco = new Set(
  todosIn[todosIn.length - 1][1]
    .split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean),
);

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nQUEM AGRUPA NA TELA AGRUPA NO BANCO\n");
console.log(`  lista do banco (${ultima}):`);
console.log(`    ${[...doBanco].join(", ")}\n`);

/* ── 1. todo valor que a tela trata como agrupador está na lista ─────────── */
const VALORES = ["projeto", "fase", "entrega", "pacote", "atividade", "historia_usuario", ""];
const CODIGOS = [null, "1", "1.1", "1.1.1", "1.1.1.1", "Anexo A"];

/*
 * A comparação certa é sobre o valor CONGELADO, não sobre qualquer combinação.
 *
 * Depois do congelamento, `item_type` É o papel exibido — foi medido: nas 8.199
 * linhas, gravado e exibido coincidem. Então o que o banco precisa aceitar é o
 * conjunto de valores que `resolveEapKind` pode PRODUZIR como agrupador.
 *
 * Combinações incoerentes ainda podem nascer (gravar 'atividade' num item com
 * código de nível 2 exibe "Fase", porque o nível vence o campo), e para essas o
 * banco recusaria o aninhamento. Não é o que este teste cobra — é o que o
 * item 4 da Fase 1 vai impedir na origem, recusando a troca de tipo que
 * contradiz o nível. Aqui basta garantir que o vocabulário bate.
 */
const produzidos = new Set();
for (const item_type of VALORES) {
  for (const wbs_code of CODIGOS) {
    for (const is_milestone of [false, true]) {
      produzidos.add(resolveEapKind({ item_type, wbs_code, is_milestone }));
    }
  }
}
const agrupadores = [...produzidos].filter((k) => eapCanGroup(k));
const faltando = agrupadores.filter((k) => !doBanco.has(k));

check(
  `todo papel agrupador que resolveEapKind produz (${agrupadores.join(", ")}) é aceito pelo banco`,
  faltando.length === 0,
  faltando.length ? `fora da lista: ${faltando.join(", ")}` : null,
);

/* ── 2. os dois valores que o congelamento introduziu ────────────────────── */
check("'entrega' agrupa no banco (o congelamento grava 1.256 pais assim)",
  doBanco.has("entrega"));
check("'projeto' agrupa no banco (a raiz da EAP tem filhas por definição)",
  doBanco.has("projeto"));

/* ── 3. o legado não pode ter caído fora ─────────────────────────────────── */
check("'fase' continua na lista", doBanco.has("fase"));
check("'pacote' continua na lista (agrupador legado, ainda em dado antigo)",
  doBanco.has("pacote"));
check("'historia_usuario' continua na lista (9 casos reais com subitens)",
  doBanco.has("historia_usuario"));

/* ── 4. e o que NÃO pode agrupar segue de fora ───────────────────────────── */
check("'atividade' NÃO está na lista — folha de trabalho não agrupa por tipo",
  !doBanco.has("atividade"));

/* ── 5. o rollback desfaz na direção certa ───────────────────────────────── */
const rb = path.join(migDir, "20260827130001_congelar_item_type_rollback.sql");
if (fs.existsSync(rb)) {
  const t = fs.readFileSync(rb, "utf8");
  const mIn = [...t.matchAll(/_item_type\s+IN\s*\(([^)]*)\)/gi)];
  const listaRb = mIn.length
    ? new Set(mIn[mIn.length - 1][1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")))
    : new Set();
  check("o rollback devolve eap_is_group à lista antiga",
    listaRb.has("fase") && !listaRb.has("entrega"));
  check("e confere se sobrou pai inválido depois de reverter",
    /pais ficaram invalidos/i.test(t));
}

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
