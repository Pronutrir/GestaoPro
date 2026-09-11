'use client';
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
 * Bloco compacto que mostra Previsto × Real × Desvio do projeto.
 *
 * O comentário daqui dizia que ele "permite a gestores Admin/Gestor
 * congelar/recongelar a linha de base". Não permite, e nunca permitiu: não há
 * botão de congelar neste componente, e `canManage` chega e não é lido.
 * Congelar linha de base é a segunda onda do CLAUDE.md, ainda não construída.
 *
 * Até 11/09/2026 este bloco só conseguia renderizar "Previsto": as cinco
 * colunas que ele lê além do previsto — `actual_start_date`, `actual_end_date`,
 * `baseline_start_date`, `baseline_end_date`, `baseline_frozen_at` — não
 * existiam em `public.projects`, então "Real" e "Desvio" eram impossíveis.
 *
 * A migration 20260911160100 criou as duas colunas de data REAL. As três de
 * baseline continuam não existindo de propósito (ver a própria migration):
 * enquanto não houver o ato de congelar, `endVariance` usa o PREVISTO como
 * referência, que é o ramo já escrito para este caso.
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
