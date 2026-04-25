import { useMemo } from "react";
import { GUT_HINTS, GUT_META, gutLabel, gutScore } from "@/lib/gutPriority";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface Props {
  gravity: number | null;
  urgency: number | null;
  tendency: number | null;
  onChange: (next: { gravity: number | null; urgency: number | null; tendency: number | null }) => void;
  /** Tamanho compacto p/ uso em diálogos */
  compact?: boolean;
}

const FACTORS: Array<{ key: "gravity" | "urgency" | "tendency"; short: string; full: string }> = [
  { key: "gravity",  short: "G", full: "Gravidade" },
  { key: "urgency",  short: "U", full: "Urgência" },
  { key: "tendency", short: "T", full: "Tendência" },
];

export const GutPrioritySelector = ({ gravity, urgency, tendency, onChange, compact }: Props) => {
  const score = useMemo(() => gutScore(gravity, urgency, tendency), [gravity, urgency, tendency]);
  const level = gutLabel(score);
  const meta = GUT_META[level];

  const setFactor = (key: "gravity" | "urgency" | "tendency", v: number) => {
    onChange({
      gravity: key === "gravity" ? v : gravity,
      urgency: key === "urgency" ? v : urgency,
      tendency: key === "tendency" ? v : tendency,
    });
  };

  const values: Record<string, number | null> = { gravity, urgency, tendency };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-2">
        {FACTORS.map((f) => {
          const current = values[f.key];
          const hint = GUT_HINTS[f.key];
          return (
            <div key={f.key} className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-28 shrink-0">
                <span className="text-[11px] font-bold text-muted-foreground tabular-nums">{f.short}</span>
                <span className="text-xs text-foreground">{f.full}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" tabIndex={-1} className="text-muted-foreground/60 hover:text-foreground">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px]">
                    <p className="font-semibold mb-1 text-[11px]">{hint.title}</p>
                    <ul className="space-y-0.5 text-[10px]">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <li key={n}>
                          <span className="font-mono font-bold">{n}</span> — {hint.notes[n as 1 | 2 | 3 | 4 | 5]}
                        </li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex gap-1 flex-1">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = current === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFactor(f.key, n)}
                      className={`flex-1 ${compact ? "h-7 text-xs" : "h-8 text-sm"} rounded-md border font-semibold tabular-nums transition-all ${
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Resultado calculado */}
        <div className={`mt-3 p-2.5 rounded-lg border ${meta.ringClass} bg-card flex items-center justify-between gap-2`}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${meta.dotClass} ${meta.pulse ? "animate-pulse" : ""}`} />
            <span className="text-xs text-muted-foreground">Prioridade calculada:</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${meta.badgeClass}`}>
              {meta.label}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {score == null ? "— / 125" : <><span className="text-foreground font-semibold">{score}</span> / 125</>}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};