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
import {
  ESTAGIOS,
  classificar,
  themeLabels,
} from "@/components/roadmap/criterios";
import type { RoadmapItem } from "@/components/roadmap/types";

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
          <Skeleton key={i} className="h-12 w-full" />
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
            <TableHead>Título</TableHead>
            <TableHead className="w-24">Tema</TableHead>
            <TableHead className="w-40">Prioridade</TableHead>
            <TableHead className="w-40 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.id}
              onClick={() => onView(item)}
              className="cursor-pointer"
            >
              <TableCell className="max-w-[520px] py-3 align-top">
                {/* Objetivo pode ter até 150 caracteres: exibe em até 3 linhas. */}
                <p className="line-clamp-3 font-medium leading-snug" title={item.title}>
                  {item.title}
                </p>
                {item.origem === "formulario" && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Inbox className="h-3 w-3 shrink-0" />
                    {[item.area, item.solicitante_nome]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </TableCell>
              <TableCell className="py-3 align-top">
                <Badge variant="outline">{themeLabels[item.theme] || item.theme}</Badge>
              </TableCell>
              <TableCell className="py-3 align-top">
                {(() => {
                  // Sem classificação não há prioridade: mostrar 0%/"Baixa"
                  // sugeriria uma avaliação que ninguém fez.
                  if (item.score == null || !item.classificado_em) {
                    return (
                      <span className="text-xs text-muted-foreground">
                        — a classificar
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
              <TableCell className="py-3 align-top" onClick={(e) => e.stopPropagation()}>
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

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(item)}
                    title="Classificar"
                    className="h-8 w-8"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
