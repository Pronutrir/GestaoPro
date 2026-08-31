#!/usr/bin/env node
/**
 * O LOTE QUE DOBRA NA URL — 31/08/2026
 *
 * Relato, com captura: "Dependências não carregaram / As setas e travas do
 * quadro podem faltar" ao recarregar a página.
 *
 * NÃO era migration pendente. `task_dependencies` existe em produção com as
 * três colunas lidas — conferido pelo esquema OpenAPI, sem tocar em dado.
 *
 * A causa é aritmética de URL. `ID_CHUNK = 50` foi calibrado para UM `.in(...)`.
 * As quatro telas de dependência usam `.or(...)` com o MESMO lote em dois
 * filtros, então cada id custa o dobro:
 *
 *     50 ids com um  .in()  -> 1.869 chars   cabe
 *     50 ids com o   .or()  -> 3.742 chars   ESTOURA (limite medido: ~3.700)
 *     25 ids com o   .or()  -> 1.892 chars   cabe, com a folga original
 *
 * Estoura por 42 caracteres. É por isso que o projeto pequeno funcionava e só o
 * grande quebrava — o defeito parecia intermitente.
 *
 * São CINCO chamadas em quatro telas: `ActivityKanban` tem duas — uma para
 * `task_dependencies` e outra para `task_relations`. A segunda quase escapou,
 * porque a primeira varredura parava na primeira ocorrência de cada arquivo
 * (ver a seção 4, que hoje conta em vez de perguntar "existe alguma").
 *
 * Estas asserções travam as duas metades do conserto: o módulo saber dividir, e
 * cada chamada declarar que repete a lista. Uma sem a outra não vale: o
 * parâmetro tem padrão 1, então uma chamada que esqueça de passar 2 volta
 * silenciosamente ao lote que estoura.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");
/** Sem comentários — citar a regra não pode satisfazer a asserção. */
const semComentario = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nO LOTE QUE DOBRA NA URL\n");

/* ── 1. a aritmética, medida e não estimada ──────────────────────────────── */
const UUID = "00000000-0000-4000-8000-000000000000";
const LIMITE = 3700;  // medido no servidor; ver o cabeçalho de lib/chunkedIn.ts
const urlOr = (n) => {
  const l = Array.from({ length: n }, () => UUID).join(",");
  return `or=(predecessor_id.in.(${l}),successor_id.in.(${l}))`.length;
};
check("o lote de 50 com `.or` de fato estoura o limite do proxy",
  urlOr(50) > LIMITE,
  `50 ids -> ${urlOr(50)} chars, limite ${LIMITE}`);
// "Metade do limite, com folga se o host mudar" é o critério declarado no
// cabeçalho de lib/chunkedIn.ts, e o lote de referência — 50 ids num `.in()` só
// — mede 1.869 chars. O lote dividido tem de alcançar o MESMO patamar, e
// alcança: 1.892, a 23 caracteres do original.
//
// O teto é esse patamar mais uma margem, não `LIMITE / 2` exato: 1.850
// reprovaria também o lote de referência, que é justamente o que se considera
// seguro desde a medição de 07/08.
check("e o lote dividido cabe, no mesmo patamar do lote de referência",
  urlOr(25) < 2000,
  `25 ids -> ${urlOr(25)} chars; a referência (50 ids, um filtro) é 1.869`);

/* ── 2. o módulo sabe dividir ────────────────────────────────────────────── */
const chunked = ler("src/lib/chunkedIn.ts");
const chunkedCod = semComentario(chunked);

check("existe uma divisão que leva em conta a repetição na URL",
  /export const chunkIdsFor = <T,>\(items: T\[\], vezesNaUrl: number\)/.test(chunkedCod));
check("ela divide o ID_CHUNK, em vez de baixar o global",
  /Math\.floor\(ID_CHUNK \/ Math\.max\(1, vezesNaUrl\)\)/.test(chunkedCod),
  "baixar o global puniria as dezenas de chamadas com um `.in()` só");
check("e nunca produz lote de tamanho zero",
  /Math\.max\(1, Math\.floor/.test(chunkedCod),
  "vezesNaUrl grande demais faria chunkIds(0) e o laço não terminaria");
check("`selectInChunks` aceita a contagem, com padrão 1",
  /vezesNaUrl = 1,/.test(chunkedCod),
  "o padrão 1 é o que mantém as chamadas existentes inalteradas");
check("e passa a usar a divisão consciente, não a fixa",
  /for \(const batch of chunkIdsFor\(ids, vezesNaUrl\)\)/.test(chunkedCod));
check("`chunkIds` é declarado ANTES de quem o usa",
  chunkedCod.indexOf("export const chunkIds =") < chunkedCod.indexOf("export const chunkIdsFor ="),
  "`const` não sofre hoisting: a ordem inversa quebraria em runtime");

/* ── 3. as quatro chamadas declaram que repetem a lista ──────────────────── */
//
// A lista é fechada de propósito: se uma tela nova passar a usar `.or` com o
// mesmo lote, esta asserção falha e obriga a decisão a ser tomada, em vez de o
// 502 reaparecer meses depois num projeto grande.
const TELAS = [
  "src/components/ActivityKanban.tsx",
  "src/components/BacklogSection.tsx",
  "src/components/ProjectDependenciesView.tsx",
  "src/components/TimelineView.tsx",
];

// ATUALIZADO NO MERGE (main venceu no 502): a RPC — get_task_dependencies /
// get_task_relations — SUBSTITUIU o `.or(...in.(batch),...in.(batch))` nas quatro
// telas. O filtro vai no corpo do POST, então o padrão que dobrava a URL não pode
// mais existir aqui. É garantia MAIS FORTE que "se dobra, declara 2": não dobra.
for (const tela of TELAS) {
  const nome = path.basename(tela);
  const cod = semComentario(ler(tela));
  const repete = (cod.match(/\.or\(`[^`]*\$\{batch[^`]*\$\{batch/g) || []).length;
  check(`${nome}: sem .or(...in.(batch),...in.(batch)) — a RPC substituiu o lote que dobrava na URL`,
    repete === 0,
    `${repete} ainda montam o lote duas vezes na URL — deviam usar fetchTaskDependencias/fetchTaskRelations`);
}

/* ── 4. nenhuma outra chamada repete a lista sem declarar ────────────────── */
const todas = fs.readdirSync(path.join(raiz, "src/components"))
  .filter((f) => /\.tsx?$/.test(f));
// CONTA as ocorrências, não pergunta "existe alguma".
//
// A primeira versão desta varredura tinha o mesmo defeito do código que ela
// vigia: parava na primeira ocorrência por arquivo. `ActivityKanban.tsx` tem
// DUAS — `task_dependencies` e `task_relations` — e a segunda passou despercebida
// justamente porque a primeira já satisfazia a asserção.
//
// Um `2,` solto no arquivo também não prova nada sobre a segunda chamada, então
// o que se compara é a CONTAGEM: tantos `.or` que repetem o lote quantos `2,`
// fechando um `selectInChunks`.
const contar = (s, re) => (s.match(re) || []).length;
const REPETE = /\.or\(`[^`]*\$\{batch[^`]*\$\{batch/g;
const DECLARA = /\n\s*2,\s*\n\s*\)/g;

const esquecidas = todas
  .map((f) => {
    const cod = semComentario(ler(path.join("src/components", f)));
    const repete = contar(cod, REPETE);
    return repete === 0 ? null
      : { f, repete, declara: contar(cod, DECLARA) };
  })
  .filter((x) => x && x.declara < x.repete);

check("toda repetição do lote no `.or` declara a contagem — todas, não a primeira",
  esquecidas.length === 0,
  esquecidas.map((x) => `${x.f}: ${x.repete} repetem, ${x.declara} declaram`).join("; "));

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
