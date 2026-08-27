#!/usr/bin/env node
/**
 * O QUADRO DE EXECUÇÃO — os cinco testes do bug relatado.
 *
 * O defeito, reproduzido na base em 26/08/2026:
 *   - 142 agrupadores estavam no quadro como CARTÃO;
 *   - 39 famílias com filhas em colunas diferentes (uma com 16 filhas partidas
 *     entre "Em Andamento" e "Backlog" — o "parte fica, parte volta");
 *   - 97 casos de pai no Backlog com filha no quadro.
 *
 * Dois caminhos de escrita causavam isso: `subirPaisCompletos` escrevia no
 * ANCESTRAL ao mover um cartão, e o diálogo "levar os N junto" CASCATEAVA para
 * os descendentes. A ida levava os filhos, a volta trazia o pai atrás deles.
 *
 * Roda o CÓDIGO REAL, compilado na hora.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const saida = path.join(raiz, "node_modules", ".cache", "verificar-quadro");
fs.mkdirSync(saida, { recursive: true });

const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(
    process.execPath,
    [tsc, "src/lib/quadroDeExecucao.ts", "--outDir", saida, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" },
  );
} catch (e) {
  if (!fs.existsSync(path.join(saida, "quadroDeExecucao.js"))) {
    console.error("não foi possível compilar lib/quadroDeExecucao.ts");
    console.error(String(e.stdout || e.message).slice(0, 900));
    process.exit(1);
  }
}
const Q = require(path.join(saida, "quadroDeExecucao.js"));

let ok = 0;
let falhou = 0;
const check = (nome, condicao) => {
  console.log(`  ${condicao ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  condicao ? ok++ : falhou++;
};

console.log("\nO QUADRO DE EXECUÇÃO — o bug do pacote que arrasta a fase\n");

// ── O cenário do relato ───────────────────────────────────────────────────
//   Fase 1
//     └ Pacote A
//         ├ Atividade A1
//         ├ Atividade A2
//         └ Marco M
//     └ Pacote B
//         └ Atividade B1
const COLS = [
  { id: "bk", title: "Backlog", categoria: "backlog" },
  { id: "ni", title: "Não iniciado", categoria: "a_iniciar" },
  { id: "em", title: "Em andamento", categoria: "andamento" },
  { id: "co", title: "Concluída", categoria: "concluida", is_final: true },
];
const colunaPorId = new Map(COLS.map((c) => [c.id, c]));
const col = (id) => COLS.find((c) => c.id === id);

const cenario = () => {
  const itens = [
    { id: "F1", parent_id: null, workflow_stage_id: "bk", status: "pending" },
    { id: "PA", parent_id: "F1", workflow_stage_id: "bk", status: "pending" },
    { id: "A1", parent_id: "PA", workflow_stage_id: "bk", status: "pending" },
    { id: "A2", parent_id: "PA", workflow_stage_id: "bk", status: "pending" },
    { id: "M",  parent_id: "PA", workflow_stage_id: "bk", status: "pending", is_milestone: true },
    { id: "PB", parent_id: "F1", workflow_stage_id: "bk", status: "pending" },
    { id: "B1", parent_id: "PB", workflow_stage_id: "bk", status: "pending" },
  ];
  const porId = new Map(itens.map((i) => [i.id, i]));
  const filhas = new Map();
  itens.forEach((i) => {
    if (!i.parent_id) return;
    if (!filhas.has(i.parent_id)) filhas.set(i.parent_id, []);
    filhas.get(i.parent_id).push(i);
  });
  return { itens, porId, filhas };
};

const aplicar = (ctx, escritas) => {
  for (const e of escritas) {
    const it = ctx.porId.get(e.id);
    if (it) Object.assign(it, e.campos);
  }
};

/** A "foto" do quadro: quem é cartão, em qual coluna, com qual status. */
const foto = (ctx) =>
  JSON.stringify(
    ctx.itens
      .filter((i) => Q.viraCartao(i, ctx.filhas, colunaPorId))
      .map((i) => [i.id, i.workflow_stage_id, i.status])
      .sort(),
  );

/** A foto de TODAS as linhas — pega escrita em quem não devia ser tocado. */
const fotoCompleta = (ctx) =>
  JSON.stringify(ctx.itens.map((i) => [i.id, i.workflow_stage_id, i.status]).sort());

// ── 1. Só Atividade vira cartão ───────────────────────────────────────────
{
  const c = cenario();
  c.itens.forEach((i) => { i.workflow_stage_id = "ni"; });
  const cartoes = c.itens.filter((i) => Q.viraCartao(i, c.filhas, colunaPorId)).map((i) => i.id);
  check("só Atividade vira cartão — fase, pacotes e marco fora",
    JSON.stringify(cartoes.sort()) === JSON.stringify(["A1", "A2", "B1"]));
  check("a fase não é cartão (é agrupador)", Q.ehAgrupadorDoQuadro(c.porId.get("F1"), c.filhas));
  check("o marco não é cartão nem agrupador",
    !Q.viraCartao(c.porId.get("M"), c.filhas, colunaPorId)
    && !Q.ehAgrupadorDoQuadro(c.porId.get("M"), c.filhas));
}

// ── 2. Promover pacote → as atividades dele aparecem sob a faixa ──────────
{
  const c = cenario();
  const { atividades, agrupadores } = Q.subatividadesPromoviveis(c.porId.get("PA"), c.filhas);
  check("a pergunta conta 2 atividades no pacote (marco fora)", atividades === 2 && agrupadores === 0);

  aplicar(c, Q.escritasDePromover(c.porId.get("PA"), col("ni"), c.filhas, true));

  const cartoes = c.itens.filter((i) => Q.viraCartao(i, c.filhas, colunaPorId)).map((i) => i.id);
  check("promover o pacote põe as ATIVIDADES dele no quadro",
    JSON.stringify(cartoes.sort()) === JSON.stringify(["A1", "A2"]));
  check("e o pacote NÃO vira cartão — vira faixa",
    !Q.viraCartao(c.porId.get("PA"), c.filhas, colunaPorId));
  check("as atividades ficam sob a faixa do pacote",
    Q.faixaDoCartao(c.porId.get("A1"), c.porId, c.filhas, colunaPorId) === "PA"
    && Q.faixaDoCartao(c.porId.get("A2"), c.porId, c.filhas, colunaPorId) === "PA");
  check("o marco NÃO foi promovido", c.porId.get("M").workflow_stage_id === "bk");
  check("o pacote B, que ninguém promoveu, continua na fila",
    c.porId.get("PB").workflow_stage_id === "bk" && c.porId.get("B1").workflow_stage_id === "bk");
}

// ── 2b. Promover SEM levar as subatividades ───────────────────────────────
{
  const c = cenario();
  aplicar(c, Q.escritasDePromover(c.porId.get("PA"), col("ni"), c.filhas, false));
  check("promover sem levar junto move SÓ o item — nenhuma filha vai",
    c.porId.get("A1").workflow_stage_id === "bk" && c.porId.get("A2").workflow_stage_id === "bk");
}

// ── 3. Mover 1 atividade → nenhuma outra linha muda ───────────────────────
{
  const c = cenario();
  aplicar(c, Q.escritasDePromover(c.porId.get("PA"), col("ni"), c.filhas, true));
  const antes = fotoCompleta(c);

  const escritas = Q.escritasDeMoverColuna(c.porId.get("A1"), col("em"), c.filhas, "T");
  check("mover um cartão gera EXATAMENTE UMA escrita", escritas.length === 1);
  check("e ela é no item movido", escritas[0].id === "A1");
  check("nenhuma escrita toca o ancestral",
    !escritas.some((e) => e.id === "PA" || e.id === "F1"));

  aplicar(c, escritas);
  const mudaram = c.itens.filter((i) => {
    const a = JSON.parse(antes).find((x) => x[0] === i.id);
    return a[1] !== i.workflow_stage_id || a[2] !== i.status;
  });
  check("só A1 mudou de coluna ou status",
    mudaram.length === 1 && mudaram[0].id === "A1");
  check("A2 continua onde estava", c.porId.get("A2").workflow_stage_id === "ni");
}

// ── 4. Ida e volta N vezes → o quadro volta idêntico ─────────────────────
{
  const c = cenario();
  aplicar(c, Q.escritasDePromover(c.porId.get("PA"), col("ni"), c.filhas, true));
  const inicial = foto(c);
  const inicialCompleta = fotoCompleta(c);

  for (let i = 0; i < 7; i++) {
    aplicar(c, Q.escritasDeMoverColuna(c.porId.get("A1"), col("em"), c.filhas, "T"));
    aplicar(c, Q.escritasDeMoverColuna(c.porId.get("A1"), col("ni"), c.filhas, "T"));
  }
  check("depois de 7 idas e voltas, o conjunto do quadro é IDÊNTICO",
    foto(c) === inicial);
  check("e nenhuma outra linha se moveu no caminho",
    fotoCompleta(c) === inicialCompleta);
}

// ── 5. Pacote com filhas em colunas diferentes ───────────────────────────
{
  const c = cenario();
  aplicar(c, Q.escritasDePromover(c.porId.get("PA"), col("ni"), c.filhas, true));
  aplicar(c, Q.escritasDeMoverColuna(c.porId.get("A1"), col("em"), c.filhas, "T"));

  check("a faixa continua inteira: as duas filhas apontam para o pacote",
    Q.faixaDoCartao(c.porId.get("A1"), c.porId, c.filhas, colunaPorId) === "PA"
    && Q.faixaDoCartao(c.porId.get("A2"), c.porId, c.filhas, colunaPorId) === "PA");
  check("o pacote continua sendo agrupador, em qualquer coluna",
    Q.ehAgrupadorDoQuadro(c.porId.get("PA"), c.filhas));

  check("o status do pacote é DERIVADO — pendente com filha aberta",
    Q.statusDerivadoDoAgrupador(c.porId.get("PA"), c.filhas) === "pending");

  aplicar(c, Q.escritasDeMoverColuna(c.porId.get("A1"), col("co"), c.filhas, "T"));
  aplicar(c, Q.escritasDeMoverColuna(c.porId.get("A2"), col("co"), c.filhas, "T"));
  check("e vira concluído quando TODAS as filhas concluem",
    Q.statusDerivadoDoAgrupador(c.porId.get("PA"), c.filhas) === "completed");
  check("o marco não impede o pacote de concluir",
    c.porId.get("M").status !== "completed");
}

// ── 6. Agrupador não se move ─────────────────────────────────────────────
{
  const c = cenario();
  aplicar(c, Q.escritasDePromover(c.porId.get("PA"), col("ni"), c.filhas, true));
  check("mover um AGRUPADOR não gera escrita nenhuma",
    Q.escritasDeMoverColuna(c.porId.get("PA"), col("em"), c.filhas, "T").length === 0);
  check("mover um MARCO não gera escrita nenhuma",
    Q.escritasDeMoverColuna(c.porId.get("M"), col("em"), c.filhas, "T").length === 0);

  // Pacote sem filhas é trabalho, não caixa: pode mover.
  const solto = { id: "S", parent_id: null, workflow_stage_id: "ni", status: "pending" };
  check("um 'pacote' SEM filhas é atividade — e move normalmente",
    Q.escritasDeMoverColuna(solto, col("em"), new Map(), "T").length === 1);
}

// ── 7. Nenhuma tela grava status em agrupador (código real) ──────────────
//
// Ler o código é o único jeito de travar isto: a regra pode estar perfeita em
// `lib/` e a tela continuar chamando o caminho antigo — foi exatamente o que
// aconteceu aqui, e o relato do usuário confirmou ("o quadro ainda usa a
// lógica antiga").
{
  const kanban = fs.readFileSync(path.join(raiz, "src/components/ActivityKanban.tsx"), "utf8");
  const coluna = fs.readFileSync(path.join(raiz, "src/components/kanban/KanbanColumn.tsx"), "utf8");

  // A função que subia o ancestral não pode voltar a ser CHAMADA. As menções
  // em comentário ficam de propósito: elas explicam por que ela saiu.
  const chamada = /^\s*(await\s+)?subirPaisCompletos\s*\(/m.test(kanban);
  const declarada = /const\s+subirPaisCompletos\s*=/.test(kanban);
  check("`subirPaisCompletos` não existe mais", !declarada);
  check("e não é chamada em lugar nenhum", !chamada);

  check(
    "o diálogo que cascateava para os descendentes saiu do arrasto",
    !/setMoverJunto\(\{\s*pai: draggedActivity/.test(kanban),
  );
  check(
    "agrupador é BARRADO no arrasto, com explicação",
    /ehAgrupadorDoQuadro\(draggedActivity as never/.test(kanban),
  );
  check(
    "agrupador não entra nas colunas do quadro",
    /!ehAgrupadorDoQuadro\(a as never, filhasPorPaiParaRegra\)/.test(kanban),
  );
  check(
    "a faixa do cartão vem de faixaDoCartao, não de 'pai em outra coluna'",
    /faixaDoCartao\(/.test(coluna) && !/parentAct\.workflow_stage_id !== activity\.workflow_stage_id/.test(coluna),
  );

  // O lote da SELEÇÃO continua valendo: são cartões que a pessoa marcou, um a
  // um. Não confundir com cascata para descendente, que é o que saiu.
  check(
    "o lote da seleção múltipla continua existindo (não é cascata)",
    /const emLote = selecionados\.has\(activityId\)/.test(kanban),
  );

  // ── A TERCEIRA CÓPIA ────────────────────────────────────────────────────
  // A mesma regra ("o pai acompanha quando o último filho chega") existia em
  // TRÊS lugares: o arrasto do Kanban, o menu de mover, e o Backlog. Encontrar
  // duas e esquecer a terceira deixaria o bug vivo por um caminho.
  const backlog = fs.readFileSync(path.join(raiz, "src/components/BacklogSection.tsx"), "utf8");
  check(
    "o Backlog também não sobe o ancestral ao promover",
    !/const subiram: string\[\] = \[\]/.test(backlog),
  );
  check(
    "e a promoção escreve só o que foi selecionado",
    !/subiram\.push\(paiId\)/.test(backlog),
  );
  check(
    "o agrupador promovido muda de coluna mas NÃO de status",
    /O AGRUPADOR MUDA DE COLUNA, MAS NÃO DE STATUS/.test(backlog)
    && /const soAColuna/.test(backlog),
  );
}

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
