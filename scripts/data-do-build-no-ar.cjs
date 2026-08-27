#!/usr/bin/env node
/**
 * A DATA DO BUILD QUE ESTÁ NO AR — de fora, sem acesso à VM.
 *
 * O nginx/openresty devolve `ETag: "<tamanho>-<mtime>"` em hexadecimal, e o
 * mtime é o instante em que o arquivo foi gravado na imagem — ou seja, a hora
 * do build.
 *
 * ============================================================================
 * POR QUE ISTO EXISTE (e o que eu tinha concluído errado)
 *
 * Tentei identificar o build comparando o HASH dos chunks com um build local.
 * Não funciona, e não é por pouco: o Docker constrói em `node:22-alpine`, esta
 * máquina roda node 24, e Node diferente produz hash diferente para o MESMO
 * código. Daí concluí "não dá para saber de fora" — e parei cedo demais.
 *
 * Dá: o hash identifica o CONTEÚDO (e depende do ambiente de build), o ETag
 * carrega o INSTANTE (e não depende de nada). São perguntas diferentes.
 *
 * O que este script NÃO responde: qual commit. Para isso, a única saída é
 * carimbar versão + commit ao publicar — ver docs/DEPLOY.md.
 * ============================================================================
 *
 * Uso:  node scripts/data-do-build-no-ar.cjs [url]
 */
const URL_PADRAO = "https://gestaopro.pronutrir.com.br";
const base = (process.argv[2] || URL_PADRAO).replace(/\/$/, "");

const decodificar = (etag) => {
  const limpo = (etag || "").replace(/^W\//, "").replace(/"/g, "");
  const partes = limpo.split("-");
  if (partes.length !== 2) return null;
  const tamanho = parseInt(partes[0], 16);
  const mtime = parseInt(partes[1], 16);
  if (!Number.isFinite(tamanho) || !Number.isFinite(mtime)) return null;
  // Sanidade: mtime plausível (entre 2020 e 2100). Sem isto, um ETag de outro
  // formato viraria uma data absurda apresentada como fato.
  const d = new Date(mtime);
  const ano = d.getUTCFullYear();
  if (ano < 2020 || ano > 2100) return null;
  return { tamanho, data: d };
};

(async () => {
  const html = await (await fetch(`${base}/login`)).text();
  const assets = [...new Set(
    [...html.matchAll(/\/_next\/static\/[^"']+\.(?:js|css)/g)].map((m) => m[0]),
  )].slice(0, 8);

  if (assets.length === 0) {
    console.error("nenhum asset estático encontrado — a página mudou de forma?");
    process.exit(1);
  }

  const lidos = [];
  for (const a of assets) {
    const r = await fetch(`${base}${a}`, { method: "HEAD" });
    const info = decodificar(r.headers.get("etag"));
    if (info) lidos.push({ a, ...info });
  }

  if (lidos.length === 0) {
    console.error("nenhum ETag no formato <tamanho>-<mtime>. O servidor mudou?");
    process.exit(1);
  }

  console.log("");
  console.log(`  ${base}`);
  console.log("");
  for (const l of lidos) {
    console.log(`  ${l.data.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}  ${String(l.tamanho).padStart(7)} B  ${l.a.replace("/_next/static/", "")}`);
  }

  const instantes = [...new Set(lidos.map((l) => l.data.getTime()))];
  console.log("");
  if (instantes.length === 1) {
    const d = new Date(instantes[0]);
    console.log(`  BUILD NO AR: ${d.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })} (Fortaleza)`);
    console.log(`               ${d.toISOString()} (UTC)`);
  } else {
    // Assets de builds diferentes no mesmo deploy é sinal de cache do proxy
    // servindo arquivo velho — vale saber, não vale esconder numa média.
    console.log("  ⚠ assets com instantes DIFERENTES — pode ser cache do proxy:");
    instantes.sort().forEach((t) =>
      console.log(`      ${new Date(t).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}`));
  }
  console.log("");
  console.log("  (a data é do build; o COMMIT só se souber pela versão carimbada)");
  console.log("");
})().catch((e) => { console.error(e.message); process.exit(1); });
