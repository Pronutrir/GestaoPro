'use client';
// Métricas de fluxo (Item 6 da rodada final): throughput semanal (via
// completed_at, funciona desde já), tempo por coluna média/p85 (via histórico
// de transições — exige a migration activity_stage_transitions) e a medição
// da maior coluna (decisão F: gatilho objetivo da virtualização, 60 cards).
// O CFD gráfico entra quando houver histórico acumulado para desenhá-lo.
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStageDisplayTitle, type Activity, type WorkflowStage } from "./shared";
import { cn } from "@/lib/utils";

// Tabela fora dos tipos gerados até a migration rodar e os tipos regenerarem.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const transitionsTable = () => (supabase as any).from("activity_stage_transitions");

type Transition = {
  activity_id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  moved_at: string;
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
};

export function FlowMetricsDialog({
  open,
  onOpenChange,
  projectId,
  activities,
  stages,
  maxColumnCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  activities: Activity[];
  stages: WorkflowStage[];
  maxColumnCount: number;
}) {
  const [transitions, setTransitions] = useState<Transition[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await transitionsTable()
        .select("activity_id, from_stage_id, to_stage_id, moved_at")
        .eq("project_id", projectId)
        .order("moved_at", { ascending: true });
      if (error) {
        if (/activity_stage_transitions|relation|does not exist|schema cache/i.test(error.message)) {
          setUnavailable(true);
        }
        return;
      }
      setUnavailable(false);
      setTransitions((data as Transition[]) || []);
    })();
  }, [open, projectId]);

  // Throughput: concluídas por semana (segunda a domingo), últimas 8 semanas.
  const weeks = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // segunda desta semana
    const rows: { label: string; from: Date; to: Date; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const from = new Date(start);
      from.setDate(start.getDate() - i * 7);
      const to = new Date(from);
      to.setDate(from.getDate() + 7);
      rows.push({
        label: `${String(from.getDate()).padStart(2, "0")}/${String(from.getMonth() + 1).padStart(2, "0")}`,
        from,
        to,
        count: 0,
      });
    }
    activities.forEach((a) => {
      if (!a.completed_at) return;
      const t = new Date(a.completed_at);
      const row = rows.find((r) => t >= r.from && t < r.to);
      if (row) row.count += 1;
    });
    return rows;
  }, [activities]);

  const last4 = weeks.slice(-4).reduce((s, w) => s + w.count, 0);
  const weeklyAvg = weeks.reduce((s, w) => s + w.count, 0) / weeks.length;
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));

  // Tempo por coluna: só intervalos FECHADOS (entrada → próxima saída);
  // o tempo da passagem em andamento não entra para não puxar a média p/ baixo.
  const stageStats = useMemo(() => {
    if (!transitions) return null;
    const byActivity = new Map<string, Transition[]>();
    transitions.forEach((t) => {
      const l = byActivity.get(t.activity_id) || [];
      l.push(t);
      byActivity.set(t.activity_id, l);
    });
    const samples = new Map<string, number[]>();
    byActivity.forEach((list) => {
      for (let i = 0; i < list.length - 1; i++) {
        const stageId = list[i].to_stage_id;
        if (!stageId) continue;
        const days = (new Date(list[i + 1].moved_at).getTime() - new Date(list[i].moved_at).getTime()) / 86_400_000;
        const arr = samples.get(stageId) || [];
        arr.push(days);
        samples.set(stageId, arr);
      }
    });
    return samples;
  }, [transitions]);

  const statRows = stages
    .filter((s) => s.display_order > 0)
    .map((s) => {
      const samples = (stageStats?.get(s.id) ?? []).slice().sort((a, b) => a - b);
      return {
        id: s.id,
        title: getStageDisplayTitle(s.title),
        color: s.color,
        count: samples.length,
        avg: samples.length ? samples.reduce((x, y) => x + y, 0) / samples.length : 0,
        p85: percentile(samples, 85),
      };
    });
  const hasStageData = statRows.some((r) => r.count > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Métricas do fluxo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">Concluídas · 4 sem.</p>
              <p className="text-xl font-bold tabular-nums">{last4}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">Média / semana</p>
              <p className="text-xl font-bold tabular-nums">{weeklyAvg.toFixed(1)}</p>
            </div>
            <div className="rounded-lg border p-3" title="Gatilho definido da virtualização: 60 cards numa coluna">
              <p className="text-[11px] text-muted-foreground">Maior coluna</p>
              <p className={cn("text-xl font-bold tabular-nums", maxColumnCount >= 60 && "text-amber-600")}>
                {maxColumnCount}
                <span className="text-[11px] font-normal text-muted-foreground"> / 60</span>
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Throughput — concluídas por semana
            </p>
            <div className="space-y-1">
              {weeks.map((w) => (
                <div key={w.label} className="flex items-center gap-2 text-xs">
                  <span className="w-11 tabular-nums text-muted-foreground shrink-0">{w.label}</span>
                  <span className="flex-1 h-3 rounded-sm bg-muted overflow-hidden">
                    <span
                      className="block h-full rounded-sm bg-primary/70"
                      style={{ width: `${(w.count / maxWeek) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right tabular-nums shrink-0">{w.count}</span>
                </div>
              ))}
            </div>
          </div>

          {unavailable ? (
            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Tempo por coluna e CFD dependem do histórico de transições, ainda não habilitado — rode{" "}
                <code className="font-mono text-[11px]">scripts/apply-activity-stage-transitions.sh</code> na VM.
                O histórico conta a partir daí; o passado não é reconstruível.
              </span>
            </div>
          ) : (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                Tempo por coluna — passagens fechadas
              </p>
              {!hasStageData ? (
                <p className="text-xs text-muted-foreground border rounded-md px-3 py-2.5">
                  Ainda sem passagens registradas — o histórico começou a contar quando a migration rodou.
                  Mova cards no quadro e os tempos aparecem aqui.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="text-left font-semibold py-1">Coluna</th>
                      <th className="text-right font-semibold py-1">Passagens</th>
                      <th className="text-right font-semibold py-1">Média</th>
                      <th className="text-right font-semibold py-1">p85</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statRows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                            {r.title}
                          </span>
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">{r.count || "—"}</td>
                        <td className="text-right tabular-nums">{r.count ? `${r.avg.toFixed(1)}d` : "—"}</td>
                        <td className="text-right tabular-nums">{r.count ? `${r.p85.toFixed(1)}d` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">
                O CFD (fluxo cumulativo) entra quando o histórico tiver semanas suficientes para desenhá-lo.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
