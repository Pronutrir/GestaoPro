"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  ListFilter,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Filtros de cabeçalho de tabela. Três variantes, porque as colunas do roadmap
 * têm naturezas diferentes: categorias (multi-seleção), dinheiro (faixa) e
 * data (intervalo). Um único tipo de filtro serviria mal a todas.
 */

/**
 * Título de coluna clicável para ordenar. O ciclo é asc → desc → sem
 * ordenação, para dar como voltar ao padrão da lista (prioridade primeiro)
 * sem recarregar a página.
 */
export function BotaoOrdenar({
  label,
  ativa,
  asc,
  onClick,
}: {
  label: string;
  ativa: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  const Icone = !ativa ? ChevronsUpDown : asc ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        !ativa
          ? `Ordenar por ${label}`
          : asc
            ? "Ordem crescente — clique para inverter"
            : "Ordem decrescente — clique para remover"
      }
      className={cn(
        "group inline-flex items-center gap-1 rounded transition-colors hover:text-foreground",
        ativa && "text-foreground",
      )}
    >
      {label}
      <Icone
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          ativa
            ? "text-primary"
            : "text-muted-foreground/40 group-hover:text-muted-foreground",
        )}
      />
    </button>
  );
}

/** Ícone de funil no cabeçalho — preenchido quando o filtro está ativo. */
function Gatilho({ ativo, label }: { ativo: boolean; label: string }) {
  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={`Filtrar por ${label}`}
        className={cn(
          "ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors",
          ativo
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground/50 hover:bg-muted hover:text-foreground",
        )}
      >
        <ListFilter className="h-3.5 w-3.5" />
      </button>
    </PopoverTrigger>
  );
}

/** Multi-seleção com busca — para tipo de necessidade, solicitante, área. */
export function FiltroSelecao({
  label,
  opcoes,
  selecionados,
  onChange,
  descricoes,
}: {
  label: string;
  opcoes: string[];
  selecionados: string[];
  onChange: (v: string[]) => void;
  /** Texto auxiliar por opção — ex.: a faixa percentual de cada prioridade. */
  descricoes?: Record<string, string>;
}) {
  const [busca, setBusca] = useState("");
  const visiveis = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return q ? opcoes.filter((o) => o.toLocaleLowerCase("pt-BR").includes(q)) : opcoes;
  }, [opcoes, busca]);

  const alternar = (v: string) =>
    onChange(
      selecionados.includes(v)
        ? selecionados.filter((s) => s !== v)
        : [...selecionados, v],
    );

  return (
    <Popover>
      <Gatilho ativo={selecionados.length > 0} label={label} />
      <PopoverContent align="start" className="w-64 p-0">
        <div className="border-b p-2">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar ${label.toLocaleLowerCase("pt-BR")}…`}
            className="h-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {visiveis.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Nada encontrado.
            </p>
          ) : (
            visiveis.map((o) => {
              const marcado = selecionados.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => alternar(o)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      marcado
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {marcado && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{o}</span>
                  {descricoes?.[o] && (
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                      {descricoes[o]}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        {selecionados.length > 0 && (
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange([])}
              className="h-7 w-full justify-start text-xs text-muted-foreground"
            >
              <X className="mr-1 h-3 w-3" />
              Limpar ({selecionados.length})
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export type Faixa = { min: string; max: string };

/** Faixa numérica — para os custos. */
export function FiltroFaixa({
  label,
  valor,
  onChange,
  prefixo,
}: {
  label: string;
  valor: Faixa;
  onChange: (v: Faixa) => void;
  prefixo?: string;
}) {
  const ativo = !!valor.min || !!valor.max;
  return (
    <Popover>
      <Gatilho ativo={ativo} label={label} />
      <PopoverContent align="end" className="w-60 space-y-2 p-3">
        <p className="text-xs font-medium">{label}</p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            {prefixo && (
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {prefixo}
              </span>
            )}
            <Input
              type="number"
              inputMode="numeric"
              value={valor.min}
              onChange={(e) => onChange({ ...valor, min: e.target.value })}
              placeholder="mín"
              className={cn("h-8", prefixo && "pl-8")}
            />
          </div>
          <span className="text-xs text-muted-foreground">até</span>
          <div className="relative flex-1">
            {prefixo && (
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {prefixo}
              </span>
            )}
            <Input
              type="number"
              inputMode="numeric"
              value={valor.max}
              onChange={(e) => onChange({ ...valor, max: e.target.value })}
              placeholder="máx"
              className={cn("h-8", prefixo && "pl-8")}
            />
          </div>
        </div>
        {ativo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ min: "", max: "" })}
            className="h-7 w-full justify-start text-xs text-muted-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Limpar
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export type Periodo = { de: string; ate: string };

/** Intervalo de datas — para a expectativa de prazo. */
export function FiltroPeriodo({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: Periodo;
  onChange: (v: Periodo) => void;
}) {
  const ativo = !!valor.de || !!valor.ate;
  return (
    <Popover>
      <Gatilho ativo={ativo} label={label} />
      <PopoverContent align="end" className="w-60 space-y-2 p-3">
        <p className="text-xs font-medium">{label}</p>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">De</span>
          <Input
            type="date"
            value={valor.de}
            onChange={(e) => onChange({ ...valor, de: e.target.value })}
            className="h-8"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Até</span>
          <Input
            type="date"
            value={valor.ate}
            onChange={(e) => onChange({ ...valor, ate: e.target.value })}
            className="h-8"
          />
        </label>
        {ativo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ de: "", ate: "" })}
            className="h-7 w-full justify-start text-xs text-muted-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Limpar
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
