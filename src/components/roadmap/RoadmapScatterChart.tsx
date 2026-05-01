import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from "recharts";
import type { RoadmapItem } from "@/legacy/pages/Roadmap";

interface Props {
  items: RoadmapItem[];
}

export function RoadmapScatterChart({ items }: Props) {
  const data = useMemo(
    () =>
      items
        .filter((i) => i.status !== "descartado")
        .map((i) => ({
          name: i.title,
          effort: i.effort,
          value: i.reach * i.impact,
          status: i.status,
        })),
    [items]
  );

  if (!data.length) {
    return (
      <div className="text-center py-12 text-muted-foreground mt-4">
        Sem dados para exibir. Cadastre ideias primeiro.
      </div>
    );
  }

  const maxEffort = Math.max(...data.map((d) => d.effort), 10);
  const maxValue = Math.max(...data.map((d) => d.value), 10);
  const midEffort = maxEffort / 2;
  const midValue = maxValue / 2;

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground max-w-md mx-auto">
        <div className="text-center p-1 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          🎯 Quick Wins (alto valor, baixo esforço)
        </div>
        <div className="text-center p-1 rounded bg-primary/5 border border-primary/20">
          🚀 Big Bets (alto valor, alto esforço)
        </div>
        <div className="text-center p-1 rounded bg-muted border border-border">
          🤔 Maybes (baixo valor, baixo esforço)
        </div>
        <div className="text-center p-1 rounded bg-destructive/5 border border-destructive/20">
          ⏳ Time Sinks (baixo valor, alto esforço)
        </div>
      </div>

      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis type="number" dataKey="effort" name="Esforço" domain={[0, maxEffort + 1]}>
              <Label value="Esforço →" offset={-10} position="insideBottom" className="fill-muted-foreground" />
            </XAxis>
            <YAxis type="number" dataKey="value" name="Valor" domain={[0, maxValue + 2]}>
              <Label value="Valor ↑" angle={-90} position="insideLeft" className="fill-muted-foreground" />
            </YAxis>
            <ReferenceLine x={midEffort} stroke="hsl(var(--border))" strokeDasharray="4 4" />
            <ReferenceLine y={midValue} stroke="hsl(var(--border))" strokeDasharray="4 4" />
            <Tooltip
              content={({ payload }) => {
                if (!payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="rounded-lg border bg-background p-2 shadow-md text-xs">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-muted-foreground">
                      Valor: {p.value.toFixed(1)} · Esforço: {p.effort}
                    </p>
                  </div>
                );
              }}
            />
            <Scatter data={data} fill="hsl(var(--primary))" r={6} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
