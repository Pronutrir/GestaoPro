#!/usr/bin/env node
/**
 * HOMÔNIMO SE ANUNCIA — guarda da marcação nas telas.
 *
 * Decisão do Raphael: **marcar, não unificar.** Os dois perfis continuam
 * existindo; o que muda é que, onde o sistema mostra ou oferece pessoas, um
 * nome repetido aparece com um diferenciador que a pessoa reconhece.
 *
 * O que este arquivo trava:
 *   1. a detecção do nome repetido (a regra, rodando de verdade);
 *   2. o diferenciador prefere E-MAIL — os dois "Williame" são do mesmo setor,
 *      então cargo/setor não separam nada;
 *   3. o dedup por nome NÃO é mais o padrão — ele fazia um dos dois perfis
 *      simplesmente sumir da lista, sem aviso;
 *   4. as telas realmente marcam (leitura do código real).
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const saida = path.join(raiz, "node_modules", ".cache", "verificar-marcacao");
fs.mkdirSync(saida, { recursive: true });

const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(
    process.execPath,
    [tsc, "src/lib/homonimos.ts", "--outDir", saida, "--module", "commonjs",
     "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" },
  );
} catch (e) { /* erro de tipo em arquivo solto; segue se o .js saiu */ }

let ok = 0;
let falhou = 0;
const check = (nome, condicao) => {
  console.log(`  ${condicao ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  condicao ? ok++ : falhou++;
};

console.log("\nHOMÔNIMO SE ANUNCIA\n");

const compilado = path.join(saida, "homonimos.js");
if (fs.existsSync(compilado)) {
  const { nomesRepetidos, diferenciador, ehHomonimo } = require(compilado);

  const lista = [
    { id: "1", full_name: "Williame Correia de Lima", email: "williame_lima@hotmail.com", sector: "TI", role_title: "Analista de sistemas" },
    { id: "2", full_name: "Williame Correia de Lima", email: "williame.correia@pronutrir.com.br", sector: "TI", role_title: "Desenvolvedor" },
    { id: "3", full_name: "Raphael Luis Gomes Telles", email: "r@x.com", sector: "TI" },
  ];

  const rep = nomesRepetidos(lista);
  check("detecta o nome repetido", rep.has("williame correia de lima"));
  check("e NÃO marca quem tem nome único", !rep.has("raphael luis gomes telles"));
  check("nome com acento/caixa diferente conta como o mesmo",
    nomesRepetidos([{ full_name: "José Silva" }, { full_name: "  JOSE SILVA  " }]).size === 1);
  check("nome vazio não vira falso positivo",
    nomesRepetidos([{ full_name: null }, { full_name: "  " }]).size === 0);

  check("o diferenciador é o E-MAIL", diferenciador(lista[0]) === "williame_lima@hotmail.com");
  check(
    "e-mail vence cargo/setor — os dois homônimos são do MESMO setor",
    diferenciador(lista[0]) !== diferenciador(lista[1]),
  );
  check(
    "sem e-mail, cai em cargo · setor",
    diferenciador({ id: "9", full_name: "X", role_title: "Analista", sector: "TI" }) === "Analista · TI",
  );
  check(
    "sem nada, devolve null (não inventa rótulo)",
    diferenciador({ id: "9", full_name: "X" }) === null,
  );
} else {
  check("compilar lib/homonimos.ts", false);
}

// ── As telas marcam? (código real) ────────────────────────────────────────
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");

const combo = ler("src/components/PersonCombobox.tsx");
check("PersonCombobox marca o homônimo na linha", /ehHomonimo\(p\) &&/.test(combo));
check("e avisa uma vez no topo da lista", /filtered\.some\(ehHomonimo\)/.test(combo));
check("e mostra qual foi escolhido no campo", /ehHomonimo\(selected\)/.test(combo));
check("a busca alcança o e-mail", /p\.email \|\| ""\]\.join\(" "\)\)\.includes\(q\)/.test(combo));

const dialog = ler("src/components/EditActivityDialog.tsx");
check(
  "o dedup por nome deixou de ser o padrão (ele sumia com um dos perfis)",
  /dedupPorNome = false/.test(dialog),
);
check("EditActivityDialog marca o homônimo na lista simples", /membrosHomonimos/.test(dialog));

const parts = ler("src/components/SelecionarParticipantes.tsx");
check("SelecionarParticipantes marca o homônimo", /homonimos\.has\(norm\(nome\)\)/.test(parts));
check("e aceita e-mail para diferenciar", /email\?: string \| null/.test(parts));

const team = ler("src/app/(dashboard)/team/page.tsx");
check(
  "a equipe agrupa por PERFIL, não por nome (era união de projetos)",
  /porPerfil/.test(team) && !/nameToProjects/.test(team),
);
check("e a linha somada se anuncia como dois perfis", /m\.perfis\.length > 1/.test(team));

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
