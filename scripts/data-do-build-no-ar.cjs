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

  /**
   * A DATA É A MAIOR ENTRE OS CHUNKS. Nunca a de um chunk específico.
   *
   * ============================================================================
   * POR QUE NÃO SE OLHA O WEBPACK — ele mente quando o conteúdo não muda
   *
   * O chunk do webpack é praticamente estável entre builds: mudanças em telas
   * não alteram o runtime. Se o conteúdo não muda, o arquivo pode conservar o
   * mtime do build ANTERIOR — e quem olhasse só para ele concluiria que nada
   * subiu, num deploy que subiu.
   *
   * A maior data entre todos os assets responde a pergunta certa: *"quando foi
   * o build mais recente que produziu algum destes arquivos?"*
   *
   * A versão anterior desta função tratava datas divergentes como anomalia e
   * apenas LISTAVA os instantes, sem decidir. Isso deixava justamente o caso
   * comum — alguns chunks reaproveitados, outros novos — sem resposta.
   * ============================================================================
   */
  const instantes = [...new Set(lidos.map((l) => l.data.getTime()))].sort((a, b) => a - b);
  const maior = new Date(Math.max(...instantes));

  console.log("");
  console.log(`  BUILD NO AR: ${maior.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })} (Fortaleza)`);
  console.log(`               ${maior.toISOString()} (UTC)`);
  console.log(`               (maior entre ${lidos.length} assets)`);

  if (instantes.length > 1) {
    // Chunk reaproveitado é normal; chunk de OUTRO DIA sugere cache do proxy
    // servindo arquivo velho — e isso vale um aviso, não um silêncio.
    const menor = new Date(Math.min(...instantes));
    const horas = (maior.getTime() - menor.getTime()) / 3600000;
    console.log("");
    console.log(`  ${instantes.length} instantes distintos; o mais antigo é ${menor.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}.`);
    if (horas > 24) {
      console.log("  ⚠ mais de 24h de diferença — pode ser cache do proxy servindo asset velho.");
    } else {
      console.log("  (normal: chunks sem alteração conservam o mtime do build anterior)");
    }
  }
  console.log("");
  console.log("  (a data é do build; o COMMIT só se souber pela versão carimbada)");
  console.log("");
})().catch((e) => { console.error(e.message); process.exit(1); });
