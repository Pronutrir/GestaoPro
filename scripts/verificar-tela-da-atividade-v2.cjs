#!/usr/bin/env node
/**
 * A TELA DA ATIVIDADE — uma tela, três estados.
 *
 * O que este arquivo trava não é aparência: é a promessa estrutural do desenho.
 * *"Criar é esta mesma tela vazia. Editar é ela com conteúdo. Visualizar é ela
 * sem os controles. Não são três telas para manter."*
 *
 * O modo de falhar aqui é conhecido e já aconteceu neste repositório três
 * vezes: alguém precisa de um comportamento diferente num estado, cria um
 * segundo componente "só para esse caso", e em três meses há duas telas
 * divergindo. Foi assim com as três fórmulas de progresso, com as três cópias
 * da subida do ancestral e com as duas listas de "quem agrupa".
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nA TELA DA ATIVIDADE — uma tela, três estados\n");

const tela = ler("src/components/atividade/TelaDaAtividade.tsx");
const campo = ler("src/components/atividade/CampoNoLugar.tsx");
const trilha = ler("src/components/atividade/TrilhaDaAtividade.tsx");
const feed = ler("src/components/atividade/FeedDaAtividade.tsx");
const dados = ler("src/lib/telaDaAtividadeDados.ts");

/* ── 1. UMA TELA, NÃO TRÊS ───────────────────────────────────────────────── */
check("os três estados vivem no mesmo componente",
  /export type EstadoDaTela = "criar" \| "editar" \| "visualizar"/.test(tela));
check(
  "e nenhum estado desvia para outro componente",
  !/if \(\s*estado === "visualizar"\s*\)\s*return\s*</.test(tela)
  && !/if \(\s*criando\s*\)\s*return\s*</.test(tela),
  "um `return <Outra/>` por estado é o começo das três telas",
);

/* ── 2. PERMISSÃO É AUSÊNCIA, NÃO `disabled` ─────────────────────────────── */
//
// O desenho: "campo sem permissão vira TEXTO; botão sem permissão NÃO APARECE
// — nunca apagado". Um input cinza convida ao clique e mente sobre o motivo.
check("sem capacidade, o gravador é undefined — e o campo vira texto",
  /pode && aoGravarCampo \? \(v: string\) => aoGravarCampo\(campo, v\) : undefined/.test(tela));
check("o campo sem `aoGravar` renderiza texto, não input",
  /if \(!podeEditar\) \{[\s\S]{0,400}<span/.test(campo));
check("botão de concluir só existe se houver capacidade",
  /capacidades\.concluir && aoConcluir && \(/.test(tela));
check("nenhum botão da tela usa `disabled` para representar permissão",
  !/disabled=\{!capacidades/.test(tela));

/* ── 3. OS TOTAIS VÊM DO SERVIDOR ────────────────────────────────────────── */
//
// A lista de filhas passa pela RLS: somar aqui encolhe o pai para quem enxerga
// menos. Aconteceu, e a gravação foi removida em 26/08.
check("a tela consome resumoDasSubatividades, não soma horas",
  /resumoDasSubatividades\(totais/.test(tela));
check("e não há reduce/soma de horas nas subatividades",
  !/subatividades[\s\S]{0,80}\.reduce\(/.test(tela));
check("lerTotaisDerivados apenas LÊ derived_*",
  /derived_hours \?\? null/.test(dados) && !/\+\s*derived_/.test(dados));

/* ── 4. A TRILHA É CONTEXTO, E SÓ CARREGA O PERMITIDO ────────────────────── */
//
// activity_breadcrumb é security_invoker=false de propósito. Um contador ali
// entregaria a existência das irmãs a quem chegou por atribuição. A migration
// diz: "NUNCA acrescentar contador, soma, pessoa, data ou custo".
const selectTrilha = (dados.match(/tabela\("activity_breadcrumb"\)[\s\S]{0,160}?\.select\("([^"]+)"\)/) || [])[1] || "";
const colunasTrilha = selectTrilha.split(",").map((c) => c.trim()).filter(Boolean);
const PROIBIDAS = ["hours", "cost", "assigned", "start", "end", "count", "progress", "derived"];
const vazando = colunasTrilha.filter((c) => PROIBIDAS.some((p) => c.includes(p)));
check(`a trilha lê só ${colunasTrilha.length} colunas, nenhuma proibida`,
  vazando.length === 0, `vazando: ${vazando.join(", ")}`);
check("o último degrau NÃO é link — é onde a pessoa está",
  /O último NÃO é link/.test(trilha));

/* ── 5. O FEED É FEED, NÃO CHAT ──────────────────────────────────────────── */
//
// O diagnóstico da seção 01: "o histórico é um chat, não um feed". Um chat
// mostra o que disseram; o feed mostra o que aconteceu — inclusive o que
// ninguém digitou.
check("o feed marca o que veio da subatividade",
  /naSubatividade/.test(feed));
check("e mistura evento e comentário na mesma coluna",
  /ehComentario/.test(feed) && /marco\?: boolean/.test(feed));
check("comentar aparece para quem só visualiza",
  /Comentar não\s*\n?\s*\* é alterar/.test(feed) || /Pode comentar; não pode alterar/.test(feed));

/* ── 6. CRIAR É A MESMA TELA VAZIA ───────────────────────────────────────── */
check("'Criar e continuar criando' existe",
  /Criar e continuar criando/.test(tela));
// A janela é generosa de propósito: entre o `{!criando && (` e a palavra
// "Subatividades" há o cartão inteiro, e apertar isso faz o teste falhar por
// contagem de caracteres em vez de por comportamento — foi o que aconteceu na
// primeira execução, com um teto de 200.
check("no estado criar, subatividades não aparecem (a atividade ainda não existe)",
  /\{!criando && \([\s\S]{0,600}Subatividades/.test(tela));
check("e o feed fica vazio, sem inventar histórico",
  /dias=\{criando \? \[\] : feed\}/.test(tela));

/* ── 7. O VAZIO DIZ O QUE FALTA ──────────────────────────────────────────── */
//
// "vazio diz o que falta — sem responsável, sem data — nunca 0, traço mudo ou
// a definir". É regra não negociável do desenho.
check('nenhum campo usa "a definir"', !/a definir/i.test(tela));
check("os vazios nomeiam a ausência",
  /vazio="sem responsável"/.test(tela) && /vazio="sem data"/.test(tela));
check("marco diz 'não se aplica' no GUT, não 'sem prioridade'",
  /dados\.ehMarco \? "não se aplica"/.test(tela));

/* ── 8. O LAYOUT É O DO DESENHO ──────────────────────────────────────────── */
check("grid 1fr 372px, medida da seção 02",
  /lg:grid-cols-\[1fr_372px\]/.test(tela));
check("status é ponto de 7px, nunca pastilha",
  /w-\[7px\] h-\[7px\] rounded-full/.test(tela));
check("nenhum hexadecimal solto — cor vem de token",
  !/#[0-9A-Fa-f]{6}/.test(tela) && !/#[0-9A-Fa-f]{6}/.test(campo));

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
