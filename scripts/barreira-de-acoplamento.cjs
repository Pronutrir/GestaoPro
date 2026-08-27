#!/usr/bin/env node
/**
 * A BARREIRA — recusa buildar código que o banco de produção ainda não suporta.
 *
 * ============================================================================
 * ESCRITA DEPOIS DO INCIDENTE DE 27/08/2026, 12:08
 *
 * O que aconteceu: o build com a leitura pura de `item_type` subiu com o
 * backfill do congelamento incompleto. Itens de nível 3 gravados como 'fase'
 * passaram a ser lidos como Entrega — viraram agrupador, sumiram do Kanban e
 * recusaram arrasto em silêncio. Relato do Raphael: "arrasta e nada acontece".
 *
 * POR QUE A "BARREIRA" ANTERIOR NÃO BARROU NADA — e esta é a lição:
 *
 * `publicar-as-tres.sh` existia desde as 09:48, duas horas antes do build. Ele
 * não falhou nem foi contornado: **ele nunca foi capaz de barrar**. Os comandos
 * de build viviam dentro de um `cat <<'TXT'`, ou seja, eram TEXTO IMPRESSO —
 * instruções para um humano ler, não código que executa ou verifica. E
 * `build-prod.sh`, que é o caminho normal e documentado de publicar, não
 * consultava nada sobre migrations.
 *
 * Escrevi um documento e chamei de barreira. Quem seguiu o caminho normal
 * passou por fora sem contorcer nada.
 *
 *   Uma barreira que depende de alguém ler não é barreira. É uma placa.
 *
 * Esta aqui roda DENTRO do build e sai com código ≠ 0. Para publicar assim
 * mesmo é preciso escrever `PULAR_BARREIRA=1` — que é explícito, aparece no
 * histórico do shell, e não acontece por distração.
 *
 * ============================================================================
 * O QUE ELA CONFERE
 *
 * Para cada acoplamento conhecido: o código do build EXIGE algo do banco?
 * Então esse algo tem de existir em produção AGORA. Não basta a coluna existir
 * — foi exatamente essa a armadilha do incidente: `item_type_antes_congelar`
 * existia, e por isso toda conferência dizia "APLICADA", enquanto o backfill
 * não tinha escrito uma linha sequer.
 *
 * Por isso cada regra confere o EFEITO, não o artefato.
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

const api = async (rota, extra = {}) => {
  const r = await fetch(`${URL}/rest/v1/${rota}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...extra },
  });
  return r;
};

/* ── as regras de acoplamento ────────────────────────────────────────────── */
const REGRAS = [
  {
    nome: "leitura pura de item_type ←→ congelamento aplicado",
    /**
     * O código exige? `resolveEapKind` sem o `OR hasChildren` — ele LÊ o campo.
     * Detectado no fonte, não numa lista que alguém precisa manter.
     */
    codigoExige: () => {
      const src = fs.readFileSync(path.join(raiz, "src/lib/eapModel.ts"), "utf8");
      const corpo = src.split("export function resolveEapKind")[1] ?? "";
      const trecho = corpo.slice(0, 1200);
      // Sem o OR = leitura pura = precisa do banco congelado.
      return /const agrupa\s*=/.test(trecho) && !/hasChildren/.test(trecho.split("const agrupa")[1]?.slice(0, 200) ?? "");
    },
    /**
     * O banco tem? NÃO basta a coluna existir — a armadilha do incidente. O
     * congelamento produz 'entrega' e 'projeto'; se não houver nenhum, o
     * backfill não rodou, por mais que a sombra esteja lá.
     */
    bancoTem: async () => {
      const r = await api("activities?select=id&item_type=eq.entrega&limit=1", { Prefer: "count=exact" });
      if (!r.ok) return { ok: false, detalhe: `não consegui consultar o banco (${r.status})` };
      const cr = r.headers.get("content-range") || "";
      const total = Number((cr.split("/")[1] ?? "0"));
      if (total > 0) return { ok: true, detalhe: `${total} linhas com item_type='entrega'` };
      return {
        ok: false,
        detalhe: "ZERO linhas com item_type='entrega' — o backfill do congelamento não rodou",
      };
    },
    consequencia:
      "itens de nível 3 gravados como 'fase' viram Entrega na leitura, somem do\n" +
      "     Kanban e recusam arrasto em silêncio. Foi o incidente de 27/08 12:08.",
    comoResolver: "PGPASSWORD=... ./scripts/apply-congelar-item-type.sh",
  },
  {
    nome: "eapPodeSerPai (só marco é folha) ←→ eap_is_group no banco",
    codigoExige: () => {
      const src = fs.readFileSync(path.join(raiz, "src/lib/eapModel.ts"), "utf8");
      return /export function eapPodeSerPai/.test(src);
    },
    /**
     * A tela oferece 'atividade' como destino. Se o banco ainda recusa, o
     * usuário descobre no clique, com erro cru do trigger. Conferido pelo
     * EFEITO: existe alguma atividade com filha? Se o trigger antigo estivesse
     * de pé, não existiria nenhuma — ele recusa.
     *
     * Enquanto ninguém tiver criado a primeira, a checagem não consegue
     * distinguir "o trigger novo está lá" de "está, mas ninguém usou". Nesse
     * caso ela AVISA em vez de barrar: barrar por falta de uso travaria o
     * primeiro build legítimo depois da migration.
     */
    bancoTem: async () => {
      const r = await api("activities?select=id,parent_id,item_type&item_type=eq.atividade&parent_id=not.is.null&limit=1");
      if (!r.ok) return { ok: false, detalhe: `não consegui consultar o banco (${r.status})` };
      const linhas = await r.json();
      if (linhas.length > 0) return { ok: true, detalhe: "há atividade com pai — o trigger novo está no ar" };
      return {
        ok: true,
        aviso: true,
        detalhe: "nenhuma atividade tem filha ainda — não dá para provar daqui que\n" +
                 "     o trigger novo subiu. Confira a conferência 6 do dia seguinte.",
      };
    },
    consequencia:
      "a tela oferece 'atividade' como destino de movimentação e o banco recusa,\n" +
      "     com erro cru do trigger.",
    comoResolver: "a mesma migration: ./scripts/apply-congelar-item-type.sh",
  },
];

/* ── execução ────────────────────────────────────────────────────────────── */
(async () => {
  if (process.env.PULAR_BARREIRA === "1") {
    console.log("\n  \x1b[33m⚠  BARREIRA PULADA (PULAR_BARREIRA=1)\x1b[0m");
    console.log("     Quem fizer isso assume o acoplamento. Anote em docs/deploys.md.\n");
    process.exit(0);
  }

  if (!KEY || !URL) {
    console.error("\n  ✗ faltam credenciais no .env — a barreira não pode conferir o banco.");
    console.error("    Corrija, ou publique com PULAR_BARREIRA=1 assumindo o risco.\n");
    process.exit(1);
  }

  console.log("\n  BARREIRA DE ACOPLAMENTO — o banco suporta este código?\n");

  let bloqueia = 0;
  for (const r of REGRAS) {
    let exige;
    try { exige = r.codigoExige(); } catch { exige = false; }

    if (!exige) {
      console.log(`  \x1b[90m–\x1b[0m ${r.nome}`);
      console.log(`      o código não exige isso; nada a conferir`);
      continue;
    }

    const res = await r.bancoTem();
    if (res.ok && !res.aviso) {
      console.log(`  \x1b[32m✓\x1b[0m ${r.nome}`);
      console.log(`      ${res.detalhe}`);
    } else if (res.aviso) {
      console.log(`  \x1b[33m!\x1b[0m ${r.nome}`);
      console.log(`      ${res.detalhe}`);
    } else {
      bloqueia++;
      console.log(`  \x1b[31m✗ ${r.nome}\x1b[0m`);
      console.log(`      ${res.detalhe}`);
      console.log(`      SE PUBLICAR ASSIM: ${r.consequencia}`);
      console.log(`      RESOLVA COM: ${r.comoResolver}`);
    }
    console.log("");
  }

  if (bloqueia > 0) {
    console.error(`  \x1b[31mBUILD RECUSADO\x1b[0m — ${bloqueia} acoplamento(s) não satisfeito(s).`);
    console.error("  Aplique a migration ANTES. Se souber o que está fazendo:");
    console.error("    PULAR_BARREIRA=1 ./scripts/build-prod.sh <versao>\n");
    process.exit(1);
  }

  console.log("  \x1b[32mo banco suporta este código — pode buildar\x1b[0m\n");
})().catch((e) => {
  console.error(`\n  ✗ a barreira falhou: ${e.message}`);
  console.error("    NÃO publique sem saber por quê. Para forçar: PULAR_BARREIRA=1\n");
  process.exit(1);
});
