#!/usr/bin/env node
/**
 * A TELA NUNCA PODE OFERECER O QUE O BANCO RECUSA.
 *
 * ============================================================================
 * DUAS PERGUNTAS DIFERENTES, E CONFUNDI-LAS FOI O DEFEITO
 *
 *   "é uma CAIXA?"            eapCanGroup(resolveEapKind(item))
 *                             decide faixa × cartão, ícone, seleção em cascata
 *
 *   "pode TER FILHAS?"        eapPodeSerPai(item)  ←→  eap_is_group() no Postgres
 *                             decide destino de movimentação e "+ Subatividade"
 *
 * Uma Atividade responde **não** à primeira e **sim** à segunda: é trabalho,
 * não caixa, mas pode ter subatividades. Até 27/08/2026 havia uma pergunta só,
 * e ela respondia errado a uma das duas.
 *
 * ============================================================================
 * OS DOIS DEFEITOS QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
 *
 * 1. O congelamento passou a gravar 'entrega' e 'projeto', e `eap_is_group` era
 *    `IN (fase, pacote, historia_usuario)`. Medido: **1.272 pais** que o
 *    trigger passaria a recusar. O teste de ponto fixo não pega — trigger só
 *    dispara em escrita, e o backfill não insere nem move nada.
 *
 * 2. `eapCanMoveInto` dizia "escolha uma fase, entrega ou ATIVIDADE como
 *    destino" enquanto o banco recusava atividade. Divergência **latente**:
 *    ninguém esbarrou porque não havia como criar a situação (zero atividades
 *    com filhas), mas o usuário teria descoberto no clique, com um erro cru.
 *
 * Por isso as duas listas viraram teste: quem mexer numa é obrigado a olhar a
 * outra.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const raiz = path.join(__dirname, "..");

/* ── o lado da TELA, do código real compilado ────────────────────────────── */
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
const { resolveEapKind, eapCanGroup, eapPodeSerPai, eapCanMoveInto } =
  require(path.join(saida, "eapModel.js"));

/* ── o lado do BANCO, lido da migration mais recente que redefine a função ──
 *
 * A regra do banco já teve DUAS FORMAS, e o leitor precisa entender as duas:
 *
 *   LISTA    `_item_type IN ('fase', 'pacote', …)`     — até 27/08/2026
 *   EXCEÇÃO  `NOT COALESCE(_is_milestone, false)`       — desde 27/08/2026
 *
 * Ler só a lista, como a primeira versão deste teste fazia, quebra no dia em
 * que a regra vira exceção — e quebra dizendo "não encontrei a lista", que
 * parece defeito do teste e não mudança de regra.
 */
const migDir = path.join(raiz, "supabase", "migrations");
const queDefinem = fs.readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => /FUNCTION\s+public\.eap_is_group/i.test(fs.readFileSync(path.join(migDir, f), "utf8")))
  .filter((f) => !/rollback/i.test(f))
  .sort();

if (queDefinem.length === 0) {
  console.error("nenhuma migration define eap_is_group — a regra do banco não pôde ser lida");
  process.exit(1);
}

const ultima = queDefinem[queDefinem.length - 1];
const sql = fs.readFileSync(path.join(migDir, ultima), "utf8");

/** O corpo da ÚLTIMA definição de eap_is_group — não os comentários em volta. */
const corpoDaFuncao = (() => {
  const blocos = [...sql.matchAll(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.eap_is_group[\s\S]*?AS\s+\$(\w*)\$([\s\S]*?)\$\1\$/gi,
  )];
  if (blocos.length === 0) return null;
  return blocos[blocos.length - 1][2];
})();

if (corpoDaFuncao === null) {
  console.error(`não consegui ler o corpo de eap_is_group em ${ultima}`);
  process.exit(1);
}

const listaNoCorpo = [...corpoDaFuncao.matchAll(/_item_type\s+IN\s*\(([^)]*)\)/gi)];
const ehExcecao = listaNoCorpo.length === 0;
const doBanco = ehExcecao ? null : new Set(
  listaNoCorpo[listaNoCorpo.length - 1][1]
    .split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean),
);

/** A regra do banco, aplicada a um item — a MESMA forma dos dois lados. */
const bancoAceitaComoPai = (item) => {
  if (item.is_milestone) return false;
  return ehExcecao ? true : doBanco.has(String(item.item_type ?? ""));
};

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nA TELA NUNCA OFERECE O QUE O BANCO RECUSA\n");
console.log(`  regra do banco (${ultima}):`);
console.log(`    ${ehExcecao ? "EXCEÇÃO — todo item agrupa, menos marco" : `LISTA — ${[...doBanco].join(", ")}`}\n`);

/* ── 1. quem é CAIXA na tela precisa poder ser pai no banco ──────────────── */
const VALORES = ["projeto", "fase", "entrega", "pacote", "atividade", "historia_usuario", ""];
const CODIGOS = [null, "1", "1.1", "1.1.1", "1.1.1.1", "Anexo A"];

const caixasRecusadas = [];
for (const item_type of VALORES) {
  for (const wbs_code of CODIGOS) {
    const item = { item_type, wbs_code, is_milestone: false };
    if (eapCanGroup(resolveEapKind(item)) && !bancoAceitaComoPai(item)) {
      caixasRecusadas.push(`${item_type || "(vazio)"} / wbs ${wbs_code ?? "null"}`);
    }
  }
}
check("todo item que a tela desenha como CAIXA é aceito como pai pelo banco",
  caixasRecusadas.length === 0,
  caixasRecusadas.join("; "));

/* ── 2. OS DESTINOS DE MOVIMENTAÇÃO — a segunda lista, item 3 de 27/08 ───── */
console.log("");
const CENARIOS = [
  ["fase",             { item_type: "fase" }],
  ["entrega",          { item_type: "entrega" }],
  ["pacote",           { item_type: "pacote" }],
  ["atividade",        { item_type: "atividade" }],
  ["projeto",          { item_type: "projeto" }],
  ["historia_usuario", { item_type: "historia_usuario" }],
  ["marco",            { item_type: "atividade", is_milestone: true }],
];

for (const [nome, campos] of CENARIOS) {
  const destino = { id: "d", parent_id: null, wbs_code: null, is_milestone: false, ...campos };
  const movido = { id: "m", parent_id: null, item_type: "atividade", wbs_code: null, is_milestone: false };

  const tela = eapCanMoveInto([destino, movido], ["m"], "d").ok;
  const banco = bancoAceitaComoPai(destino);

  check(`destino "${nome}": tela ${tela ? "oferece" : "recusa"}, banco ${banco ? "aceita" : "recusa"}`,
    tela === banco,
    `divergem — a tela ${tela ? "ofereceria um destino que o banco recusa" : "esconde um destino válido"}`);
}

/* ── 3. as duas perguntas são DIFERENTES, e isso é o desenho ─────────────── */
console.log("");
check("uma ATIVIDADE não é caixa — eapCanGroup diz não",
  !eapCanGroup(resolveEapKind({ item_type: "atividade", wbs_code: null, is_milestone: false })));
check("mas PODE ter filhas — eapPodeSerPai diz sim (é o '+ Subatividade')",
  eapPodeSerPai({ is_milestone: false }));
check("marco é o único que nunca tem filha",
  !eapPodeSerPai({ is_milestone: true }) && !bancoAceitaComoPai({ item_type: "atividade", is_milestone: true }));

/* ── 4. o rollback desfaz na direção certa ──────────────────────────────── */
console.log("");
const rb = path.join(migDir, "20260827130001_congelar_item_type_rollback.sql");
if (fs.existsSync(rb)) {
  const t = fs.readFileSync(rb, "utf8");
  check("o rollback devolve eap_is_group à lista antiga",
    /_item_type\s+IN\s*\([^)]*'fase'/i.test(t) && !/_item_type\s+IN\s*\([^)]*'entrega'/i.test(t));
  check("e devolve também as MENSAGENS do trigger",
    /So Pacote ou Fase agrupam/i.test(t));
  check("e confere se sobrou pai inválido depois de reverter",
    /pais ficaram invalidos/i.test(t));
}

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
