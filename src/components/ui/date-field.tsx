'use client';
// Campo de data em português — substitui o <input type="date"> nativo, que
// herda o idioma do NAVEGADOR (não o lang do documento nem do elemento) e
// exibia "mm/dd/yyyy" para todo mundo com o Chrome em inglês. Além do rótulo
// errado, isso invertia dia e mês em silêncio: 05/01 virava 1º de maio.
//
// Aqui a máscara é sempre dd/mm/aaaa, digitável, com calendário em pt-BR.
// O valor trafega no mesmo formato do banco (YYYY-MM-DD), então trocar o
// <Input type="date"> por este componente não muda nada no que é gravado.
import { useEffect, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** "2026-05-01" ou "2026-05-01T00:00:00Z" -> "2026-05-01" */
const ymd = (v: string) => (v ? v.slice(0, 10) : "");
/** "2026-05-01" -> "01/05/2026" */
const toBr = (v: string) => {
  const s = ymd(v);
  return s ? s.split("-").reverse().join("/") : "";
};
/** "01/05/2026" -> "2026-05-01" (só quando a data existe de fato) */
const fromBr = (s: string): string | null => {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), 12);
  // Rejeita 31/02 e afins: o Date normaliza, então o mês muda.
  if (dt.getDate() !== Number(d) || dt.getMonth() !== Number(mo) - 1) return null;
  return `${y}-${mo}-${d}`;
};
const toDate = (v: string): Date | undefined => {
  const s = ymd(v);
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d, 12) : undefined;
};
const toStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface DateFieldProps {
  /** Valor em YYYY-MM-DD (igual ao <input type="date">). */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
}

export function DateField({
  value, onChange, id, className, placeholder = "dd/mm/aaaa", disabled, min, max,
}: DateFieldProps) {
  const [text, setText] = useState(() => toBr(value));
  const [open, setOpen] = useState(false);

  // Reflete mudanças vindas de fora (reset do formulário, carga do registro),
  // sem atropelar o que está sendo digitado.
  useEffect(() => { setText(toBr(value)); }, [value]);

  // Digitação com barras automáticas: 01052026 -> 01/05/2026.
  const handleType = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
    const masked = parts.join("/");
    setText(masked);
    if (masked === "") { onChange(""); return; }
    const iso = fromBr(masked);
    if (iso) onChange(iso);
  };

  // Ao sair do campo, texto incompleto/invalido volta ao ultimo valor valido.
  const handleBlur = () => setText(toBr(value));

  const minDate = toDate(min ?? "");
  const maxDate = toDate(max ?? "");

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(e) => handleType(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm",
          "ring-offset-background placeholder:text-muted-foreground tabular-nums",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Abrir calendário"
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded",
              "text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <CalendarIcon className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end" sideOffset={4} collisionPadding={12}>
          <Calendar
            mode="single"
            locale={ptBR}
            selected={toDate(value)}
            defaultMonth={toDate(value)}
            disabled={minDate || maxDate ? { before: minDate, after: maxDate } : undefined}
            onSelect={(d) => {
              if (d) onChange(toStr(d));
              setOpen(false);
            }}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
