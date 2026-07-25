'use client';
import { useMemo, useState } from "react";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchOption {
  value: string;
  label: string;
  /** Texto extra pesquisável (não exibido). */
  keywords?: string;
}

interface SearchSelectProps {
  options: SearchOption[];
  value?: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Realce sutil no item ativo (accent + guia) no lugar do azul sólido base.
const ITEM_CLASS =
  "gap-2 py-1.5 relative aria-selected:!bg-accent aria-selected:!text-foreground " +
  "data-[selected=true]:!bg-accent data-[selected=true]:!text-foreground " +
  "data-[selected=true]:before:content-[''] data-[selected=true]:before:absolute " +
  "data-[selected=true]:before:left-0 data-[selected=true]:before:top-1.5 data-[selected=true]:before:bottom-1.5 " +
  "data-[selected=true]:before:w-[2.5px] data-[selected=true]:before:rounded-full data-[selected=true]:before:bg-primary";

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = norm(text).indexOf(norm(query));
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-amber-500/30 text-inherit rounded-sm px-0.5">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

export function SearchSelect({
  options, value, onSelect, placeholder = "Selecionar...",
  searchPlaceholder = "Buscar...", emptyText = "Nada encontrado.",
  onClear, disabled, className,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((o) => norm([o.label, o.keywords || ""].join(" ")).includes(q));
  }, [options, query]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}
          className={cn("justify-between font-normal w-full", className)}>
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[240px]"
        align="start"
        sideOffset={4}
        collisionPadding={16}
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList
            className="max-h-[min(300px,var(--radix-popover-content-available-height,300px))] overflow-y-auto overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
          >
            <CommandEmpty>{emptyText}</CommandEmpty>
            {selected && onClear && (
              <CommandItem value="__clear__" onSelect={() => { onClear(); setOpen(false); }}
                className={cn(ITEM_CLASS, "text-muted-foreground")}>
                Limpar seleção
              </CommandItem>
            )}
            {filtered.map((o) => (
              <CommandItem
                key={o.value}
                value={o.value}
                onSelect={() => { onSelect(o.value); setOpen(false); setQuery(""); }}
                className={cn(ITEM_CLASS, value === o.value && "font-semibold")}
              >
                <span className="flex-1 truncate"><Highlight text={o.label} query={query.trim()} /></span>
                {value === o.value && <Check className="w-4 h-4 text-primary shrink-0" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
