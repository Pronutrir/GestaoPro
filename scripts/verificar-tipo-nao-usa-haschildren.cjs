#!/usr/bin/env node
/*
 * Barra a volta da dedução "hasChildren decide tipo" — removida em 27/08/2026
 * (o `OR hasChildren` saiu de resolveEapKind; ver os-14-que-mudam-de-rotulo).
 *
 * Depois do congelamento (migration 20260827130000), o papel de um item vem do
 * CAMPO `item_type`, nunca da presença de filhas. Consultar hasChildren para
 * decidir tipo faz o item mudar de papel ao ganhar/perder subitem — o defeito
 * fatal do modelo antigo (a atividade que vira faixa e some do quadro).
 *
 * EXCEÇÃO ÚNICA E AUTORIZADA: `eap_kind_estrutural` (SQL, na migration do
 * congelamento) usa hasChildren DE PROPÓSITO, uma vez, para tirar a foto da
 * estrutura. Este teste EXIGE que ela exista e esteja marcada como exceção —
 * mas o padrão não pode vazar para o runtime. Se falhar, alguém reintroduziu a
 * dedução onde ela não é permitida.
 *
 * Uso: node scripts/verificar-tipo-nao-usa-haschildren.cjs
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const falhas = [];

const eapModel = fs.readFileSync(path.join(RAIZ, 'src/lib/eapModel.ts'), 'utf8');

function corpoDaFuncao(fonte, nome) {
  const re = new RegExp(`export function ${nome}\\s*\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`);
  const m = fonte.match(re);
  return m ? m[1] : null;
}

// Tira comentários (/* */ e //) antes de procurar uso REAL. Um comentário que
// EXPLICA a dedução removida (ex.: "a mesma cirurgia do `OR hasChildren`") não
// é uso — e falso-positivo aqui esconderia uma regressão de verdade no ruído.
function semComentarios(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

// ── 1) resolveEapKind (a regra daqui pra frente) NÃO pode consultar hasChildren.
//      O parâmetro sobrevive como `_hasChildren` (prefixo _ = não usado, só
//      documenta a saída da dedução); o corpo tem de ignorá-lo.
const corpoResolve = corpoDaFuncao(eapModel, 'resolveEapKind');
if (corpoResolve === null) {
  falhas.push('resolveEapKind não encontrado em src/lib/eapModel.ts — atualize o teste');
} else if (/hasChildren/.test(semComentarios(corpoResolve))) {
  falhas.push('resolveEapKind consulta hasChildren no corpo — o tipo deve vir de item_type, não da presença de filhas');
}

// ── 2) eapToPersisted (a ponte de armazenamento) é agnóstica a estrutura.
const corpoPersist = corpoDaFuncao(eapModel, 'eapToPersisted');
if (corpoPersist !== null && /hasChildren/.test(semComentarios(corpoPersist))) {
  falhas.push('eapToPersisted consulta hasChildren — a tradução de armazenamento não pode depender de estrutura');
}

// ── 3) Nenhuma OUTRA função em eapModel.ts pode devolver EapKind decidindo por
//      hasChildren num ternário/condicional (o padrão do OR que saiu).
for (const m of semComentarios(eapModel).matchAll(/_?hasChildren[^\n]*\?[^\n]*(fase|entrega|atividade|projeto|marco)/g)) {
  falhas.push(`eapModel.ts: "${m[0].trim()}" — decide EapKind por hasChildren`);
}

// ── 4) A EXCEÇÃO tem de existir e estar marcada: a foto do congelamento em
//      eap_kind_estrutural. Positiva, não uma varredura — trava que ela é a
//      ÚNICA e que ninguém removeu a marca.
const freeze = path.join(RAIZ, 'supabase/migrations/20260827130000_congelar_item_type.sql');
if (!fs.existsSync(freeze)) {
  falhas.push('migration 20260827130000_congelar_item_type.sql sumiu — a exceção não pode ficar sem âncora');
} else {
  const sql = fs.readFileSync(freeze, 'utf8');
  if (!/CREATE OR REPLACE FUNCTION\s+public\.eap_kind_estrutural/.test(sql)) {
    falhas.push('eap_kind_estrutural não existe na migration do congelamento');
  }
  if (!/EXCECAO DELIBERADA E UNICA/.test(sql)) {
    falhas.push('a marca "EXCECAO DELIBERADA E UNICA" sumiu de eap_kind_estrutural — sem ela, alguém copia o padrão achando que é permitido');
  }
}

if (falhas.length) {
  console.error('✗ dedução por hasChildren onde não é permitida:\n' + falhas.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log('✓ tipo não é decidido por hasChildren no runtime; a única exceção (a foto do congelamento) está marcada');
