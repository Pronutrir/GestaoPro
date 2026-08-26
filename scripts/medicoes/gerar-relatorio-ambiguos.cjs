#!/usr/bin/env node
/**
 * GERA docs/medicoes/ambiguos-<data>.md — a lista dos registros que a
 * conversão nome → identificador deixou PENDENTES de propósito.
 *
 * Pendente = o texto casa com mais de um perfil ATIVO. Nenhuma heurística
 * separa duas pessoas com o mesmo nome; chutar seria dar a atividade de uma à
 * outra, silenciosamente.
 *
 * Uso:  node scripts/medicoes/gerar-relatorio-ambiguos.cjs [AAAA-MM-DD]
 * Só faz SELECT.
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
const DATA = process.argv[2] || "26-08-2026";

(async () => {
  const perfis = await q("profiles?select=id,full_name,email,is_active,sector,role_title,created_at,last_login_at&limit=1000");
  const porId = new Map(perfis.map((p) => [p.id, p]));
  const porEmail = new Map(perfis.filter((p) => p.email).map((p) => [norm(p.email), p]));
  const porNome = new Map();
  for (const p of perfis) {
    const n = norm(p.full_name);
    if (!n) continue;
    if (!porNome.has(n)) porNome.set(n, []);
    porNome.get(n).push(p);
  }

  const resolve = (t0) => {
    const t = (t0 ?? "").trim();
    if (!t) return { ok: true };
    if (UUID.test(t)) return { ok: porId.has(t) };
    if (porEmail.has(norm(t))) return { ok: true };
    const c = porNome.get(norm(t)) ?? [];
    if (c.length <= 1) return { ok: true };
    const ativos = c.filter((p) => p.is_active);
    if (ativos.length === 1) return { ok: true };
    return { ok: false, candidatos: c };
  };

  const atividades = [];
  for (let o = 0; o < 20000; o += 1000) {
    const l = await q(`activities?select=id,title,project_id,assigned_to,participants,created_at,is_trashed&order=created_at&limit=1000&offset=${o}`);
    atividades.push(...l);
    if (l.length < 1000) break;
  }
  const projetos = await q("projects?select=id,title,owner,manager,is_trashed&limit=500");
  const tituloProj = new Map(projetos.map((p) => [p.id, p.title]));

  const pend = [];
  for (const a of atividades) {
    const r = resolve(a.assigned_to);
    if (!r.ok) {
      pend.push({
        id: a.id, titulo: a.title,
        projeto: tituloProj.get(a.project_id) ?? a.project_id,
        criada: (a.created_at ?? "").slice(0, 10),
        texto: a.assigned_to, viva: !a.is_trashed,
        candidatos: r.candidatos,
      });
    }
  }
  const projPend = [];
  for (const p of projetos) {
    for (const campo of ["owner", "manager"]) {
      const r = resolve(p[campo]);
      if (!r.ok) projPend.push({ titulo: p.title, campo, texto: p[campo], viva: !p.is_trashed, candidatos: r.candidatos });
    }
  }
  let partPend = 0;
  for (const a of atividades) {
    for (const n of a.participants ?? []) if (!resolve(n).ok) partPend++;
  }

  const vivas = pend.filter((x) => x.viva);
  const textos = [...new Set(pend.map((x) => x.texto))];
  const porProj = {};
  vivas.forEach((x) => { (porProj[x.projeto] = porProj[x.projeto] ?? []).push(x); });

  const L = [];
  L.push(`# Registros ambíguos — pendentes de decisão · ${DATA.replace(/-/g, "/")}`);
  L.push("");
  L.push("> Estes registros **não foram convertidos** pela migration `20260826200000`, e isso é");
  L.push("> deliberado: o nome pertence a mais de um perfil **ativo**, e nenhuma heurística de");
  L.push("> string separa duas pessoas com o mesmo nome. Chutar daria a atividade de uma à outra,");
  L.push("> silenciosamente.");
  L.push(">");
  L.push("> **O texto original está intacto** em `assigned_to` e na coluna sombra");
  L.push("> `assigned_to_nome_original`. Nada foi perdido.");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## O tamanho");
  L.push("");
  L.push("| | |");
  L.push("|---|---|");
  L.push(`| Atividades pendentes | **${pend.length}** |`);
  L.push(`| — vivas | **${vivas.length}** |`);
  L.push(`| — na lixeira | ${pend.length - vivas.length} |`);
  L.push(`| Entradas em \`participants\` | ${partPend} |`);
  L.push(`| Campos \`owner\`/\`manager\` de projeto | ${projPend.length} |`);
  L.push(`| Textos ambíguos distintos | **${textos.length}** |`);
  L.push("");
  if (textos.length === 1) {
    L.push(`**Todos vêm de um único texto:** \`"${textos[0]}"\`. Nenhum outro nome da base é ambíguo.`);
    L.push("");
  }

  const cands = pend[0]?.candidatos ?? projPend[0]?.candidatos ?? [];
  if (cands.length) {
    L.push("## Os perfis candidatos");
    L.push("");
    L.push("| | " + cands.map((_, i) => `**${String.fromCharCode(65 + i)}**`).join(" | ") + " |");
    L.push("|---|" + cands.map(() => "---").join("|") + "|");
    L.push("| `id` | " + cands.map((c) => `\`${c.id}\``).join(" | ") + " |");
    L.push("| e-mail | " + cands.map((c) => c.email ?? "—").join(" | ") + " |");
    L.push("| cargo | " + cands.map((c) => c.role_title ?? "—").join(" | ") + " |");
    L.push("| setor | " + cands.map((c) => c.sector ?? "—").join(" | ") + " |");
    L.push("| criado em | " + cands.map((c) => (c.created_at ?? "").slice(0, 10) || "—").join(" | ") + " |");
    L.push("| último login | " + cands.map((c) => (c.last_login_at ?? "").slice(0, 10) || "**nunca**").join(" | ") + " |");
    L.push("| ativo | " + cands.map((c) => (c.is_active ? "sim" : "**NÃO**")).join(" | ") + " |");
    L.push("");
    L.push("Levantamento completo, com volume de trabalho de cada um:");
    L.push("`docs/medicoes/homonimos-26-08-2026.md`.");
    L.push("");
  }

  L.push("---");
  L.push("");
  L.push("## Por projeto — só as atividades VIVAS");
  L.push("");
  L.push("| projeto | atividades | período |");
  L.push("|---|---|---|");
  Object.entries(porProj).sort((a, b) => b[1].length - a[1].length).forEach(([proj, lista]) => {
    const ds = lista.map((x) => x.criada).filter(Boolean).sort();
    const per = ds.length ? (ds[0] === ds[ds.length - 1] ? ds[0] : `${ds[0]} a ${ds[ds.length - 1]}`) : "—";
    L.push(`| ${proj} | ${lista.length} | ${per} |`);
  });
  L.push("");

  if (projPend.length) {
    L.push("## Projetos com dono/gestor ambíguo");
    L.push("");
    L.push("Aqui a concessão é **maior** — dono manda em tudo dentro do projeto.");
    L.push("");
    L.push("| projeto | campo | texto |");
    L.push("|---|---|---|");
    projPend.forEach((p) => L.push(`| ${p.titulo} | \`${p.campo}\` | ${p.texto} |`));
    L.push("");
  }

  L.push("---");
  L.push("");
  L.push("## A lista completa das vivas");
  L.push("");
  L.push("<details><summary>" + vivas.length + " atividades — clique para abrir</summary>");
  L.push("");
  L.push("| # | atividade | projeto | criada | id |");
  L.push("|---|---|---|---|---|");
  vivas.forEach((x, i) => {
    const t = (x.titulo ?? "").replace(/\|/g, "\\|").slice(0, 60);
    const p = (x.projeto ?? "").replace(/\|/g, "\\|").slice(0, 34);
    L.push(`| ${i + 1} | ${t} | ${p} | ${x.criada} | \`${x.id.slice(0, 8)}\` |`);
  });
  L.push("");
  L.push("</details>");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## Como converter, depois da decisão");
  L.push("");
  L.push("O script já está pronto — **escrito e não rodado**:");
  L.push("");
  L.push("```bash");
  L.push("# na VM, com PGPASSWORD exportado");
  L.push("PERFIL=<uuid-do-perfil-correto> ./scripts/desempatar-homonimo.sh");
  L.push("```");
  L.push("");
  L.push("Ele mostra quantos registros vai converter, pede confirmação, converte **todos de uma");
  L.push("vez** e confere depois. O texto original continua intacto, e a coluna sombra permite");
  L.push("desfazer.");
  L.push("");
  L.push("**A decisão não é técnica.** Os dois perfis estão ativos e os dois escrevem — ver o");
  L.push("levantamento. A pergunta é por qual login a pessoa entra hoje.");
  L.push("");
  L.push("---");
  L.push("");
  L.push("**Método:** `scripts/medicoes/gerar-relatorio-ambiguos.cjs`, só `SELECT`. Regenerável a");
  L.push("qualquer momento — os números mudam conforme a base.");

  const destino = path.join(raiz, "docs", "medicoes", `ambiguos-${DATA}.md`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, L.join("\n") + "\n");
  console.log(`escrito: docs/medicoes/ambiguos-${DATA}.md`);
  console.log(`  atividades pendentes: ${pend.length} (${vivas.length} vivas)`);
  console.log(`  participants: ${partPend}   owner/manager: ${projPend.length}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
