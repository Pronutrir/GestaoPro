#!/usr/bin/env node
/**
 * "CLICO EM UM E NÃO ENTRA E NÃO SALVA" — 31/08/2026
 *
 * Relato com captura, no modal "Editar Atividade": escolher o responsável de
 * uma subatividade não gravava e a tela não dizia nada.
 *
 * Eram DOIS lados, e o conserto de um sem o outro não resolve:
 *
 *   A TELA  o UPDATE não conferia `count`. Um update recusado pela RLS volta
 *           do PostgREST como SUCESSO com zero linhas — então o código seguia
 *           para o refetch, que relia o valor antigo. Silêncio total.
 *
 *   O BANCO `can_update_activity_v2` tinha quatro vias, e nenhuma era "responde
 *           pelo pai". A correção da manhã (canAssign na tela) liberava o
 *           campo, e o banco recusava assim mesmo — a tela prometia o que o
 *           banco negava, que é o defeito que o CLAUDE.md manda não repetir.
 *
 * Sem a migration, o conserto da tela só troca silêncio por mensagem de erro.
 * Sem o conserto da tela, a migration funciona mas qualquer recusa futura volta
 * a ser silenciosa. Por isso as duas metades são travadas juntas aqui.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");
const semComentario = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nATRIBUIR NA SUBATIVIDADE — os dois lados\n");

/* ── A TELA: o update confere o que o banco fez ──────────────────────────── */
const dialog = semComentario(ler("src/components/EditActivityDialog.tsx"));

check("o update da subatividade pede `count: \"exact\"`",
  /\.update\(values as any, \{ count: "exact" \}\)/.test(dialog),
  "sem count não há como distinguir 'gravou' de 'a RLS recusou'");
// Sem teto de caracteres entre os pedaços: este trecho vive com mais de 30
// espaços de indentação, e um limite fixo reprova o código certo. O que a
// asserção precisa garantir é a ORDEM — !count, depois a mensagem, depois o
// return — não a distância entre eles.
check("e trata zero linhas como RECUSA, não como sucesso",
  /if \(!count\) \{[\s\S]*?variant: "destructive"[\s\S]*?return;/.test(dialog),
  "zero linha é o sintoma da recusa — `error` sozinho não a vê");
check("o erro do banco é traduzido, não mostrado cru",
  /import \{ mensagemDeErro \} from "@\/lib\/erroDoBanco"/.test(dialog)
  && /description: mensagemDeErro\(error\)/.test(dialog));
// Espaço normalizado: o que se afirma é que o `return` da recusa vem ANTES do
// refetch, e isso não deve depender de como o arquivo está indentado.
check("e a recusa NÃO segue para o refetch — que releria o valor antigo",
  /if \(!count\) \{.*?return; \} if \(effectiveActivity\)/.test(dialog.replace(/\s+/g, " ")),
  "seguir para o refetch é o que produzia 'não entra e não salva'");

// O OUTRO PONTO DA MESMA LINHA. Mover a subatividade de coluna tinha o mesmo
// silêncio — o popover fechava como se tivesse funcionado. Consertar só o
// responsável deixaria metade do defeito de pé, na mesma tela.
check("mover a subatividade de coluna também confere o que o banco fez",
  /\.update\(upd, \{ count: "exact" \}\)/.test(dialog)
  && /if \(eCol \|\| !nCol\)/.test(dialog),
  "era o mesmo silêncio, uma coluna ao lado");

/* ── O BANCO: a quinta via existe, e é estreita ──────────────────────────── */
const MIG = "supabase/migrations/20260831120000_responsavel_do_pai_atribui_na_filha.sql";
check("existe a migration da via do pai", fs.existsSync(path.join(raiz, MIG)));
const mig = fs.existsSync(path.join(raiz, MIG)) ? ler(MIG) : "";

check("`can_update_activity_v2` ganha a via do pai direto",
  /OR public\.responde_pelo_pai_direto\(a\.id, _user_id\)/.test(mig));
check("as quatro vias antigas continuam inteiras",
  /is_admin_user_v2/.test(mig) && /is_project_leader_v2/.test(mig)
  && /can_member_action\(a\.project_id, _user_id, 'edit'\)/.test(mig)
  && /is_activity_actor_v2/.test(mig),
  "a quinta via é acréscimo, não substituição");
check("e `can_edit_own` continua rebaixando 'Visualizar e comentar'",
  /pm\.can_edit_own = false/.test(mig),
  "essa leitura já se perdeu uma vez numa reescrita — 20260825150000");

// O ALCANCE. É aqui que uma regra de permissão vira buraco: um degrau a mais e
// o responsável de uma FASE escreve em qualquer descendente.
check("sobe UM degrau: junta filha ao pai, sem recursão",
  /JOIN public\.activities pai ON pai\.id = filha\.parent_id/.test(mig)
  && !/WITH RECURSIVE/.test(mig),
  "recursão aqui daria ao dono da fase escrita na árvore inteira");
check("e a migration se recusa a virar a árvore inteira",
  /RAISE EXCEPTION 'a via do pai virou a arvore inteira/.test(mig),
  "a verificação falha alto se alguém trocar um degrau por todos");

// SÓ O RESPONSÁVEL. `is_activity_actor_v2` incluiria participante e criador.
check("só quem RESPONDE pelo pai — não qualquer ator dele",
  /assigned_to_id/.test(mig) && !/is_activity_actor_v2\(pai/.test(mig),
  "participar da entrega é executar junto; distribuir é de quem responde");
check("compara por identificador E por texto",
  /pai\.assigned_to_id = _user_id/.test(mig)
  && /lower\(btrim\(pai\.assigned_to\)\)/.test(mig),
  "assigned_to guarda NOME em 657 das 667 atividades");

/* ── O ROLLBACK: existe e desfaz na ordem certa ──────────────────────────── */
const ROLL = "supabase/migrations/20260831120001_responsavel_do_pai_atribui_na_filha_rollback.sql";
check("há rollback", fs.existsSync(path.join(raiz, ROLL)));
const roll = fs.existsSync(path.join(raiz, ROLL)) ? ler(ROLL) : "";
check("e ele restaura a REGRA antes de remover a função",
  roll.indexOf("CREATE OR REPLACE FUNCTION public.can_update_activity_v2")
    < roll.indexOf("DROP FUNCTION IF EXISTS public.responde_pelo_pai_direto"),
  "a ordem inversa deixa a regra chamando função inexistente — e aí NENHUM update passa");

/* ── OS DOIS LADOS DIZEM A MESMA COISA ───────────────────────────────────── */
// Tela e RLS divergindo é o defeito que o CLAUDE.md nomeia. A migration existe
// justamente para o banco alcançar o que canAssign já concede.
const acesso = semComentario(ler("src/lib/activityAccess.ts"));
check("a tela concede pela mesma regra que o banco passa a aceitar",
  /matchesIdentity\(atividade\?\.responsavel_do_pai, candidatos\)/.test(acesso),
  "se a tela liberar e o banco recusar, volta o 'não entra e não salva'");

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
