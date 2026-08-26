#!/usr/bin/env node
/**
 * SEM FALLBACK SILENCIOSO — guarda de regressão da fase 09.
 *
 * O planejado do pai passou a vir de `derived_hours`, derivado no banco sobre
 * TODAS as filhas. O perigo agora não é o número errado: é o número errado
 * VOLTANDO sem ninguém perceber.
 *
 * O caminho de volta é sempre o mesmo — alguém vê `planned` nulo, acha que é
 * bug, e "conserta" somando no cliente de novo. A soma do cliente é feita sobre
 * a fatia que a RLS deixou passar: quem enxerga 1 de 8 filhas soma 1 e exibe
 * como total do pai. Está certo por acidente, e só para quem enxerga tudo.
 *
 * Estas verificações leem o CÓDIGO REAL. Se alguém devolver a recursão de
 * horas ao Kanban, ou tirar o "—" do card, isto falha alto.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");

let ok = 0;
let falhou = 0;
const check = (nome, condicao) => {
  if (condicao) {
    console.log(`  \x1b[32m✓\x1b[0m ${nome}`);
    ok++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${nome}`);
    falhou++;
  }
};

console.log("\nSEM FALLBACK SILENCIOSO — o planejado do pai vem do servidor\n");

const kanban = ler("src/components/ActivityKanban.tsx");
const card = ler("src/components/kanban/KanbanCard.tsx");
const shared = ler("src/components/kanban/shared.ts");

// ── 1. O tipo admite ausência ─────────────────────────────────────────────
check(
  "HoursStat.planned aceita null (ausência é representável)",
  /planned:\s*number\s*\|\s*null/.test(shared),
);

check(
  "Activity carrega derived_hours",
  /derived_hours\?:/.test(shared),
);

check(
  "Activity carrega derived_children",
  /derived_children\?:/.test(shared),
);

// ── 2. O Kanban lê o derivado, não recalcula ──────────────────────────────
check(
  "o Kanban lê derived_hours para o planejado do pai",
  /derived_hours/.test(kanban),
);

// A recursão que somava PLANEJADO não pode voltar. A do consumido continua —
// é explícita, tem nome próprio e o servidor não deriva consumido.
const somaPlanejadoRecursiva = /planned\s*\+=\s*sub\.planned/.test(kanban);
check(
  "a recursão que somava PLANEJADO no cliente não voltou",
  !somaPlanejadoRecursiva,
);

check(
  "o consumido continua no cliente, com nome próprio",
  /consumidoDaSubarvore/.test(kanban),
);

// ── 3. O card mostra ausência, não o número antigo ────────────────────────
check(
  "o card trata planned === null explicitamente",
  /hoursStat\.planned === null/.test(card),
);

// O ramo final (activity.hours do próprio item) só pode valer quando NÃO há
// hoursStat. Com hoursStat presente e planned nulo, cair nele mostraria as
// horas próprias do pai como se fossem o total da subárvore.
check(
  "o ramo de activity.hours exige ausência de hoursStat (não pega o pai sem derivação)",
  /cardFields\.hours && !hoursStat && toHoursNumber\(activity\.hours\)/.test(card),
);

// ── 4. A comparação do planejado protege contra null ──────────────────────
check(
  "o card só compara planned depois de descartar null",
  /hoursStat\.planned !== null && \(hoursStat\.planned > 0/.test(card),
);

console.log(`\n  ${ok} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
