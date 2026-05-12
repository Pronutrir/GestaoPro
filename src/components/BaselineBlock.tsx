import { cn } from "@/lib/utils";
import { endVariance, varianceTone, varianceClasses, formatVariance } from "@/lib/dateVariance";

interface ProjectLike {
  id: string;
  start_date?: string | null;
  due_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  baseline_start_date?: string | null;
  baseline_end_date?: string | null;
  baseline_frozen_at?: string | null;
}

const fmt = (iso?: string | null) => {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
};

/**
 * Bloco compacto que mostra Previsto x Real x Desvio do projeto e
 * permite a gestores Admin/Gestor congelar/recongelar a linha de base.
 */
export function BaselineBlock({
  project,
}: { project: ProjectLike; canManage?: boolean; onChanged?: () => void }) {
  const planned = { s: project.start_date, e: project.due_date };
  const real = { s: project.actual_start_date, e: project.actual_end_date };
  const variance = endVariance(real.e, project.baseline_end_date, planned.e);
  const tone = varianceTone(variance);

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="text-muted-foreground">Previsto:</span>
      <span className="font-mono text-foreground">{fmt(planned.s)} → {fmt(planned.e)}</span>

      {(real.s || real.e) && (
        <>
          <span className="text-muted-foreground ml-2">Real:</span>
          <span className="font-mono text-foreground">{fmt(real.s)} → {fmt(real.e)}</span>
        </>
      )}

      {variance !== null && (
        <span
          className={cn("px-1.5 py-0.5 rounded border font-mono", varianceClasses(tone))}
          title="Real − Previsto"
        >
          Desvio {formatVariance(variance)}
        </span>
      )}
    </div>
  );
}
