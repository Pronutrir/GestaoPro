#!/usr/bin/env node
/**
 * LEVANTAMENTO DE HOMÔNIMOS — quem são, e o que cada perfil acumulou.
 *
 * `owner`, `manager`, `assigned_to` e `participants` guardam NOME, e a
 * permissão comparava por nome. Dois perfis com o mesmo `full_name` casavam
 * com as mesmas atividades — cada um recebendo o acesso do outro.
 *
 * A migration 20260826180000 fechou o furo (ambiguidade não concede). Este
 * script não conserta nada: ele MOSTRA, para a decisão de qual perfil fica.
 *
 * Conta tudo por IDENTIFICADOR (user_id), nunca por nome — senão mediria o
 * mesmo defeito que está investigando.
 *
 * Uso:  node scripts/medicoes/levantar-homonimos.cjs
 * Só faz SELECT.
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

const cab = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const buscar = async (p) => {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers: cab });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j));
  return j;
};
/** Só o total, pelo Content-Range — não traz linha nenhuma. */
const contar = async (p) => {
  const r = await fetch(`${URL}/rest/v1/${p}&limit=1`, {
    headers: { ...cab, Prefer: "count=exact" },
    method: "HEAD",
  });
  const cr = r.headers.get("content-range");
  return cr ? Number(cr.split("/")[1]) : 0;
};

(async () => {
  const perfis = await buscar(
    "profiles?select=id,full_name,email,provider,created_at,last_login_at,is_active,role_title,sector&limit=1000",
  );

  const porNome = new Map();
  for (const p of perfis) {
    const n = (p.full_name || "").trim().toLowerCase();
    if (!n) continue;
    if (!porNome.has(n)) porNome.set(n, []);
    porNome.get(n).push(p);
  }
  const duplicados = [...porNome.entries()].filter(([, v]) => v.length > 1);

  console.log(`\nperfis: ${perfis.length}`);
  console.log(`NOMES REPETIDOS: ${duplicados.length}\n`);

  if (duplicados.length === 0) {
    console.log("Nenhum homônimo. A trava da migration fica de prontidão.\n");
    return;
  }

  const projetos = await buscar("projects?select=id,title,owner,manager&is_trashed=eq.false&limit=500");
  const tituloDe = new Map(projetos.map((p) => [p.id, p.title]));

  for (const [nome, lista] of duplicados) {
    console.log("═".repeat(74));
    console.log(`  "${lista[0].full_name}"  —  ${lista.length} perfis`);
    console.log("═".repeat(74));

    // Onde este nome aparece como dono/gestor: é a concessão MAIOR.
    const comoDono = projetos.filter(
      (p) =>
        (p.owner || "").trim().toLowerCase() === nome ||
        (p.manager || "").trim().toLowerCase() === nome,
    );
    if (comoDono.length) {
      console.log(`\n  ⚠ é dono/gestor de ${comoDono.length} projeto(s) — a concessão maior:`);
      comoDono.forEach((p) => console.log(`      - ${p.title}`));
    }

    const emAtividades = await contar(
      `activities?select=id&assigned_to=eq.${encodeURIComponent(lista[0].full_name)}&is_trashed=eq.false`,
    );
    console.log(`\n  atividades com este NOME em assigned_to: ${emAtividades}`);

    for (const p of lista) {
      console.log(`\n  ── ${p.id}`);
      console.log(`     e-mail ......... ${p.email || "—"}`);
      console.log(`     entrou por ..... ${p.provider || "—"}`);
      console.log(`     criado em ...... ${(p.created_at || "").slice(0, 10) || "—"}`);
      console.log(`     último login ... ${(p.last_login_at || "").slice(0, 10) || "nunca registrado"}`);
      console.log(`     cargo .......... ${p.role_title || "—"}`);
      console.log(`     ativo .......... ${p.is_active ? "sim" : "NÃO"}`);

      const [resp, part, criou, membro, escritas, coment] = await Promise.all([
        contar(`activity_assignees?select=id&user_id=eq.${p.id}&papel=eq.responsavel`),
        contar(`activity_assignees?select=id&user_id=eq.${p.id}&papel=eq.participante`),
        contar(`activities?select=id&created_by=eq.${p.id}&is_trashed=eq.false`),
        contar(`project_members?select=id&user_id=eq.${p.id}`),
        contar(`audit_log?select=id&changed_by=eq.${p.id}`),
        contar(`activity_comments?select=id&created_by=eq.${p.id}&is_trashed=eq.false`),
      ]);

      console.log(`     responsável .... ${resp}`);
      console.log(`     participante ... ${part}`);
      console.log(`     criou .......... ${criou} atividades`);
      console.log(`     membro de ...... ${membro} projetos`);
      console.log(`     escritas ....... ${escritas}`);
      console.log(`     comentários .... ${coment}`);

      const ult = await buscar(
        `audit_log?select=created_at&changed_by=eq.${p.id}&order=created_at.desc&limit=1`,
      );
      console.log(`     ÚLTIMA escrita . ${ult[0] ? ult[0].created_at.slice(0, 10) : "—"}`);

      const pm = await buscar(`project_members?select=project_id&user_id=eq.${p.id}`);
      if (pm.length) {
        console.log(`     projetos:`);
        pm.slice(0, 6).forEach((m) =>
          console.log(`        - ${tituloDe.get(m.project_id) || m.project_id}`),
        );
        if (pm.length > 6) console.log(`        … e mais ${pm.length - 6}`);
      }
    }
    console.log("");
  }

  console.log("─".repeat(74));
  console.log("Nada foi alterado. A decisão de qual perfil fica é de pessoa —");
  console.log("ver docs/medicoes/homonimos-26-08-2026.md para as três perguntas.\n");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
