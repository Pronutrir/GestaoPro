#!/usr/bin/env node
/**
 * O ERRO DO BANCO, DITO PARA GENTE.
 *
 * O relato de 27/08, com captura: a tela mostrava
 *
 *   "usuario 0eb3047e-… nao esta na equipe do projeto dcf977e9-… | P0001"
 *
 * Dois UUIDs, um código do Postgres, e nenhum passo seguinte. Este arquivo
 * trava a tradução — e trava também a regra que a torna necessária: o que sai
 * na tela nunca carrega id nem código.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const saida = path.join(raiz, "node_modules", ".cache", "verificar-erro");
fs.mkdirSync(saida, { recursive: true });
const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(process.execPath,
    [tsc, "src/lib/erroDoBanco.ts", "--outDir", saida, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" });
} catch (e) { /* o .js basta */ }
const { traduzirErroDoBanco, mensagemDeErro } = require(path.join(saida, "erroDoBanco.js"));

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nO ERRO DO BANCO, DITO PARA GENTE\n");

const PESSOA = "0eb3047e-1111-2222-3333-444455556666";
const PROJETO = "dcf977e9-aaaa-bbbb-cccc-ddddeeeeffff";
const nomes = {
  pessoas: { [PESSOA]: "Williame Correia de Lima" },
  projetos: { [PROJETO]: "Revitalização Tasy" },
};

/* ── 1. O ERRO DO RELATO ─────────────────────────────────────────────────── */
const cru = `usuario ${PESSOA} nao esta na equipe do projeto ${PROJETO} -- adicione a equipe antes de atribuir | P0001`;
const t = traduzirErroDoBanco(cru, nomes);

check("nomeia a PESSOA, não o id",
  t.titulo.includes("Williame Correia de Lima"), t.titulo);
check("nomeia o PROJETO, não o id",
  t.titulo.includes("Revitalização Tasy"), t.titulo);
check("diz o PASSO SEGUINTE",
  (t.detalhe ?? "").includes("Inclua na equipe"), t.detalhe);

const inteiro = `${t.titulo} ${t.detalhe ?? ""}`;
check("nenhum UUID sobrevive",
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(inteiro), inteiro);
check("nenhum código do Postgres sobrevive",
  !/P\d{4}|PGRST\d{3}/.test(inteiro), inteiro);

/* ── 2. SEM DICIONÁRIO, DEGRADA COM ELEGÂNCIA ────────────────────────────── */
//
// A tela nem sempre conhece o nome. Nesse caso o id SAI da frase em vez de
// aparecer: ele não ajuda quem lê, e atrapalha quem relata.
const semNomes = traduzirErroDoBanco(cru);
check("sem dicionário, ainda assim não mostra id",
  !/[0-9a-f]{8}-/i.test(`${semNomes.titulo} ${semNomes.detalhe ?? ""}`),
  semNomes.titulo);
check("e a frase continua fazendo sentido",
  semNomes.titulo.includes("não está na equipe"), semNomes.titulo);

/* ── 3. OS OUTROS DA MESMA FAMÍLIA ───────────────────────────────────────── */
const casos = [
  ["Um marco não pode conter subitens (parent 1234abcd-…).", "Marco não agrupa"],
  ["Aninhamento EAP inválido: uma marco não pode conter subitens.", "não pode conter subitens"],
  ["A atividade pai pertence a outro projeto.", "outro projeto"],
  ["parent_id criaria um ciclo na hierarquia.", "dentro do item"],
  ["RACI inválido: cada atividade pode ter apenas um Accountable (A). Encontrados: 2", "Aprovador"],
  ["new row violates row-level security policy for table \"activities\"", "permissão"],
  ["duplicate key value violates unique constraint", "já existe"],
  ["sem permissao para incluir na equipe deste projeto", "gerencia"],
];
for (const [bruto, esperado] of casos) {
  const r = traduzirErroDoBanco(bruto, nomes);
  const frase = `${r.titulo} ${r.detalhe ?? ""}`;
  check(`traduz: ${bruto.slice(0, 44)}…`,
    frase.toLowerCase().includes(esperado.toLowerCase()), frase);
}

/* ── 4. O DESCONHECIDO É LIMPO, NÃO ESCONDIDO ───────────────────────────── */
//
// "Algo deu errado" é pior que a mensagem crua: não dá para agir nem relatar.
// O que sai é a mensagem SEM id e SEM código.
const estranho = traduzirErroDoBanco(
  `falha inesperada na tabela xyz para ${PESSOA} | 23503`, nomes);
check("mensagem desconhecida NÃO vira 'algo deu errado'",
  estranho.titulo.includes("falha inesperada"), estranho.titulo);
check("mas sai limpa de id e código",
  !/[0-9a-f]{8}-|23503/.test(estranho.titulo), estranho.titulo);
check("e o id vira nome quando o dicionário conhece",
  estranho.titulo.includes("Williame"), estranho.titulo);

check("erro vazio devolve frase útil",
  traduzirErroDoBanco("").titulo.length > 10);
check("aceita Error, não só string",
  traduzirErroDoBanco(new Error(cru), nomes).titulo.includes("Williame"));
check("mensagemDeErro devolve uma linha só",
  typeof mensagemDeErro(cru, nomes) === "string" && mensagemDeErro(cru, nomes).includes("Inclua"));

/* ── 5. LIGADO NO PONTO DO RELATO ────────────────────────────────────────── */
const bl = fs.readFileSync(path.join(raiz, "src/components/BacklogSection.tsx"), "utf8");
check("definirResponsavelDaLinha traduz em vez de despejar error.message",
  bl.includes("traduzirErroDoBanco(error, nomes)"),
  "é o ponto exato do relato: definir responsável dispara a validação de equipe");

/* ── 6. O CONSERTO DE VERDADE ────────────────────────────────────────────── */
//
// Traduzir resolve metade. O diálogo resolve a outra: o erro deixa de
// acontecer, porque a pessoa é incluída ali mesmo.
const dlg = fs.readFileSync(path.join(raiz, "src/components/atividade/IncluirEAtribuir.tsx"), "utf8");
check("o diálogo chama a RPC — uma transação, não dois inserts",
  dlg.includes('rpc("incluir_e_atribuir"'));
check("o padrão do papel é o mais restrito",
  dlg.includes('useState("visualizar_comentar")'));
check("e o do escopo também",
  dlg.includes('useState("atividade_e_trilha")'));
check("quem não gerencia vê o MOTIVO e uma saída — não um botão apagado",
  dlg.includes("if (!podeGerenciarEquipe)") && dlg.includes("Copiar pedido ao gestor"));

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
