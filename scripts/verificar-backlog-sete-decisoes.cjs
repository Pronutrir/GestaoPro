#!/usr/bin/env node
/**
 * AS SETE DECISÕES, NA TELA — guarda de regressão da fase 06.
 *
 * `lib/mesaDePlanejamento` já tem as regras testadas (42 verificações). Isto
 * verifica outra coisa: que a TELA as **consome** em vez de reimplementar.
 *
 * O modo de falhar aqui não é o número errado — é a divergência silenciosa.
 * Foi assim que as duas metades de `canMutateActivity` andaram separadas por
 * meses, e assim que três fórmulas de progresso passaram a coexistir. Se o
 * Backlog reescrever o limiar do GUT, ele e o Kanban divergem no dia em que
 * alguém mudar o 60 num lugar só.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");

let ok = 0;
let falhou = 0;
const check = (nome, condicao) => {
  console.log(`  ${condicao ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  condicao ? ok++ : falhou++;
};

console.log("\nAS SETE DECISÕES — a tela consome as regras, não as reescreve\n");

const backlog = ler("src/components/BacklogSection.tsx");

// ── Consumo, não reimplementação ──────────────────────────────────────────
check(
  "o Backlog importa de lib/mesaDePlanejamento",
  /from "@\/lib\/mesaDePlanejamento"/.test(backlog),
);

// O limiar 60/100 não pode aparecer escrito na tela: é da faixaDoGut.
const limiarNaTela = /(priority_score|gutScore)\s*>=?\s*(60|100)/.test(backlog);
check("o limiar do GUT (60/100) não foi reescrito na tela", !limiarNaTela);

// ── 1. Sem badge de tipo em atividade ─────────────────────────────────────
check(
  "decisão 1 — o badge de tipo passa por mostrarBadgeDeTipo",
  /mostrarBadgeDeTipo\(activity, eapCanGroup\(kind\)\)/.test(backlog),
);

// ── 2. Status é ponto de 7px ──────────────────────────────────────────────
check(
  "decisão 2 — o status virou ponto de 7px",
  /w-\[7px\] h-\[7px\] rounded-full/.test(backlog),
);
check(
  "decisão 2 — a pílula de status saiu (sem borda+fundo por cor de coluna)",
  !/backgroundColor: `\$\{stg\.color\}18`/.test(backlog),
);

// ── 3. GUT: o número, colorido só a partir de 60 ──────────────────────────
check(
  "decisão 3 — a coluna mostra o SCORE, não o rótulo",
  /\{gutScore\}/.test(backlog),
);
check(
  "decisão 3 — a cor vem de corDoGut(faixaDoGut(...))",
  /faixaDoGut\(gutScore\)/.test(backlog) && /corDoGut\(faixa\)/.test(backlog),
);

// ── 4. Número à direita, tabular-nums ─────────────────────────────────────
check(
  "decisão 4 — esforço e custo usam CLASSE_NUMERO",
  (backlog.match(/CLASSE_NUMERO/g) || []).length >= 3,
);

// ── 5. Vazio diz o que falta ──────────────────────────────────────────────
check(
  "decisão 5 — as células vazias passam por comoMostrarVazio",
  (backlog.match(/comoMostrarVazio\(/g) || []).length >= 4,
);
check(
  "decisão 5 — 'Sem responsável' saiu (virou 'a definir')",
  !/>Sem responsável</.test(backlog),
);
check(
  "decisão 5 — marco devolve célula VAZIA, não traço",
  /nao-se-aplica/.test(backlog),
);

// ── 6. Sem zebra ──────────────────────────────────────────────────────────
check(
  "decisão 6 — não há zebra",
  !/odd:bg-|even:bg-|nth-child/.test(backlog),
);

// ── 7. Subtotal por grupo ─────────────────────────────────────────────────
check(
  "decisão 7 — a faixa consome resumoDoGrupo",
  /resumoDoGrupo\(acts/.test(backlog),
);

// ── 7b. O total do projeto, fixo no rodapé ────────────────────────────────
check(
  "decisão 7 — o total do projeto consome totalDoProjeto",
  /totalDoProjeto\(raizes/.test(backlog),
);
check(
  "e fica FIXO no rodapé (sticky), não no fim da rolagem",
  /sticky bottom-0/.test(backlog),
);

// ── Densidade: guardada por usuário, no caminho que já existe ─────────────
check(
  "a densidade usa useKanbanPrefs, sem inventar um segundo armazenamento",
  /useKanbanPrefs\(projectId/.test(backlog),
);
check(
  "e a altura da linha vem de ALTURA_DA_LINHA",
  /minHeight: alturaDaLinha/.test(backlog),
);

// ── PROMOVER ≠ ASSUMIR: a pergunta que nao pode ser automatica ───────────
check(
  "levar as subatividades e PERGUNTADO (existe o controle)",
  /setLevarSubatividades/.test(backlog),
);
check(
  "e nasce DESMARCADO — levar junto é decisão, não padrão",
  /\[levarSubatividades, setLevarSubatividades\] = useState\(false\)/.test(backlog),
);
check(
  "sem a marca, o movimento alcança só o que está selecionado",
  /levarSubatividades[\s\S]{0,400}: Array\.from\(selectedIds\)/.test(backlog),
);
check(
  "marco nunca entra no lote da promoção",
  /a \? !a\.is_milestone : false/.test(backlog),
);
check(
  "a pergunta volta desmarcada depois de mover",
  /setLevarSubatividades\(false\)/.test(backlog),
);

// ── A regra que atravessa tudo: agregado NÃO se recalcula na tela ─────────
check(
  "o esforço do pai lê derived_hours (não soma no cliente)",
  /activity\.derived_hours/.test(backlog),
);
check(
  "o custo do pai lê derived_cost",
  /activity\.derived_cost/.test(backlog),
);
check(
  "pai sem derivação mostra ausência, não as horas próprias dele",
  /ehPai && h === null/.test(backlog) && /ehPai && c === null/.test(backlog),
);

// ── A TABELA DO DESENHO: colunas, ordem e o que saiu ─────────────────────
check(
  "a coluna STATUS saiu — backlog e planejamento, nao execucao",
  !/id: "status", label: "Status"/.test(backlog),
);
check(
  "EAP e TIPO tem coluna propria no grid",
  /68px 58px minmax/.test(backlog),
);
// O selo do código na FAIXA DE GRUPO continua — ali ele é o rótulo do grupo
// ("1.1 Formalização"), e some-lo tiraria a posição da fase na EAP. O que saiu
// é o selo dentro da linha de ATIVIDADE, que virou coluna própria.
check(
  "o código EAP saiu de dentro do título da ATIVIDADE",
  !/\{\(activity as any\)\.wbs_code\}/.test(backlog),
);
check(
  "o código passa por codigoParaExibir (marco mostra a âncora do pai)",
  /codigoParaExibir\(/.test(backlog),
);
check(
  "PREVISTO mostra a JANELA, não só o prazo",
  /derived_start \?\? activity\.start_date/.test(backlog),
);
check(
  "o vazio do responsavel e um BOTAO, nao o texto a definir",
  /Sem responsavel|Sem responsável/.test(backlog) && /definirResponsavelDaLinha/.test(backlog),
);
check(
  "e a escrita da linha LE o resultado (count exact)",
  /count: "exact"/.test(backlog),
);
check(
  "a faixa diz N no backlog, e continua dizendo quando recolhida",
  /no backlog/.test(backlog) && /isCollapsed && <span/.test(backlog),
);
check(
  "a barra de progresso saiu da faixa",
  !/bg-success transition-all/.test(backlog),
);
check(
  "os chips de recorte substituiram Todas/Incompletas",
  /RecorteRapido/.test(backlog) && /alternarRecorte/.test(backlog),
);
check(
  "e o rodape acompanha o recorte",
  /recorteLigado/.test(backlog),
);

// ── Data sem fuso ─────────────────────────────────────────────────────────
check(
  "o atraso usa diasAte (parseDataLocal), não new Date() na coluna date",
  /diasAte\(activity\.end_date\)/.test(backlog),
);

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
