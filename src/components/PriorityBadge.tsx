import { GUT_META, normalizeGut } from "@/lib/gutPriority";

interface Props {
  priority: string | null | undefined;
  score?: number | null;
  size?: "sm" | "md";
  showScore?: boolean;
}

export const PriorityBadge = ({ priority, score, size = "sm", showScore = false }: Props) => {
  const level = normalizeGut(priority);
  const meta = GUT_META[level];
  const dim = size === "sm" ? "text-[10px] px-1.5 py-0.5 gap-1" : "text-xs px-2 py-1 gap-1.5";
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <span className={`inline-flex items-center rounded-md font-semibold ${dim} ${meta.badgeClass}`}>
      <span className={`rounded-full ${dotSize} ${meta.dotClass} ${meta.pulse ? "animate-pulse" : ""}`} />
      {meta.label}
      {showScore && score != null && (
        <span className="opacity-70 tabular-nums font-normal">· {score}</span>
      )}
    </span>
  );
};