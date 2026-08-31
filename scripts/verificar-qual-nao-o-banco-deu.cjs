#!/usr/bin/env node
/**
 * "SEM PERMISSÃO PARA INCLUIR NA EQUIPE" — 31/08/2026
 *
 * Relato com captura, na entrega 1.2.1.5, onde a pessoa É a responsável:
 * escolher alguém devolvia "sem permissão para incluir na equipe deste
 * projeto".
 *
 * A frase é da RPC `incluir_e_atribuir`, que exige `can_manage`. Só que ela não
 * pediu para incluir ninguém na equipe — pediu para atribuir. A tela é que caía
 * na RPC sempre que o insert direto falhava, SEM olhar por que falhou.
 *
 * São duas causas, e só uma justifica a RPC:
 *
 *   trigger trg_assignee_exige_equipe  o ATRIBUÍDO está fora da equipe.
 *                                      A RPC resolve: inclui e atribui juntos.
 *
 *   policy "Assignees write"           quem ATRIBUI não pode mexer na
 *                                      atividade. A RPC não resolve nada — vai
 *                                      recusar também, por outro motivo, e a
 *                                      pessoa lê uma frase que a manda pedir a
 *                                      permissão errada.
 *
 * A RECUSA EM SI ESTÁ CORRETA e não é o que se conserta aqui: `can_manage` é
 * coluna própria em project_members, separada de `can_edit`, e o CLAUDE.md diz
 * que incluir na equipe é ato de quem gerencia equipe — a checagem vive no
 * banco justamente para não ser contornada pela tela. O que se conserta é a
 * tela pedir a coisa errada e depois relatar mal o não que recebeu.
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

console.log("\nQUAL \"NÃO\" O BANCO DEU\n");

const tela = semComentario(
  ler("src/app/(dashboard)/project/[id]/atividade/[activityId]/page.tsx"));

/* ── a tela separa os dois "não" ─────────────────────────────────────────── */
// Casa a intenção, não a grafia exata da regex do código: o que precisa existir
// é uma decisão chamada `foraDaEquipe`, tirada da MENSAGEM do erro — que é o
// único lugar onde o gatilho e a policy se distinguem.
check("a tela distingue POR QUE o insert direto falhou",
  /const foraDaEquipe = [\s\S]{0,120}\.test\(eDireto\?\.message/.test(tela)
  && /na equipe do projeto/.test(tela),
  "sem isso, qualquer recusa vira 'não pode incluir na equipe'");

check("recusa da POLICY não chama a RPC",
  /if \(eDireto && !foraDaEquipe\) \{[\s\S]*?return;/.test(tela),
  "a RPC não conserta permissão de editar a atividade — só troca a frase");

check("e a recusa da policy é traduzida, não mostrada crua",
  /description: mensagemDeErro\(eDireto\)/.test(tela));

check("só quem está FORA da equipe cai na RPC",
  tela.indexOf("const foraDaEquipe") < tela.indexOf('supabase.rpc("incluir_e_atribuir"'),
  "a decisão precisa vir antes da chamada");

/* ── e quando a RPC recusa de verdade, a frase serve para agir ───────────── */
check("a recusa da RPC vira instrução, não jargão do banco",
  /Só quem gerencia a equipe pode incluir alguém novo/.test(
    ler("src/app/(dashboard)/project/[id]/atividade/[activityId]/page.tsx")),
  "'sem permissao para incluir na equipe deste projeto' não diz o que fazer");
check("e diz que depois de incluída dá para atribuir",
  /depois você consegue atribuir/.test(
    ler("src/app/(dashboard)/project/[id]/atividade/[activityId]/page.tsx")),
  "a saída importa mais que o motivo");

/* ── a regra do banco NÃO foi afrouxada ──────────────────────────────────── */
//
// Esta é a asserção que impede o conserto de virar buraco. A tentação óbvia
// seria deixar quem tem `can_edit` incluir na equipe — e isso quebraria a regra
// que organiza o modelo inteiro: atribuir nunca concede acesso ao projeto.
const rpc = ler("supabase/migrations/20260827160000_incluir_e_atribuir.sql");
check("incluir na equipe continua exigindo `can_manage`",
  /pm\.can_manage = true/.test(rpc),
  "atribuir nunca pode virar uma porta lateral para entrar no projeto");
check("e a checagem continua ANTES de qualquer escrita",
  rpc.indexOf("IF NOT v_pode THEN") < rpc.indexOf("INSERT INTO public.project_members"),
  "SECURITY DEFINER sem checagem prévia é poder concedido, não emprestado");

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
