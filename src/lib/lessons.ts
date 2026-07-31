/**
 * LIÇÕES APRENDIDAS — captura por evento e entrega no momento certo.
 *
 * A evidência é clara sobre onde está o gargalo: NÃO é a captura, é a ENTREGA.
 * Organizações capturam bastante; o que não acontece é a lição VOLTAR para
 * alguém. Numa avaliação controlada, um sistema que entregava a lição relevante
 * sozinho superou de forma significativa o repositório com busca.
 *
 * Por isso este módulo tem duas metades: os gatilhos (o sistema pergunta) e a
 * recuperação por contexto (a lição volta), sendo a segunda a mais importante.
 */

export type TriggerType = "bloqueio" | "atraso" | "risco" | "orcamento" | "encerramento";
export type PromptStatus = "pendente" | "respondido" | "dispensado";
/** Ciclo da OTAN: só é "aprendida" quando algo mudou por causa dela. */
export type Lifecycle = "identificada" | "acao_atribuida" | "aplicada";
export type Outcome = "funcionou" | "nao_funcionou";

export interface LessonPrompt {
  id: string;
  project_id: string;
  activity_id: string | null;
  phase_id: string | null;
  trigger_type: TriggerType;
  context_title: string;
  context_detail: string | null;
  impact_days: number | null;
  status: PromptStatus;
  lesson_id: string | null;
  created_at: string;
}

export interface Lesson {
  id: string;
  project_id: string;
  phase_id: string | null;
  category: string;
  problem: string;
  solution: string | null;
  suggestion: string | null;
  impact: string | null;
  reported_by: string | null;
  created_at: string;
  // Origem e ciclo
  source_activity_id?: string | null;
  source_trigger?: string | null;
  impact_days?: number | null;
  lifecycle?: Lifecycle | null;
  owner_id?: string | null;
  owner_name?: string | null;
  action_text?: string | null;
  applied_at?: string | null;
  applied_by_name?: string | null;
  outcome?: Outcome | null;
  reuse_count?: number | null;
}

/** Vocabulário de cada gatilho — o que o sistema pergunta, e como. */
export const TRIGGER_META: Record<TriggerType, {
  label: string;
  icon: string;
  /** A pergunta, já com o contexto do evento. */
  question: (ctx: { title: string; detail?: string | null; days?: number | null }) => string;
  category: string;
}> = {
  bloqueio: {
    label: "Bloqueio resolvido",
    icon: "🔓",
    question: (c) =>
      `"${c.title}" ficou ${c.days ?? 0} dia(s) bloqueada por ${c.detail || "motivo não registrado"}. O que evitaria isso?`,
    category: "process",
  },
  atraso: {
    label: "Entrega atrasada",
    icon: "⏱",
    question: (c) => `"${c.title}" terminou ${c.days ?? 0} dia(s) depois do previsto. O que atrasou?`,
    category: "process",
  },
  risco: {
    label: "Risco materializado",
    icon: "⚠",
    question: (c) => `O risco "${c.title}" aconteceu. O plano de resposta funcionou?`,
    category: "risk",
  },
  orcamento: {
    label: "Orçamento replanejado",
    icon: "💰",
    question: (c) => `A linha de base mudou (${c.detail || "nova versão"}). Por que a estimativa inicial não se sustentou?`,
    category: "general",
  },
  encerramento: {
    label: "Balanço final",
    icon: "🏁",
    question: (c) => `"${c.title}" foi concluído. O que você faria diferente num projeto parecido?`,
    category: "general",
  },
};

export const LIFECYCLE_META: Record<Lifecycle, { label: string; hint: string; tone: "draft" | "run" | "done" }> = {
  identificada: {
    label: "Identificada",
    hint: "Registrada, mas nada mudou ainda",
    tone: "draft",
  },
  acao_atribuida: {
    label: "Ação atribuída",
    hint: "Alguém ficou responsável por mudar algo",
    tone: "run",
  },
  aplicada: {
    label: "Aplicada",
    hint: "A mudança foi feita e verificada",
    tone: "done",
  },
};

/**
 * ENTREGA NO MOMENTO CERTO — o núcleo da proposta.
 *
 * Devolve as lições relevantes para um contexto (fase e categoria), ordenadas
 * pelo que mais importa: primeiro as que viraram mudança de verdade, depois as
 * de maior impacto medido em dias. Sem IA e sem busca: a pessoa não precisa
 * saber que a lição existe.
 */
export function relevantLessons(
  lessons: Lesson[],
  ctx: { phaseId?: string | null; category?: string | null; excludeId?: string },
  limit = 3,
): Lesson[] {
  const scored = lessons
    .filter((l) => l.id !== ctx.excludeId)
    .map((l) => {
      let score = 0;
      // Mesma fase é o sinal mais forte de relevância.
      if (ctx.phaseId && l.phase_id === ctx.phaseId) score += 10;
      if (ctx.category && l.category === ctx.category) score += 5;
      // Lição que virou mudança vale mais que lição que ficou no papel.
      if (l.lifecycle === "aplicada") score += 4;
      else if (l.lifecycle === "acao_atribuida") score += 2;
      // Impacto medido desempata: o que custou mais dias aparece antes.
      score += Math.min(5, (Number(l.impact_days) || 0) / 5);
      return { lesson: l, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.lesson);
}

/** Agrupa por motivo, somando o custo em dias — anedota vira padrão. */
export interface BlockerCluster {
  reason: string;
  count: number;
  totalDays: number;
  activities: string[];
}

export function clusterByReason(
  items: { reason: string | null; days: number | null; title: string }[],
): BlockerCluster[] {
  const map = new Map<string, BlockerCluster>();
  items.forEach((i) => {
    // Normaliza para agrupar "Acesso ao ambiente" e "acesso ao ambiente ".
    const key = (i.reason || "sem motivo registrado").trim().toLowerCase();
    const c = map.get(key) ?? {
      reason: (i.reason || "sem motivo registrado").trim(),
      count: 0,
      totalDays: 0,
      activities: [],
    };
    c.count += 1;
    c.totalDays += Number(i.days) || 0;
    c.activities.push(i.title);
    map.set(key, c);
  });
  // Ordena pelo CUSTO, não pela contagem: o que dói mais aparece primeiro.
  return Array.from(map.values()).sort((a, b) => b.totalDays - a.totalDays);
}

/**
 * Regra de qualidade: lição que registra o que NÃO funcionou precisa dizer o
 * que fazer diferente. Reclamação sem recomendação não é lição.
 */
export const needsRecommendation = (l: Pick<Lesson, "outcome" | "suggestion">): boolean =>
  l.outcome === "nao_funcionou" && !l.suggestion?.trim();

/**
 * Métricas honestas. Nunca contar lições REGISTRADAS: foi exatamente a métrica
 * que a NASA otimizou por norma obrigatória, produzindo US$ 94 mil por lição.
 * Medir o que não dá para inflar escrevendo mais.
 */
export interface LessonMetrics {
  /** Quantas viraram mudança verificada. */
  applied: number;
  /** Quantas têm dono mas ainda não fecharam. */
  inProgress: number;
  /** Quantas ficaram só no registro. */
  identified: number;
  /** Quantas vezes lições foram reaproveitadas em outro planejamento. */
  reuse: number;
  /** % que chegou a virar mudança. */
  appliedPct: number;
}

export function lessonMetrics(lessons: Lesson[]): LessonMetrics {
  const applied = lessons.filter((l) => l.lifecycle === "aplicada").length;
  const inProgress = lessons.filter((l) => l.lifecycle === "acao_atribuida").length;
  const identified = lessons.filter((l) => !l.lifecycle || l.lifecycle === "identificada").length;
  const reuse = lessons.reduce((s, l) => s + (Number(l.reuse_count) || 0), 0);
  return {
    applied,
    inProgress,
    identified,
    reuse,
    appliedPct: lessons.length > 0 ? (applied / lessons.length) * 100 : 0,
  };
}
