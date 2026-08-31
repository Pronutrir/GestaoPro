#!/usr/bin/env node
/**
 * SIMULACAO DA ARVORE DA CAPTURA — 31/08/2026
 *
 * Roda a cadeia INTEIRA que decide se o campo "Responsaveis" aparece editavel:
 *
 *     capacidadesNaAtividade  ->  capacidadesDaTela  ->  editarPessoas
 *
 * As suites de assercao conferem trechos de codigo. Esta EXECUTA a decisao com
 * os dados exatos do relato e imprime o que a tela mostraria — inclusive a
 * faixa "Voce acompanha esta atividade", que foi o que denunciou o defeito.
 *
 * Inclui a CONTRAPROVA dos dois defeitos: sem ela, um verde aqui nao distingue
 * "corrigido" de "nunca esteve quebrado".
 *
 * Sai 1 se o campo deixar de ficar editavel no pai ou na filha.
 */
const {execFileSync}=require("child_process");const fs=require("fs"),path=require("path");
const raiz=require("path").join(__dirname,".."), out=path.join(raiz,"node_modules/.cache/sim-1215");
fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(out,{recursive:true});
try{execFileSync(process.execPath,[path.join(raiz,"node_modules/typescript/lib/tsc.js"),
  "src/lib/activityAccess.ts","src/lib/identityMatch.ts","src/lib/capacidadesDaTelaDaAtividade.ts",
  "--outDir",out,"--module","commonjs","--target","es2019","--moduleResolution","node",
  "--skipLibCheck"],{cwd:raiz,stdio:"pipe"});}catch(e){}
for(const f of ["activityAccess.js","capacidadesDaTelaDaAtividade.js"]){
  const p=path.join(out,f);
  fs.writeFileSync(p,fs.readFileSync(p,"utf8")
    .replace(/@\/lib\/identityMatch/g,"./identityMatch")
    .replace(/@\/components\/atividade\/TelaDaAtividade/g,"./_stub"));
}
fs.writeFileSync(path.join(out,"_stub.js"),"module.exports={};");
const {capacidadesNaAtividade}=require(path.join(out,"activityAccess.js"));
const {capacidadesDaTela}=require(path.join(out,"capacidadesDaTelaDaAtividade.js"));

const EU="Teste Raphael Telles";
// A EQUIPE, como esta no banco: membro com "editar apenas as minhas".
const membro={id:"u-teste",profileId:"u-teste",fullName:EU,email:"teste@x.com",
  isAdmin:false,ehVisualizador:false,
  naEquipe:true,canEdit:false,canMove:false,canCreate:false,canDelete:false,canEditOwn:true};
const projeto={owner:"Outro Dono",manager:"Outro Gestor"};

// A ARVORE DA CAPTURA.
const pai   = {id:"1.2.1.5",  assigned_to:EU,   participants:[]};                         // a ENTREGA: eu respondo
const filha = {id:"1.2.1.5.1",assigned_to:null, participants:[], responsavel_do_pai:EU};  // "sem responsavel" / "ninguem"

const linha=(t)=>console.log("  "+"-".repeat(t));
const sim=(rot,at,quem)=>{
  const c=capacidadesNaAtividade(at,projeto,quem);
  const t=capacidadesDaTela(c);
  const faixa=(!c.canEditExecucao&&!c.canEditPlanejamento);
  console.log(`\n  ${rot}`);
  console.log(`    passo que decidiu   : ${c.passoQueDecidiu}`);
  console.log(`    canAssign           : ${c.canAssign}`);
  console.log(`    -> editarPessoas    : ${t.editarPessoas}   <= o campo Responsaveis`);
  console.log(`    campo na tela       : ${t.editarPessoas?"EDITAVEL":"so texto"}`);
  console.log(`    faixa "so acompanha": ${faixa?"aparece":"nao aparece"}`);
  return t;
};

console.log("\n================ SIMULACAO: a arvore da captura ================");
console.log("  Projeto de outra pessoa. Eu sou membro 'editar apenas as minhas'.");
console.log("  1.2.1.5   ENTREGA    -> responsavel: EU");
console.log("  1.2.1.5.1 ATIVIDADE  -> sem responsavel, sem participantes");
linha(62);
const a=sim("NO PAI (1.2.1.5) — a entrega por que respondo", pai, membro);
const b=sim("NA FILHA (1.2.1.5.1) — o caso do relato", filha, membro);

console.log("\n================ OS LIMITES (nao pode alargar) ================");
const outro={...membro,fullName:"Mariana Prado",email:"mariana.prado@x.com",id:"u-mariana",profileId:"u-mariana"};
sim("outra pessoa da equipe, na mesma filha", filha, outro);
sim("participante do pai (nao responsavel) na filha",
    {id:"x",assigned_to:null,participants:[],responsavel_do_pai:"Outra Pessoa"}, membro);

console.log("\n================ VEREDITO ================");
const passou = a.editarPessoas===true && b.editarPessoas===true;
console.log(passou
  ? "  CORRIGIDO: o campo Responsaveis fica editavel no pai E na filha."
  : "  NAO CORRIGIDO.");
console.log("  Datas/GUT/custo na filha:", b.editarDatas?"editavel":"so texto",
            "(esperado: so texto — distribuir != replanejar)");
const CODIGO_FINAL = passou?0:1;

console.log("\n================ CONTRAPROVA: os dois defeitos ================");
console.log("  Se algum destes voltasse, o relato voltava junto.\n");
// Defeito 1: a tela mandando o ator sem os campos de equipe (era o `as never`).
const semEquipe={id:"u-teste",profileId:"u-teste",fullName:EU,email:"teste@x.com",
  isAdmin:false,ehVisualizador:false};
const d1=capacidadesNaAtividade(filha,projeto,semEquipe);
console.log(`  1. ator sem os campos de equipe -> passo ${d1.passoQueDecidiu}, canAssign ${d1.canAssign}`);
console.log(`     ${d1.canAssign?"":"e o campo fica so texto — era o defeito da tela"}`);
// Defeito 2: o `ator &&` — reproduzido a mao sobre os mesmos dados.
const ehAtor = !!filha.assigned_to || (filha.participants||[]).includes(EU);
console.log(`  2. com o \`ator &&\`: ator na filha? ${ehAtor} -> canAssign seria ${ehAtor}`);
console.log(`     ${ehAtor?"":"o && zerava a regra do pai — era o defeito da expressao"}`);

process.exit(CODIGO_FINAL);
