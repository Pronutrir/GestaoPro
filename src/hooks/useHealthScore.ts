import { useEffect, useState } from "react";
import { calculateHealthScore, HealthScoreResult } from "@/lib/healthScore";

export function useHealthScore(projectId: string | undefined) {
  const [health, setHealth] = useState<HealthScoreResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    calculateHealthScore(projectId)
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  return { health, loading };
}
