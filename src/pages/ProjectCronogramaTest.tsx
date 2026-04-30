import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { ProjectCronogramaPanel } from "@/components/cronograma/ProjectCronogramaPanel";

/**
 * Cronograma do projeto — versão TESTE.
 * Rota: /project/:id/cronograma-test
 * Escopo de UM projeto, sem seletor (vem da URL).
 */
export default function ProjectCronogramaTest() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<{ title: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from("projects").select("title").eq("id", id).maybeSingle()
      .then(({ data }) => setProject(data as any));
  }, [id]);

  if (!id) return null;

  return (
    <AppLayout>
      <main className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 -ml-2">
                <Link to={`/project/${id}`}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Voltar ao projeto
                </Link>
              </Button>
              <Badge variant="outline" className="border-amber-500/60 text-amber-600">
                Prova de conceito
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold">
              Cronograma {project?.title ? `— ${project.title}` : ""}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Tabela detalhada estilo MS Project + Gantt com cálculo real de caminho crítico (CPM).
              Use os controles para alternar visão, zoom e colunas.
            </p>
          </div>
        </div>

        <ProjectCronogramaPanel projectIds={[id]} defaultMode="gantt" />
      </main>
    </AppLayout>
  );
}