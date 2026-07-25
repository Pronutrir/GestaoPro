'use client';
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DateChipProps {
  /** Valor no formato YYYY-MM-DD (ou "" quando vazio). */
  value: string;
  onChange: (value: string) => void;
  /** Rótulo mostrado quando vazio (ex.: "Início", "Vencimento"). */
  placeholder: string;
  /** Texto do tooltip (ex.: "Definir data de início"). */
  tooltip?: string;
  invalid?: boolean;
  disabled?: boolean;
}

// Normaliza qualquer valor de data para "YYYY-MM-DD": aceita tanto uma data
// pura (colunas `date`) quanto um timestamp ISO (colunas `timestamptz`, ex.:
// "2026-07-23T00:00:00+00:00") — pega so a parte da data antes do "T".
function ymd(v: string): string {
  if (!v) return "";
  return v.slice(0, 10);
}
// -> Date local (meio-dia, evita drift de fuso)
function toDate(v: string): Date | undefined {
  const s = ymd(v);
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12, 0, 0);
}
// Date -> YYYY-MM-DD
function toStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
// -> dd/mm/aaaa (tolera timestamp)
const br = (v: string) => {
  const s = ymd(v);
  return s ? s.split("-").reverse().join("/") : "";
};

export function DateChip({ value, onChange, placeholder, tooltip, invalid, disabled }: DateChipProps) {
  const hasValue = !!value;
  const chip = (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 rounded-md px-2 text-xs transition-colors border",
        hasValue
          ? "text-foreground border-input bg-background hover:bg-muted/50"
          : "text-muted-foreground border-transparent hover:bg-muted/60 hover:text-foreground",
        invalid && "border-destructive text-destructive",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
      {hasValue ? br(value) : placeholder}
      {hasValue && !disabled && (
        <span
          role="button"
          tabIndex={-1}
          aria-label="Limpar data"
          onClick={(e) => { e.stopPropagation(); onChange(""); }}
          className="ml-0.5 -mr-0.5 rounded hover:bg-muted-foreground/20 p-0.5"
        >
          <X className="w-3 h-3" />
        </span>
      )}
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        {tooltip && !hasValue ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>{chip}</TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          chip
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={4} collisionPadding={12}>
        <Calendar
          mode="single"
          selected={toDate(value)}
          onSelect={(d) => onChange(d ? toStr(d) : "")}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
