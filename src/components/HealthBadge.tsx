import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HealthScoreResult } from "@/lib/healthScore";

interface HealthBadgeProps {
  health: HealthScoreResult;
  size?: "sm" | "md";
}

export function HealthBadge({ health, size = "sm" }: HealthBadgeProps) {
  const colorMap: Record<string, string> = {
    success: "bg-success text-success-foreground",
    warning: "bg-warning text-warning-foreground",
    destructive: "bg-destructive text-destructive-foreground",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={`${colorMap[health.color]} ${size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1"} cursor-help`}>
          {health.score}%
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="space-y-1 text-xs">
        <p className="font-semibold">{health.label} — {health.score}/100</p>
        <p>Prazo: {health.breakdown.prazo}%</p>
        <p>Riscos: {health.breakdown.riscos}%</p>
        <p>Engajamento: {health.breakdown.engajamento}%</p>
        <p>Financeiro: {health.breakdown.financeiro}%</p>
      </TooltipContent>
    </Tooltip>
  );
}
