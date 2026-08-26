#!/usr/bin/env node
/**
 * NOME DE DUAS PESSOAS NÃO IDENTIFICA NINGUÉM — guarda de `lib/identityMatch`.
 *
 * `owner`, `manager`, `assigned_to` e `participants` guardam NOME, e a
 * permissão comparava por nome. Medido em 26/08/2026: dois perfis ativos
 * chamados "Williame Correia de Lima" casavam com as MESMAS 450 atividades e
 * os MESMOS 2 projetos — cada um recebendo o acesso do outro.
 *
 * A comparação aqui é tolerante de propósito (nome curto × nome longo), o que
 * torna homônimo indistinguível por construção. A única saída correta é não
 * conceder.
 *
 * Roda o CÓDIGO REAL, compilado na hora.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const saida = path.join(raiz, "node_modules", ".cache", "verificar-homonimos");
fs.mkdirSync(saida, { recursive: true });

const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(
    process.execPath,
    [tsc, "src/lib/identityMatch.ts", "--outDir", saida, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" },
  );
} catch (e) {
  if (!fs.existsSync(path.join(saida, "identityMatch.js"))) {
    console.error("não foi possível compilar lib/identityMatch.ts");
    console.error(String(e.stdout || e.message).slice(0, 800));
    process.exit(1);
  }
}

const {
  buildUserCandidates, matchesIdentity, anyMatchesIdentity,
  definirNomesAmbiguos, nomesRepetidosEm, ehNomeAmbiguo,
} = require(path.join(saida, "identityMatch.js"));

let ok = 0;
let falhou = 0;
const check = (nome, condicao) => {
  console.log(`  ${condicao ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  condicao ? ok++ : falhou++;
};

console.log("\nNOME DE DUAS PESSOAS NÃO IDENTIFICA NINGUÉM\n");

// ── Detectar o nome repetido ──────────────────────────────────────────────
const perfis = [
  { full_name: "Williame Correia de Lima" },   // hotmail
  { full_name: "Williame Correia de Lima" },   // corporativo
  { full_name: "Raphael Luis Gomes Telles" },
  { full_name: "Liana Lopes" },
  { full_name: null },
];
const repetidos = nomesRepetidosEm(perfis);
check(
  "nomesRepetidosEm acha o nome duplicado, e só ele",
  repetidos.length === 1 && repetidos[0] === "williame correia de lima",
);
check("nome nulo não vira falso positivo", !repetidos.includes(""));

// ── Antes de registrar: o furo existe ─────────────────────────────────────
definirNomesAmbiguos([]);
const w1 = buildUserCandidates(["Williame Correia de Lima", "williame_lima@hotmail.com"]);
const w2 = buildUserCandidates(["Williame Correia de Lima", "williame.correia@pronutrir.com.br"]);

check(
  "SEM a trava, os DOIS homônimos casam com a mesma atividade (o furo)",
  matchesIdentity("Williame Correia de Lima", w1) &&
  matchesIdentity("Williame Correia de Lima", w2),
);

// ── Depois de registrar: ninguém passa pela via do nome ───────────────────
definirNomesAmbiguos(repetidos);

check(
  "COM a trava, nenhum dos dois casa pelo nome",
  !matchesIdentity("Williame Correia de Lima", w1) &&
  !matchesIdentity("Williame Correia de Lima", w2),
);
check(
  "a trava vale para variação de caixa e acento",
  !matchesIdentity("  WILLIAME CORREIA DE LIMA  ", w1),
);
check(
  "vale também em participants (anyMatchesIdentity)",
  !anyMatchesIdentity(["Felipe Cavalcanti", "Williame Correia de Lima"], w2),
);
check("ehNomeAmbiguo reconhece o nome", ehNomeAmbiguo("Williame Correia de Lima"));

// ── E NÃO pode derrubar quem tem nome único ───────────────────────────────
const raphael = buildUserCandidates(["Raphael Luis Gomes Telles", "pronutrirdev@outlook.com"]);
check(
  "quem tem nome único continua casando",
  matchesIdentity("Raphael Luis Gomes Telles", raphael),
);
check(
  "e continua casando pela forma curta do nome",
  matchesIdentity("Raphael Telles", raphael),
);
check(
  "e por e-mail",
  matchesIdentity("pronutrirdev@outlook.com", raphael),
);
check(
  "pessoa diferente continua NÃO casando",
  !matchesIdentity("Liana Lopes", raphael),
);

// ── O e-mail do homônimo ainda identifica: é único por definição ──────────
check(
  "e-mail do homônimo AINDA identifica — não há ambiguidade em e-mail",
  matchesIdentity("williame_lima@hotmail.com", w1),
);
check(
  "e o e-mail de um não casa com o outro",
  !matchesIdentity("williame_lima@hotmail.com", w2),
);

// ── Limpar volta ao estado anterior (idempotência) ────────────────────────
definirNomesAmbiguos([]);
check(
  "definirNomesAmbiguos([]) devolve o comportamento antigo",
  matchesIdentity("Williame Correia de Lima", w1),
);

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
