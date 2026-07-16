import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import type { RoadmapItem } from "@/components/roadmap/types";

interface Props {
  items: RoadmapItem[];
}

const quarterLabels = ["Q1", "Q2", "Q3", "Q4"];
const quarterColors = [
  "bg-primary/10 border-primary/30",
  "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800",
  "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
  "bg-violet-50 border-violet-200 dark:bg-violet-900/20 dark:border-violet-800",
];

export function RoadmapTimeline({ items }: Props) {
  const grouped = useMemo(() => {
    const map: Record<string, RoadmapItem[]> = {};
    quarterLabels.forEach((q) => (map[q] = []));
    items.forEach((item) => {
      const q = item.target_quarter || "Q1";
      if (!map[q]) map[q] = [];
      map[q].push(item);
    });
    return map;
  }, [items]);

  if (!items.length) {
    return (
      <div className="text-center py-12 text-muted-foreground mt-4">
        Nenhum item aprovado com trimestre definido.
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
      {quarterLabels.map((q, idx) => (
        <div key={q} className={`rounded-lg border p-4 ${quarterColors[idx]}`}>
          <h3 className="font-bold text-sm mb-3">{q}</h3>
          <div className="space-y-2">
            {grouped[q]?.length ? (
              grouped[q].map((item) => (
                <div
                  key={item.id}
                  className="bg-background rounded-md p-2 border shadow-sm text-xs space-y-1"
                >
                  <p className="font-medium truncate">{item.title}</p>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {item.score != null ? `${Math.round(item.score)}%` : "—"}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Sem itens</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
