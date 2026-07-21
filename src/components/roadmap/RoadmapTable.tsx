"use client";

import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Rocket,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ESTAGIOS, classificar } from "@/components/roadmap/criterios";
import type { RoadmapItem } from "@/components/roadmap/types";
import { dateBR, diasRestantes, moneyValueBR } from "@/components/roadmap/format";
import {
  BotaoOrdenar,
  FiltroFaixa,
  FiltroPeriodo,
  FiltroSelecao,
} from "@/components/roadmap/ColumnFilter";
import {
  FAIXA_PRIORIDADE,
  FILTROS_VAZIOS,
  aplicarFiltros,
  aplicarOrdenacao,
  contarAtivos,
  opcoesDe,
  rotuloPrioridade,
  rotuloTipo,
  type ColunaOrdenavel,
  type FiltrosRoadmap,
  type Ordenacao,
} from "@/components/roadmap/filtros";

/** Placeholder de célula sem dado — itens que não vieram do formulário. */
const vazio = <span className="text-muted-foreground">—</span>;

/**
 * Valor monetário com "R$" fixo à esquerda e dígitos alinhados à direita.
 * Renderizar "R$ 12.000" como um texto só e alinhar tudo à direita faz o
 * símbolo dançar de linha em linha; aqui ele fica ancorado e só o número
 * se move, então as unidades ficam em coluna.
 */
function Moeda({ valor }: { valor?: number | null }) {
  const n = moneyValueBR(valor);
  // O traço fica na mesma coluna dos dígitos, não centralizado na célula.
  if (n === null)
    return (
      <span className="inline-grid grid-cols-[1.25rem_4.5rem] gap-1.5">
        <span />
        <span className="text-right text-muted-foreground">—</span>
      </span>
    );
  // Colunas de largura constante (1.25rem para o "R$", 4.5rem para os dígitos)
  // — larguras iguais em todas as linhas fazem as unidades caírem na mesma
  // vertical. 4.5rem comporta "999.999".
  return (
    <span className="inline-grid grid-cols-[1.25rem_4.5rem] items-baseline gap-1.5 tabular-nums">
      <span className="text-xs text-muted-foreground">R$</span>
      <span className="text-right">{n}</span>
    </span>
  );
}


interface Props {
  items: RoadmapItem[];
  isLoading: boolean;
  /** admin/gestor: só eles movem estágio, projetizam e priorizam. */
  canManage: boolean;
  onEdit: (item: RoadmapItem) => void;
  onProjetizar: (item: RoadmapItem) => void;
  /** Abre a visualização completa do item (clique na linha). */
  onView: (item: RoadmapItem) => void;
  /** Move o item para outro estágio do fluxo. */
  onMover: (item: RoadmapItem, status: string) => void;
}

export function RoadmapTable({
  items,
  isLoading,
  canManage,
  onEdit,
  onProjetizar,
  onView,
  onMover,
}: Props) {
  const [filtros, setFiltros] = useState<FiltrosRoadmap>(FILTROS_VAZIOS);

  // Opções saem dos itens do próprio estágio: filtrar por um solicitante que
  // não tem nenhuma demanda nesta aba só produziria lista vazia.
  const opcoes = useMemo(
    () => ({
      tipo: opcoesDe(items, rotuloTipo),
      solicitante: opcoesDe(items, (i) => i.solicitante_nome),
      area: opcoesDe(items, (i) => i.area),
      prioridade: opcoesDe(items, rotuloPrioridade),
    }),
    [items],
  );

  // Sem ordenação escolhida, mantém a ordem da consulta (prioridade primeiro,
  // não avaliados no fim) — o padrão que a lista sempre teve.
  const [ordem, setOrdem] = useState<Ordenacao>(null);

  const visiveis = useMemo(
    () => aplicarOrdenacao(aplicarFiltros(items, filtros), ordem),
    [items, filtros, ordem],
  );
  const ativos = contarAtivos(filtros);

  /** Ciclo ao clicar no título: crescente → decrescente → padrão. */
  const alternarOrdem = (coluna: ColunaOrdenavel) =>
    setOrdem((o) =>
      o?.coluna !== coluna
        ? { coluna, asc: true }
        : o.asc
          ? { coluna, asc: false }
          : null,
    );

  /** Título de coluna com ordenação — os props repetiriam em 7 colunas. */
  const titulo = (coluna: ColunaOrdenavel, label: string) => (
    <BotaoOrdenar
      label={label}
      ativa={ordem?.coluna === coluna}
      asc={ordem?.asc ?? true}
      onClick={() => alternarOrdem(coluna)}
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-md border mt-4 py-12 text-center text-sm text-muted-foreground">
        Nenhuma demanda neste estágio.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {/* Resumo dos filtros: sem isso, uma lista curta por causa de um filtro
          esquecido parece uma lista vazia de verdade. */}
      {ativos > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {visiveis.length} de {items.length}{" "}
            {items.length === 1 ? "demanda" : "demandas"} ·{" "}
            {ativos} {ativos === 1 ? "filtro ativo" : "filtros ativos"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFiltros(FILTROS_VAZIOS)}
            className="h-6 px-2 text-xs"
          >
            <X className="mr-1 h-3 w-3" />
            Limpar filtros
          </Button>
        </div>
      )}
      <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Texto com min-w (cresce em telas largas); números com largura
                fixa e pr-6, para os valores não colarem na borda direita da
                célula. whitespace-nowrap impede "Custo atual/mês" e
                "Expectativa de prazo" de quebrarem em duas linhas. */}
            <TableHead className="min-w-[17rem]">
              <span className="inline-flex items-center">
                {titulo("tipo", "Tipo de necessidade")}
                <FiltroSelecao
                  label="Tipo de necessidade"
                  opcoes={opcoes.tipo}
                  selecionados={filtros.tipo}
                  onChange={(v) => setFiltros({ ...filtros, tipo: v })}
                />
              </span>
            </TableHead>
            <TableHead className="min-w-[12rem]">
              <span className="inline-flex items-center">
                {titulo("solicitante", "Solicitante")}
                <FiltroSelecao
                  label="Solicitante"
                  opcoes={opcoes.solicitante}
                  selecionados={filtros.solicitante}
                  onChange={(v) => setFiltros({ ...filtros, solicitante: v })}
                />
              </span>
            </TableHead>
            <TableHead className="min-w-[8rem]">
              <span className="inline-flex items-center">
                {titulo("area", "Área")}
                <FiltroSelecao
                  label="Área"
                  opcoes={opcoes.area}
                  selecionados={filtros.area}
                  onChange={(v) => setFiltros({ ...filtros, area: v })}
                />
              </span>
            </TableHead>
            <TableHead className="w-[9rem] whitespace-nowrap pr-6 text-right">
              <span className="inline-flex w-full items-center justify-end">
                {titulo("custoAtual", "Custo atual/mês")}
                <FiltroFaixa
                  label="Custo atual/mês"
                  prefixo="R$"
                  valor={filtros.custoAtual}
                  onChange={(v) => setFiltros({ ...filtros, custoAtual: v })}
                />
              </span>
            </TableHead>
            <TableHead className="w-[8rem] whitespace-nowrap pr-6 text-right">
              <span className="inline-flex w-full items-center justify-end">
                {titulo("custoDev", "Custo dev.")}
                <FiltroFaixa
                  label="Custo do desenvolvimento"
                  prefixo="R$"
                  valor={filtros.custoDev}
                  onChange={(v) => setFiltros({ ...filtros, custoDev: v })}
                />
              </span>
            </TableHead>
            <TableHead className="w-[10rem] whitespace-nowrap pr-6 text-right">
              <span className="inline-flex w-full items-center justify-end">
                {titulo("prazo", "Expectativa de prazo")}
                <FiltroPeriodo
                  label="Expectativa de prazo"
                  valor={filtros.prazo}
                  onChange={(v) => setFiltros({ ...filtros, prazo: v })}
                />
              </span>
            </TableHead>
            <TableHead className="w-[11rem] whitespace-nowrap pl-2">
              <span className="inline-flex items-center">
                {titulo("prioridade", "Prioridade (%)")}
                <FiltroSelecao
                  label="Prioridade"
                  opcoes={opcoes.prioridade}
                  selecionados={filtros.prioridade}
                  onChange={(v) => setFiltros({ ...filtros, prioridade: v })}
                  descricoes={FAIXA_PRIORIDADE}
                />
              </span>
            </TableHead>
            <TableHead className="w-[9rem] pr-4 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visiveis.map((item) => (
            <TableRow
              key={item.id}
              onClick={() => onView(item)}
              // Zebra: com 8 colunas, ajuda a seguir a linha até as ações.
              className="cursor-pointer even:bg-muted/30"
            >
              {/* O título saiu das colunas, mas continua acessível no hover da
                  linha e no detalhe aberto pelo clique. */}
              <TableCell className="py-4 align-middle" title={item.title}>
                {/* Texto simples em vez de badge: as pílulas tinham larguras
                    muito diferentes (de "Outro" a 40 caracteres), o que criava
                    um serrilhado visual ao percorrer a coluna. */}
                {rotuloTipo(item) ? (
                  <span className="font-medium leading-snug">
                    {rotuloTipo(item)}
                  </span>
                ) : (
                  vazio
                )}
              </TableCell>
              <TableCell className="py-4 align-middle">
                {item.solicitante_nome ? (
                  <span className="flex items-center gap-1.5">
                    {item.origem === "formulario" && (
                      <Inbox className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <span>{item.solicitante_nome}</span>
                  </span>
                ) : (
                  vazio
                )}
              </TableCell>
              <TableCell className="py-4 align-middle">
                {/* Badge aqui (e não no tipo): valores curtos e repetidos entre
                    linhas, onde a pílula ajuda a agrupar visualmente. */}
                {item.area ? (
                  <Badge variant="secondary" className="font-normal">
                    {item.area}
                  </Badge>
                ) : (
                  vazio
                )}
              </TableCell>
              {/* Custo atual/mês vem do formulário; custo dev. só é preenchido
                  na classificação — daí os dois aparecerem separados. */}
              <TableCell className="py-4 pr-6 text-right align-middle">
                <Moeda valor={item.custo_atual} />
              </TableCell>
              <TableCell className="py-4 pr-6 text-right align-middle">
                <Moeda valor={item.custo_desenvolvimento} />
              </TableCell>
              <TableCell className="py-4 pr-6 text-right align-middle">
                {(() => {
                  const data = dateBR(item.data_necessaria);
                  if (!data) return vazio;
                  // Mesmo destaque do detalhe: vencido em vermelho, ≤30 dias em âmbar.
                  const dias = diasRestantes(item.data_necessaria);
                  return (
                    <span
                      className={cn(
                        "tabular-nums",
                        dias !== null && dias < 0 && "font-medium text-destructive",
                        dias !== null && dias >= 0 && dias <= 30 && "font-medium text-amber-600",
                      )}
                    >
                      {data}
                    </span>
                  );
                })()}
              </TableCell>
              <TableCell className="py-4 pl-2 align-middle">
                {(() => {
                  // Sem classificação não há prioridade: mostrar 0%/"Baixa"
                  // sugeriria uma avaliação que ninguém fez.
                  if (item.score == null || !item.classificado_em) {
                    return (
                      <span className="text-xs text-muted-foreground">
                        — a priorizar
                      </span>
                    );
                  }
                  const pct = Math.round(item.score);
                  const classe = classificar(pct);
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            classe.className,
                          )}
                        >
                          {classe.label}
                        </span>
                        <span className="text-sm font-bold tabular-nums">
                          {pct}%
                        </span>
                      </div>
                      {/* Barra permite comparar prioridades ao percorrer a lista. */}
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: classe.color }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </TableCell>
              {/* stopPropagation: as ações não devem abrir a visualização da linha. */}
              <TableCell className="py-4 pr-4 align-middle" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  {/* Todas as ações da listagem (mover estágio, projetizar,
                      priorizar) são de gestor. Usuário comum acompanha pela
                      linha e edita a própria solicitação pelo detalhe. */}
                  {!canManage && (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                  {canManage && (() => {
                    const estagio = ESTAGIOS.find((e) => e.value === item.status);
                    if (!estagio?.prev) return null;
                    return (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onMover(item, estagio.prev!)}
                        title={estagio.prevLabel ?? undefined}
                        className="h-8 w-8 text-muted-foreground"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    );
                  })()}

                  {/* Ação principal do estágio: avança a demanda no fluxo. */}
                  {canManage && (() => {
                    const estagio = ESTAGIOS.find((e) => e.value === item.status);
                    if (estagio?.next) {
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onMover(item, estagio.next!)}
                          className="h-8"
                        >
                          {estagio.nextLabel}
                          <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      );
                    }
                    if (item.status === "aprovado") {
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onProjetizar(item)}
                          className="h-8 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                        >
                          <Rocket className="mr-1 h-3.5 w-3.5" />
                          Projetizar
                        </Button>
                      );
                    }
                    if (item.status === "descartado") {
                      return (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onMover(item, "backlog")}
                          className="h-8 text-muted-foreground"
                          title="Devolver ao Backlog"
                        >
                          <Undo2 className="mr-1 h-3.5 w-3.5" />
                          Restaurar
                        </Button>
                      );
                    }
                    return null;
                  })()}

                  {/* No backlog a única ação é "Analisar": a priorização por
                      critérios acontece depois, quando a demanda entra em
                      análise. */}
                  {canManage && item.status !== "backlog" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(item)}
                      title="Priorizar"
                      className="h-8 w-8"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {visiveis.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={8} className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhuma demanda corresponde aos filtros.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFiltros(FILTROS_VAZIOS)}
                  className="mt-3"
                >
                  Limpar filtros
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
