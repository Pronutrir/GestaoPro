#!/usr/bin/env node
/**
 * O QUE JÁ ESTÁ NO BANCO — pelo ESQUEMA, não pela tabela de controle.
 *
 * As duas fontes já divergiram duas vezes nesta semana:
 *   - uma migration rodou e não foi registrada;
 *   - outra foi registrada com o esquema pela metade.
 *
 * Por isso este script pergunta as DUAS coisas e mostra lado a lado. Quando
 * discordam, o esquema é a verdade: é ele que o código encontra em runtime.
 *
 * ============================================================================
 * O DETALHE QUE CUSTOU UMA INVESTIGAÇÃO
 *
 * Perguntar por uma coluna com `?select=<coluna>` **NÃO SERVE**: o PostgREST
 * ignora coluna inexistente e devolve `200` com as outras. Cheguei a concluir
 * que `assigned_to_id` existia — existia só na minha pergunta.
 *
 * FILTRAR pela coluna (`?<coluna>=not.is.null`) é o que força o `42703`.
 * ============================================================================
 *
 * Uso: node scripts/conferir-migrations.cjs
 * Só faz leitura.
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
if (!KEY || !URL) {
  console.error("faltam SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL no .env");
  process.exit(1);
}
const cab = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const Z = "00000000-0000-0000-0000-000000000000";

/** Coluna: FILTRA por ela — só assim o PostgREST reclama se não existir. */
const temColuna = async (tabela, coluna) => {
  const r = await fetch(`${URL}/rest/v1/${tabela}?select=id&${coluna}=not.is.null&limit=1`, { headers: cab });
  const t = await r.text();
  return !t.includes("42703");
};

const temTabela = async (tabela) => {
  const r = await fetch(`${URL}/rest/v1/${tabela}?select=*&limit=1`, { headers: cab });
  const t = await r.text();
  return !t.includes("PGRST205");
};

const temFuncao = async (nome, args) => {
  const r = await fetch(`${URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { ...cab, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  return !t.includes("PGRST202");
};

/** O que cada migration desta leva DEVE ter deixado no esquema. */
const ESPERADO = [
  { v: 20260825120000, nome: "visualizar não edita", tipo: "fn", alvo: "can_update_activity_v2", args: { _activity_id: Z, _user_id: Z } },
  { v: 20260826120000, nome: "fase 02 · assignees", tipo: "tabela", alvo: "activity_assignees" },
  { v: 20260826130000, nome: "fase 09 · derivação", tipo: "coluna", alvo: ["activities", "derived_hours"] },
  { v: 20260826140000, nome: "fase 04 · estágio", tipo: "coluna", alvo: ["activities", "estagio"] },
  { v: 20260826150000, nome: "P00 · escopo de leitura", tipo: "fn", alvo: "pode_ler_atividade_v2", args: { _activity_id: Z, _user_id: Z } },
  { v: 20260826160000, nome: "fase 05 · sincronia", tipo: "fn", alvo: "resolver_profile_do_texto", args: { _texto: "x" } },
  { v: 20260826170000, nome: "fase 08 · feed", tipo: "fn", alvo: "feed_da_subarvore", args: { _raiz: Z } },
  { v: 20260826180000, nome: "homônimos", tipo: "fn", alvo: "nome_e_ambiguo", args: { _texto: "x" } },
  { v: 20260826190000, nome: "progresso no servidor", tipo: "fn", alvo: "percentual_da_coluna", args: { _stage_id: Z } },
  { v: 20260826200000, nome: "conversão nome→id", tipo: "coluna", alvo: ["activities", "assigned_to_id"] },
];

(async () => {
  const r = await fetch(`${URL}/rest/v1/schema_migrations?select=version&version=gte.20260825000000`, { headers: cab });
  const registradas = new Set((await r.json()).map((x) => Number(x.version)));

  console.log("");
  console.log("| migration | o que deixa no esquema | ESQUEMA | REGISTRO |");
  console.log("|---|---|---|---|");

  const divergentes = [];
  const faltando = [];

  for (const e of ESPERADO) {
    let existe;
    let descricao;
    if (e.tipo === "tabela") { existe = await temTabela(e.alvo); descricao = `\`${e.alvo}\``; }
    else if (e.tipo === "coluna") { existe = await temColuna(e.alvo[0], e.alvo[1]); descricao = `\`${e.alvo[0]}.${e.alvo[1]}\``; }
    else { existe = await temFuncao(e.alvo, e.args); descricao = `\`${e.alvo}()\``; }

    const reg = registradas.has(e.v);
    console.log(`| \`${e.v}\` ${e.nome} | ${descricao} | ${existe ? "sim" : "**NÃO**"} | ${reg ? "sim" : "**NÃO**"} |`);

    if (existe !== reg) divergentes.push({ ...e, existe, reg });
    if (!existe) faltando.push(e);
  }

  console.log("");
  if (divergentes.length === 0) {
    console.log("  ✓ esquema e registro CONCORDAM em todas as linhas.");
  } else {
    console.log("  ⚠ DIVERGEM — e o esquema é a verdade:");
    for (const d of divergentes) {
      console.log(
        d.existe
          ? `    - ${d.v} está no esquema mas NÃO no registro (rodou sem registrar)`
          : `    - ${d.v} está no registro mas NÃO no esquema (registrou sem rodar, ou rodou pela metade)`,
      );
    }
  }

  console.log("");
  if (faltando.length === 0) {
    console.log("  Nada a aplicar: todas as migrations desta leva estão no esquema.");
  } else {
    console.log("  FALTA APLICAR de verdade:");
    for (const f of faltando) console.log(`    - ${f.v}  ${f.nome}`);
  }
  console.log("");
})().catch((e) => { console.error(e.message); process.exit(1); });
