#!/usr/bin/env node
/**
 * AUDITORIA DOS USOS DE `assigned_to` — quais são perigosos e quais podem esperar.
 *
 * A coluna guarda NOME em texto livre. Isso é inofensivo quando o código só
 * quer **mostrar** o nome, e é um defeito quando o código quer **saber quem é
 * a pessoa** — porque dois perfis homônimos são, para o texto, a mesma pessoa.
 *
 * Classificação:
 *
 *   COMPARA IDENTIDADE (perigoso) — o uso decide alguma coisa a partir de
 *     quem é: filtro "Minhas", comparação com o usuário logado, casamento
 *     com uma lista de pessoas, agrupamento por pessoa, notificação.
 *     Com homônimo, acerta ou erra por sorte.
 *
 *   SÓ EXIBE (seguro) — o uso pega o texto e mostra, ou o repassa para um
 *     campo que será mostrado. Homônimo aqui é confuso, não errado, e a
 *     marcação (lib/homonimos) já resolve.
 *
 *   ESCRITA — grava a coluna. Continua correta enquanto o texto for a fonte;
 *     a sincronia (20260826160000) mantém a tabela em dia.
 *
 * A heurística erra para o lado de PERIGOSO: um falso positivo custa uma
 * leitura, um falso negativo deixa um defeito de identidade no ar.
 *
 * Uso: node scripts/medicoes/auditar-usos-assigned-to.cjs [--md]
 */
const cp = require("child_process");
const path = require("path");

const raiz = path.join(__dirname, "..", "..");
const saida = cp.execSync("git grep -n assigned_to -- src", {
  cwd: raiz, encoding: "utf8", maxBuffer: 1e8,
});

/** Sinais de que o uso DECIDE a partir de quem é a pessoa. */
const SINAIS_IDENTIDADE = [
  { re: /user(\?)?\.(id|email)|currentUser|usuario\.(id|email)/i, motivo: "compara com o usuário logado" },
  { re: /matchesIdentity|anyMatchesIdentity|buildUserCandidates|normalizeIdentity/, motivo: "casamento de identidade" },
  { re: /ehMinha|soMinhas|["'`]minhas["'`]|filterAssignees|filterMine/i, motivo: 'filtro "Minhas"' },
  { re: /\.filter\([^)]*assigned_to|assigned_to[^)]*\.filter\(/, motivo: "filtra por pessoa" },
  { re: /new Set\([^)]*assigned_to|\bSet<[^>]*>\([^)]*assigned_to/, motivo: "conjunto de pessoas" },
  { re: /group|agrupa|byAssignee|porResponsavel/i, motivo: "agrupa por pessoa" },
  { re: /assigned_to\s*===|===\s*[a-z.]*assigned_to/i, motivo: "igualdade de nome" },
  { re: /notif|recipient|destinatario/i, motivo: "decide quem recebe notificação" },
  { re: /workload|carga|capacity/i, motivo: "carga de trabalho por pessoa" },
];

const SINAIS_ESCRITA = /update\(|insert\(|upsert\(|payload|formData|setFormData|: *null,?$/;

const arquivos = new Map();
let ignoradas = 0;
for (const bruta of saida.trim().split("\n")) {
  // O \r do CRLF quebra o `$` do regex e some com a linha SILENCIOSAMENTE.
  // Custou uma auditoria: a primeira versão contou 106 de 305 linhas, em 14
  // arquivos de 42, e o número parecia plausível. Por isso o script agora
  // conta o que ignorou e reclama no fim.
  const linha = bruta.replace(/\r$/, "");
  const m = linha.match(/^([^:]+):(\d+):(.*)$/);
  if (!m) { ignoradas++; continue; }
  const [, arquivo, n, texto] = m;
  const t = texto.trim();

  // Comentário puro não é uso.
  if (/^(\/\/|\*|\/\*)/.test(t)) {
    continue;
  }

  if (!arquivos.has(arquivo)) {
    arquivos.set(arquivo, { total: 0, identidade: [], escrita: 0, exibe: 0 });
  }
  const reg = arquivos.get(arquivo);
  reg.total++;

  const sinal = SINAIS_IDENTIDADE.find((s) => s.re.test(t));
  if (sinal) {
    reg.identidade.push({ linha: +n, motivo: sinal.motivo, trecho: t.slice(0, 100) });
  } else if (SINAIS_ESCRITA.test(t)) {
    reg.escrita++;
  } else {
    reg.exibe++;
  }
}

const linhas = [...arquivos.entries()]
  .sort((a, b) => b[1].identidade.length - a[1].identidade.length || b[1].total - a[1].total);

let tI = 0, tE = 0, tX = 0;
for (const [, v] of linhas) { tI += v.identidade.length; tE += v.escrita; tX += v.exibe; }

const md = process.argv.includes("--md");
const L = [];
L.push("| arquivo | usos | **comparam identidade** | escrevem | só exibem |");
L.push("|---|---|---|---|---|");
for (const [arquivo, v] of linhas) {
  const nome = arquivo.replace(/^src\//, "");
  const marca = v.identidade.length > 0 ? `**${v.identidade.length}**` : "—";
  L.push(`| \`${nome}\` | ${v.total} | ${marca} | ${v.escrita || "—"} | ${v.exibe || "—"} |`);
}
L.push(`| **TOTAL** | **${tI + tE + tX}** | **${tI}** | ${tE} | ${tX} |`);

console.log("");
console.log(L.join("\n"));
console.log("");

const brutas = saida.trim().split("\n").length;
const classificadas = tI + tE + tX;
console.log(
  `linhas do git grep: ${brutas} · classificadas: ${classificadas} · ` +
  `comentário: ${brutas - classificadas - ignoradas} · NÃO RECONHECIDAS: ${ignoradas}`,
);
if (ignoradas > 0) {
  console.error("\n  ATENÇÃO: linha não reconhecida vira subcontagem silenciosa.");
  process.exit(1);
}
console.log("");

if (tI > 0) {
  console.log("## Os que comparam identidade — um a um");
  console.log("");
  for (const [arquivo, v] of linhas) {
    if (!v.identidade.length) continue;
    console.log(`**\`${arquivo.replace(/^src\//, "")}\`**`);
    console.log("");
    for (const it of v.identidade) {
      console.log(`- linha ${it.linha} — *${it.motivo}*`);
      if (md) console.log(`  \`\`\`\n  ${it.trecho}\n  \`\`\``);
    }
    console.log("");
  }
}
