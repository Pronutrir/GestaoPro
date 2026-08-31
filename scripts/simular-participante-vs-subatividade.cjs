#!/usr/bin/env node
/**
 * POR QUE PARTICIPANTE ENTRA E RESPONSÁVEL DA SUBATIVIDADE NÃO — 31/08/2026
 *
 * Pergunta do Raphael, com captura: "o responsável pelo pacote, que é o mesmo
 * que está no grupo, não consegue adicionar e atribuir responsável para as
 * subatividades, mas consegue incluir participante."
 *
 * A assimetria é real, e não é inconsistência da regra: os dois caminhos
 * escrevem em ALVOS DIFERENTES. Este script mostra qual, executando a mesma
 * função de acesso que o banco espelha.
 */
const {execFileSync}=require("child_process");
const fs=require("fs"),path=require("path");
const raiz=path.join(__dirname,"..");
const out=path.join(raiz,"node_modules/.cache/sim-assimetria");
fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(out,{recursive:true});
try{execFileSync(process.execPath,[path.join(raiz,"node_modules/typescript/lib/tsc.js"),
  "src/lib/activityAccess.ts","src/lib/identityMatch.ts","--outDir",out,"--module","commonjs",
  "--target","es2019","--moduleResolution","node","--skipLibCheck"],{cwd:raiz,stdio:"pipe"});}catch(e){}
const f=path.join(out,"activityAccess.js");
fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/@\/lib\/identityMatch/g,"./identityMatch"));
const {podeMutarAtividade}=require(f);

const EU="Teste Raphael Telles";
const eu={id:"u1",profileId:"u1",fullName:EU,email:"t@x.com",isAdmin:false,
  canEdit:false,canMove:false,canCreate:false,canDelete:false,canEditOwn:true};
const projeto={owner:"Outro Dono",manager:"Outro Gestor"};
const pai   = {assigned_to:EU,  participants:[]};
const filha = {assigned_to:null, participants:[]};

console.log("\n=========== OS DOIS CAMINHOS ESCREVEM EM ALVOS DIFERENTES ===========\n");
console.log("  1.2.1.5    ENTREGA   -> responsavel: EU");
console.log("  1.2.1.5.1  filha     -> sem responsavel\n");

const linha=(rot,alvo,at,quando)=>{
  const pode=podeMutarAtividade(at,projeto,eu);
  console.log(`  ${rot}`);
  console.log(`     escreve em : ${alvo}`);
  console.log(`     quando     : ${quando}`);
  console.log(`     RLS permite: ${pode?"SIM":"NAO"}\n`);
  return pode;
};

const p=linha("INCLUIR PARTICIPANTE (aba Participantes)","1.2.1.5 — a atividade ABERTA",
  pai,"so no Salvar; ate la e formulario local (setFormData)");
const s=linha("ATRIBUIR RESPONSAVEL DA SUBATIVIDADE","1.2.1.5.1 — a FILHA",
  filha,"na hora do clique, direto no banco");

console.log("=========== POR QUE UM PASSA E O OUTRO NAO ===========\n");
console.log("  Nao sao duas regras diferentes: e a MESMA regra, sobre linhas diferentes.");
console.log("  Em 1.2.1.5 voce e o responsavel -> a via 4 (ator da propria atividade) passa.");
console.log("  Em 1.2.1.5.1 voce nao e nada    -> nenhuma das quatro vias alcanca.\n");
console.log("  A quinta via (responde pelo pai direto) e o que falta, e ela esta");
console.log("  ESCRITA E NAO APLICADA: 20260831120000_responsavel_do_pai_atribui_na_filha.sql\n");

const esperado = p === true && s === false;
console.log(esperado
  ? "  CONFERE: a assimetria observada e exatamente a que a migration pendente fecha."
  : "  INESPERADO: reveja o cenario antes de concluir.");
process.exit(esperado?0:1);
