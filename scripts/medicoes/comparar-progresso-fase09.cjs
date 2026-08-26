#!/usr/bin/env node
/**
 * Compara o progresso do pai calculado NA TELA com o `derived_progress` do
 * servidor, antes de trocar a fonte.
 *
 * Resultado em 26/08/2026: 82 dos 581 pais mudariam, 74 deles PARA MENOS, até
 * 66 pontos percentuais. A troca foi barrada por causa disto — ver
 * docs/medicoes/progresso-tela-x-servidor-26-08-2026.md
 *
 * Uso:
 *   node scripts/medicoes/comparar-progresso-fase09.cjs
 *
 * Lê SUPABASE_SERVICE_ROLE_KEY e a URL do .env. Só faz SELECT.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..", "..");
const env = fs.readFileSync(path.join(raiz, ".env"), "utf8");
const pegar = (chave) => {
  const m = env.match(new RegExp(`^${chave}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};

const KEY = pegar("SUPABASE_SERVICE_ROLE_KEY");
const URL = pegar("NEXT_PUBLIC_SUPABASE_URL");
if (!KEY || !URL) {
  console.error("faltam SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL no .env");
  process.exit(1);
}

const buscar = async (caminho) => {
  const r = await fetch(`${URL}/rest/v1/${caminho}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j));
  return j;
};

(async () => {
  // Paginado: o proxy corta URL longa, e o teto do PostgREST é 1000 por vez.
  const atividades = [];
  for (let off = 0; off < 20000; off += 1000) {
    const lote = await buscar(
      "activities?select=id,parent_id,project_id,title,hours,is_milestone,status," +
        "workflow_stage_id,derived_hours,derived_progress,derived_children" +
        `&is_trashed=eq.false&order=id&limit=1000&offset=${off}`,
    );
    atividades.push(...lote);
    if (lote.length < 1000) break;
  }

  const colunas = await buscar(
    "workflow_stages?select=id,name,categoria,is_final,is_blocked,display_order," +
      "project_id,contributes_to_progress,is_exception&limit=2000",
  );

  console.log(`atividades vivas: ${atividades.length} · colunas: ${colunas.length}`);

  const porProjeto = {};
  colunas.forEach((c) => {
    (porProjeto[c.project_id] = porProjeto[c.project_id] || []).push(c);
  });
  const colunaPorId = new Map(colunas.map((c) => [c.id, c]));

  const filhasDe = new Map();
  atividades.forEach((a) => {
    if (a.parent_id) {
      const arr = filhasDe.get(a.parent_id) || [];
      arr.push(a);
      filhasDe.set(a.parent_id, arr);
    }
  });

  // `percentualAutomaticoDaColuna`: a j-ésima de K colunas de trabalho vale
  // j/(K+1). Divide por K+1 para nunca dar 100% antes da coluna final.
  const auto = (col, fluxo) => {
    if (!col) return 0;
    if (col.categoria === "concluida" || col.is_final) return 100;
    if (col.categoria === "backlog") return 0;
    if (col.is_blocked || col.is_exception) return 0;
    if (col.contributes_to_progress === false) return 0;
    const j = fluxo.findIndex((x) => x.id === col.id) + 1;
    return j <= 0 ? 0 : (j / (fluxo.length + 1)) * 100;
  };

  const porId = new Map(atividades.map((a) => [a.id, a]));
  let iguais = 0;
  const mudam = [];

  for (const [paiId, filhas] of filhasDe) {
    const pai = porId.get(paiId);
    if (!pai || pai.derived_progress == null) continue;

    const servidor = Number(pai.derived_progress);
    const fluxo = (porProjeto[pai.project_id] || [])
      .filter((c) => c.categoria === "andamento")
      .sort((a, b) => a.display_order - b.display_order);

    const valores = filhas.map((f) =>
      (f.status || "").toLowerCase() === "completed"
        ? 100
        : auto(colunaPorId.get(f.workflow_stage_id), fluxo),
    );
    const tela = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
    const delta = tela - servidor;

    if (Math.abs(delta) < 0.5) iguais++;
    else
      mudam.push({
        titulo: pai.title,
        tela: +tela.toFixed(1),
        servidor,
        delta: +delta.toFixed(1),
        filhas: filhas.length,
      });
  }

  mudam.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const caem = mudam.filter((m) => m.delta > 0).length;

  console.log("");
  console.log("PROGRESSO — tela (crédito por posição) x servidor (binário)");
  console.log(`  praticamente iguais (<0,5pp): ${iguais}`);
  console.log(`  MUDAM: ${mudam.length}`);
  console.log(`  a barra CAI: ${caem}    SOBE: ${mudam.length - caem}`);
  console.log("");
  console.log("| pai | tela hoje | servidor | delta | filhas |");
  console.log("|---|---|---|---|---|");
  mudam.slice(0, 12).forEach((m) =>
    console.log(
      `| ${m.titulo.slice(0, 32)} | ${m.tela}% | ${m.servidor}% | ` +
        `${m.delta > 0 ? "−" : "+"}${Math.abs(m.delta)}pp | ${m.filhas} |`,
    ),
  );
  console.log("");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
