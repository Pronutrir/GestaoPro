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
     * O banco tem? Reporta qual dos TRÊS ESTADOS o congelamento está, porque o
     * conserto é diferente em cada um — dizer só "falta a migration" mandaria
     * alguém rodar a coisa inteira no estado B, onde isso destrói dado.
     *
     *   A · sombra ausente ................ rodar a migration inteira
     *   B · sombra cheia, backfill não feito  rodar SÓ o backfill
     *   C · sombra cheia, backfill feito ... pode buildar
     *
     * COMO SE DISTINGUE B DE C — e por que não é comparando as colunas:
     *
     * O caminho intuitivo seria "a sombra difere do item_type atual?". Está
     * ERRADO. Hoje elas divergem em 785 linhas, e a causa não é o congelamento:
     * é a migration 20260824130000_pacote_e_posicao, que rodou DEPOIS da sombra
     * e fez atividade → fase nos itens de nível 3. Divergência prova que
     * *alguma coisa* escreveu, não que o BACKFILL escreveu.
     *
     * A prova tem de vir de algo que só o backfill produz: o VOCABULÁRIO. O
     * congelamento é a única coisa no sistema que grava 'entrega' e 'projeto'
     * em item_type — `eapToPersisted` grava 'fase' para os dois papéis
     * agrupadores, e nenhuma tela ou importação escreve esses valores.
     */
    bancoTem: async () => {
      // Existe o vocabulário que só o backfill produz?
      const rv = await api("activities?select=id&item_type=in.(entrega,projeto)&limit=1",
        { Prefer: "count=exact" });
      if (!rv.ok) return { ok: false, detalhe: `não consegui consultar o banco (${rv.status})` };
      const total = Number((rv.headers.get("content-range") || "").split("/")[1] ?? "0");

      // A sombra existe? Filtrar pela coluna é o que força o erro 42703 —
      // `?select=` ignora coluna desconhecida em silêncio.
      const rs = await api("activities?select=id&item_type_antes_congelar=not.is.null&limit=1");
      const sombraExiste = rs.ok;

      if (total > 0) {
        return { ok: true, detalhe: `estado C — backfill feito (${total} linhas com 'entrega'/'projeto')` };
      }
      if (!sombraExiste) {
        return {
          ok: false,
          detalhe: "estado A — a migration nunca rodou (não há coluna sombra)",
          comoResolver: "PGPASSWORD=... ./scripts/apply-congelar-item-type.sh",
        };
      }
      return {
        ok: false,
        detalhe:
          "estado B — a sombra EXISTE mas o backfill NÃO rodou.\n" +
          "     ⚠ NÃO rode a migration inteira: ela pularia o passo da sombra\n" +
          "       (WHERE ... IS NULL não casa com nada) e gravaria o 'antes' de\n" +
          "       HOJE por cima do original. 785 linhas perderiam o valor real,\n" +
          "       e o rollback da entrega 3 passaria a devolver um estado que\n" +
          "       nunca existiu.",
        comoResolver: "a migration RETOMÁVEL — ver docs/FILA-DE-TRABALHO.md §3.0. Ela ainda não existe.",
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
      // A regra pode devolver um conserto específico do estado que encontrou —
      // "rode a migration" e "NÃO rode a migration" são conselhos diferentes
      // conforme o estado, e o genérico está errado em um deles.
      console.log(`      RESOLVA COM: ${res.comoResolver ?? r.comoResolver}`);
    }
    console.log("");
  }

  if (bloqueia > 0) {
    console.error(`  \x1b[31mBUILD RECUSADO\x1b[0m — ${bloqueia} acoplamento(s) não satisfeito(s).`);
    // Sem "aplique a migration" genérico: no estado B esse conselho DESTRÓI
    // dado. Cada regra já imprimiu o conserto certo para o estado que achou.
    console.error("  Siga o RESOLVA COM de cada linha acima — o conserto muda conforme o estado.");
    console.error("  Se souber exatamente o que está fazendo:");
    console.error("    PULAR_BARREIRA=1 ./scripts/build-prod.sh <versao>\n");
    process.exit(1);
  }

  console.log("  \x1b[32mo banco suporta este código — pode buildar\x1b[0m\n");
})().catch((e) => {
  console.error(`\n  ✗ a barreira falhou: ${e.message}`);
  console.error("    NÃO publique sem saber por quê. Para forçar: PULAR_BARREIRA=1\n");
  process.exit(1);
});
