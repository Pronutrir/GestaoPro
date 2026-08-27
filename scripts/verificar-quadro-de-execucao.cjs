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

// eapModel compilado a parte: a cirurgia do nível vive nele, e o teste dela
// precisa da função real — não de uma cópia à mão, que já produziu 56
// divergências falsas numa medição anterior.
const saidaEap = path.join(raiz, "node_modules", ".cache", "verificar-quadro-eap");
fs.mkdirSync(saidaEap, { recursive: true });
try {
  execFileSync(process.execPath,
    [tsc, "src/lib/eapModel.ts", "--outDir", saidaEap, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" });
} catch (e) {
  if (!fs.existsSync(path.join(saidaEap, "eapModel.js"))) {
    console.error("não foi possível compilar src/lib/eapModel.ts");
    process.exit(1);
  }
}

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
  // `item_type` EXPLICITO desde 27/08/2026. Antes o fixture o omitia, porque a
  // regra era estrutural ("tem filhas") e o campo nao era lido. Agora o tipo E
  // a regra, e um fixture sem tipo testaria um cenario que nao existe: no banco
  // congelado toda linha tem item_type, e NOT NULL.
  const itens = [
    { id: "F1", parent_id: null, item_type: "fase",      workflow_stage_id: "bk", status: "pending" },
    { id: "PA", parent_id: "F1", item_type: "pacote",    workflow_stage_id: "bk", status: "pending" },
    { id: "A1", parent_id: "PA", item_type: "atividade", workflow_stage_id: "bk", status: "pending" },
    { id: "A2", parent_id: "PA", item_type: "atividade", workflow_stage_id: "bk", status: "pending" },
    { id: "M",  parent_id: "PA", item_type: "atividade", workflow_stage_id: "bk", status: "pending", is_milestone: true },
    { id: "PB", parent_id: "F1", item_type: "pacote",    workflow_stage_id: "bk", status: "pending" },
    { id: "B1", parent_id: "PB", item_type: "atividade", workflow_stage_id: "bk", status: "pending" },
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

  // ── INVERTIDA EM 27/08/2026 ─────────────────────────────────────────────
  // Dizia: "um 'pacote' SEM filhas é atividade — e move normalmente", e
  // passava porque a regra era estrutural (sem filhas => não é caixa).
  //
  // Agora o TIPO manda: um pacote é caixa mesmo vazio. Não é regressão, é a
  // decisão — o tipo parou de mudar sozinho, nos dois sentidos. Antes, um
  // pacote virava trabalho ao perder a última filha; agora continua pacote até
  // alguém dizer o contrário.
  //
  // Quem quiser mover trabalho move uma ATIVIDADE, que é o que o segundo caso
  // trava — e é o caso que a regra nova existe para proteger.
  const pacoteVazio = { id: "S", parent_id: null, item_type: "pacote", workflow_stage_id: "ni", status: "pending" };
  check("um pacote SEM filhas continua caixa — o tipo manda, não a estrutura",
    Q.escritasDeMoverColuna(pacoteVazio, col("em"), new Map(), "T").length === 0);

  // ── NOVA: o coração da decisão de 27/08 ─────────────────────────────────
  // Uma ATIVIDADE COM FILHAS continua atividade: continua cartão, continua
  // arrastável. Com a regra antiga ela virava caixa no instante em que ganhava
  // a primeira subatividade, e sumia do quadro sem ninguém ter decidido.
  const paiTrabalhador = { id: "AP", parent_id: null, item_type: "atividade", workflow_stage_id: "ni", status: "pending" };
  const filhaDele = { id: "AF", parent_id: "AP", item_type: "atividade", workflow_stage_id: "ni", status: "pending" };
  const comFilha = new Map([["AP", [filhaDele]]]);

  check("atividade COM filhas NÃO é agrupador",
    !Q.ehAgrupadorDoQuadro(paiTrabalhador, comFilha));
  check("atividade COM filhas continua cartão",
    Q.viraCartao(paiTrabalhador, comFilha, colunaPorId));
  check("e continua arrastável — mover gera a escrita normal",
    Q.escritasDeMoverColuna(paiTrabalhador, col("em"), comFilha, "T").length === 1);
  check("a subatividade promovida ganha cartão próprio — pai e filha convivem",
    Q.viraCartao(filhaDele, new Map(), colunaPorId)
    && Q.viraCartao(paiTrabalhador, comFilha, colunaPorId));
  check("e a atividade-pai NÃO desenha faixa: faixa é de agrupador",
    Q.faixaDoCartao(filhaDele, new Map([["AP", paiTrabalhador]]), comFilha, colunaPorId) === null);

  // MARCO é o único que nunca tem filha — a regra que não mudou.
  check("marco continua fora, com ou sem filhas",
    !Q.ehAgrupadorDoQuadro({ id: "MM", item_type: "atividade", is_milestone: true }, comFilha)
    && !Q.viraCartao({ id: "MM", item_type: "atividade", is_milestone: true, workflow_stage_id: "ni" }, comFilha, colunaPorId));
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

// ── 8. A PORTA FECHADA: agrupador não se promove (27/08/2026) ────────────
//
// O arraste do Kanban já recusava; a promoção do Backlog aceitava em silêncio.
// Mesmo gesto, dois comportamentos — e o item sumia no quadro, porque agrupador
// não vira cartão. O incidente de 27/08 mediu: 68 folhas promovidas invisíveis,
// em 17 projetos.
{
  const c = cenario();
  const fase = c.porId.get("F1");        // tem filhas, item_type fase
  const pacote = c.porId.get("PA");      // tem filhas, item_type pacote
  const atividade = c.porId.get("A1");   // folha
  const marco = c.porId.get("M");

  check("fase NÃO pode ser promovida", !Q.podePromover(fase));
  check("pacote NÃO pode ser promovido", !Q.podePromover(pacote));
  check("marco NÃO pode ser promovido", !Q.podePromover(marco));
  check("atividade PODE ser promovida", Q.podePromover(atividade));

  // Uma atividade COM filhas continua promovível: ela é trabalho, e o cartão
  // dela mostra o contador. É a regra do item 4, e o teste existe para que
  // "fechar a porta" não feche a porta errada.
  check("atividade com filhas continua promovível",
    Q.podePromover({ id: "AP", item_type: "atividade" }));

  // A recusa precisa EXPLICAR, não só barrar.
  const mFase = Q.motivoNaoPromove(fase);
  const mMarco = Q.motivoNaoPromove(marco);
  check("a recusa da fase traz título e descrição",
    !!mFase && !!mFase.titulo && !!mFase.descricao);
  check("e a do marco é diferente — motivos diferentes, frases diferentes",
    !!mMarco && mMarco.titulo !== mFase.titulo);
  check("quem pode promover não recebe motivo",
    Q.motivoNaoPromove(atividade) === null);
}

// ── 9. O CONTADOR NÃO PASSA PELA PREFERÊNCIA (código real) ───────────────
//
// Ler o código é o único jeito de travar isto: a regra pode estar certa em lib/
// e a tela continuar gateando o contador atrás de uma preferência desligada —
// que foi exatamente o defeito relatado.
{
  /*
   * SEM OS COMENTÁRIOS. As duas regras removidas são CITADAS nos comentários
   * que explicam por que saíram — e devem continuar sendo: elas documentam uma
   * decisão. Um teste que lesse o arquivo cru acusaria a própria explicação
   * como se fosse o código, e a única forma de fazê-lo passar seria apagar a
   * documentação. Já aconteceu aqui: as duas asserções abaixo falharam na
   * primeira execução exatamente assim.
   */
  const BLOCO = new RegExp("/\\*[\\s\\S]*?\\*/", "g");  // /* ... */ e {/* ... */}
  const LINHA = new RegExp("^\\s*//.*$", "gm");         // // linha
  const semComentarios = (t) => t.replace(BLOCO, "").replace(LINHA, "");

  const card = semComentarios(
    fs.readFileSync(path.join(raiz, "src/components/kanban/KanbanCard.tsx"), "utf8"));
  const shared = semComentarios(
    fs.readFileSync(path.join(raiz, "src/components/kanban/shared.ts"), "utf8"));

  check(
    "o contador não é mais gateado por isPhase nem por cardFields.subCount",
    !/\(isPhase \|\| cardFields\.subCount\)/.test(card),
  );
  check(
    "e aparece sempre que há subatividades",
    /\{subActivityCount && subActivityCount > 0 \?/.test(card),
  );
  check(
    "a opção órfã saiu do menu de campos do card",
    !/\{ key: "subCount", label:/.test(shared),
  );
  check(
    "mas a chave continua no tipo — preferências já gravadas não viram lixo",
    /subCount: boolean;/.test(shared),
  );
}


// ── 10. RECUSAR PROMOVER NÃO É RECUSAR MOVER ─────────────────────────────
//
// Relatado com captura em 27/08: o aviso "Fases e pacotes não vão para o
// quadro" aparecia para o item `1.1`, que JÁ ESTAVA em "Em Andamento". Ele
// ficava preso — não dava para movê-lo nem para outra coluna, nem de volta
// para o backlog.
//
// A primeira versão da guarda tratava "mudar status" como se fosse sempre
// promover. São duas operações no mesmo botão:
//
//   PROMOVER  fila → coluna do quadro     ← a regra barra agrupador aqui
//   MOVER     quadro → outra coluna/fila  ← e não diz nada sobre isto
//
// Pior: a guarda trancava justamente a via que TIRA do quadro os itens presos.
{
  const bl = fs.readFileSync(path.join(raiz, "src/components/BacklogSection.tsx"), "utf8");

  check(
    "a recusa só vale quando o destino é o QUADRO",
    /const destinoEhQuadro = !!destino && catDestino !== "backlog";/.test(bl),
  );
  check(
    "quem JÁ está no quadro não é barrado — isso é mover, não promover",
    /if \(jaNoQuadro\) return false;/.test(bl),
  );
  check(
    "e mandar de volta para a fila nunca é barrado",
    /!destinoEhQuadro \? \[\]/.test(bl),
  );
  check(
    "a recusa fecha o diálogo — sem aviso sobre formulário aberto",
    /setMoveDialogOpen\(false\);[\s\S]{0,220}title: motivo\?\.titulo/.test(bl),
  );
  check(
    "o botão 'Mudar status' NÃO tem guarda própria — ela mediria a operação errada",
    /onClick=\{\(\) => setMoveDialogOpen\(true\)\}>\s*\n\s*<ArrowRight/.test(bl),
  );
}


// ── 11. O NÍVEL NÃO DECIDE MAIS O PAPEL (27/08/2026) ─────────────────────
//
// A segunda cirurgia, irmã da que tirou o `OR hasChildren`. O padrão dos dois
// defeitos é o mesmo: uma heurística criada para suprir a ausência do campo,
// que sobreviveu ao campo passar a existir.
//
// Custava 67 folhas de trabalho promovidas e INVISÍVEIS no quadro: gravadas
// como 'atividade' (correto), exibidas como 'entrega' porque o nível 3 decidia
// antes de o campo ser lido.
{
  const eap = require(path.join(saidaEap, "eapModel.js"));

  // O caso que motivou tudo: nível 3, gravado como atividade.
  const folhaN3 = { item_type: "atividade", wbs_code: "1.1.1", is_milestone: false };
  check("nível 3 gravado como atividade É atividade — era 'entrega'",
    eap.resolveEapKind(folhaN3) === "atividade");
  check("e portanto vira CARTÃO, não faixa",
    !eap.eapCanGroup(eap.resolveEapKind(folhaN3)));

  // Nível 2 idem — eram 11 itens.
  check("nível 2 gravado como atividade É atividade — era 'fase'",
    eap.resolveEapKind({ item_type: "atividade", wbs_code: "1.1", is_milestone: false }) === "atividade");

  // O contrário também: quem está gravado como agrupador continua agrupador,
  // com ou sem código. É o campo que manda, nos dois sentidos.
  check("gravado como fase É agrupador, mesmo em nível 3",
    eap.eapCanGroup(eap.resolveEapKind({ item_type: "fase", wbs_code: "1.1.1", is_milestone: false })));
  check("gravado como entrega É agrupador, mesmo sem código",
    eap.eapCanGroup(eap.resolveEapKind({ item_type: "entrega", wbs_code: null, is_milestone: false })));
  check("pacote legado continua agrupador",
    eap.eapCanGroup(eap.resolveEapKind({ item_type: "pacote", wbs_code: null, is_milestone: false })));

  // Marco vence tudo, como sempre.
  check("marco vence o campo e o código",
    eap.resolveEapKind({ item_type: "fase", wbs_code: "1.1", is_milestone: true }) === "marco");

  // O MESMO ITEM, com e sem código, dá o MESMO papel. É o teste que prova que
  // o nível saiu de verdade: antes, acrescentar um wbs_code mudava o papel.
  const semCod = eap.resolveEapKind({ item_type: "atividade", wbs_code: null, is_milestone: false });
  const comCod = eap.resolveEapKind({ item_type: "atividade", wbs_code: "1.2.3.4", is_milestone: false });
  check("o código EAP não altera o papel — mesmo item, mesma resposta",
    semCod === comCod);

  // E a função de nível CONTINUA existindo: ela serve à numeração da EAP, à
  // importação e ao aviso "pela estrutura este item seria X". O que saiu foi
  // ela decidir o papel exibido.
  check("eapLevel continua disponível para a numeração e o aviso",
    typeof eap.eapLevel === "function" && eap.eapLevel("1.2.3") === 3);
}


console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
