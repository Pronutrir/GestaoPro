#!/usr/bin/env node
/**
 * OS DOIS RELATOS DE 31/08/2026.
 *
 *   1. o responsável da entrega não consegue atribuir ninguém às filhas
 *   2. salvar volta para o Kanban (é o U15 do plano de correção)
 *
 * Ambos vieram com captura de tela. As asserções afirmam o comportamento
 * CORRETO — antes do conserto elas falham, depois passam.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const saida = path.join(raiz, "node_modules", ".cache", "verificar-relatos");
fs.mkdirSync(saida, { recursive: true });
const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
// Compila junto o `identityMatch` e reescreve o alias "@/" — o mesmo caminho
// que `verificar-matriz-acesso.cjs` usa. Sem isso o require falha, porque o
// alias do tsconfig não existe fora do bundler.
try {
  execFileSync(process.execPath,
    [tsc, "src/lib/activityAccess.ts", "src/lib/identityMatch.ts",
     "--outDir", saida, "--module", "commonjs", "--target", "es2019",
     "--moduleResolution", "node", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" });
} catch (e) { /* o .js basta */ }
{
  const alvo = path.join(saida, "activityAccess.js");
  if (!fs.existsSync(alvo)) { console.error("não compilou activityAccess.ts"); process.exit(1); }
  fs.writeFileSync(alvo, fs.readFileSync(alvo, "utf8")
    .replace(/@\/lib\/identityMatch/g, "./identityMatch"));
}

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nOS DOIS RELATOS DE 31/08\n");

const { capacidadesNaAtividade } = require(path.join(saida, "activityAccess.js"));

/* ── RELATO 1: atribuir nas filhas ───────────────────────────────────────── */
//
// "Teste Raphael Telles" responde pela entrega 1.2.1.5 e não conseguia designar
// ninguém para as quatro subatividades. A regra era `assigned_to` da PRÓPRIA
// atividade — e numa filha recém-criada esse campo está vazio. O campo só se
// preenchia se já estivesse preenchido.

const EU = "Teste Raphael Telles";
const naEquipeSoAsMinhas = {
  id: "u1", profileId: "u1", fullName: EU, email: "t@x.com",
  isAdmin: false, ehVisualizador: false,
  naEquipe: true, canEdit: false, canMove: false, canCreate: false,
  canDelete: false, canEditOwn: true,
};
const projeto = { owner: "outro", manager: "outro" };

// A entrega: eu sou o responsável dela.
const entrega = { assigned_to: EU, participants: [] };
check("no PAI, quem responde por ele pode atribuir",
  capacidadesNaAtividade(entrega, projeto, naEquipeSoAsMinhas).canAssign);

// A filha: sem responsável ainda, e eu respondo pelo pai.
const filha = { assigned_to: null, participants: [EU], responsavel_do_pai: EU };
check("na FILHA sem responsável, quem responde pelo PAI pode atribuir",
  capacidadesNaAtividade(filha, projeto, naEquipeSoAsMinhas).canAssign,
  "era o impasse: canAssign exigia ser responsável de um campo vazio");

// E o limite: participante do pai NÃO herda o poder de atribuir.
const filhaDeOutro = { assigned_to: null, participants: [EU], responsavel_do_pai: "Outra Pessoa" };
check("mas quem só PARTICIPA do pai não atribui",
  !capacidadesNaAtividade(filhaDeOutro, projeto, naEquipeSoAsMinhas).canAssign,
  "distribuir trabalho é ato de quem responde pelo conjunto");

// Sem o campo, o comportamento anterior é preservado.
const semPai = { assigned_to: null, participants: [EU] };
check("sem `responsavel_do_pai`, a regra antiga vale — nada regride",
  !capacidadesNaAtividade(semPai, projeto, naEquipeSoAsMinhas).canAssign);

// Quem responde pela filha continua podendo, como sempre.
const minhaFilha = { assigned_to: EU, participants: [] };
check("quem responde pela própria atividade continua podendo",
  capacidadesNaAtividade(minhaFilha, projeto, naEquipeSoAsMinhas).canAssign);

/* ── RELATO 2: salvar volta para o Kanban (U15) ──────────────────────────── */
const proj = fs.readFileSync(path.join(raiz, "src/app/(dashboard)/project/[id]/page.tsx"), "utf8");

check("a aba ativa é ESCRITA na URL",
  proj.includes('qs.set("tab", activeTab)'),
  "sem isso, `useState(\"kanban\")` vence a cada remontagem");
check("usa replace, não push — trocar de aba não é navegação nova",
  /router\.replace\(`\/project\/\$\{id\}\?\$\{qs\.toString\(\)\}`/.test(proj),
  "com push, o voltar percorreria cada aba visitada");
check("preserva os outros parâmetros — `?activity=` não é apagado",
  proj.includes('new URLSearchParams(searchParams?.toString() ?? "")'),
  "apagar a query fecharia a atividade aberta ao trocar de aba");
check("só grava depois de as abas visíveis resolverem",
  proj.includes("if (!visibleTabs.length || !visibleTabs.includes(activeTab)) return;"),
  "antes disso activeTab é o padrão, e gravá-lo apagaria o ?tab= do link");
check("e a leitura de ?tab= continua existindo",
  proj.includes('searchParams?.get("tab")'));

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
