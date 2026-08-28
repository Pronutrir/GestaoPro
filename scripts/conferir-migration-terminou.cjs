#!/usr/bin/env node
/**
 * A MIGRATION TERMINOU, OU SÓ RODOU? — a trava que faltou em 27/08.
 *
 * ============================================================================
 * O ERRO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
 *
 * A migration do congelamento **rodou e parou no meio**. Criou a coluna sombra,
 * copiou os valores antigos, e não escreveu o backfill. E ninguém percebeu por
 * dias — porque toda conferência perguntava *"a coluna existe?"*, e ela existia.
 *
 * A pergunta certa não é se a migration rodou. É se ela **produziu o efeito**.
 *
 *   ERRADO   "a coluna item_type_antes_congelar existe?"     → sim, e mentia
 *   CERTO    "existe alguma linha com item_type='entrega'?"  → zero, e denuncia
 *
 * Cada verificação abaixo conta LINHAS ESCRITAS e compara com o esperado.
 * Nenhuma delas se satisfaz com a existência de um artefato.
 *
 * Uso:  node scripts/conferir-migration-terminou.cjs [nome]
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const env = fs.readFileSync(path.join(raiz, ".env"), "utf8");
const g = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};
const KEY = g("SUPABASE_SERVICE_ROLE_KEY");
const URL = g("NEXT_PUBLIC_SUPABASE_URL");

const contar = async (rota) => {
  const r = await fetch(`${URL}/rest/v1/${rota}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "count=exact", Range: "0-0" },
  });
  if (!r.ok) return { erro: `${r.status} ${(await r.text()).slice(0, 120)}` };
  const cr = r.headers.get("content-range") || "";
  return { n: Number(cr.split("/")[1] ?? "0") };
};

const existe = async (tabela) => {
  const r = await fetch(`${URL}/rest/v1/${tabela}?limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  return r.ok;
};

/**
 * Cada verificação diz o EFEITO esperado, não o artefato.
 *
 * `minimo` é o piso: abaixo dele a migration não terminou. Ele existe porque
 * "mais que zero" às vezes é pouco — o backfill do congelamento escreveria
 * 2.604 linhas, e 3 significaria que parou logo no começo.
 */
const VERIFICACOES = {
  feed: {
    titulo: "Nao-lido do feed (20260827150000)",
    passos: [
      {
        /**
         * A tabela de EVENTOS nao esta aqui de proposito: ela ja existia (a
         * view activity_feed_events, da fase 08). Esta migration entrega so o
         * nao-lido, que precisa de um sujeito.
         */
        o_que: "a tabela de visitas responde",
        conferir: async () => {
          const ok = await existe("activity_feed_visitas");
          return { ok, detalhe: ok ? "responde" : "nao existe" };
        },
      },
      {
        o_que: "o feed da fase 08 continua respondendo",
        conferir: async () => {
          const ok = await existe("activity_feed_events");
          return { ok, detalhe: ok ? "a view da fase 08 responde" : "a view sumiu" };
        },
      },
    ],
  },

  incluir: {
    titulo: "Incluir e atribuir (20260827160000)",
    passos: [
      {
        o_que: "a função responde a uma chamada",
        conferir: async () => {
          // Chamada deliberadamente inválida: se a função NÃO existe, o
          // PostgREST devolve PGRST202. Se existe, devolve erro de negócio —
          // e é isso que se quer provar.
          const r = await fetch(`${URL}/rest/v1/rpc/incluir_e_atribuir`, {
            method: "POST",
            headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              p_activity_id: "00000000-0000-0000-0000-000000000000",
              p_user_id: "00000000-0000-0000-0000-000000000000",
            }),
          });
          const txt = await r.text();
          const naoExiste = /PGRST202/.test(txt);
          return {
            ok: !naoExiste,
            detalhe: naoExiste ? "a função não existe no banco" : "existe e respondeu",
          };
        },
      },
    ],
  },

  congelar: {
    titulo: "Congelamento de item_type (20260827130000)",
    passos: [
      {
        o_que: "a coluna sombra existe",
        conferir: async () => {
          const r = await fetch(`${URL}/rest/v1/activities?item_type_antes_congelar=not.is.null&limit=1`, {
            headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
          });
          return { ok: r.ok, detalhe: r.ok ? "existe" : "não existe" };
        },
      },
      {
        /**
         * ESTE É O PASSO QUE FALTOU. A coluna existia e a conferência dizia
         * "aplicada" — enquanto o backfill não tinha escrito uma linha.
         *
         * `entrega` e `projeto` são vocabulário que SÓ o backfill produz:
         * `eapToPersisted` grava 'fase' para os dois papéis agrupadores, e
         * nenhuma tela ou importação escreve esses valores.
         */
        o_que: "o BACKFILL escreveu — vocabulário que só ele produz",
        minimo: 100,
        conferir: async () => {
          const c = await contar("activities?select=id&item_type=in.(entrega,projeto)");
          if (c.erro) return { ok: false, detalhe: c.erro };
          return {
            ok: c.n >= 100,
            detalhe: `${c.n} linhas com item_type entrega/projeto (esperado: milhares)`,
          };
        },
      },
    ],
  },
};

(async () => {
  const alvo = process.argv[2];
  const nomes = alvo ? [alvo] : Object.keys(VERIFICACOES);

  console.log("\n  A MIGRATION TERMINOU, OU SÓ RODOU?\n");
  console.log("  Cada linha conta o EFEITO, nunca a existência de um artefato.\n");

  let falhou = 0;
  for (const nome of nomes) {
    const v = VERIFICACOES[nome];
    if (!v) { console.log(`  (não conheço "${nome}")`); continue; }
    console.log(`  ── ${v.titulo}`);
    for (const passo of v.passos) {
      const r = await passo.conferir();
      const marca = r.aviso ? "\x1b[33m!\x1b[0m" : r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      console.log(`     ${marca} ${passo.o_que}`);
      console.log(`         ${r.detalhe}`);
      if (!r.ok) falhou++;
    }
    console.log("");
  }

  if (falhou > 0) {
    console.error(`  \x1b[31m${falhou} verificação(ões) falharam — a migration NÃO terminou.\x1b[0m`);
    console.error("  NÃO publique o código que depende dela.\n");
    process.exit(1);
  }
  console.log("  \x1b[32mtodas terminaram\x1b[0m\n");
})().catch((e) => { console.error(`\n  erro: ${e.message}\n`); process.exit(1); });
