'use client';
/**
 * Seletor de VÍNCULO — fase ou atividade, num campo só.
 *
 * Antes cada tela montava o seu: Reuniões, Lições e Orçamento ofereciam
 * apenas as 5 fases do projeto, deixando 827 atividades inalcançáveis;
 * Documentos tinha dois selects lado a lado, sem busca.
 *
 * Um campo, não dois: quem preenche quer dizer "isto é sobre X". Se X é fase
 * ou atividade é característica do X — não uma escolha que a pessoa precise
 * fazer ANTES de procurar.
 *
 * A busca não é enfeite: com 827 atividades, uma lista rolável é pior que não
 * ter o campo.
 */
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown, X, Layers, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VinculoFase {
  id: string;
  title: string;
}

export interface VinculoAtividade {
  id: string;
  title: string;
  wbs_code?: string | null;
  parent_id?: string | null;
}

interface Props {
  fases: VinculoFase[];
  atividades: VinculoAtividade[];
  faseId: string;
  atividadeId: string;
  onChange: (v: { faseId: string; atividadeId: string }) => void;
  /** false enquanto a migration de activity_id não rodou: só fases. */
  atividadeDisponivel?: boolean;
  placeholder?: string;
  className?: string;
}

export function VinculoSelect({
  fases, atividades, faseId, atividadeId, onChange,
  atividadeDisponivel = true, placeholder = "Vincular a… (opcional)", className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const faseSel = fases.find((f) => f.id === faseId);
  const ativSel = atividades.find((a) => a.id === atividadeId);
  const selecionado = ativSel ?? faseSel;

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const filtradas = useMemo(() => {
    const q = norm(query.trim());
    const base = q
      ? atividades.filter((a) => norm(a.title).includes(q) || (a.wbs_code || "").includes(q))
      : atividades;
    // Sem busca, corta em 50: a lista existe para escolher, não para rolar.
    // Com busca, mostra até 200 — quem digitou sabe o que procura.
    return base.slice(0, q ? 200 : 50);
  }, [atividades, query]);

  const fasesFiltradas = useMemo(() => {
    const q = norm(query.trim());
    return q ? fases.filter((f) => norm(f.title).includes(q)) : fases;
  }, [fases, query]);

  const escolher = (tipo: "fase" | "atividade" | null, id: string) => {
    if (tipo === "fase") onChange({ faseId: id, atividadeId: "" });
    else if (tipo === "atividade") onChange({ faseId: "", atividadeId: id });
    else onChange({ faseId: "", atividadeId: "" });
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left",
            className,
          )}
        >
          {selecionado ? (
            <>
              {ativSel
                ? <ListTodo className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                : <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              {ativSel?.wbs_code && (
                <span className="font-mono text-[11px] text-muted-foreground shrink-0">{ativSel.wbs_code}</span>
              )}
              <span className="truncate">{selecionado.title}</span>
              {/* Limpar direto no campo — sem isto, desfazer o vínculo exigiria
                  abrir a lista e achar a opção "nenhum". */}
              <span
                role="button"
                tabIndex={0}
                aria-label="Remover vínculo"
                className="ml-auto shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); escolher(null, ""); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault(); e.stopPropagation(); escolher(null, "");
                  }
                }}
              >
                <X className="w-3.5 h-3.5" />
              </span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">{placeholder}</span>
              <ChevronsUpDown className="ml-auto w-4 h-4 opacity-50 shrink-0" />
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start" collisionPadding={12}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar fase ou atividade…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[min(340px,var(--radix-popover-content-available-height,340px))]">
            <CommandEmpty>Nada encontrado.</CommandEmpty>

            {fasesFiltradas.length > 0 && (
              <CommandGroup heading="Fases do projeto">
                {fasesFiltradas.map((f) => (
                  <CommandItem key={f.id} value={f.id} onSelect={() => escolher("fase", f.id)} className="gap-2">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{f.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Enquanto a migration não roda, a seção some por completo em vez
                de oferecer algo que não tem onde ser gravado. */}
            {atividadeDisponivel && filtradas.length > 0 && (
              <CommandGroup heading="Atividades">
                {filtradas.map((a) => (
                  <CommandItem key={a.id} value={a.id} onSelect={() => escolher("atividade", a.id)} className="gap-2">
                    <ListTodo className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {a.wbs_code && (
                      <span className="font-mono text-[11px] text-muted-foreground shrink-0">{a.wbs_code}</span>
                    )}
                    <span className="truncate">{a.title}</span>
                  </CommandItem>
                ))}
                {!query && atividades.length > filtradas.length && (
                  <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                    {atividades.length - filtradas.length} outras — use a busca
                  </div>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
