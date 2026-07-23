'use client';
import { useMemo, useState } from "react";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronsUpDown, Check, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Person {
  id: string;
  full_name: string;
  sector?: string | null;
  role_title?: string | null;
  avatar_url?: string | null;
}

interface PersonComboboxProps {
  people: Person[];
  /** id da pessoa selecionada (modo seleção única). */
  value?: string | null;
  /** Chamado ao escolher uma pessoa. */
  onSelect: (person: Person) => void;
  placeholder?: string;
  /** "add": rótulo/ícone de adicionar (equipe). "single": mostra o escolhido. */
  variant?: "single" | "add";
  /** Permite limpar (só no modo single). */
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
}

const initials = (name: string) =>
  (name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Destaca o trecho que casou com a busca.
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

export function PersonCombobox({
  people, value, onSelect, placeholder = "Buscar pessoa...",
  variant = "single", onClear, disabled, className,
}: PersonComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = variant === "single" ? people.find((p) => p.id === value) : undefined;

  // Filtro combinado: nome + setor + função.
  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return people;
    return people.filter((p) =>
      norm([p.full_name, p.sector || "", p.role_title || ""].join(" ")).includes(q),
    );
  }, [people, query]);

  const trigger =
    variant === "add" ? (
      <Button type="button" variant="outline" disabled={disabled}
        className={cn("h-9 gap-1.5 justify-start font-normal text-muted-foreground w-full", className)}>
        <UserPlus className="w-4 h-4 shrink-0" />
        {placeholder}
      </Button>
    ) : (
      <Button type="button" variant="outline" disabled={disabled}
        className={cn("h-9 justify-between font-normal w-full", className)}>
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <Avatar className="h-5 w-5 shrink-0">
              {selected.avatar_url ? <AvatarImage src={selected.avatar_url} alt={selected.full_name} /> : null}
              <AvatarFallback className="text-[9px]">{initials(selected.full_name)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{selected.full_name}{selected.sector ? ` — ${selected.sector}` : ""}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
      </Button>
    );

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]"
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions={false}
      >
        <Command shouldFilter={false} className="max-h-[min(320px,var(--radix-popover-content-available-height))]">
          <CommandInput
            placeholder="Nome, setor ou função..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList
            className="max-h-[260px] overflow-y-auto overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
          >
            <CommandEmpty>Ninguém encontrado.</CommandEmpty>
            {variant === "single" && selected && (
              <CommandItem
                value="__clear__"
                onSelect={() => { onClear?.(); setOpen(false); }}
                className="text-muted-foreground"
              >
                Remover seleção
              </CommandItem>
            )}
            {filtered.map((p) => (
              <CommandItem
                key={p.id}
                value={p.id}
                onSelect={() => { onSelect(p); setOpen(false); setQuery(""); }}
                className="gap-2"
              >
                <Avatar className="h-6 w-6 shrink-0">
                  {p.avatar_url ? <AvatarImage src={p.avatar_url} alt={p.full_name} /> : null}
                  <AvatarFallback className="text-[9px]">{initials(p.full_name)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm truncate leading-tight">
                    <Highlight text={p.full_name} query={query.trim()} />
                  </span>
                  {(p.role_title || p.sector) && (
                    <span className="text-[11px] text-muted-foreground truncate leading-tight">
                      {p.role_title ? <Highlight text={p.role_title} query={query.trim()} /> : null}
                      {p.role_title && p.sector ? " · " : null}
                      {p.sector ? <Highlight text={p.sector} query={query.trim()} /> : null}
                    </span>
                  )}
                </div>
                {variant === "single" && selected?.id === p.id && (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
