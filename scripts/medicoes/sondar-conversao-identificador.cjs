#!/usr/bin/env node
/**
 * SONDA DA CONVERSÃO nome → identificador.
 *
 * Responde, ANTES de converter, a única pergunta que decide: quantos registros
 * resolvem para UM perfil ativo, e quantos não resolvem.
 *
 * A regra é a mesma da migration `20260826200000`, nesta ordem:
 *   1. uuid exato
 *   2. e-mail (único por definição)
 *   3. nome que casa com UM ÚNICO perfil ATIVO
 *
 * "Ativo" importa: um homônimo desativado não disputa, e o nome volta a
 * resolver. Perfil inativo não recebe atribuição nova, então usá-lo para
 * desempatar é seguro.
 *
 * Nada é convertido aqui. Só SELECT.
 *
 * Uso: node scripts/medicoes/sondar-conversao-identificador.cjs
 */
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

const q = async (p) => {
  const r = await fetch(`${URL}/rest/v1/${p}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j));
  return j;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const norm = (v) => (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

(async () => {
  const perfis = await q("profiles?select=id,full_name,email,is_active,sector,role_title&limit=1000");

  const porId = new Map(perfis.map((p) => [p.id, p]));
  const porEmail = new Map(perfis.filter((p) => p.email).map((p) => [norm(p.email), p]));
  const porNome = new Map();
  for (const p of perfis) {
    const n = norm(p.full_name);
    if (!n) continue;
    (porNome.get(n) ?? porNome.set(n, []).get(n)).push(p);
  }

  /** A regra da migration, em JS. Devolve {id, via} ou {id:null, motivo}. */
  const resolver = (texto) => {
    const t = (texto ?? "").trim();
    if (!t) return { id: null, motivo: "vazio" };

    if (UUID.test(t)) {
      return porId.has(t)
        ? { id: t, via: "uuid" }
        : { id: null, motivo: "uuid inexistente" };
    }

    const porE = porEmail.get(norm(t));
    if (porE) return { id: porE.id, via: "email" };

    const cands = porNome.get(norm(t)) ?? [];
    if (cands.length === 0) return { id: null, motivo: "nome sem perfil" };
    if (cands.length === 1) return { id: cands[0].id, via: "nome" };

    const ativos = cands.filter((p) => p.is_active);
    if (ativos.length === 1) return { id: ativos[0].id, via: "nome (1 ativo)" };
    return { id: null, motivo: `AMBIGUO (${ativos.length} ativos)`, candidatos: cands };
  };

  const atividades = [];
  for (let o = 0; o < 20000; o += 1000) {
    const l = await q(
      `activities?select=id,title,project_id,assigned_to,participants,created_at,is_trashed&order=id&limit=1000&offset=${o}`,
    );
    atividades.push(...l);
    if (l.length < 1000) break;
  }
  const projetos = await q("projects?select=id,title&limit=500");
  const tituloProj = new Map(projetos.map((p) => [p.id, p.title]));

  // ── assigned_to ─────────────────────────────────────────────────────────
  const comResp = atividades.filter((a) => (a.assigned_to ?? "").trim());
  const porVia = {};
  const ambiguos = [];
  for (const a of comResp) {
    const r = resolver(a.assigned_to);
    const chave = r.id ? r.via : r.motivo;
    porVia[chave] = (porVia[chave] ?? 0) + 1;
    if (!r.id && String(r.motivo).startsWith("AMBIGUO")) {
      ambiguos.push({
        id: a.id,
        titulo: a.title,
        projeto: tituloProj.get(a.project_id) ?? a.project_id,
        criada: (a.created_at ?? "").slice(0, 10),
        texto: a.assigned_to,
        viva: !a.is_trashed,
        candidatos: r.candidatos,
      });
    }
  }

  console.log("");
  console.log("═".repeat(70));
  console.log("  assigned_to — o que resolve, e o que não");
  console.log("═".repeat(70));
  console.log(`  atividades com responsável: ${comResp.length}`);
  console.log("");
  const resolvidos = Object.entries(porVia).filter(([k]) => !k.startsWith("AMBIGUO") && k !== "vazio" && !k.startsWith("nome sem") && !k.startsWith("uuid inex"));
  for (const [via, n] of Object.entries(porVia).sort((a, b) => b[1] - a[1])) {
    const marca = via.startsWith("AMBIGUO") ? "  ← PENDENTE" : via.startsWith("nome sem") || via.startsWith("uuid inex") ? "  ← sem perfil" : "";
    console.log(`    ${String(n).padStart(5)}  ${via}${marca}`);
  }
  const totalOk = resolvidos.reduce((s, [, n]) => s + n, 0);
  console.log("");
  console.log(`  CONVERTEM: ${totalOk}`);
  console.log(`  PENDENTES (ambíguos): ${ambiguos.length}`);
  console.log(`  sem perfil correspondente: ${comResp.length - totalOk - ambiguos.length}`);

  // ── participants ────────────────────────────────────────────────────────
  let pTotal = 0, pOk = 0, pAmb = 0, pSem = 0;
  for (const a of atividades) {
    for (const nome of a.participants ?? []) {
      if (!(nome ?? "").trim()) continue;
      pTotal++;
      const r = resolver(nome);
      if (r.id) pOk++;
      else if (String(r.motivo).startsWith("AMBIGUO")) pAmb++;
      else pSem++;
    }
  }
  console.log("");
  console.log("═".repeat(70));
  console.log("  participants");
  console.log("═".repeat(70));
  console.log(`  entradas: ${pTotal}`);
  console.log(`    CONVERTEM: ${pOk}`);
  console.log(`    PENDENTES (ambíguos): ${pAmb}`);
  console.log(`    sem perfil: ${pSem}`);

  // ── projects.owner / manager ────────────────────────────────────────────
  const projsFull = await q("projects?select=id,title,owner,manager,is_trashed&limit=500");
  let oOk = 0, oAmb = 0, oSem = 0, oTot = 0;
  for (const p of projsFull) {
    for (const campo of ["owner", "manager"]) {
      if (!(p[campo] ?? "").trim()) continue;
      oTot++;
      const r = resolver(p[campo]);
      if (r.id) oOk++;
      else if (String(r.motivo).startsWith("AMBIGUO")) oAmb++;
      else oSem++;
    }
  }
  console.log("");
  console.log("═".repeat(70));
  console.log("  projects.owner / manager");
  console.log("═".repeat(70));
  console.log(`  preenchidos: ${oTot}`);
  console.log(`    CONVERTEM: ${oOk}`);
  console.log(`    PENDENTES (ambíguos): ${oAmb}`);
  console.log(`    sem perfil: ${oSem}`);

  fs.writeFileSync(
    path.join(raiz, "_ambiguos.json"),
    JSON.stringify(ambiguos, null, 2),
  );
  console.log("");
  console.log(`  (detalhe dos ambíguos gravado em _ambiguos.json — ${ambiguos.length} linhas)`);
  console.log("");
})().catch((e) => { console.error(e.message); process.exit(1); });
