#!/usr/bin/env node
/**
 * QUEM TRABALHA NA ATIVIDADE — lido por IDENTIFICADOR, não por nome.
 *
 * `assigned_to` e `participants` guardam nome em texto livre. Medido em
 * 26/08/2026: das 667 atividades com responsável, **657 guardam nome** e só
 * 10 guardam uuid — e a aba "Minhas" de Pendências comparava esse texto com
 * `user.id`, então enxergava 1,5% do que deveria.
 *
 * Pior: dois perfis ativos chamam-se "Williame Correia de Lima", e 450
 * atividades trazem esse nome. Por texto, os dois são a mesma pessoa.
 *
 * `activity_assignees` responde por `user_id`. Estas verificações travam:
 *   - a tabela ganha do texto sempre que responde;
 *   - o fallback de texto se declara (`origem`), e recusa nome ambíguo;
 *   - UUID nunca vaza para a tela.
 *
 * Roda o CÓDIGO REAL, compilado na hora.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const saida = path.join(raiz, "node_modules", ".cache", "verificar-responsaveis");
fs.mkdirSync(saida, { recursive: true });

const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
for (const alvo of ["src/lib/responsaveisDaAtividade.ts", "src/lib/pendencias.ts"]) {
  try {
    execFileSync(
      process.execPath,
      [tsc, alvo, "--outDir", saida, "--module", "commonjs", "--target", "es2020", "--skipLibCheck"],
      { cwd: raiz, stdio: "pipe" },
    );
  } catch (e) { /* erro de tipo em arquivo solto; segue se o .js saiu */ }
}

const R = require(path.join(saida, "responsaveisDaAtividade.js"));
const P = require(path.join(saida, "pendencias.js"));

let ok = 0;
let falhou = 0;
const check = (nome, condicao) => {
  console.log(`  ${condicao ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  condicao ? ok++ : falhou++;
};

console.log("\nRESPONSÁVEIS POR IDENTIFICADOR\n");

const W1 = "b0b64edb-09e2-48b6-85aa-5c533dc886ff";
const W2 = "149e6c4a-c496-4765-af2c-52eff5cb8919";
const RAPHA = "8c578160-3622-4d0f-a6ce-70ea62a8da38";

const perfisArr = [
  { id: W1, full_name: "Williame Correia de Lima", email: "williame_lima@hotmail.com" },
  { id: W2, full_name: "Williame Correia de Lima", email: "williame.correia@pronutrir.com.br" },
  { id: RAPHA, full_name: "Raphael Luis Gomes Telles", email: "r@x.com" },
];
const perfis = new Map(perfisArr.map((p) => [p.id, p]));
const porNome = R.indexarPorNome(perfisArr);

check("indexarPorNome detecta o homônimo", (porNome.get("williame correia de lima") || []).length === 2);

// ── A tabela ganha do texto ───────────────────────────────────────────────
const atividade = { id: "A1", assigned_to: "Williame Correia de Lima" };
const comTabela = R.agruparAtribuicoes([{ activity_id: "A1", user_id: W2, papel: "responsavel" }]);

const r1 = R.responsavelDaAtividade(atividade, comTabela, perfis, porNome);
check("a tabela responde com o user_id certo", r1.id === W2 && r1.origem === "tabela");
check("e o homônimo NÃO é confundido", r1.id !== W1);

// ── Sem tabela: texto, declarado, e ambíguo não resolve ───────────────────
const r2 = R.responsavelDaAtividade(atividade, new Map(), perfis, porNome);
check("sem a tabela, cai no texto e DIZ que é texto", r2.origem === "texto");
check("nome ambíguo não resolve para pessoa nenhuma", r2.id === null && r2.ambiguo === true);
check("mas o nome continua sendo exibido", r2.nome === "Williame Correia de Lima");

const unico = { id: "A2", assigned_to: "Raphael Luis Gomes Telles" };
const r3 = R.responsavelDaAtividade(unico, new Map(), perfis, porNome);
check("nome único resolve normalmente", r3.id === RAPHA && r3.ambiguo === false);

// ── UUID nunca vaza para a tela ───────────────────────────────────────────
check("uuid conhecido vira o nome da pessoa", R.nomeParaExibir(W2, perfis) === "Williame Correia de Lima");
check(
  "uuid DESCONHECIDO vira null, nunca o identificador na tela",
  R.nomeParaExibir("2f7c1c8a-1111-4111-8111-111111111111", perfis) === null,
);
check("texto vazio vira null", R.nomeParaExibir("   ", perfis) === null);

// ── Sem responsável ───────────────────────────────────────────────────────
const r4 = R.responsavelDaAtividade({ id: "A3", assigned_to: null }, new Map(), perfis, porNome);
check("sem responsável, origem é 'ausente'", r4.origem === "ausente");

// ── Participantes ─────────────────────────────────────────────────────────
const parts = R.participantesDaAtividade(
  { id: "A1", participants: ["Raphael Luis Gomes Telles"] },
  R.agruparAtribuicoes([
    { activity_id: "A1", user_id: W2, papel: "participante" },
    { activity_id: "A1", user_id: RAPHA, papel: "participante" },
  ]),
  perfis, porNome,
);
check("participantes vêm da tabela quando ela responde", parts.length === 2 && parts.every((p) => p.origem === "tabela"));
check("e vêm ordenados por nome", parts[0].nome.localeCompare(parts[1].nome, "pt-BR") <= 0);

// ── "É minha?" — por identificador ────────────────────────────────────────
check(
  "a atividade é de quem está na tabela",
  R.ehDaPessoa(atividade, W2, comTabela, perfis, porNome) === true,
);
check(
  "e NÃO é do homônimo que não está nela",
  R.ehDaPessoa(atividade, W1, comTabela, perfis, porNome) === false,
);
check(
  "a tabela respondeu e a pessoa não está lá: não cai no texto",
  R.ehDaPessoa(atividade, RAPHA, comTabela, perfis, porNome) === false,
);
check(
  "sem tabela, nome ambíguo não torna a atividade 'minha'",
  R.ehDaPessoa(atividade, W1, new Map(), perfis, porNome) === false,
);
check(
  "sem tabela, nome único torna",
  R.ehDaPessoa(unico, RAPHA, new Map(), perfis, porNome) === true,
);
check(
  "quem criou a atividade também a reconhece como sua",
  R.ehDaPessoa({ id: "A9", created_by: RAPHA }, RAPHA, new Map(), perfis, porNome) === true,
);

// ── Pendências: responsavelId deixa de receber NOME ───────────────────────
console.log("");
const base = { id: "A1", title: "t", project_id: "P", assigned_to: "Williame Correia de Lima", end_date: "2026-01-01" };

const semMapa = P.atividadeParaPendencia(base, undefined, undefined);
check(
  "sem o mapa, o NOME não vira responsavelId (era o defeito)",
  semMapa.responsavelId === null,
);
check("e o nome sobrevive em responsavelTexto", semMapa.responsavelTexto === "Williame Correia de Lima");

const comMapa = P.atividadeParaPendencia(base, undefined, new Map([["A1", W2]]));
check("com o mapa, responsavelId é o user_id", comMapa.responsavelId === W2);
check("e responsavelTexto some, para não duplicar", comMapa.responsavelTexto === null);

const comUuid = P.atividadeParaPendencia(
  { ...base, assigned_to: W1 }, undefined, undefined,
);
check("assigned_to que JÁ é uuid continua valendo como id", comUuid.responsavelId === W1);

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
