#!/usr/bin/env node
/**
 * METADADO DE COLUNA — sem tocar em dado.
 *
 * ============================================================================
 * A REGRA QUE ESTE SCRIPT EXISTE PARA CUMPRIR
 *
 * Para descobrir metadado — se uma coluna aceita NULL, qual o tipo, se existe —
 * pergunte ao ESQUEMA, nunca ao dado. **Nenhuma escrita em produção durante
 * tarefa de medição**, nem em linha na lixeira.
 *
 * A regra nasceu de um erro concreto: para saber se `priority` aceitava NULL,
 * fiz um `PATCH` real numa linha (descartada, mas real) e li o código HTTP.
 * Funcionou e estava errado — a pergunta era de metadado e a resposta veio de
 * uma escrita em produção.
 *
 * ============================================================================
 * POR QUE NÃO `information_schema` DIRETO
 *
 * O PostgREST não o expõe: `Accept-Profile: information_schema` devolve
 * `PGRST106 — Only the following schemas are exposed: public, graphql_public,
 * app, pronutrir`.
 *
 * O que ele expõe é o **schema OpenAPI** da raiz, gerado a partir do catálogo
 * do Postgres. Ali estão tipo, formato, default e — em `required` — quais
 * colunas são NOT NULL. É metadado de verdade, sem ler nem escrever linha.
 *
 * Dentro de uma migration, `information_schema` está disponível normalmente e é
 * o caminho preferido; este script é para quando se pergunta de fora.
 *
 * Uso:
 *   node scripts/metadado-da-coluna.cjs activities
 *   node scripts/metadado-da-coluna.cjs activities item_type priority
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

const tabela = process.argv[2];
const colunas = process.argv.slice(3);
if (!tabela) {
  console.error("uso: node scripts/metadado-da-coluna.cjs <tabela> [coluna...]");
  process.exit(1);
}

(async () => {
  const r = await fetch(`${URL}/rest/v1/`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: "application/openapi+json" },
  });
  const j = await r.json();
  const def = j.definitions && j.definitions[tabela];
  if (!def) {
    console.error(`tabela "${tabela}" não está no schema exposto`);
    process.exit(1);
  }

  const req = new Set(def.required || []);
  const alvo = colunas.length ? colunas : Object.keys(def.properties);

  console.log("");
  console.log(`  ${tabela} — ${alvo.length} coluna(s)`);
  console.log("");
  console.log("  coluna                tipo            NOT NULL      default");
  console.log("  " + "-".repeat(70));
  for (const c of alvo) {
    const p = def.properties[c];
    if (!p) { console.log(`  ${c.padEnd(22)}(não existe nesta tabela)`); continue; }
    const tipo = `${p.type ?? "?"}${p.format && p.format !== p.type ? `/${p.format}` : ""}`;
    console.log(
      `  ${c.padEnd(22)}${tipo.padEnd(16)}${(req.has(c) ? "sim" : "aceita NULL").padEnd(14)}` +
      `${p.default !== undefined ? JSON.stringify(p.default) : ""}`,
    );
  }
  console.log("");
  console.log("  (lido do schema OpenAPI — nenhuma linha foi lida nem escrita)");
  console.log("");
})().catch((e) => { console.error(e.message); process.exit(1); });
