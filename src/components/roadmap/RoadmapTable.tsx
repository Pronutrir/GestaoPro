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
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ESTAGIOS, classificar } from "@/components/roadmap/criterios";
import type { RoadmapItem } from "@/components/roadmap/types";
import { dateBR, diasRestantes, moneyValueBR } from "@/components/roadmap/format";
import { TIPOS_NECESSIDADE } from "@/components/roadmap/solicitacaoLabels";

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

/** Mesma resolução de rótulo usada no detalhe, incluindo o caso "outro". */
const rotuloTipoNecessidade = (item: RoadmapItem) =>
  item.tipo_necessidade === "outro"
    ? item.tipo_necessidade_outro
    : item.tipo_necessidade
      ? TIPOS_NECESSIDADE[item.tipo_necessidade] ?? item.tipo_necessidade
      : null;

interface Props {
  items: RoadmapItem[];
  isLoading: boolean;
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
  onEdit,
  onProjetizar,
  onView,
  onMover,
}: Props) {
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
    <div className="rounded-md border mt-4 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Texto com min-w (cresce em telas largas); números com largura
                fixa e pr-6, para os valores não colarem na borda direita da
                célula. whitespace-nowrap impede "Custo atual/mês" e
                "Expectativa de prazo" de quebrarem em duas linhas. */}
            <TableHead className="min-w-[17rem]">Tipo de necessidade</TableHead>
            <TableHead className="min-w-[12rem]">Solicitante</TableHead>
            <TableHead className="min-w-[8rem]">Área</TableHead>
            <TableHead className="w-[9rem] whitespace-nowrap pr-6 text-right">
              Custo atual/mês
            </TableHead>
            <TableHead className="w-[8rem] whitespace-nowrap pr-6 text-right">
              Custo dev.
            </TableHead>
            <TableHead className="w-[10rem] whitespace-nowrap pr-6 text-right">
              Expectativa de prazo
            </TableHead>
            <TableHead className="w-[11rem] pl-2">Prioridade</TableHead>
            <TableHead className="w-[9rem] pr-4 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
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
                {rotuloTipoNecessidade(item) ? (
                  <span className="font-medium leading-snug">
                    {rotuloTipoNecessidade(item)}
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
                  {/* Devolve a demanda ao estágio anterior (corrigir engano). */}
                  {(() => {
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
                  {(() => {
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

                  {/* No backlog a única ação é "Analisar": a classificação por
                      critérios acontece depois, quando a demanda entra em
                      análise. */}
                  {item.status !== "backlog" && (
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
        </TableBody>
      </Table>
    </div>
  );
}
