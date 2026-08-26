#!/usr/bin/env node
/**
 * FASE 08 (parte) — o histórico não mostra UUID nem enum em inglês.
 *
 *   node scripts/verificar-rotulos-do-historico.cjs
 *
 * `fmtValor` vive num componente React (`ActivityRegistro.tsx`), que não
 * compila isolado com `tsc` — traria a árvore inteira de imports. Então o
 * verificador extrai a função do arquivo e a avalia.
 *
 * Isso é mais frágil que compilar, e por isso há contraprova: se a extração
 * falhar, o teste ACUSA em vez de passar vazio.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const ALVO = path.join(RAIZ, "src", "components", "ActivityRegistro.tsx");
const fonte = fs.readFileSync(ALVO, "utf8");

function extrair(nome, ate) {
  const i = fonte.indexOf(nome);
  if (i < 0) return null;
  const j = fonte.indexOf(ate, i);
  return j < 0 ? null : fonte.slice(i, j);
}

const blocoStatus = extrair("const STATUS_LABELS", "const EH_UUID");
const blocoUuid = extrair("const EH_UUID", "export const fmtValor");
const blocoFmt = extrair("export const fmtValor", "\ninterface Props");

if (!blocoStatus || !blocoUuid || !blocoFmt) {
  console.error("FALHOU: não consegui extrair fmtValor de ActivityRegistro.tsx.");
  console.error("O arquivo mudou de forma — reveja este verificador antes de confiar nele.");
  process.exit(1);
}

// Tira os tipos: o corpo é JS válido depois disso. A assinatura da função é
// trocada ANTES das anotações soltas — senão o `Record<string,string>` dela
// já teria sumido e o casamento falharia.
const js = (blocoStatus + blocoUuid + blocoFmt)
  .replace(/export const/g, "const")
  .replace(/fmtValor\s*=\s*\([^)]*\)\s*:\s*string\s*=>/, "fmtValor = (v, campo, nomes) =>")
  .replace(/:\s*Record<string,\s*string>/g, "");

let fmtValor;
try {
  // eslint-disable-next-line no-new-func
  fmtValor = new Function(js + "\nreturn fmtValor;")();
} catch (e) {
  console.error("FALHOU ao avaliar fmtValor:", e.message);
  process.exit(1);
}

const UUID_COLUNA = "4533f517-a6cf-43aa-8f6a-dea00c6b5d54";
const NOMES = { [UUID_COLUNA]: "Não iniciado" };

const CASOS = [
  ["UUID conhecido vira o nome da coluna",
    () => fmtValor(UUID_COLUNA, "workflow_stage_id", NOMES), "Não iniciado"],
  ["UUID DESCONHECIDO vira traço, nunca o identificador",
    () => fmtValor("9adab523-ae95-45e0-9988-01b105f48049", "workflow_stage_id", NOMES), "—"],
  ["UUID sem mapa nenhum também vira traço",
    () => fmtValor(UUID_COLUNA, "workflow_stage_id"), "—"],
  ["status 'pending' vira Pendente",
    () => fmtValor("pending", "status"), "Pendente"],
  ["status 'completed' vira Concluída",
    () => fmtValor("completed", "status"), "Concluída"],
  ["status desconhecido não some — devolve o próprio",
    () => fmtValor("foo", "status"), "foo"],
  ["texto comum passa intacto",
    () => fmtValor("Revisar contrato", "title"), "Revisar contrato"],
  ["vazio vira traço",
    () => fmtValor("", "title"), "—"],
  ["nulo vira traço",
    () => fmtValor(null, "title"), "—"],
  ["lista vazia vira traço",
    () => fmtValor([], "tags"), "—"],
  ["lista resolve cada item",
    () => fmtValor([UUID_COLUNA, "livre"], "tags", NOMES), "Não iniciado, livre"],
  ["número passa como texto",
    () => fmtValor(42, "progress"), "42"],
];

let ok = 0, falhou = 0;
console.log("\n  Rótulos do histórico — sem UUID, sem enum em inglês");
console.log("  (fmtValor, extraída de ActivityRegistro.tsx)\n");

for (const [nome, fn, esperado] of CASOS) {
  let obtido;
  try { obtido = fn(); } catch (e) { obtido = "ERRO: " + e.message; }
  if (obtido === esperado) {
    ok++; console.log("  \x1b[32m✓\x1b[0m " + nome);
  } else {
    falhou++;
    console.log("  \x1b[31m✗\x1b[0m " + nome);
    console.log(`      esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`);
  }
}

// Contraprova: os dois consumidores têm de usar a função, não uma cópia.
const painel = fs.readFileSync(path.join(RAIZ, "src", "components", "AuditLogPanel.tsx"), "utf8");
if (/fmtValor/.test(painel)) {
  ok++; console.log("  \x1b[32m✓\x1b[0m AuditLogPanel consome fmtValor (não tem cópia inline)");
} else {
  falhou++; console.log("  \x1b[31m✗\x1b[0m AuditLogPanel voltou a ter a própria formatação");
}

console.log("\n  " + ok + " passaram, " + falhou + " falharam\n");
process.exit(falhou > 0 ? 1 : 0);
