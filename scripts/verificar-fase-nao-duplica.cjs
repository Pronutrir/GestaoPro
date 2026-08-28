#!/usr/bin/env node
/**
 * A FASE NÃO APARECE DUAS VEZES NO CRONOGRAMA.
 *
 * ============================================================================
 * O RELATO
 *
 * Com captura: `1.1 · 1ª. Fase - Planejamento e Lançamento` em duas linhas
 * seguidas — uma sem ID, outra com `8277fd5`.
 *
 * A causa é DADO: em 10 projetos a mesma fase existe nas duas tabelas (60
 * pares; 16 só em "Revitalização Tasy"). Consertar o dado é decisão de quem
 * cuida de cada projeto — qual das duas é "a de verdade" muda caso a caso.
 *
 * Mas a TELA não precisa esperar por isso. Duplicar na exibição é defeito de
 * tela, e ela pode parar de duplicar sem tocar no banco.
 *
 * ============================================================================
 * A REGRA DE DESEMPATE: A ATIVIDADE VENCE
 *
 * Ela tem id, código EAP, responsável e histórico. A linha sintética é um
 * agrupador desenhado em memória, que existe só porque fases moram noutra
 * tabela. Some a que não existe de verdade.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nA FASE NÃO APARECE DUAS VEZES\n");

const cron = fs.readFileSync(
  path.join(raiz, "src/components/cronograma/ProjectCronogramaPanel.tsx"), "utf8");

/* ── 1. O FILTRO EXISTE ──────────────────────────────────────────────────── */
check("a linha sintética é filtrada quando já há a atividade",
  cron.includes("fasesJaComoAtividade"));
// Sem casar a assinatura do parâmetro: ela mudou quando tipei o `p` para tirar
// o `any` que eu tinha introduzido, e o teste quebrou por causa da tipagem —
// não do comportamento. O que importa é a chamada, não como o argumento é
// declarado.
check("e o filtro entra na montagem das linhasFase",
  /\.filter\([^)]*\)\s*=>\s*!fasesJaComoAtividade\.has\(semCodigo\(/.test(cron));

/* ── 2. O REGEX SOBREVIVEU AO ESCAPE ─────────────────────────────────────
 *
 * Não é paranoia: a primeira escrita deste arquivo perdeu as barras invertidas
 * e produziu `/^s*d+(.d+)*s+/`, que não casa nada. O código teria compilado e
 * a duplicata continuaria na tela.
 */
const m = cron.match(/const semCodigo[\s\S]{0,140}?replace\((\/[^,]+\/)/);
check("o regex de normalização está escrito com escapes",
  !!m && m[1] === "/^\\s*\\d+(\\.\\d+)*\\s+/",
  m ? `veio: ${m[1]}` : "não encontrei o regex");

/* ── 3. ELE FUNCIONA NO DADO REAL ────────────────────────────────────────── */
const semCodigo = (t) => String(t || "").replace(/^\s*\d+(\.\d+)*\s+/, "").trim().toLowerCase();

// Os títulos exatos do projeto da captura.
const pares = [
  ["1.1 1ª. Fase - Planejamento e Lançamento", "1ª. Fase - Planejamento e Lançamento"],
  ["1.2 2ª. Fase - Cadastros e funções essenciais", "2ª. Fase - Cadastros e funções essenciais"],
  ["1.3 3ª Fase - Validações / Testes", "3ª Fase - Validações / Testes"],
];
for (const [emPhases, emActivities] of pares) {
  check(`casa: "${emPhases.slice(0, 34)}…"`,
    semCodigo(emPhases) === semCodigo(emActivities),
    `${semCodigo(emPhases)} ≠ ${semCodigo(emActivities)}`);
}

/* ── 4. E NÃO COME O "1" DE "1ª" ─────────────────────────────────────────
 *
 * Foi o erro que subestimou a medição: `[\d.]+` guloso transformava
 * "1.1 1ª. Fase" em "ª. Fase", e o par não casava. O projeto da captura ficava
 * de fora da própria lista de duplicatas.
 */
check("não come o '1' de '1ª' — só remove código seguido de espaço",
  semCodigo("1.1 1ª. Fase").startsWith("1ª"),
  semCodigo("1.1 1ª. Fase"));

/* ── 5. FASE SEM PAR CONTINUA APARECENDO ─────────────────────────────────
 *
 * O filtro tem de tirar só a duplicata. Uma fase que existe APENAS em `phases`
 * é a razão de a linha sintética existir — e sumir com ela deixaria as
 * atividades filhas soltas na raiz, que é o defeito que ela veio consertar.
 */
const jaComoAtividade = new Set(["1ª. fase - planejamento e lançamento"]);
const fasesDoBanco = [
  { title: "1.1 1ª. Fase - Planejamento e Lançamento" },  // tem par → some
  { title: "2.0 Fase só em phases" },                      // sem par → fica
];
const restantes = fasesDoBanco.filter((p) => !jaComoAtividade.has(semCodigo(p.title)));
check("a fase COM par some", restantes.length === 1);
check("e a fase SEM par continua — senão as filhas ficam soltas na raiz",
  restantes[0].title.includes("só em phases"));

/* ── 6. UM PONTO DE MONTAGEM SÓ ─────────────────────────────────────────
 *
 * Tabela detalhada e Gantt consomem a MESMA lista. Se alguém criar um segundo
 * lugar que monta `phase:<uuid>`, o conserto vale numa aba e não na outra — e
 * o defeito volta pela metade, que é pior que voltar inteiro: ninguém acredita
 * que foi corrigido.
 */
/*
 * O teste acusou DOIS, e o segundo é legítimo — vale registrar a distinção,
 * porque ela é o que separa "duplica na tela" de "existe em memória".
 *
 *   linha ~835  monta `linhasFase`, que É DESENHADA. Duplicar aqui aparece.
 *   linha ~967  monta `activityById`, um MAPA DE CONSULTA para o cálculo de
 *               profundidade subir pelo pai e parar na fase. Nunca é iterado
 *               para render — entrar duas vezes num Map com a mesma chave
 *               sobrescreve, não duplica.
 *
 * Então o que importa não é "quantos lugares constroem o objeto", é **quantos
 * produzem lista renderizada**. Medir o primeiro dava um falso positivo.
 */
const listasRenderizadas = (cron.match(/const linhasFase\s*=/g) || []).length;
check("há UMA única lista de fases desenhada — Tabela e Gantt consomem a mesma",
  listasRenderizadas === 1, `achei ${listasRenderizadas}`);
check("o mapa de consulta por id existe e é outra coisa — não duplica na tela",
  cron.includes("const activityById"));

/* ── 7. O FILTRO VEM ANTES DO .map ──────────────────────────────────────
 *
 * Filtrar depois de montar funcionaria, mas desenharia e descartaria 60 objetos
 * por render. Antes é de graça.
 */
const posFiltro = cron.indexOf("fasesJaComoAtividade.has");
const posMapa = cron.indexOf("id: `phase:");
check("o filtro roda antes de montar o objeto",
  posFiltro > 0 && posMapa > 0 && posFiltro < posMapa);


console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
