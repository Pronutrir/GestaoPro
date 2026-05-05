'use client';
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { GutPrioritySelector } from "@/components/GutPrioritySelector";
import { GUT_META, gutLabel, gutScore } from "@/lib/gutPriority";
import { ChevronDown, Sliders } from "lucide-react";

interface Props {
  gravity: number | null;
  urgency: number | null;
  tendency: number | null;
  onChange: (next: { gravity: number | null; urgency: number | null; tendency: number | null }) => void;
  /** Largura do botão; padrão = full */
  buttonClassName?: string;
}

/**
 * Campo compacto de Prioridade GUT.
 * Exibe apenas o badge calculado + botão "Ajustar"; abre um Popover com os 3 sliders 1-5.
 * Mantém a tela limpa enquanto preserva acesso rápido ao método.
 */
export const GutPriorityField = ({ gravity, urgency, tendency, onChange, buttonClassName }: Props) => {
  const [open, setOpen] = useState(false);
  const score = useMemo(() => gutScore(gravity, urgency, tendency), [gravity, urgency, tendency]);
  const level = gutLabel(score);
  const meta = GUT_META[level];
  const isPending = level === "pendente";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`h-10 justify-between font-normal bg-background hover:bg-muted/40 hover:text-foreground data-[state=open]:bg-background data-[state=open]:text-foreground ${buttonClassName ?? "w-full"}`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className={`h-2 w-2 rounded-full shrink-0 ${meta.dotClass} ${meta.pulse ? "animate-pulse" : ""}`} />
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${meta.badgeClass}`}>
              {meta.label}
            </span>
            {!isPending && score != null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {score}/125 · G{gravity} U{urgency} T{tendency}
              </span>
            )}
            {isPending && (
              <span className="text-xs text-muted-foreground">Clique para definir G × U × T</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[360px] p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2 mb-2 pb-2 border-b">
          <Sliders className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Definir prioridade (GUT)</span>
        </div>
        <GutPrioritySelector
          gravity={gravity}
          urgency={urgency}
          tendency={tendency}
          onChange={onChange}
          compact
        />
        <div className="flex justify-end gap-2 mt-3 pt-2 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ gravity: null, urgency: null, tendency: null })}
          >
            Limpar
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Concluir
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};