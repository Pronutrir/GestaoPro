import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ProjectCronogramaPanel } from "@/components/cronograma/ProjectCronogramaPanel";

/**
 * Prova de conceito original — escopo de UM projeto (selecionável).
 * Deve manter o comportamento que já validamos em /cronograma-test.
 */
export default function CronogramaTest() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    supabase.from("projects").select("id, title")
      .eq("is_trashed", false).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => {
        const list = data || [];
        setProjects(list);
        if (!projectId && list.length) {
          const onboard = list.find((p: any) => p.title?.toLowerCase().includes("onboard"));
          setProjectId(onboard?.id || list[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppLayout>
      <main className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="border-amber-500/60 text-amber-600">
                Prova de conceito
              </Badge>
              <h1 className="text-2xl font-semibold">Cronograma — Tabela detalhada + Gantt</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Visualização no estilo MS Project. Alterne entre <strong>Tabela detalhada</strong> e
              <strong> Gantt</strong>, ajuste o zoom (Dia/Semana/Mês/Trimestre/Ano), use o botão
              <strong> Hoje</strong> para centralizar e personalize as colunas da tabela.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Projeto:</span>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Projeto" /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {projectId && <ProjectCronogramaPanel projectIds={[projectId]} defaultMode="table" />}

        <div className="text-xs text-muted-foreground border-t pt-3">
          Após aprovação, este painel será adicionado dentro do Cronograma do projeto real e na
          rota <strong>/cronograma-geral-test</strong> (visão geral consolidada).
        </div>
      </main>
    </AppLayout>
  );
}
