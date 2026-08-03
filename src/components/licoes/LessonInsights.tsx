'use client';
// PADRÕES E MÉTRICAS — uma lição é anedota; cinco iguais são um problema.
//
// Duas ideias, ambas com evidência:
//  1. Agrupar bloqueios por motivo e SOMAR os dias revela causa sistêmica. Num
//     levantamento de campo, bloqueios externos custaram 147 dias contra 20 dos
//     internos — priorização quantificada, que post-it nenhum produz.
//  2. Medir reuso e aplicação, NUNCA quantidade registrada: contar submissões
//     foi o que a NASA otimizou por norma, produzindo US$ 94 mil por lição.
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Layers, CheckCircle2, Repeat } from "lucide-react";
import { clusterByReason, lessonMetrics, type Lesson } from "@/lib/lessons";
import { cn } from "@/lib/utils";

interface Props {
  lessons: Lesson[];
  /** Bloqueios do projeto, para agrupar por motivo. */
  blockers: { reason: string | null; days: number | null; title: string }[];
}

export function LessonInsights({ lessons, blockers }: Props) {
  const m = lessonMetrics(lessons);
  const clusters = clusterByReason(blockers).filter((c) => c.totalDays > 0).slice(0, 5);
  const maxDays = Math.max(1, ...clusters.map((c) => c.totalDays));

  if (lessons.length === 0 && clusters.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Métricas honestas: o que virou mudança e o que foi reaproveitado */}
      {lessons.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Viraram mudança
            </p>
            <p className="text-lg font-bold tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">
              {m.applied}
            </p>
            <p className="text-[11px] text-muted-foreground">{m.appliedPct.toFixed(0)}% do total</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Em andamento</p>
            <p className="text-lg font-bold tabular-nums mt-0.5 text-primary">{m.inProgress}</p>
            <p className="text-[11px] text-muted-foreground">com dono definido</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Só registradas</p>
            <p className="text-lg font-bold tabular-nums mt-0.5">{m.identified}</p>
            <p className="text-[11px] text-muted-foreground">
              {m.identified > 0 ? "aguardando ação" : "nenhuma parada"}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5" /> Reaproveitadas
            </p>
            <p className="text-lg font-bold tabular-nums mt-0.5">{m.reuse}</p>
            <p className="text-[11px] text-muted-foreground">vezes em outro planejamento</p>
          </div>
        </div>
      )}

      {/* Padrões: motivos que mais custaram dias */}
      {clusters.length > 0 && (
        <div className="rounded-lg border bg-card p-3.5">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Layers className="w-4 h-4 text-primary" />
            <span className="text-[13px] font-semibold">O que mais custou dias</span>
            <span className="text-[11px] text-muted-foreground ml-auto">
              bloqueios agrupados por motivo
            </span>
          </div>
          <div className="space-y-2.5">
            {clusters.map((c) => (
              <div key={c.reason} className="grid grid-cols-[minmax(90px,1.4fr)_2fr_auto] gap-2.5 items-center">
                <span className="text-[12px] truncate" title={c.reason}>{c.reason}</span>
                <span className="h-4 rounded bg-muted overflow-hidden relative">
                  <span className={cn("absolute inset-y-0 left-0 rounded",
                    c.totalDays >= maxDays * 0.6 ? "bg-destructive" : "bg-amber-500")}
                    style={{ width: `${(c.totalDays / maxDays) * 100}%` }} />
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground shrink-0 w-[104px] text-right"
                      title={c.activities.join(" · ")}>
                  {c.totalDays}d em {c.count}×
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2.5">
            Um bloqueio é acidente; o mesmo motivo repetido é processo. Ordenado pelo custo em dias,
            não pela quantidade.
          </p>
        </div>
      )}
    </div>
  );
}
