import { supabase } from "@/integrations/supabase/client";
import { isActivityOverdue } from "./activityState";

export interface HealthScoreResult {
  score: number;
  label: string;
  color: string;
  breakdown: {
    prazo: number;
    riscos: number;
    engajamento: number;
    financeiro: number;
  };
}

export async function calculateHealthScore(projectId: string): Promise<HealthScoreResult> {
  const [activitiesRes, risksRes, projectRes, stagesRes] = await Promise.all([
    // workflow_stage_id é necessário para respeitar a coluna final do Kanban:
    // sem ele, uma atividade encerrada no quadro contava como atrasada aqui.
    supabase
      .from("activities")
      .select("id, status, end_date, workflow_stage_id")
      .eq("project_id", projectId),
    supabase.from("risks").select("id, probability, impact, status").eq("project_id", projectId).eq("is_trashed", false),
    supabase.from("projects").select("budget_planned, budget_used, updated_at").eq("id", projectId).single(),
    supabase.from("workflow_stages").select("id, is_final").eq("project_id", projectId),
  ]);

  const activities = activitiesRes.data || [];
  const risks = risksRes.data || [];
  const project = projectRes.data;

  const finalStageIds = new Set(
    (stagesRes.data || []).filter((s: any) => s.is_final).map((s: any) => s.id),
  );

  // 1. Prazo (40%)
  // Usa a mesma regra do Cronograma (lib/activityState) — antes esta conta
  // ignorava a coluna final do Kanban e as duas telas divergiam.
  const total = activities.length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = activities.filter((a: any) =>
    isActivityOverdue(a, { is_final: finalStageIds.has(a.workflow_stage_id) }, today),
  ).length;
  const prazo = total > 0 ? (1 - overdue / total) * 100 : 100;

  // 2. Riscos (30%)
  let riskPenalty = 0;
  risks.forEach((r) => {
    if (r.status === "mitigated" || r.status === "closed") return;
    const isCritical =
      (r.probability === "high" && r.impact === "high") ||
      r.impact === "critical" ||
      r.probability === "critical";
    const isHigh = r.probability === "high" || r.impact === "high";
    if (isCritical) riskPenalty += 15;
    else if (isHigh) riskPenalty += 5;
  });
  const riscos = Math.max(0, 100 - riskPenalty);

  // 3. Engajamento (20%)
  let engajamento = 0;
  if (project?.updated_at) {
    const lastUpdate = new Date(project.updated_at);
    const daysSince = Math.floor((today.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince <= 3) engajamento = 100;
    else if (daysSince <= 7) engajamento = 50;
    else engajamento = 0;
  }

  // 4. Financeiro (10%)
  let financeiro = 100;
  if (project) {
    const planned = Number(project.budget_planned) || 0;
    const used = Number(project.budget_used) || 0;
    if (planned > 0 && used > planned) {
      financeiro = Math.max(0, 100 - ((used - planned) / planned) * 100);
    }
  }

  const score = Math.round(prazo * 0.4 + riscos * 0.3 + engajamento * 0.2 + financeiro * 0.1);

  let label: string;
  let color: string;
  if (score >= 80) { label = "Saudável"; color = "success"; }
  else if (score >= 60) { label = "Atenção"; color = "warning"; }
  else { label = "Crítico"; color = "destructive"; }

  return {
    score,
    label,
    color,
    breakdown: { prazo: Math.round(prazo), riscos: Math.round(riscos), engajamento: Math.round(engajamento), financeiro: Math.round(financeiro) },
  };
}
