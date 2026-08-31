#!/usr/bin/env node
/**
 * O CRONOGRAMA NÃO PODE FICAR MUDO — 31/08/2026
 *
 * Relato: "além disso, o cronograma não aparece informação alguma."
 *
 * A tela tinha QUATRO caminhos diferentes que terminavam no mesmo quadro em
 * branco, sem uma palavra de explicação:
 *
 *   1. `Promise.all` — uma das cinco consultas rejeita e leva as outras quatro
 *      junto; a exceção escapa e o `useState([])` inicial é o que fica na tela.
 *   2. `{ data }` sem `error` — a RLS recusa, `data` vem null, `|| []` vira
 *      lista vazia, e "recusado" fica idêntico a "não há atividades".
 *   3. `scopedProjectIds.length === 0` — zerava tudo e voltava, calado.
 *   4. `projects`/`filterProjects` lançando ANTES das consultas — promise
 *      rejeitada que ninguém aguarda.
 *
 * Cada asserção aqui trava um desses caminhos. O que se está protegendo não é
 * o texto de uma mensagem: é a regra de que nenhuma falha de carregamento
 * termina em silêncio, porque tela vazia e tela quebrada são indistinguíveis
 * para quem está do outro lado.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const alvo = path.join(raiz, "src/components/cronograma/ProjectCronogramaPanel.tsx");
const src = fs.readFileSync(alvo, "utf8");

/** O código sem comentários — para que citar uma regra não a satisfaça. */
const codigo = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nO CRONOGRAMA NÃO FICA MUDO\n");

/* ── 1. a consulta acessória não derruba a tela ──────────────────────────── */
check("as cinco consultas usam allSettled, não all",
  /await Promise\.allSettled\(\[/.test(codigo),
  "com Promise.all, activity_assignees falhando apaga o cronograma inteiro");
check("e `Promise.all` não sobreviveu em nenhum ponto do carregamento",
  !/await Promise\.all\(\[\s*actsQ/.test(codigo),
  "o bloco original tem de ter sido substituído, não duplicado");

/* ── 2. o erro do PostgREST é LIDO ───────────────────────────────────────── */
check("o `error` de cada consulta é colhido, não descartado",
  /if \(v\?\.error\) return \{ data: null, erro: v\.error \}/.test(codigo),
  "`{ data }` sozinho transforma recusa da RLS em lista vazia");
check("a promise rejeitada também vira erro, não silêncio",
  /if \(r\.status === "rejected"\) return \{ data: null, erro: r\.reason \}/.test(codigo));

/* ── 3. essencial e acessória têm pesos diferentes ───────────────────────── */
check("atividades é ESSENCIAL: falhou, vira mensagem e para",
  /if \(acts_\.erro\) \{[\s\S]{0,160}setErroAoCarregar\([\s\S]{0,120}return;/.test(codigo),
  "um cronograma sem atividades é uma página em branco");
check("mas responsáveis é ACESSÓRIA: não interrompe o carregamento",
  !/if \(resps_\.erro\)[\s\S]{0,120}return;/.test(codigo),
  "cronograma sem a coluna responsável ainda é um cronograma");
check("e o sucesso limpa o erro anterior — a faixa não fica presa na tela",
  /setErroAoCarregar\(null\)/.test(codigo));

/* ── 4. o caminho mais silencioso: nenhum projeto visível ────────────────── */
check("sem projeto visível, a tela diz se é ausência ou permissão",
  /havia > 0[\s\S]{0,200}Peça acesso ao gestor/.test(src),
  "as duas causas pedem ações opostas: esperar ou pedir acesso");
check("e quando não há projeto ativo nenhum, não inventa erro",
  /:\s*null,\s*\n\s*\);/.test(src),
  "'nada a mostrar' não é falha — não pode virar faixa vermelha");

/* ── 5. a última via: exceção antes das consultas ────────────────────────── */
check("o carregamento inteiro está dentro de um try/catch",
  /try \{\s*\n\s*await carregarDados\(\);\s*\n\s*\} catch \(e\) \{\s*\n\s*setErroAoCarregar\(mensagemDeErro\(e\)\);/.test(codigo),
  "`projects` ou `filterProjects` lançando é rejeição que ninguém aguarda");
check("e o efeito chama o invólucro, não o miolo desprotegido",
  /useEffect\(\(\) => \{ fetchData\(\); \}, \[fetchData\]\)/.test(codigo),
  "chamar carregarDados direto contornaria o catch");

/* ── 6. a mensagem chega ao usuário em português ─────────────────────────── */
check("usa o tradutor de erro do banco, não a mensagem crua",
  /import \{ mensagemDeErro \} from "@\/lib\/erroDoBanco"/.test(codigo),
  "erro cru do Postgres na tela é a família que já foi varrida");
check("a faixa de erro é renderizada",
  /erroAoCarregar && \(/.test(codigo)
  && /O cronograma não pôde ser carregado/.test(src));
check("com saída: dá para tentar de novo sem recarregar a página",
  /onClick=\{\(\) => \{ void fetchData\(\); \}\}/.test(codigo),
  "falha de rede é o caso comum; exigir F5 é castigo desproporcional");

/* ── 7. vazio legítimo também é explicado ────────────────────────────────── */
check("vazio por filtro é distinguido de vazio por ausência",
  /activities\.length > 0 \?/.test(codigo)
  && /Nenhuma atividade corresponde aos filtros/.test(src),
  "'Nenhuma atividade encontrada' respondia por três situações diferentes");
check("e o vazio por filtro diz QUANTAS estão escondidas",
  /Há <b className="tabular-nums">\{activities\.length\}<\/b>/.test(src),
  "sem o número, o usuário não sabe se vale mexer no filtro");

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
