#!/usr/bin/env node
/**
 * VERIFICAÇÃO DA REGRA DE ACESSO À ATIVIDADE.
 *
 * Roda contra o CÓDIGO REAL (`src/lib/activityAccess.ts`, compilado na hora),
 * não contra uma reimplementação — reimplementar a regra num teste é como as
 * duas metades de `canMutateActivity` divergiram em primeiro lugar.
 *
 * O projeto não tem framework de teste; isto roda só com Node:
 *
 *   node scripts/verificar-acesso-atividade.js
 *
 * Cobre os cenários levantados na revisão de acesso de 25/08/2026:
 *   - os 4 papéis de equipe (lib/projectRoles.ts)
 *   - líder e gestor do projeto (o campo `manager`, que a RLS legada ignorava)
 *   - quem entra só pelo vínculo com a atividade (responsável/participante)
 *   - `can_edit_own = false` — "Visualizar e comentar" barrando de verdade
 *   - marco e agrupador, que não são trabalho de coluna
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const RAIZ = path.resolve(__dirname, "..");
// Dentro do próprio repo, e não em os.tmpdir(): no Windows o temp fica noutra
// unidade, e o tsc rejeita --outDir cruzando de volume.
const SAIDA = path.join(RAIZ, "node_modules", ".cache", "verif-acesso");

function compilar() {
  fs.mkdirSync(SAIDA, { recursive: true });
  let erroTsc = "";
  try {
    // O binário do tsc é chamado direto (e não via `npx`), porque no Windows
    // `npx.cmd` exige shell e o spawn falha com EINVAL.
    const tsc = path.join(RAIZ, "node_modules", "typescript", "bin", "tsc");
    execFileSync(
      process.execPath,
      [tsc,
       "src/lib/activityAccess.ts",
       "src/lib/identityMatch.ts",
       "--outDir", SAIDA,
       "--module", "commonjs", "--target", "es2019",
       "--moduleResolution", "node", "--skipLibCheck"],
      { cwd: RAIZ, stdio: "pipe" },
    );
  } catch (e) {
    // tsc sai com código 1 pelo alias `@/` não resolvido, mas emite o .js
    // correto. Guardamos a saída para o caso de o arquivo não aparecer.
    erroTsc = String((e && (e.stdout || e.message)) || "");
  }
  const alvo = path.join(SAIDA, "activityAccess.js");
  if (!fs.existsSync(alvo)) {
    console.error("FALHOU: não foi possível compilar src/lib/activityAccess.ts");
    if (erroTsc) console.error(erroTsc);
    process.exit(1);
  }
  // O alias `@/lib/...` não existe fora do bundler.
  fs.writeFileSync(alvo, fs.readFileSync(alvo, "utf8")
    .replace(/@\/lib\/identityMatch/g, "./identityMatch"));
  return require(alvo);
}

const { podeMutarAtividade, ehAtividadeDaPessoa } = compilar();

// ── cenário ────────────────────────────────────────────────────────────────
const PROJETO = { owner: "Eva Ribeiro", manager: "Marcos Tavares" };

const ATIV_DA_ANA   = { created_by: "id-ana", assigned_to: "Ana Souza",  participants: [] };
const ATIV_DO_BRUNO = { created_by: "id-bru", assigned_to: "Bruno Lima", participants: ["Ana Souza", "Carla Dias"] };
const ATIV_DE_NINGUEM = { created_by: "id-outro", assigned_to: null, participants: [] };

const P = {
  ana:    { id: "id-ana", fullName: "Ana Souza",      email: "ana@ex.com" },
  bruno:  { id: "id-bru", fullName: "Bruno Lima",     email: "bruno@ex.com" },
  carla:  { id: "id-car", fullName: "Carla Dias",     email: "carla@ex.com" },
  daniel: { id: "id-dan", fullName: "Daniel Prado",   email: "daniel@ex.com" },
  eva:    { id: "id-eva", fullName: "Eva Ribeiro",    email: "eva@ex.com" },
  marcos: { id: "id-mar", fullName: "Marcos Tavares", email: "marcos@ex.com" },
};

// Os 4 papéis, exatamente como em lib/projectRoles.ts.
const PAPEL = {
  editar_excluir: { canEdit: true,  canMove: true,  canEditOwn: true  },
  editar_tudo:    { canEdit: true,  canMove: true,  canEditOwn: true  },
  editar_minhas:  { canEdit: false, canMove: false, canEditOwn: true  },
  visualizar:     { canEdit: false, canMove: false, canEditOwn: false },
};

const quem = (pessoa, papel, extra) =>
  Object.assign({}, pessoa, papel ? PAPEL[papel] : {}, extra || {});

// ── casos ──────────────────────────────────────────────────────────────────
const CASOS = [
  // --- equipe: papéis que editam tudo ---
  ["equipe 'Editar tudo' edita atividade de outro",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.ana, "editar_tudo")), true],
  ["equipe 'Editar e excluir' edita atividade de outro",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.ana, "editar_excluir")), true],

  // --- equipe: 'Editar apenas as minhas' ---
  ["'Editar as minhas' edita onde é responsável",
    () => podeMutarAtividade(ATIV_DA_ANA, PROJETO, quem(P.ana, "editar_minhas")), true],
  ["'Editar as minhas' edita onde é participante",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.ana, "editar_minhas")), true],
  ["'Editar as minhas' NÃO edita atividade alheia",
    () => podeMutarAtividade(ATIV_DE_NINGUEM, PROJETO, quem(P.carla, "editar_minhas")), false],

  // --- O DEFEITO CORRIGIDO: 'Visualizar e comentar' ---
  ["'Visualizar' NÃO edita nem onde é responsável  ← a correção",
    () => podeMutarAtividade(ATIV_DA_ANA, PROJETO, quem(P.ana, "visualizar")), false],
  ["'Visualizar' NÃO edita onde é participante",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.carla, "visualizar")), false],
  ["'Visualizar' NÃO edita nem o que criou",
    () => podeMutarAtividade(ATIV_DA_ANA, PROJETO, quem(P.ana, "visualizar")), false],
  ["os dois papéis baixos agora DIFEREM (era o bug)",
    () => podeMutarAtividade(ATIV_DA_ANA, PROJETO, quem(P.ana, "editar_minhas"))
       !== podeMutarAtividade(ATIV_DA_ANA, PROJETO, quem(P.ana, "visualizar")), true],

  // --- can_edit_own NÃO é teto sobre quem edita tudo ---
  ["can_edit_own=false NÃO afeta quem tem can_edit",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.ana, null, { canEdit: true, canEditOwn: false })), true],
  ["can_edit_own=false NÃO afeta quem tem can_move",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.ana, null, { canMove: true, canEditOwn: false })), true],
  ["can_edit_own=false NÃO afeta o líder do projeto",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.eva, null, { canEditOwn: false })), true],
  ["can_edit_own=false NÃO afeta o gestor do projeto",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.marcos, null, { canEditOwn: false })), true],
  ["can_edit_own=false NÃO afeta o admin",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.daniel, null, { isAdmin: true, canEditOwn: false })), true],

  // --- ausência da coluna = comportamento histórico ---
  ["can_edit_own ausente conta como true (linha antiga)",
    () => podeMutarAtividade(ATIV_DA_ANA, PROJETO, quem(P.ana, null, {})), true],

  // --- líder e gestor (o campo manager, ignorado pela RLS legada) ---
  ["líder do projeto edita sem estar na equipe",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.eva, null, {})), true],
  ["GESTOR do projeto edita sem estar na equipe  ← campo manager",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.marcos, null, {})), true],

  // --- fora da equipe, só pelo vínculo ---
  ["fora da equipe edita onde é participante",
    () => podeMutarAtividade(ATIV_DO_BRUNO, PROJETO, quem(P.carla, null, {})), true],
  ["fora da equipe NÃO edita atividade alheia",
    () => podeMutarAtividade(ATIV_DE_NINGUEM, PROJETO, quem(P.carla, null, {})), false],
  ["sem vínculo nenhum não edita nada",
    () => podeMutarAtividade(ATIV_DE_NINGUEM, PROJETO, quem(P.daniel, null, {})), false],

  // --- bordas ---
  ["atividade nula devolve false",
    () => podeMutarAtividade(null, PROJETO, quem(P.ana, "editar_tudo")), false],
  ["projeto nulo não quebra (Kanban sem projectOwner)",
    () => podeMutarAtividade(ATIV_DA_ANA, null, quem(P.ana, "editar_minhas")), true],
  ["participants nulo não quebra",
    () => podeMutarAtividade({ assigned_to: "Ana Souza", participants: null }, PROJETO, quem(P.ana, "editar_minhas")), true],

  // --- ehAtividadeDaPessoa: "é meu trabalho?" ignora papel de equipe ---
  ["ehAtividadeDaPessoa: responsável é dela",
    () => ehAtividadeDaPessoa(ATIV_DA_ANA, P.ana), true],
  ["ehAtividadeDaPessoa: participante é dela",
    () => ehAtividadeDaPessoa(ATIV_DO_BRUNO, P.carla), true],
  ["ehAtividadeDaPessoa: alheia não é dela",
    () => ehAtividadeDaPessoa(ATIV_DE_NINGUEM, P.carla), false],
  ["ehAtividadeDaPessoa NÃO olha can_edit_own (é 'meu trabalho', não 'posso editar')",
    () => ehAtividadeDaPessoa(ATIV_DA_ANA, Object.assign({}, P.ana, { canEditOwn: false })), true],
];

// ── execução ───────────────────────────────────────────────────────────────
let ok = 0, falhou = 0;
console.log("\n  Verificação da regra de acesso à atividade");
console.log("  (contra src/lib/activityAccess.ts, compilado na hora)\n");

for (const [nome, fn, esperado] of CASOS) {
  let obtido;
  try { obtido = fn(); }
  catch (e) { obtido = "ERRO: " + e.message; }
  if (obtido === esperado) {
    ok++;
    console.log("  \x1b[32m✓\x1b[0m " + nome);
  } else {
    falhou++;
    console.log("  \x1b[31m✗\x1b[0m " + nome);
    console.log("      esperado " + esperado + ", obtido " + obtido);
  }
}

try { fs.rmSync(SAIDA, { recursive: true, force: true }); } catch (e) { /* temp */ }

console.log("\n  " + ok + " passaram, " + falhou + " falharam\n");
process.exit(falhou > 0 ? 1 : 0);
