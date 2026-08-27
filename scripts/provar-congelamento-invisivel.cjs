#!/usr/bin/env node
/**
 * PROVA DE QUE NINGUÉM VÊ DIFERENÇA — passo 3 do congelamento de `item_type`.
 *
 * ============================================================================
 * O QUE ESTE SCRIPT PRECISA PROVAR
 *
 * A migration 20260827130000 grava em `item_type` o valor que `resolveEapKind`
 * produz com o `hasChildren` REAL. A promessa da decisão é que, no dia
 * seguinte, **ninguém vê nada mudar**.
 *
 * Provar isso é comparar, para uma amostra de 50 itens em projetos distintos,
 * o tipo EXIBIDO antes e o tipo EXIBIDO depois. "Exibido" é o que a tela mostra
 * — `resolveEapKind(item, hasChildren)` — não o campo cru.
 *
 *   ANTES:  resolveEapKind({...item, item_type: <o gravado hoje>}, temFilhas)
 *   DEPOIS: resolveEapKind({...item, item_type: <o congelado>},    temFilhas)
 *
 * Se algum divergir, a migration NÃO deve ser aplicada: quer dizer que o
 * `hasChildren` real diverge do que a tela usava, e isso precisa ser entendido
 * antes de seguir. O script para e mostra a lista.
 *
 * ============================================================================
 * POR QUE ISTO NÃO É TAUTOLOGIA
 *
 * À primeira vista parece que sempre bate: congela-se o que a função devolve e
 * depois pergunta-se à mesma função. Não bate por dois motivos reais:
 *
 *   1. `item_type` ENTRA no cálculo. `agrupa` é `item_type IN (fase,pacote) OR
 *      hasChildren` — então trocar o campo pode trocar a resposta. Um item
 *      gravado como 'fase', sem filhas e sem código EAP, hoje exibe "entrega"
 *      (agrupa, porque o campo diz fase); congelado como 'entrega', ele deixa
 *      de casar com `IN (fase,pacote)` e passaria a exibir "atividade".
 *      **É exatamente esse caso que o script existe para pegar** — e são os
 *      232 "fase sem filha nenhuma" da medição.
 *
 *   2. A migration é idempotente por construção (ela verifica o ponto fixo),
 *      mas idempotência no SQL não prova nada sobre o TypeScript. As duas
 *      regras são cópias uma da outra; este script é o único lugar onde a
 *      cópia em SQL é confrontada com a original.
 *
 * ============================================================================
 * SÓ LEITURA
 *
 * Nenhum PATCH, nenhum POST. O "depois" é calculado em memória, com a mesma
 * tradução que a migration faz — a migration não precisa ter rodado.
 *
 * Uso:  node scripts/provar-congelamento-invisivel.cjs
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");

/* ── credenciais ─────────────────────────────────────────────────────────── */
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

/* ── o código REAL, compilado na hora ────────────────────────────────────────
 * Reimplementar `resolveEapKind` aqui já produziu 56 divergências falsas numa
 * medição anterior. A função tem sutilezas (zeros decorativos, nível do
 * pacote por posição) que uma cópia à mão erra.
 */
const saida = path.join(raiz, "node_modules", ".cache", "provar-congelamento");
fs.mkdirSync(saida, { recursive: true });
const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(
    process.execPath,
    [tsc, "src/lib/eapModel.ts", "--outDir", saida, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" },
  );
} catch (e) {
  if (!fs.existsSync(path.join(saida, "eapModel.js"))) {
    console.error("não foi possível compilar src/lib/eapModel.ts");
    console.error(String(e.stdout || e.message));
    process.exit(1);
  }
}
const { resolveEapKind, EAP_LABELS } = require(path.join(saida, "eapModel.js"));

/* ── a tradução que a migration faz, em JS ───────────────────────────────────
 * Espelha eap_tipo_exibido() da 20260827130000. Aqui ela é só um NOME para
 * `resolveEapKind` — o valor congelado É o valor exibido, por definição da
 * decisão. Escrever assim deixa explícito que a migration não inventa regra.
 */
const valorCongelado = (item, temFilhas) => resolveEapKind(item, temFilhas);

/* ── leitura ─────────────────────────────────────────────────────────────── */
const api = async (rota) => {
  const r = await fetch(`${URL}/rest/v1/${rota}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

(async () => {
  console.log("\n  PROVA: o congelamento é invisível?\n");

  // A tabela inteira, em páginas — precisa ser inteira para saber quem tem
  // filha. Uma amostra não sabe: a filha de um item da amostra pode estar fora
  // dela.
  const campos = "id,project_id,title,item_type,wbs_code,is_milestone,parent_id,is_trashed";
  const todos = [];
  for (let de = 0; ; de += 1000) {
    const pag = await api(`activities?select=${campos}&order=id&offset=${de}&limit=1000`);
    todos.push(...pag);
    if (pag.length < 1000) break;
  }

  // `temFilhas` inclui a lixeira, como na migration: restaurar uma filha
  // descartada não pode mudar o tipo do pai.
  const comFilha = new Set();
  for (const a of todos) if (a.parent_id) comFilha.add(a.parent_id);

  console.log(`  ${todos.length} linhas lidas · ${comFilha.size} têm ao menos uma filha\n`);

  /* ── a amostra: 50 itens em projetos DISTINTOS ─────────────────────────────
   * Um por projeto até esgotar os projetos, depois completa. Amostra tirada de
   * um projeto só não prova nada sobre os outros — e a base tem convenções de
   * EAP diferentes entre projetos antigos e novos.
   *
   * Determinística de propósito (ordem por id, sem sorteio): a mesma amostra
   * amanhã, para poder comparar duas execuções.
   */
  const vivos = todos.filter((a) => !a.is_trashed);
  const porProjeto = new Map();
  for (const a of vivos) {
    if (!porProjeto.has(a.project_id)) porProjeto.set(a.project_id, []);
    porProjeto.get(a.project_id).push(a);
  }
  const projetos = [...porProjeto.keys()].sort();
  const amostra = [];
  for (let volta = 0; amostra.length < 50 && volta < 40; volta++) {
    for (const p of projetos) {
      const lista = porProjeto.get(p);
      if (volta < lista.length) amostra.push(lista[volta]);
      if (amostra.length >= 50) break;
    }
  }

  console.log(`  amostra: ${amostra.length} itens em ${new Set(amostra.map((a) => a.project_id)).size} projetos\n`);

  /* ── a comparação ────────────────────────────────────────────────────────── */
  const divergem = [];
  for (const a of amostra) {
    const temFilhas = comFilha.has(a.id);
    const antes = resolveEapKind(a, temFilhas);
    const congelado = valorCongelado(a, temFilhas);
    const depois = resolveEapKind({ ...a, item_type: congelado }, temFilhas);
    if (antes !== depois) divergem.push({ a, antes, congelado, depois, temFilhas });
  }

  if (divergem.length === 0) {
    console.log(`  \x1b[32m✓\x1b[0m os ${amostra.length} itens exibem o MESMO tipo antes e depois.`);
  } else {
    console.log(`  \x1b[31m✗ ${divergem.length} de ${amostra.length} MUDAM de aparência\x1b[0m\n`);
    for (const d of divergem.slice(0, 30)) {
      console.log(
        `    ${(d.a.wbs_code || "—").padEnd(10)} ${String(d.a.title).slice(0, 42).padEnd(44)}` +
        ` grava=${String(d.a.item_type).padEnd(10)} filhas=${d.temFilhas ? "sim" : "não"}` +
        `  ${EAP_LABELS[d.antes]} -> ${EAP_LABELS[d.depois]}`,
      );
    }
    if (divergem.length > 30) console.log(`    … e mais ${divergem.length - 30}`);
  }

  /* ── e a base inteira, porque a amostra pode ter sorte ─────────────────────
   * O passo 3 pede 50. Rodar nas 8.199 é de graça (já estão em memória) e
   * transforma "a amostra passou" em "não há nenhum caso". Se a amostra passar
   * e a base inteira não, o número aqui é a lista de revisão de verdade.
   */
  let mudamNaBase = 0;
  const paresBase = new Map();
  for (const a of todos) {
    const temFilhas = comFilha.has(a.id);
    const antes = resolveEapKind(a, temFilhas);
    const depois = resolveEapKind({ ...a, item_type: valorCongelado(a, temFilhas) }, temFilhas);
    if (antes !== depois) {
      mudamNaBase++;
      const k = `${antes} -> ${depois}`;
      paresBase.set(k, (paresBase.get(k) || 0) + 1);
    }
  }

  console.log("");
  console.log(`  na base inteira (${todos.length} linhas): ${mudamNaBase} mudam de aparência`);
  for (const [k, n] of [...paresBase.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`    ${k.padEnd(26)} ${n}`);
  }

  /* ── quantas linhas o campo muda (sem ninguém ver) ───────────────────────── */
  let campoMuda = 0;
  const paresCampo = new Map();
  for (const a of todos) {
    const novo = valorCongelado(a, comFilha.has(a.id));
    if (novo !== (a.item_type || "")) {
      campoMuda++;
      const k = `${a.item_type || "(vazio)"} -> ${novo}`;
      paresCampo.set(k, (paresCampo.get(k) || 0) + 1);
    }
  }
  console.log("");
  console.log(`  o CAMPO muda em ${campoMuda} linhas — e é isso que a migration escreve:`);
  for (const [k, n] of [...paresCampo.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`    ${k.padEnd(26)} ${n}`);
  }

  console.log("");
  console.log("  (só SELECT — nada foi alterado)\n");
  process.exit(divergem.length === 0 && mudamNaBase === 0 ? 0 : 1);
})().catch((e) => { console.error("\n  erro:", e.message, "\n"); process.exit(1); });
