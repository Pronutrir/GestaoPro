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

// A FILHA COMO ELA É NO RELATO — e este cenário estava errado até 31/08 à
// tarde. A versão anterior punha `participants: [EU]`, e participante É ator:
// o `ator &&` da regra ficava satisfeito por acidente, então o teste passava
// com a expressão quebrada e o defeito continuava na tela.
//
// Na captura (1.2.1.5.1) o campo Participantes diz "ninguém" e Responsáveis diz
// "sem responsável". A pessoa não tem vínculo NENHUM com a filha — só responde
// pelo pai. É esse o caso que precisa funcionar, e é ele que se monta aqui.
const filha = { assigned_to: null, participants: [], responsavel_do_pai: EU };
check("na FILHA sem responsável E sem participantes, quem responde pelo PAI atribui",
  capacidadesNaAtividade(filha, projeto, naEquipeSoAsMinhas).canAssign,
  "o `ator &&` anulava justamente o caso que a regra do pai existia para atender");

// E o limite: participante do pai NÃO herda o poder de atribuir.
const filhaDeOutro = { assigned_to: null, participants: [EU], responsavel_do_pai: "Outra Pessoa" };
check("mas quem só PARTICIPA do pai não atribui",
  !capacidadesNaAtividade(filhaDeOutro, projeto, naEquipeSoAsMinhas).canAssign,
  "distribuir trabalho é ato de quem responde pelo conjunto");

// O PASSO QUE DECIDE. Sem os campos de equipe, a função nunca chega ao passo 4
// e devolve "6-sem-acesso" — foi o que manteve a tela em leitura mesmo depois
// de a regra do pai existir. Travar o passo, e não só o booleano, é o que
// impede a tela de voltar a chamar a função com o ator pela metade.
check("e a decisão vem do passo 4, não do 6",
  capacidadesNaAtividade(filha, projeto, naEquipeSoAsMinhas).passoQueDecidiu
    === "4-equipe-editar-apenas-as-minhas",
  "sem naEquipe/canEditOwn, cai em 6-sem-acesso e a tela abre em modo leitura");

// Sem o campo, o comportamento anterior é preservado.
const semPai = { assigned_to: null, participants: [EU] };
check("sem `responsavel_do_pai`, a regra antiga vale — nada regride",
  !capacidadesNaAtividade(semPai, projeto, naEquipeSoAsMinhas).canAssign);

// Quem responde pela filha continua podendo, como sempre.
const minhaFilha = { assigned_to: EU, participants: [] };
check("quem responde pela própria atividade continua podendo",
  capacidadesNaAtividade(minhaFilha, projeto, naEquipeSoAsMinhas).canAssign);

/* ── RELATO 1b: a TELA precisa passar o ator inteiro ─────────────────────── */
//
// A regra acima pode estar perfeita e não aparecer, e foi o que aconteceu: a
// tela da atividade montava o ator só com identidade (id, nome, email, isAdmin)
// e OMITIA os campos de equipe. Como o passo 4 inteiro depende de `naEquipe`,
// a função caía em "6-sem-acesso" para um membro com permissão de escrita.
//
// O `as never` no argumento é o que permitiu isso passar: ele desliga a
// checagem de forma do objeto. Por isso a asserção o proíbe — não é estilo, é
// a única barreira que teria pego o defeito antes da tela.
const tela = fs.readFileSync(
  path.join(raiz, "src/app/(dashboard)/project/[id]/atividade/[activityId]/page.tsx"), "utf8");

for (const campo of ["naEquipe", "canEdit", "canMove", "canCreate", "canDelete"]) {
  check(`a tela passa \`${campo}\` para a função de acesso`,
    new RegExp(`${campo}:\\s*!!?papelNaEquipe`).test(tela),
    "sem os campos de equipe, o passo 4 nunca é alcançado");
}
// `canEditOwn` à parte: ele NÃO pode virar `!!`. Ausente significa "coluna não
// preenchida", e o padrão do sistema desde a migration de 18/08 é `true` — a
// coluna nasceu com DEFAULT true para não tirar acesso de ninguém. Um `!!`
// aqui rebaixaria silenciosamente todo membro sem a coluna para
// "visualizar e comentar", que é o oposto do defeito que se está consertando.
check("a tela passa `canEditOwn`, e ausente vale `true` — não `false`",
  /canEditOwn:\s*papelNaEquipe\?\.canEditOwn \?\? true/.test(tela),
  "`!!` aqui rebaixaria membros sem a coluna para visualizar-e-comentar");
check("e o ator NÃO é mais silenciado por `as never`",
  !/ehVisualizador: false,\s*\n\s*\} as never,/.test(tela),
  "o cast escondia o objeto incompleto do TypeScript");
check("os campos vêm de project_members, a mesma fonte da página do projeto",
  /\.from\("project_members"\)[\s\S]{0,200}can_edit_own/.test(tela),
  "duas fontes de permissão divergem — foi o que já produziu o botão que aparece numa tela e não na outra");

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
