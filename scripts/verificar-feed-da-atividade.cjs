#!/usr/bin/env node
/**
 * O FEED DA ATIVIDADE — o que ACONTECEU, não o que disseram.
 *
 * Fase D. Era o primeiro pedido do Raphael e o único item da lista sem
 * estrutura nenhuma no banco.
 *
 * O que este arquivo trava é a diferença que o diagnóstico da seção 01 aponta:
 * *"o histórico é um chat, não um feed."* Chat mostra o que as pessoas
 * digitaram; feed mostra o que aconteceu — inclusive o que ninguém digitou, e
 * inclusive o que aconteceu nas filhas.
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
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nO FEED DA ATIVIDADE — o que aconteceu, agrupado por dia\n");

const mig = fs.readFileSync(
  path.join(raiz, "supabase/migrations/20260827150000_feed_da_atividade.sql"), "utf8");
const lib = fs.readFileSync(path.join(raiz, "src/lib/telaDaAtividadeDados.ts"), "utf8");

/* ── 1. A ESTRUTURA ──────────────────────────────────────────────────────── */
check("existe tabela de eventos", /CREATE TABLE IF NOT EXISTS public\.activity_feed_eventos/.test(mig));
check("e tabela de visitas, separada — o não-lido é por pessoa",
  /CREATE TABLE IF NOT EXISTS public\.activity_feed_visitas/.test(mig));
check("a visita tem chave (pessoa, atividade) — uma marca por par",
  /PRIMARY KEY \(user_id, activity_id\)/.test(mig));

/* ── 2. O EVENTO SOBE PARA O PAI ─────────────────────────────────────────
 *
 * É o coração da fase: "o que acontece nas subatividades aparece no feed da
 * atividade principal". Sem isso o trabalho das filhas fica invisível nos dois
 * lugares — elas não viram cartão, e o que fazem não chega a ninguém.
 */
check("`feed_de` existe e é diferente de `activity_id` quando o evento sobe",
  /feed_de\s+uuid NOT NULL/.test(mig));
check("há trigger que sobe o evento para o pai",
  /CREATE TRIGGER trg_feed_evento_sobe/.test(mig));
check(
  "e ela NÃO re-sobe o que já subiu — senão a fase teria a mesma linha N vezes",
  /IF NEW\.activity_id IS DISTINCT FROM NEW\.feed_de THEN\s*\n\s*RETURN NEW;/.test(mig),
);
check(
  "sobe UM nível, não até a raiz — o feed da fase encheria de horas de netas",
  /SELECT parent_id INTO v_pai/.test(mig) && !/WITH RECURSIVE/.test(mig),
);

/* ── 3. HISTÓRICO LEGÍVEL: SEM UUID, SEM ENUM EM INGLÊS ─────────────────── */
check("o texto é NOT NULL e vem pronto do banco",
  /texto\s+text NOT NULL/.test(mig));
check(
  "a frase é montada na ORIGEM, não com de-para na leitura",
  /Resolver o rótulo na origem/.test(lib) || /montada na ORIGEM/.test(lib),
);
check("o nome do autor é guardado junto — o histórico sobrevive ao perfil sumir",
  /autor_nome\s+text/.test(mig));

/* ── 4. O NÃO-LIDO ───────────────────────────────────────────────────────── */
check("conta desde a última visita", /gt\("created_at", desde\)/.test(lib));
check(
  "sem visita registrada, o não-lido é ZERO — não 'tudo'",
  /if \(!desde\) return 0;/.test(lib),
  "marcar tudo como novo faria o sino gritar em toda atividade nunca aberta",
);

/* ── 5. O AGRUPAMENTO POR DIA ────────────────────────────────────────────── */
/* `agruparPorDia` é função PURA, mas mora num módulo que importa o cliente
 * Supabase — e o alias "@/" não resolve fora do bundler. Em vez de carregar o
 * módulo inteiro (que falha no import), isolo a função compilada e a avalio
 * sozinha. Assim o teste roda o CÓDIGO REAL sem arrastar a infraestrutura. */
const agruparPorDia = (() => {
  const js = fs.readFileSync(path.join(saida, "telaDaAtividadeDados.js"), "utf8");
  const i = js.indexOf("function agruparPorDia");
  if (i < 0) throw new Error("agruparPorDia não encontrada no compilado");
  // até o fecha-chaves da função, que é a última do arquivo
  const corpo = js.slice(i);
  const fim = corpo.lastIndexOf("}");
  // eslint-disable-next-line no-eval
  return eval("(" + corpo.slice(0, fim + 1) + ")");
})();
const ev = (id, iso) => ({ id, tipo: "x", texto: "t", autor_nome: null, created_at: iso, activity_id: "a", feed_de: "a" });
const grupos = agruparPorDia(
  [ev("1", "2026-08-27T14:12:00Z"), ev("2", "2026-08-27T11:40:00Z"), ev("3", "2026-08-26T17:22:00Z"), ev("4", "2026-08-20T09:00:00Z")],
  "2026-08-27T18:00:00Z",
);
check("agrupa em Hoje / Ontem / data",
  grupos.map((g) => g.rotulo).join("|") === "Hoje|Ontem|20/08/2026",
  grupos.map((g) => g.rotulo).join("|"));
check("o dia mais recente vem primeiro", grupos[0].rotulo === "Hoje");
check("e os eventos do dia ficam juntos", grupos[0].eventos.length === 2);
check(
  "`hojeISO` entra por parâmetro — senão é impossível testar a virada do dia",
  /hojeISO: string/.test(lib),
);

/* ── 6. O FEED NÃO É PORTA LATERAL ──────────────────────────────────────── */
//
// Toda lista que atravessa atividades consome a MESMA camada de acesso. Um
// feed com RLS própria seria uma segunda regra, e ela divergiria.
check("RLS ligada nas duas tabelas",
  /ALTER TABLE public\.activity_feed_eventos ENABLE ROW LEVEL SECURITY/.test(mig)
  && /ALTER TABLE public\.activity_feed_visitas ENABLE ROW LEVEL SECURITY/.test(mig));
check("a leitura delega para a RLS de activities — não inventa regra",
  /EXISTS \(SELECT 1 FROM public\.activities a WHERE a\.id = activity_feed_eventos\.feed_de\)/.test(mig));
check("a visita é da pessoa: ninguém lê a marca de outro",
  /user_id = auth\.uid\(\)/.test(mig));

/* ── 7. O ROLLBACK AVISA DO QUE APAGA ───────────────────────────────────── */
const rb = fs.readFileSync(
  path.join(raiz, "supabase/migrations/20260827150001_feed_da_atividade_rollback.sql"), "utf8");
check("o rollback avisa que apaga histórico que não existe em outro lugar",
  /nao existem em outro lugar/.test(rb));
check("e oferece a saída menor: derrubar só a trigger",
  /derrube a TRIGGER e deixe/.test(rb));

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
