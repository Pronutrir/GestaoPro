import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { ProjectCronogramaPanel } from "@/components/cronograma/ProjectCronogramaPanel";

/**
 * Cronograma Geral — versão TESTE.
 * Rota: /cronograma-geral-test
 * Consolida TODAS as atividades de TODOS os projetos não arquivados.
 */
export default function CronogramaGeralTest() {
  return (
    <AppLayout>
      <main className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="border-amber-500/60 text-amber-600">
                Prova de conceito
              </Badge>
              <h1 className="text-2xl font-semibold">Cronograma Geral — Todos os projetos</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Visão consolidada de todas as atividades ativas. Use a coluna <strong>Projeto</strong>
              para identificar a origem de cada tarefa, ajuste o zoom e personalize as colunas.
            </p>
          </div>
        </div>

        <ProjectCronogramaPanel projectIds={null} defaultMode="gantt" showProjectColumn />
      </main>
    </AppLayout>
  );
}