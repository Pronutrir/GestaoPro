'use client';
/**
 * Seletor de VÍNCULO — Fase e Atividade em campos separados.
 *
 * Antes era um campo só, misturando as duas listas num dropdown. Duas razões
 * para separar, seguindo o que Documentos já faz:
 *
 *  1. São coisas de natureza diferente. São 4 fases por projeto e até 168
 *     atividades — juntar faz a lista curta desaparecer dentro da longa.
 *  2. Fase e Atividade se COMBINAM: "a ata é da fase 1, atividade 1.1.2".
 *     Num campo só, escolher uma apagava a outra.
 *
 * A Fase é <select> simples: com 4 opções, um campo de busca é mais atrito
 * que rolar. A Atividade é combobox com busca — com 168, a lista rolável é
 * pior que não ter o campo — e traz as da fase escolhida no topo.
 */
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown, X, ListTodo, Check } from "lucide-react";
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
  /** A que fase pertence: as da fase escolhida sobem para o topo da lista. */
  phase_id?: string | null;
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

  const ativSel = atividades.find((a) => a.id === atividadeId);

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  /**
   * Atividades para o combobox: filtradas pela busca e agrupadas pela fase.
   *
   * As da fase escolhida sobem; as demais continuam acessíveis, porque um
   * registro pode legitimamente cruzar fases — filtrar de vez seria decidir
   * pelo usuário.
   */
  const grupos = useMemo(() => {
    const q = norm(query.trim());
    const base = q
      ? atividades.filter((a) => norm(`${a.wbs_code || ""} ${a.title}`).includes(q))
      : atividades;

    // Ordem da EAP: numérica, senão "1.10" viria antes de "1.2".
    const ordenar = (arr: VinculoAtividade[]) =>
      arr.slice().sort((x, y) => {
        const wx = (x.wbs_code || "").trim(), wy = (y.wbs_code || "").trim();
        if (wx && wy && wx !== wy) return wx.localeCompare(wy, undefined, { numeric: true });
        if (wx && !wy) return -1;
        if (!wx && wy) return 1;
        return x.title.localeCompare(y.title);
      });

    // Sem busca, corta em 50: a lista existe para escolher, não para rolar.
    // Com busca, mostra até 200 — quem digitou sabe o que procura.
    const teto = q ? 200 : 50;

    if (!faseId) {
      const itens = ordenar(base).slice(0, teto);
      return itens.length ? [{ titulo: "Atividades", itens }] : [];
    }

    const daFase = ordenar(base.filter((a) => a.phase_id === faseId));
    const outras = ordenar(base.filter((a) => a.phase_id !== faseId));
    const nomeFase = fases.find((f) => f.id === faseId)?.title || "Desta fase";

    return [
      daFase.length && { titulo: nomeFase, itens: daFase.slice(0, teto) },
      outras.length && { titulo: "Outras fases", itens: outras.slice(0, teto) },
    ].filter(Boolean) as Array<{ titulo: string; itens: VinculoAtividade[] }>;
  }, [atividades, fases, query, faseId]);

  const totalListado = grupos.reduce((s, g) => s + g.itens.length, 0);

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", className)}>
      {/* FASE — <select> nativo. São 4 por projeto: um campo de busca sobre
          quatro opções é mais atrito que rolar. Mesma decisão de Documentos. */}
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={faseId}
        onChange={(e) => {
          const nova = e.target.value;
          // Trocar de fase NÃO limpa a atividade: ela continua válida, só
          // deixa de estar no grupo do topo. Limpar seria perder a escolha
          // por causa de um ajuste no campo ao lado.
          onChange({ faseId: nova, atividadeId });
        }}
      >
        <option value="">Fase (opcional)</option>
        {fases.map((f) => (
          <option key={f.id} value={f.id}>{f.title}</option>
        ))}
      </select>

      {/* ATIVIDADE — combobox com busca. Somem por completo enquanto a
          migration de activity_id não rodou, em vez de oferecer algo que não
          tem onde ser gravado. */}
      {atividadeDisponivel && (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left"
            >
              {ativSel ? (
                <>
                  <ListTodo className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  {ativSel.wbs_code && (
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">{ativSel.wbs_code}</span>
                  )}
                  <span className="truncate">{ativSel.title}</span>
                  {/* Limpar direto no campo — sem isto, desfazer exigiria abrir
                      a lista e achar a opção "nenhuma". */}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Remover atividade"
                    className="ml-auto shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange({ faseId, atividadeId: "" }); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault(); e.stopPropagation(); onChange({ faseId, atividadeId: "" });
                      }
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground truncate">{placeholder}</span>
                  <ChevronsUpDown className="ml-auto w-4 h-4 opacity-50 shrink-0" />
                </>
              )}
            </button>
          </PopoverTrigger>

          <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[300px]" align="start" collisionPadding={12}>
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar por título ou código EAP…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList className="max-h-[min(300px,var(--radix-popover-content-available-height,300px))]">
                <CommandEmpty>Nenhuma atividade encontrada.</CommandEmpty>

                {/* CORES QUE SOBREVIVEM À SELEÇÃO.
                    O item em foco usa bg-primary sólido, e
                    `text-muted-foreground` fixo virava cinza sobre azul — o
                    ícone e o código EAP sumiam justamente na linha que a pessoa
                    está olhando. `opacity-70` e `border-current` herdam a cor do
                    item e funcionam nos dois estados. */}
                {grupos.map((grupo) => (
                  <CommandGroup key={grupo.titulo} heading={grupo.titulo}>
                    {grupo.itens.map((a) => (
                      <CommandItem
                        key={a.id}
                        value={a.id}
                        onSelect={() => {
                          onChange({ faseId, atividadeId: a.id });
                          setOpen(false);
                          setQuery("");
                        }}
                        className="gap-2 text-[13px] py-2"
                      >
                        <ListTodo className="w-3.5 h-3.5 opacity-70 shrink-0" />
                        {a.wbs_code && (
                          <span className="font-mono text-[11px] shrink-0 rounded px-1.5 py-0.5 border border-current/25 bg-current/10 tabular-nums">
                            {a.wbs_code}
                          </span>
                        )}
                        <span className="truncate flex-1">{a.title}</span>
                        {a.id === atividadeId && <Check className="w-4 h-4 shrink-0" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}

                {!query && atividades.length > totalListado && (
                  <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                    {atividades.length - totalListado} outras — use a busca
                  </div>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
