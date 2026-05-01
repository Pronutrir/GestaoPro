import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Rocket } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { RoadmapItem } from "@/legacy/pages/Roadmap";

const themeLabels: Record<string, string> = {
  produto: "Produto",
  mercado: "Mercado",
  operacoes: "Operações",
};

const statusLabels: Record<string, string> = {
  ideacao: "Ideação",
  em_analise: "Em Análise",
  aprovado: "Aprovado",
  descartado: "Descartado",
  em_execucao: "Em Execução",
};

const statusColors: Record<string, string> = {
  ideacao: "bg-muted text-muted-foreground",
  em_analise: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  aprovado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  descartado: "bg-destructive/10 text-destructive",
  em_execucao: "bg-primary/10 text-primary",
};

interface Props {
  items: RoadmapItem[];
  isLoading: boolean;
  onEdit: (item: RoadmapItem) => void;
  onProjetizar: (item: RoadmapItem) => void;
}

export function RoadmapTable({ items, isLoading, onEdit, onProjetizar }: Props) {
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
      <div className="text-center py-12 text-muted-foreground">
        Nenhuma ideia cadastrada. Clique em "Nova Ideia" para começar.
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
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-16 text-center">R</TableHead>
            <TableHead className="w-16 text-center">I</TableHead>
            <TableHead className="w-16 text-center">C</TableHead>
            <TableHead className="w-16 text-center">E</TableHead>
            <TableHead className="w-20 text-center font-bold">Score</TableHead>
            <TableHead className="w-24">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium max-w-[200px] truncate">{item.title}</TableCell>
              <TableCell>
                <Badge variant="outline">{themeLabels[item.theme] || item.theme}</Badge>
              </TableCell>
              <TableCell>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[item.status] || ""}`}>
                  {statusLabels[item.status] || item.status}
                </span>
              </TableCell>
              <TableCell className="text-center">{item.reach}</TableCell>
              <TableCell className="text-center">{item.impact}</TableCell>
              <TableCell className="text-center">{Math.round(item.confidence * 100)}%</TableCell>
              <TableCell className="text-center">{item.effort}</TableCell>
              <TableCell className="text-center font-bold text-primary">
                {item.score?.toFixed(1) ?? "—"}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(item)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {item.status === "aprovado" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onProjetizar(item)}
                      title="Projetizar"
                      className="text-emerald-600 hover:text-emerald-700"
                    >
                      <Rocket className="h-4 w-4" />
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
