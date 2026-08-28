#!/usr/bin/env node
/**
 * FASE C — a tela da atividade: editar, criar, visualizar.
 *
 * O bloco mais longo do comando, e o único que muda o dia a dia. O que este
 * arquivo trava não é aparência: é que os três estados continuem sendo UMA
 * tela, que a permissão continue sendo ausência de controle, e que o texto rico
 * não vire um editor que reescreve `description`.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");
const saida = path.join(raiz, "node_modules", ".cache", "verificar-fase-c");
fs.mkdirSync(saida, { recursive: true });
const tsc = path.join(raiz, "node_modules", "typescript", "lib", "tsc.js");
try {
  execFileSync(process.execPath,
    [tsc, "src/lib/textoRico.ts", "src/lib/eapModel.ts", "--outDir", saida,
     "--module", "commonjs", "--target", "es2020", "--skipLibCheck"],
    { cwd: raiz, stdio: "pipe" });
} catch (e) { /* o .js basta */ }

let ok = 0, falhou = 0;
const check = (nome, cond, extra) => {
  console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${nome}`);
  if (!cond && extra) console.log(`      ${extra}`);
  cond ? ok++ : falhou++;
};

console.log("\nFASE C — a tela da atividade, três estados\n");

const tela = ler("src/components/atividade/TelaDaAtividade.tsx");
const desc = ler("src/components/atividade/DescricaoRica.tsx");
const licao = ler("src/components/atividade/LicaoAprendida.tsx");
const criar = ler("src/app/(dashboard)/project/[id]/atividade/nova/page.tsx");
const editar = ler("src/app/(dashboard)/project/[id]/atividade/[activityId]/page.tsx");
const mig = ler("supabase/migrations/20260827160000_incluir_e_atribuir.sql");

/* ── 1. O TEXTO RICO ─────────────────────────────────────────────────────── */
const TR = require(path.join(saida, "textoRico.js"));

const lidas = TR.lerTextoRico("Fazer X\n[ ] Levantar regras\n[x] Validar\nveja https://ex.com e @ana");
check("reconhece item aberto e feito",
  lidas[1].conferencia?.feito === false && lidas[2].conferencia?.feito === true);
check("reconhece link e menção na mesma linha",
  lidas[3].pedacos.some((p) => p.tipo === "link") && lidas[3].pedacos.some((p) => p.tipo === "mencao"));

// O link não pode levar a pontuação junto — "veja https://x.com." quebraria.
const comPonto = TR.lerTextoRico("veja https://ex.com.");
const link = comPonto[0].pedacos.find((p) => p.tipo === "link");
check("o link para antes da pontuação final", link?.valor === "https://ex.com");

const prog = TR.progressoDaConferencia(lidas);
check("conta 1 de 2 feitos", prog?.feitos === 1 && prog?.total === 2);
check("sem lista devolve null — não '0 de 0'",
  TR.progressoDaConferencia(TR.lerTextoRico("só texto")) === null);

// Alternar trabalha sobre o TEXTO, não sobre a estrutura lida.
const antes = "[ ] a\ntexto solto\n[x] b";
check("alternar marca só o item pedido e preserva o resto",
  TR.alternarItem(antes, 0) === "[x] a\ntexto solto\n[x] b");
check("e desmarca na segunda vez",
  TR.alternarItem(antes, 1) === "[ ] a\ntexto solto\n[ ] b");

check("a descrição continua TEXTO no banco — não virou editor rico",
  /continua sendo TEXTO/.test(tela) || /descrição continua \*\*texto puro\*\*/.test(ler("src/lib/textoRico.ts")));

/* ── 2. OS TIPOS QUE SE PODE CRIAR (seção 07) ───────────────────────────── */
const EAP = require(path.join(saida, "eapModel.js"));
const j = (a) => a.join(",");
check("raiz → só Fase", j(EAP.eapTiposQuePodeCriar(null)) === "fase");
check("dentro de Fase → Entrega, Atividade, Marco",
  j(EAP.eapTiposQuePodeCriar("fase")) === "entrega,atividade,marco");
check("dentro de Entrega → Atividade, Marco",
  j(EAP.eapTiposQuePodeCriar("entrega")) === "atividade,marco");
check("dentro de Atividade → Atividade, Marco",
  j(EAP.eapTiposQuePodeCriar("atividade")) === "atividade,marco");
check("dentro de Marco → NADA", EAP.eapTiposQuePodeCriar("marco").length === 0);
check("e o motivo é explicado, não só barrado",
  typeof EAP.eapMotivoNaoCriaDentro("marco") === "string");

/* ── 3. CRIAR É A MESMA TELA ─────────────────────────────────────────────── */
check("a rota de criar usa TelaDaAtividade com estado='criar'",
  /estado="criar"/.test(criar) && /TelaDaAtividade/.test(criar));
check("e NÃO desenha campos próprios",
  !/<input[^>]*name="title"/.test(criar));
check("'Criar e continuar criando' reabre em branco no mesmo pacote",
  /aoCriarEContinuar=\{\(\) => criar\(true\)\}/.test(criar)
  && /setNome\(""\);\s*\n\s*await carregarContexto\(\)/.test(criar));
check("o código EAP é sugestão, não reserva",
  /provis/i.test(criar) && /codigoSugerido/.test(criar));
check("só o nome é obrigatório",
  /O nome é obrigatório/.test(criar));

/* ── 4. O FEED LIGADO ────────────────────────────────────────────────────── */
check("a tela de editar carrega o feed de verdade — não recebe []",
  /carregarFeed\(activityId\)/.test(editar) && !/feed=\{\[\]\}/.test(editar));
check("marca lido e zera o contador",
  /marcarFeedVisto\(activityId/.test(editar));
// Estas quatro descreviam o desenho ANTERIOR — o da tabela de eventos que eu
// ia criar. Ao conferir o banco, a fase 08 já tinha o feed pronto, e o desenho
// mudou: os eventos vêm da view, e o que a tela faz é ler e traduzir.
check("comentar grava em activity_comments — de onde a view lê",
  editar.includes('from("activity_comments")'),
  "uma segunda tabela de comentários faria a conversa existir em dois lugares");
check(
  "a gravação NÃO registra evento à mão — o histórico já é trigger",
  !editar.includes("registrarEvento"),
  "registrar de novo produziria a mesma mudança duas vezes na coluna",
);
check("o que subiu da filha é marcado como 'na subatividade'",
  editar.includes("naSubatividade: !e.ehraiz"));
check("a frase vem de fraseDoEvento — o de-para num lugar só",
  editar.includes("texto: fraseDoEvento(e)"));

/* ── 5. LIÇÃO APRENDIDA ──────────────────────────────────────────────────── */
check("quatro campos, e nenhum a mais",
  /O que aconteceu/.test(licao) && /A causa/.test(licao)
  && /Categoria/.test(licao) && /O que fazer da próxima vez/.test(licao));
check("'concluir também' nasce DESMARCADA",
  /useState\(false\); \/\/ DESMARCADA/.test(licao));
check("o vínculo é nos dois sentidos — source_activity_id",
  /source_activity_id: activityId/.test(licao));
check("e a lição fica gravada mesmo se a conclusão falhar",
  /A CONCLUSAO VEM DEPOIS|A CONCLUSÃO VEM DEPOIS/.test(licao));
check("quem não pode concluir não vê a caixa",
  /\{aoConcluirAtividade && \(/.test(licao));

/* ── 6. INCLUIR E ATRIBUIR — a mesma transação ──────────────────────────── */
check("é FUNÇÃO no banco, não dois inserts na tela",
  /CREATE OR REPLACE FUNCTION public\.incluir_e_atribuir/.test(mig));
check("confere can_manage ANTES de qualquer escrita",
  /IF NOT v_pode THEN\s*\n\s*RAISE EXCEPTION 'sem permissao/.test(mig));
check("o padrão é Visualizar e comentar, escopo só a atividade e a trilha",
  /p_papel\s+text DEFAULT 'visualizar_comentar'/.test(mig)
  && /p_escopo\s+text DEFAULT 'atividade_e_trilha'/.test(mig));
check("grava no histórico a FRASE INTEIRA, não 'usuário X adicionado'",
  /incluiu %s na equipe do projeto como %s, com acesso %s, e atribuiu/.test(mig));
check("SECURITY DEFINER com search_path fixo",
  /SECURITY DEFINER\s*\nSET search_path = public/.test(mig));
check("e o EXECUTE é revogado de public",
  /REVOKE ALL ON FUNCTION public\.incluir_e_atribuir/.test(mig));

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
