#!/usr/bin/env node
/**
 * O FEED DA ATIVIDADE — e a tabela que eu ia criar e NÃO precisava.
 *
 * ============================================================================
 * O ERRO QUE ESTE ARQUIVO REGISTRA
 *
 * A Fase D pedia "crie a tabela de eventos da atividade". Eu criei — com
 * trigger para subir o evento da filha para o pai, RLS, tudo.
 *
 * Era REDUNDANTE. Ao conferir o banco antes de aplicar, o próprio Postgres deu
 * a dica: sugeriu `activity_feed_events`, que já existia. A fase 08 (migration
 * 20260826170000) tinha entregue:
 *
 *   activity_feed_events   view que une CONVERSA + HISTÓRICO
 *   feed_da_subarvore()    junta a subárvore, ordenada, com o código EAP
 *
 * "O que acontece nas subatividades aparece no feed da atividade principal"
 * JÁ FUNCIONAVA. Confirmado com dado real: a função devolve eventos com
 * `ehraiz: false`, que são os das filhas.
 *
 * O que faltava era UMA coisa: o não-lido, que precisa de um sujeito.
 *
 * A lição: "criar a tabela X" não é o pedido — o pedido é o EFEITO. Conferir o
 * banco antes evitou duplicar o feed inteiro.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const saida = path.join(raiz, "node_modules", ".cache", "verificar-feed");
fs.mkdirSync(saida, { recursive: true });
const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(process.execPath,
    [tsc, "src/lib/telaDaAtividadeDados.ts", "--outDir", saida, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" });
} catch (e) { /* o .js basta */ }

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "[32m✓" : "[31m✗"}[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nO FEED — consome o que a fase 08 já entregou\n");

const mig = fs.readFileSync(
  path.join(raiz, "supabase/migrations/20260827150000_feed_visitas.sql"), "utf8");
const lib = fs.readFileSync(path.join(raiz, "src/lib/telaDaAtividadeDados.ts"), "utf8");

/* ── 1. NÃO DUPLICAR ─────────────────────────────────────────────────────── */
// A migração MENCIONA `activity_feed_eventos` no comentário que explica por
// que ela não a cria — e essa menção deve ficar. O que não pode existir é o
// CREATE. Foi a primeira versão deste teste que confundiu os dois.
check("a migration NÃO cria tabela de eventos — a fase 08 já tem",
  !mig.includes("CREATE TABLE IF NOT EXISTS public.activity_feed_eventos"));
check("e diz por quê, para ninguém tentar de novo",
  mig.includes("REDUNDANTE") && mig.includes("fase 08"));
check("o módulo consome feed_da_subarvore, não uma tabela própria",
  lib.includes("rpc(\"feed_da_subarvore\""));

/* ── 2. O QUE FALTAVA: O NÃO-LIDO ───────────────────────────────────────── */
check("cria a tabela de visitas", mig.includes("CREATE TABLE IF NOT EXISTS public.activity_feed_visitas"));
check("uma marca por (pessoa, atividade)", mig.includes("PRIMARY KEY (user_id, activity_id)"));
check("a visita é da pessoa — ninguém lê a marca de outro",
  mig.includes("user_id = auth.uid()"));
check("e a migration FALHA se a policy não existir",
  mig.includes("a policy da visita nao foi criada"));
check("sem visita registrada, o não-lido é ZERO — não 'tudo'",
  lib.includes("if (!desde) return 0;"));

/* ── 3. O QUE SUBIU DA FILHA É MARCADO ──────────────────────────────────── */
check("`ehraiz` distingue o que veio da subatividade",
  lib.includes("ehraiz: boolean"));

/* ── 4. A FRASE, NUM LUGAR SÓ ───────────────────────────────────────────── */
check("o de-para de campos mora em fraseDoEvento",
  lib.includes("export function fraseDoEvento"));
check("tipo desconhecido não vira enum em inglês na tela",
  lib.includes("registrou uma alteração"));

/* ── 5. O AGRUPAMENTO POR DIA ───────────────────────────────────────────── */
/* `agruparPorDia` é pura, mas mora num módulo que importa o cliente Supabase —
 * e "@/" não resolve fora do bundler. Isolo a função compilada.
 *
 * O corte para na PRÓXIMA declaração, não no fim do arquivo: quando
 * `fraseDoEvento` entrou depois dela, cortar no último `}` arrastava as duas e
 * o eval falhava com "Unexpected token 'function'". */
const agruparPorDia = (() => {
  const js = fs.readFileSync(path.join(saida, "telaDaAtividadeDados.js"), "utf8");
  const i = js.indexOf("function agruparPorDia");
  if (i < 0) throw new Error("agruparPorDia não encontrada no compilado");
  const resto = js.slice(i);
  const proxima = resto.indexOf("\nfunction ", 1);
  const corpo = proxima > 0 ? resto.slice(0, proxima) : resto;
  return eval("(" + corpo.slice(0, corpo.lastIndexOf("}") + 1) + ")");
})();
const ev = (id, iso) => ({ evento_id: id, ocorrido_em: iso, tipo: "alteracao", autor: null, ehraiz: true });
const g = agruparPorDia(
  [ev("1", "2026-08-27T14:12:00Z"), ev("2", "2026-08-27T11:40:00Z"), ev("3", "2026-08-26T17:22:00Z")],
  "2026-08-27T18:00:00Z");
check("agrupa em Hoje / Ontem", g.map((x) => x.rotulo).join("|") === "Hoje|Ontem");
check("e os do dia ficam juntos", g[0].eventos.length === 2);
check("`hojeISO` é parâmetro — senão a virada do dia não se testa",
  lib.includes("hojeISO: string"));

console.log(`
  ${ok} passaram, ${falhou} falharam
`);
process.exit(falhou === 0 ? 0 : 1);
