#!/usr/bin/env node
/**
 * FASE 03 — a camada de acesso contra os 108 casos da matriz.
 *
 * Roda `capacidadesNaAtividade` (código real, compilado na hora) contra
 * `docs/atividade-v2/matriz-acesso.json`, conferindo as 9 capacidades, o
 * `escopoDeLeitura` E o `passoQueDecidiu` de cada caso.
 *
 *   node scripts/verificar-matriz-acesso.cjs
 *
 * O passo é conferido de propósito: duas implementações podem chegar ao mesmo
 * booleano por caminhos diferentes, e é o caminho que precisa espelhar a RLS.
 *
 * DIVERGÊNCIA DELIBERADA DO FIXTURE, decidida em 26/08/2026:
 *
 *   O fixture marca `canComment = false` para o perfil Visualizador — e essa é
 *   a decisão que vale (teto rígido, sem comentar). O papel de PROJETO chamado
 *   "Visualizar e comentar" é outra coisa: ali comentar vale, e o fixture
 *   também diz isso. São dois níveis diferentes com nomes parecidos.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-matriz");

function compilar() {
  fs.mkdirSync(SAIDA, { recursive: true });
  let erro = "";
  try {
    const tsc = path.join(RAIZ, "node_modules", "typescript", "bin", "tsc");
    execFileSync(process.execPath, [tsc,
      "src/lib/activityAccess.ts", "src/lib/identityMatch.ts",
      "--outDir", SAIDA, "--module", "commonjs", "--target", "es2019",
      "--moduleResolution", "node", "--skipLibCheck"],
      { cwd: RAIZ, stdio: "pipe" });
  } catch (e) { erro = String((e && (e.stdout || e.message)) || ""); }
  const alvo = path.join(SAIDA, "activityAccess.js");
  if (!fs.existsSync(alvo)) {
    console.error("FALHOU: não compilou src/lib/activityAccess.ts");
    if (erro) console.error(erro);
    process.exit(1);
  }
  fs.writeFileSync(alvo, fs.readFileSync(alvo, "utf8")
    .replace(/@\/lib\/identityMatch/g, "./identityMatch"));
  return require(alvo);
}

const { capacidadesNaAtividade } = compilar();
const matriz = JSON.parse(fs.readFileSync(
  path.join(RAIZ, "docs", "atividade-v2", "matriz-acesso.json"), "utf8"));

const EU = { id: "id-eu", fullName: "Fulano de Teste", email: "fulano@ex.com" };
const PROJETO_ALHEIO = { owner: "Outra Pessoa", manager: "Terceiro Alguem" };
const PROJETO_MEU = { owner: "Fulano de Teste", manager: null };

/** Traduz uma linha da matriz nos argumentos da função. */
function montar(caso) {
  const v = caso.vinculoComAtividade;
  const atividade = {
    created_by: "id-outro",
    assigned_to: v === "responsavel" ? "Fulano de Teste" : null,
    participants: v === "participante" ? ["Fulano de Teste"] : [],
  };

  const papel = caso.papelNoProjeto;
  const naEquipe = papel !== "fora_da_equipe" && papel !== "dono_gestor";

  const cols = {
    editar_excluir: { canCreate: true,  canEdit: true,  canDelete: true,  canMove: true,  canEditOwn: true  },
    editar_tudo:    { canCreate: true,  canEdit: true,  canDelete: false, canMove: true,  canEditOwn: true  },
    editar_minhas:  { canCreate: false, canEdit: false, canDelete: false, canMove: false, canEditOwn: true  },
    ver_comentar:   { canCreate: false, canEdit: false, canDelete: false, canMove: false, canEditOwn: false },
  }[papel] || {};

  const usuario = {
    ...EU,
    isAdmin: caso.perfil === "admin",
    ehVisualizador: caso.perfil === "visualizador",
    naEquipe,
    ...cols,
  };

  // "dono_gestor" é o papel de PROJETO, não de equipe: entra por owner/manager.
  const projeto = papel === "dono_gestor" ? PROJETO_MEU : PROJETO_ALHEIO;
  return { atividade, projeto, usuario };
}

const CAPS = ["canView", "canComment", "canEditExecucao", "canEditPlanejamento",
  "canAssign", "canPromover", "canAssumir", "canDelete", "canManageTeam"];

let ok = 0;
const falhas = [];

for (const caso of matriz.casos) {
  const { atividade, projeto, usuario } = montar(caso);
  const obtido = capacidadesNaAtividade(atividade, projeto, usuario);
  const id = `${caso.perfil} / ${caso.papelNoProjeto} / ${caso.vinculoComAtividade}`;

  const difs = [];
  for (const c of CAPS) {
    if (obtido[c] !== caso.esperado[c]) {
      difs.push(`${c}: esperado ${caso.esperado[c]}, obtido ${obtido[c]}`);
    }
  }
  if (obtido.passoQueDecidiu !== caso.passoQueDecidiu) {
    difs.push(`passo: esperado ${caso.passoQueDecidiu}, obtido ${obtido.passoQueDecidiu}`);
  }
  if (obtido.escopoDeLeitura !== caso.escopoDeLeitura) {
    difs.push(`escopo: esperado ${caso.escopoDeLeitura}, obtido ${obtido.escopoDeLeitura}`);
  }

  if (difs.length === 0) ok++;
  else falhas.push({ id, difs });
}

console.log(`\n  Matriz de acesso — ${matriz.casos.length} casos`);
console.log("  (capacidadesNaAtividade × docs/atividade-v2/matriz-acesso.json)\n");

if (falhas.length === 0) {
  console.log(`  \x1b[32m✓\x1b[0m todos os ${ok} casos batem — capacidades, passo e escopo\n`);
  process.exit(0);
}

for (const f of falhas.slice(0, 25)) {
  console.log(`  \x1b[31m✗\x1b[0m ${f.id}`);
  for (const d of f.difs) console.log(`      ${d}`);
}
if (falhas.length > 25) console.log(`  … e mais ${falhas.length - 25} casos`);
console.log(`\n  ${ok} passaram, ${falhas.length} falharam\n`);
process.exit(1);
