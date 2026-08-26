#!/usr/bin/env node
/**
 * A COPIA DOS PESOS ESTA CERTA? — o teste que a decisao exigiu.
 *
 * A migration 20260826190000 copia para `derivar_do_pai()` a regua da TELA
 * (credito parcial por posicao de coluna). O resultado esperado e **zero barra
 * mudando de valor** para quem enxerga o projeto inteiro.
 *
 * ============================================================================
 * O LADO "TELA" CHAMA O CODIGO REAL, COMPILADO NA HORA.
 *
 * A primeira versao reimplementava `computeActivityProgress` em JS, e a
 * reimplementacao divergia da funcao real — o mesmo erro cometido no mesmo dia
 * na medicao do Cronograma. Reimplementar o outro lado da comparacao e o modo
 * classico de "medir" o proprio engano.
 *
 * Aqui o unico lado simulado e o SQL, que ainda nao existe no banco e por isso
 * nao tem como ser chamado. Quando a migration 20260826190000 for aplicada,
 * este script deve passar a chamar `derivar_do_pai()` de verdade.
 *
 * E O ID VAI NA SAIDA. Diagnosticar pelo titulo custou uma investigacao
 * inteira: ha NOVE atividades chamadas "Cargas", e eu abri a errada — conclui
 * que o script estava com defeito quando o numero dele estava certo.
 * ============================================================================
 *
 * Uso: node scripts/medicoes/conferir-progresso-servidor.cjs
 * So faz SELECT.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..", "..");
const env = fs.readFileSync(path.join(raiz, ".env"), "utf8");
const g = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};
const KEY = g("SUPABASE_SERVICE_ROLE_KEY");
const URL = g("NEXT_PUBLIC_SUPABASE_URL");

// ── compila a regra REAL da tela ──────────────────────────────────────────
const saida = path.join(raiz, "node_modules", ".cache", "conferir-progresso");
fs.mkdirSync(saida, { recursive: true });
const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(
    process.execPath,
    [tsc, "src/lib/activityProgress.ts", "--outDir", saida, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" },
  );
} catch (e) {
  if (!fs.existsSync(path.join(saida, "activityProgress.js"))) {
    console.error("nao foi possivel compilar lib/activityProgress.ts");
    process.exit(1);
  }
}
const { computeActivityProgress } = require(path.join(saida, "activityProgress.js"));

const q = async (p) => {
  const r = await fetch(`${URL}/rest/v1/${p}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j));
  return j;
};
const clamp = (n) => Math.max(0, Math.min(100, n));

(async () => {
  const at = [];
  for (let o = 0; o < 20000; o += 1000) {
    const l = await q(
      "activities?select=id,parent_id,project_id,title,status,workflow_stage_id," +
      `is_milestone,derived_children,derived_progress&is_trashed=eq.false&order=id&limit=1000&offset=${o}`,
    );
    at.push(...l);
    if (l.length < 1000) break;
  }
  const st = await q(
    "workflow_stages?select=id,project_id,categoria,is_final,is_blocked,is_exception," +
    "display_order,contributes_to_progress,progress_percent,title&limit=2000",
  );

  const colPorId = new Map(st.map((s) => [s.id, s]));
  const porProjeto = {};
  st.forEach((s) => { (porProjeto[s.project_id] = porProjeto[s.project_id] || []).push(s); });

  const kids = new Map();
  at.forEach((a) => {
    if (a.parent_id) { const r = kids.get(a.parent_id) || []; r.push(a); kids.set(a.parent_id, r); }
  });
  const porId = new Map(at.map((a) => [a.id, a]));

  // ── LADO SQL (simulado — a funcao ainda nao existe no banco) ────────────
  const categoria = (c) => {
    const e = (c.categoria || "").trim();
    if (e) return e;
    if (c.is_final) return "concluida";
    if (c.display_order === 0) return "backlog";
    if (c.is_blocked || c.is_exception) return "andamento";
    if (c.contributes_to_progress === false) return "a_iniciar";
    return "andamento";
  };
  const emCurso = (cat) => cat === "andamento" || cat === "revisao";

  const pctColuna = (stageId) => {
    if (!stageId) return 0;
    const c = colPorId.get(stageId);
    if (!c) return 0;
    const cat = categoria(c);
    if (cat === "espera") return c.progress_percent ?? null;
    if (cat === "cancelada") return null;
    if (emCurso(cat)) {
      if (c.progress_percent != null) return clamp(c.progress_percent);
      const fluxo = (porProjeto[c.project_id] || [])
        .filter((s) => emCurso(categoria(s)))
        .sort((a, b) => a.display_order - b.display_order);
      const j = fluxo.findIndex((s) => s.id === stageId) + 1;
      if (j <= 0) return 25;
      return clamp(Math.round((j / (fluxo.length + 1)) * 100));
    }
    return cat === "concluida" ? 100 : 0;
  };

  const memo = new Map();
  const avancoSql = (a, vistos = new Set()) => {
    if (memo.has(a.id)) return memo.get(a.id);
    if (vistos.has(a.id)) return 0;
    const vs = new Set(vistos); vs.add(a.id);
    let v;
    if ((a.status || "").toLowerCase() === "completed") v = 100;
    else if (a.is_milestone) {
      const c = colPorId.get(a.workflow_stage_id);
      v = c && (c.is_final || (c.categoria || "").trim() === "concluida") ? 100 : 0;
    } else {
      const f = kids.get(a.id) || [];
      // UM NIVEL: a tela pontua a filha pela COLUNA dela, mesmo quando ela e pai
      // (subAvanco: "um nivel e o que existe"). Sem ramo para 'ja e pai'.
      v = pctColuna(a.workflow_stage_id);
    }
    memo.set(a.id, v);
    return v;
  };
  const progressoSql = (pai, vistos = new Set()) => {
    const f = kids.get(pai.id) || [];
    if (!f.length) return null;
    const vals = f.map((x) => avancoSql(x, vistos)).filter((v) => v !== null && v !== undefined);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };

  // ── LADO TELA: a funcao REAL ───────────────────────────────────────────
  const telaPct = (pai) => {
    const filhas = kids.get(pai.id) || [];
    if (!filhas.length) return null;
    const stages = porProjeto[pai.project_id] || [];
    const r = computeActivityProgress(
      pai.workflow_stage_id, stages, null, filhas, pai.is_milestone, false,
    );
    return r.percent;
  };

  let iguais = 0;
  const diferem = [];
  for (const [pid] of kids) {
    const pai = porId.get(pid);
    if (!pai) continue;
    const novo = progressoSql(pai);
    const tela = telaPct(pai);
    if (novo === null || tela === null) continue;
    if (Math.abs(novo - tela) < 0.01) iguais++;
    else diferem.push({
      id: pai.id, proj: pai.project_id, t: pai.title, tela, novo, d: +(novo - tela).toFixed(2), n: (kids.get(pid) || []).length,
    });
  }

  diferem.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  console.log("");
  console.log("A REGUA NOVA DO SERVIDOR x A TELA REAL (codigo compilado)");
  console.log(`  iguais: ${iguais}`);
  console.log(`  DIFEREM: ${diferem.length}`);
  if (diferem.length) {
    console.log("");
    // O ID vai junto: ha NOVE atividades chamadas "Cargas" na base, e
    // diagnosticar pelo titulo leva a inspecionar a errada — aconteceu.
    console.log("| pai | id | tela | servidor novo | delta | filhas |");
    console.log("|---|---|---|---|---|---|");
    diferem.slice(0, 15).forEach((r) =>
      console.log(`| ${r.t.slice(0, 28)} | ${r.id.slice(0, 8)} | ${r.tela}% | ${r.novo}% | ${r.d > 0 ? "+" : ""}${r.d}pp | ${r.n} |`));
    console.log("");
    console.log("  ⚠ A COPIA DOS PESOS ESTA ERRADA. O combinado e parar aqui.");
    process.exit(1);
  }
  console.log("");
  console.log("  ✓ zero barra muda de valor para quem enxerga o projeto inteiro.");
  console.log("");
})().catch((e) => { console.error(e.message); process.exit(1); });
