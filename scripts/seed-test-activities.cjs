// Seed de ~28 atividades de teste no projeto "Agente de IA Tasy - Pops".
// Cobre fase / pacote / atividade / marco, com responsáveis de setores
// variados, prioridades, prazos, horas, tags, participantes e bloqueios —
// para exercitar filtros, raias e times. Idempotente por prefixo [SEED].
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(".env", "utf8");
const get = (k) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : null; };
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL") || get("SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const PROJECT = "d526fbaf-f07c-4d38-b506-fe2193f333dc";
const STAGE = {
  backlog: "1b5f474e-46b6-4c86-9160-1e4954d1e04a",
  teste: "dbdbe660-f641-4ac9-b696-241675335d90",
  afazer: "702199b0-12bf-43f6-bab1-0919aa0bf0df",
  pend: "d882c810-a885-4c8d-b739-536f02bbd0a8",
  andamento: "c77fda0a-aee9-4ea2-b564-9d0d12013b49",
  emteste: "e8c1bfe0-5eed-44ab-96d2-93826ec7ebeb",
  aprovada: "8cf22a68-6613-4e33-8ba0-125867469ec4",
  concluida: "402c2947-31fe-438c-b681-536fe88d32bb",
};
// Responsáveis (nome exatamente como usado em assigned_to) com setores variados.
const P = {
  williame: "Williame Correia de Lima", // TI
  tiago: "Tiago Moreira",               // TI
  wesley: "Wesley Farias",              // TI
  antonio: "Antonio Ventura",           // Suprimentos
  daniela: "Daniela Veras",             // Estratégia e Marketing
  thayanne: "Thayanne Matos",           // Marketing
  renata: "Renata Ferreira",            // Comercial Particular
};
const d = (offsetDays) => { const x = new Date(); x.setDate(x.getDate() + offsetDays); return x.toISOString().slice(0, 10); };

// Estrutura: fases(agrupador) -> pacotes -> atividades/marcos.
// Cada nó: {t=title, type, stage, who, prio, start, end, hours, tags, parts, blocked, children}
const TREE = [
  { t: "Descoberta e Requisitos", type: "fase", stage: STAGE.andamento, who: P.daniela, prio: "high", children: [
    { t: "Levantamento de requisitos", type: "pacote", stage: STAGE.andamento, who: P.daniela, prio: "high", start: d(-5), end: d(3), hours: 16, tags: ["requisitos", "discovery"], parts: [P.tiago, P.thayanne], children: [
      { t: "Entrevistar áreas clínicas", type: "atividade", stage: STAGE.andamento, who: P.thayanne, prio: "medium", start: d(-4), end: d(1), hours: 8, tags: ["entrevista"] },
      { t: "Mapear processos atuais (AS-IS)", type: "atividade", stage: STAGE.afazer, who: P.daniela, prio: "high", end: d(5), hours: 12, tags: ["processo"] },
      { t: "Kickoff aprovado", type: "marco", stage: STAGE.concluida, who: P.daniela, prio: "low" },
    ]},
    { t: "Análise de viabilidade", type: "pacote", stage: STAGE.pend, who: P.antonio, prio: "urgente", blocked: true, children: [
      { t: "Cotação de infraestrutura", type: "atividade", stage: STAGE.pend, who: P.antonio, prio: "urgente", end: d(-2), hours: 6, tags: ["custo"], blocked: true },
      { t: "Validar orçamento com diretoria", type: "atividade", stage: STAGE.pend, who: P.antonio, prio: "critica", end: d(2), hours: 4 },
    ]},
  ]},
  { t: "Desenvolvimento do Agente", type: "fase", stage: STAGE.afazer, who: P.williame, prio: "high", children: [
    { t: "Integração com Tasy", type: "pacote", stage: STAGE.afazer, who: P.williame, prio: "high", start: d(2), end: d(20), hours: 40, tags: ["integracao", "tasy"], parts: [P.tiago, P.wesley], children: [
      { t: "Modelar banco de dados", type: "atividade", stage: STAGE.afazer, who: P.wesley, prio: "high", start: d(2), end: d(10), hours: 8, tags: ["banco"] },
      { t: "API de consulta ao prontuário", type: "atividade", stage: STAGE.afazer, who: P.williame, prio: "critica", end: d(15), hours: 20, tags: ["api", "backend"], parts: [P.tiago] },
      { t: "Autenticação e permissões", type: "atividade", stage: STAGE.teste, who: P.tiago, prio: "high", end: d(18), hours: 12, tags: ["seguranca"] },
      { t: "MVP integrado entregue", type: "marco", stage: STAGE.afazer, who: P.williame, prio: "medium", end: d(20) },
    ]},
    { t: "Treinamento do modelo de IA", type: "pacote", stage: STAGE.andamento, who: P.tiago, prio: "high", start: d(5), end: d(25), hours: 30, tags: ["ia", "treino"], children: [
      { t: "Coletar base de POPs", type: "atividade", stage: STAGE.andamento, who: P.tiago, prio: "medium", end: d(8), hours: 10, tags: ["dados"] },
      { t: "Ajuste fino (fine-tuning)", type: "atividade", stage: STAGE.afazer, who: P.wesley, prio: "high", end: d(22), hours: 16, tags: ["ia"] },
      { t: "Avaliar acurácia das respostas", type: "atividade", stage: STAGE.emteste, who: P.tiago, prio: "critica", end: d(24), hours: 6, tags: ["qualidade"] },
    ]},
  ]},
  { t: "Homologação e Rollout", type: "fase", stage: STAGE.backlog, who: P.daniela, prio: "medium", children: [
    { t: "Testes com usuários", type: "pacote", stage: STAGE.emteste, who: P.thayanne, prio: "medium", start: d(20), end: d(35), hours: 20, tags: ["teste", "uat"], parts: [P.daniela, P.renata], children: [
      { t: "Roteiro de testes UAT", type: "atividade", stage: STAGE.emteste, who: P.thayanne, prio: "low", end: d(28), hours: 8, tags: ["uat"] },
      { t: "Piloto com setor de oncologia", type: "atividade", stage: STAGE.backlog, who: P.renata, prio: "medium", end: d(33), hours: 12, tags: ["piloto"] },
    ]},
    { t: "Publicação em produção", type: "pacote", stage: STAGE.backlog, who: P.williame, prio: "high", children: [
      { t: "Plano de rollback", type: "atividade", stage: STAGE.backlog, who: P.wesley, prio: "high", end: d(40), hours: 4, tags: ["deploy"] },
      { t: "Treinar equipe de suporte", type: "atividade", stage: STAGE.backlog, who: P.renata, prio: "low", end: d(38), hours: 6, tags: ["treinamento"] },
      { t: "Go-live em produção", type: "marco", stage: STAGE.backlog, who: P.williame, prio: "urgente", end: d(42) },
    ]},
    { t: "Encerramento do projeto", type: "marco", stage: STAGE.backlog, who: P.daniela, prio: "low", end: d(45) },
  ]},
];

async function insertNode(node, parentId, order) {
  const prioMap = { urgente: "urgente", critica: "critica", high: "alta", medium: "media", low: "baixa" };
  const row = {
    project_id: PROJECT,
    parent_id: parentId,
    workflow_stage_id: node.stage,
    title: `[SEED] ${node.t}`,
    status: node.stage === STAGE.concluida ? "completed" : "pending",
    assigned_to: node.who || null,
    priority: prioMap[node.prio] || "medium",
    // O banco (migration de pacote pendente na VM) só aceita fase/atividade/marco.
    // "pacote" é derivado automaticamente pelo app quando o item tem filhos,
    // então gravamos os pacotes como "atividade" — viram pacote por ter subitens.
    item_type: node.type === "fase" ? "fase" : "atividade",
    is_milestone: node.type === "marco",
    start_date: node.start || null,
    end_date: node.end || null,
    hours: node.hours || 0,
    tags: node.tags || [],
    participants: node.parts || [],
    display_order: order,
    blocked_since: node.blocked ? new Date().toISOString() : null,
  };
  const { data, error } = await sb.from("activities").insert(row).select("id").single();
  if (error) { console.error("  ERRO em", node.t, "->", error.message); return 0; }
  let count = 1;
  if (node.children) {
    let i = 0;
    for (const c of node.children) { count += await insertNode(c, data.id, i++); }
  }
  return count;
}

(async () => {
  // Idempotência: remove seeds anteriores.
  const { count: existing } = await sb.from("activities").select("id", { count: "exact", head: true }).eq("project_id", PROJECT).ilike("title", "[SEED]%");
  if (existing > 0) {
    await sb.from("activities").delete().eq("project_id", PROJECT).ilike("title", "[SEED]%");
    console.log(`Removidos ${existing} seeds anteriores.`);
  }
  let total = 0, order = 100;
  for (const fase of TREE) { total += await insertNode(fase, null, order++); }
  console.log(`\n✓ Criadas ${total} atividades de teste no projeto "Agente de IA Tasy - Pops".`);
})().catch((e) => console.error("FALHA:", e.message));
