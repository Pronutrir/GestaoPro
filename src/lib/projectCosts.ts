/**
 * CUSTO DO PROJETO — fonte única de cálculo (Fase 1 do plano financeiro).
 *
 * Antes, "Custo do Projeto" era um campo digitado à mão (projects.budget_used)
 * que convivia com o custo das atividades sem nunca bater com ele. Aqui o custo
 * passa a ser DERIVADO, sempre pela mesma conta, em qualquer tela:
 *
 *   Orçado  = soma dos itens de orçamento (budget_items)
 *   Real    = custos lançados + custo de mão de obra (horas × taxa vigente)
 *   Linha de base = Orçado + contingência        (a gerencial fica FORA)
 *
 * Vocabulário: rótulo em português com a sigla ao lado ("Valor agregado (EV)"),
 * conforme decidido — quem conhece PMBOK reconhece, quem não conhece entende.
 */

export type BudgetCategory =
  | "pessoal"
  | "licencas"
  | "servicos"
  | "infraestrutura"
  | "viagem"
  | "outros";

export const BUDGET_CATEGORIES: { value: BudgetCategory; label: string; hint: string }[] = [
  { value: "pessoal", label: "Pessoal", hint: "Horas de equipe, alocação, terceiros por hora" },
  { value: "licencas", label: "Licenças e software", hint: "Assinaturas, licenças, ferramentas" },
  { value: "servicos", label: "Serviços", hint: "Consultoria, fornecedor de preço fechado" },
  { value: "infraestrutura", label: "Infraestrutura", hint: "Servidores, nuvem, equipamentos" },
  { value: "viagem", label: "Viagem", hint: "Deslocamento, hospedagem, diárias" },
  { value: "outros", label: "Outros", hint: "O que não se encaixa nas demais" },
];

export const categoryLabel = (v?: string | null): string =>
  BUDGET_CATEGORIES.find((c) => c.value === v)?.label ?? "Outros";

export interface BudgetItem {
  id: string;
  project_id: string;
  phase_id: string | null;
  description: string;
  category: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  supplier: string | null;
  notes: string | null;
  /** Quando o custo é reconhecido no tempo (Fase 2) — dá forma à curva S. */
  accrual?: string | null;
  /** Estimativa em três pontos (Fase 4): 'simples' | 'pert'. */
  estimate_method?: string | null;
  optimistic_cost?: number | null;
  likely_cost?: number | null;
  pessimistic_cost?: number | null;
}

export interface CostRate {
  id: string;
  job_title_id: string | null;
  user_id: string | null;
  cost_rate: number;
  bill_rate: number | null;
  effective_from: string;
  effective_to: string | null;
}

export interface BudgetSettings {
  project_id: string;
  currency: string;
  precision: number;
  alert_threshold_pct: number;
  contingency_pct: number;
  contingency_amount: number;
  management_reserve_pct: number;
  management_reserve_amount: number;
  notes: string | null;
}

export const DEFAULT_BUDGET_SETTINGS: Omit<BudgetSettings, "project_id"> = {
  currency: "BRL",
  precision: 2,
  alert_threshold_pct: 90,
  contingency_pct: 0,
  contingency_amount: 0,
  management_reserve_pct: 0,
  management_reserve_amount: 0,
  notes: null,
};

/** Atividade, no mínimo que o cálculo de custo precisa. */
export interface CostActivity {
  id: string;
  parent_id?: string | null;
  phase_id?: string | null;
  cost?: number | null;
  hours?: number | null;
}

/**
 * Taxa vigente para uma pessoa numa data: exceção da PESSOA vence a do PAPEL.
 * Entre várias vigências, ganha a mais recente que já começou e não terminou.
 */
export function resolveRate(
  rates: CostRate[],
  opts: { userId?: string | null; jobTitleId?: string | null; on?: string },
): CostRate | null {
  const day = opts.on ?? new Date().toISOString().slice(0, 10);
  const valid = (r: CostRate) =>
    r.effective_from <= day && (!r.effective_to || r.effective_to >= day);
  const newest = (list: CostRate[]) =>
    list.filter(valid).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;

  if (opts.userId) {
    const own = newest(rates.filter((r) => r.user_id === opts.userId));
    if (own) return own;
  }
  if (opts.jobTitleId) {
    return newest(rates.filter((r) => r.job_title_id === opts.jobTitleId));
  }
  return null;
}

/**
 * Custo de mão de obra a partir das horas lançadas.
 * Cada apontamento usa a taxa VIGENTE NA DATA em que foi feito — por isso a
 * vigência existe: um reajuste hoje não reescreve o custo do mês passado.
 */
export function laborCost(
  entries: { user_id?: string | null; job_title_id?: string | null; minutes: number; on: string }[],
  rates: CostRate[],
): number {
  return entries.reduce((sum, e) => {
    const rate = resolveRate(rates, { userId: e.user_id, jobTitleId: e.job_title_id, on: e.on });
    if (!rate) return sum;
    return sum + (e.minutes / 60) * rate.cost_rate;
  }, 0);
}

/**
 * ROLLUP DA EAP: custo próprio de cada atividade + o de todos os descendentes.
 * É o que faltava — o custo já existia no card e morria ali. Devolve um mapa
 * id → total, para a Fase mostrar a soma dos filhos sem recalcular a árvore.
 */
export function rollupActivityCosts(activities: CostActivity[]): Map<string, number> {
  const childrenOf = new Map<string, CostActivity[]>();
  activities.forEach((a) => {
    const key = a.parent_id ?? "__root__";
    const list = childrenOf.get(key) ?? [];
    list.push(a);
    childrenOf.set(key, list);
  });

  const totals = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (a: CostActivity): number => {
    const cached = totals.get(a.id);
    if (cached !== undefined) return cached;
    // Ciclo em parent_id não deve travar a tela (dado ruim acontece).
    if (visiting.has(a.id)) return Number(a.cost) || 0;
    visiting.add(a.id);
    const own = Number(a.cost) || 0;
    const kids = (childrenOf.get(a.id) ?? []).reduce((s, c) => s + walk(c), 0);
    visiting.delete(a.id);
    const total = own + kids;
    totals.set(a.id, total);
    return total;
  };

  activities.forEach(walk);
  return totals;
}

/** Custo total das atividades RAIZ (somar todas duplicaria os filhos). */
export function totalActivityCost(activities: CostActivity[]): number {
  const totals = rollupActivityCosts(activities);
  const ids = new Set(activities.map((a) => a.id));
  return activities
    // Filho de pai que não veio na lista conta como raiz — senão sumiria.
    .filter((a) => !a.parent_id || !ids.has(a.parent_id))
    .reduce((s, a) => s + (totals.get(a.id) ?? 0), 0);
}

export interface BudgetSummary {
  /** Soma dos itens do orçamento. */
  planned: number;
  /** Reserva de contingência — DENTRO da linha de base. */
  contingency: number;
  /** Linha de base (BAC): é contra ela que o desempenho é medido. */
  baseline: number;
  /** Reserva gerencial — FORA da linha de base. */
  managementReserve: number;
  /** Orçamento total autorizado = linha de base + reserva gerencial. */
  totalBudget: number;
  /** Custo real: lançamentos + mão de obra. */
  actual: number;
  /** Saldo contra a linha de base. */
  remaining: number;
  /** % consumido da linha de base. */
  consumedPct: number;
  /** Passou do limite de alerta configurado? */
  overThreshold: boolean;
  /** Estourou a linha de base? */
  overBudget: boolean;
}

export function summarizeBudget(input: {
  items: { total_cost: number }[];
  actualDirect: number;
  actualLabor: number;
  settings: Pick<
    BudgetSettings,
    "contingency_pct" | "contingency_amount" | "management_reserve_pct" | "management_reserve_amount" | "alert_threshold_pct"
  >;
}): BudgetSummary {
  const planned = input.items.reduce((s, i) => s + (Number(i.total_cost) || 0), 0);
  const s = input.settings;
  // % e valor fixo se somam: o % cobre o proporcional, o valor cobre o pontual.
  const contingency = planned * (Number(s.contingency_pct) || 0) / 100 + (Number(s.contingency_amount) || 0);
  const baseline = planned + contingency;
  const managementReserve =
    baseline * (Number(s.management_reserve_pct) || 0) / 100 + (Number(s.management_reserve_amount) || 0);
  const actual = (Number(input.actualDirect) || 0) + (Number(input.actualLabor) || 0);
  const consumedPct = baseline > 0 ? (actual / baseline) * 100 : 0;

  return {
    planned,
    contingency,
    baseline,
    managementReserve,
    totalBudget: baseline + managementReserve,
    actual,
    remaining: baseline - actual,
    consumedPct,
    overThreshold: baseline > 0 && consumedPct >= (Number(s.alert_threshold_pct) || 90),
    overBudget: baseline > 0 && actual > baseline,
  };
}

export const formatMoney = (v: number, currency = "BRL", precision = 2): string =>
  (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

// ============================================================
// FASE 2 — LINHA DE BASE E DISTRIBUIÇÃO NO TEMPO
// ============================================================

export interface BudgetBaseline {
  id: string;
  project_id: string;
  version: number;
  planned_total: number;
  contingency_total: number;
  baseline_total: number;
  management_reserve_total: number;
  approved_by_name: string | null;
  approved_at: string;
  reason: string | null;
  is_active: boolean;
}

export interface BaselineLine {
  baseline_id: string;
  period_start: string;
  planned_amount: number;
}

/** Regra de reconhecimento do custo ao longo do período (cost accrual). */
export type Accrual = "inicio" | "rateado" | "fim";

/** Primeiro dia do mês, em texto — a chave de período usada em tudo aqui. */
export const monthKey = (d: Date | string): string => {
  const dt = typeof d === "string" ? new Date(`${d.slice(0, 10)}T12:00:00`) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-01`;
};

/** Lista de meses (inclusive) entre duas datas. */
export const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  const start = new Date(`${from.slice(0, 10)}T12:00:00`);
  const end = new Date(`${to.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;
  const cur = new Date(start.getFullYear(), start.getMonth(), 1, 12);
  const last = new Date(end.getFullYear(), end.getMonth(), 1, 12);
  while (cur <= last) {
    out.push(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
};

/**
 * Distribui o custo dos itens pelos meses do projeto — é isto que dá FORMA à
 * curva S. Cada item usa o período da sua fase (ou o do projeto, se solto) e a
 * regra de reconhecimento: tudo no início, rateado, ou tudo no fim.
 */
export function distributeOverTime(
  items: { total_cost: number; phase_id: string | null; accrual?: string | null }[],
  phasePeriods: Map<string, { start: string; end: string }>,
  projectPeriod: { start: string; end: string },
): Map<string, number> {
  const byMonth = new Map<string, number>();
  const add = (m: string, v: number) => byMonth.set(m, (byMonth.get(m) ?? 0) + v);

  items.forEach((item) => {
    const total = Number(item.total_cost) || 0;
    if (total === 0) return;
    const period = (item.phase_id && phasePeriods.get(item.phase_id)) || projectPeriod;
    const months = monthsBetween(period.start, period.end);
    if (months.length === 0) {
      // Sem datas não há como distribuir: joga no mês corrente para o valor
      // não sumir da curva (melhor visível no lugar errado do que invisível).
      add(monthKey(new Date()), total);
      return;
    }
    const rule = (item.accrual as Accrual) || "rateado";
    if (rule === "inicio") add(months[0], total);
    else if (rule === "fim") add(months[months.length - 1], total);
    else months.forEach((m) => add(m, total / months.length));
  });

  return byMonth;
}

/** Série acumulada a partir de um mapa mês → valor do período. */
export function cumulative(byMonth: Map<string, number>, months: string[]): number[] {
  let running = 0;
  return months.map((m) => {
    running += byMonth.get(m) ?? 0;
    return running;
  });
}

// ============================================================
// FASE 3 — VALOR AGREGADO (EVM enxuto)
// ============================================================

export interface EarnedValue {
  /** Valor planejado (PV): quanto deveria ter sido gasto até hoje. */
  pv: number;
  /** Valor agregado (EV): quanto do trabalho previsto foi entregue, em dinheiro. */
  ev: number;
  /** Custo real (AC). */
  ac: number;
  /** Linha de base (BAC). */
  bac: number;
  /** Desvio de custo (CV = EV − AC). Positivo é bom. */
  cv: number;
  /** Desvio de prazo (SV = EV − PV), em dinheiro. Positivo é bom. */
  sv: number;
  /** Desempenho de custo (CPI = EV / AC). Acima de 1 é bom. */
  cpi: number;
  /** Desempenho de prazo (SPI = EV / PV). Acima de 1 é bom. */
  spi: number;
  /** Previsão final (EAC = BAC / CPI): onde termina, no ritmo atual. */
  eac: number;
  /** Custo restante previsto (ETC = EAC − AC). */
  etc: number;
  /** Desvio previsto no fim (VAC = BAC − EAC). Positivo é sobra. */
  vac: number;
  /** % de avanço físico usado para calcular o EV. */
  progressPct: number;
}

/**
 * EVM enxuto: 10 números derivados de 3 entradas.
 *
 * Deliberadamente fora (ver plano): % físico separado do % de avanço, as 4
 * variantes de EAC e regras de EV por tarefa — é o que torna o EVM pesado.
 * Usamos a variante mais usada, EAC = BAC / CPI (o desempenho atual persiste).
 */
export function earnedValue(input: {
  bac: number;
  /** Planejado acumulado até hoje, vindo da distribuição time-phased. */
  pvToDate: number;
  actualCost: number;
  /** Avanço físico do projeto (0–100), das atividades concluídas. */
  progressPct: number;
}): EarnedValue {
  const bac = Number(input.bac) || 0;
  const pv = Number(input.pvToDate) || 0;
  const ac = Number(input.actualCost) || 0;
  const pct = Math.max(0, Math.min(100, Number(input.progressPct) || 0));
  const ev = bac * (pct / 100);

  // Divisões por zero acontecem no começo do projeto (nada gasto, nada
  // planejado ainda): devolver 0 em vez de Infinity mantém a tela honesta.
  const cpi = ac > 0 ? ev / ac : 0;
  const spi = pv > 0 ? ev / pv : 0;
  const eac = cpi > 0 ? bac / cpi : bac;

  return {
    pv, ev, ac, bac,
    cv: ev - ac,
    sv: ev - pv,
    cpi, spi, eac,
    etc: Math.max(0, eac - ac),
    vac: bac - eac,
    progressPct: pct,
  };
}

/** Classificação de um índice (CPI/SPI) para semáforo. */
export const indexTone = (v: number): "ok" | "warn" | "bad" =>
  v === 0 ? "warn" : v >= 1 ? "ok" : v >= 0.9 ? "warn" : "bad";

// ============================================================
// FASE 4 — ESTIMATIVA EM TRÊS PONTOS (PERT) E MARGEM
// ============================================================

/**
 * Estimativa em três pontos pela distribuição Beta (PERT).
 * O peso 4 no "mais provável" é o que diferencia PERT da média simples: ele
 * reconhece que o valor central tem maior probabilidade de ocorrer.
 */
export function pertEstimate(o: number, m: number, p: number): { expected: number; stdDev: number } {
  const O = Number(o) || 0, M = Number(m) || 0, P = Number(p) || 0;
  return {
    expected: (O + 4 * M + P) / 6,
    // Desvio-padrão: mede a CONFIANÇA da estimativa. Quanto maior a distância
    // entre otimista e pessimista, mais incerta ela é.
    stdDev: Math.abs(P - O) / 6,
  };
}

/** Faixa de confiança de ~95% (±2 desvios) para a estimativa. */
export const pertRange = (expected: number, stdDev: number): { min: number; max: number } => ({
  min: Math.max(0, expected - 2 * stdDev),
  max: expected + 2 * stdDev,
});

export interface MarginSummary {
  /** Receita prevista: horas × valor de cobrança. */
  revenue: number;
  /** Custo das mesmas horas. */
  cost: number;
  /** Margem bruta em valor. */
  margin: number;
  /** Margem em % da receita. */
  marginPct: number;
}

/**
 * Margem a partir do bill_rate já capturado na Fase 1 — sem trabalho extra de
 * cadastro. Só faz sentido onde há taxa de cobrança definida; sem ela, devolve
 * zeros em vez de fingir lucro.
 */
export function summarizeMargin(
  entries: { user_id?: string | null; job_title_id?: string | null; minutes: number; on: string }[],
  rates: CostRate[],
): MarginSummary {
  let revenue = 0;
  let cost = 0;
  entries.forEach((e) => {
    const rate = resolveRate(rates, { userId: e.user_id, jobTitleId: e.job_title_id, on: e.on });
    if (!rate) return;
    const hours = e.minutes / 60;
    cost += hours * (Number(rate.cost_rate) || 0);
    if (rate.bill_rate) revenue += hours * Number(rate.bill_rate);
  });
  const margin = revenue - cost;
  return {
    revenue,
    cost,
    margin,
    marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
  };
}

/** Exportação do orçamento em CSV (Excel pt-BR: separador ";"). */
export function budgetToCsv(
  items: BudgetItem[],
  phaseTitle: (id: string | null) => string,
): string {
  const head = ["Categoria", "Descrição", "Fase", "Fornecedor", "Quantidade", "Valor unitário", "Total"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (v: number) => String(Number(v) || 0).replace(".", ",");
  const rows = items.map((i) => [
    categoryLabel(i.category),
    i.description,
    phaseTitle(i.phase_id),
    i.supplier ?? "",
    num(Number(i.quantity)),
    num(Number(i.unit_cost)),
    num(Number(i.total_cost)),
  ]);
  const total = items.reduce((s, i) => s + (Number(i.total_cost) || 0), 0);
  rows.push(["", "", "", "", "", "TOTAL", num(total)]);
  return [head, ...rows].map((r) => r.map(esc).join(";")).join("\n");
}
