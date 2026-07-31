'use client';
// CENTRAL DE DOCUMENTOS — a fusão das antigas abas "Documentos" e "Páginas".
//
// Eram duas metades do mesmo produto: "Páginas" escrevia bem e não distribuía
// nada (o texto não saía dali); "Documentos" distribuía bem — ciência,
// aprovação, assinatura com trilha — e não aceitava nem arquivo, só URL colada.
//
// A união segue o que Notion e Confluence fazem: o que foi escrito e o que foi
// carregado são o MESMO objeto — um documento do projeto, com fase, atividade,
// versão e ciclo de assinatura. O que muda é a origem do conteúdo, e isso é
// sub-navegação, não uma aba do projeto inteiro.
//
// Nenhuma tela nova foi inventada: as duas que já existiam continuam sendo
// renderizadas, agora sob um cabeçalho comum.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, NotebookPen } from "lucide-react";
import { DocumentManager } from "@/components/DocumentManager";
import { ProjectDocuments } from "@/components/documents/ProjectDocuments";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  phases: { id: string; title: string }[];
  activities: { id: string; title: string }[];
  canManageProject?: boolean;
  onActivityCreated?: () => void;
}

type View = "arquivos" | "paginas";

export function DocumentCenter({
  projectId, phases, activities, canManageProject = false, onActivityCreated,
}: Props) {
  // Abre em "arquivos": é onde estão os documentos que circulam para
  // assinatura — o que costuma exigir ação de alguém.
  const [view, setView] = useState<View>("arquivos");

  return (
    <div className="space-y-3">
      {/* Sub-navegação enxuta, no padrão de segmento usado no resto do sistema:
          só o nome, sem descrição repetida em cada item. */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg border bg-muted/40">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setView("arquivos")}
          className={cn("h-7 gap-1.5 text-[13px] px-3",
            view === "arquivos" && "bg-background shadow-sm font-semibold")}
        >
          <FileText className="w-3.5 h-3.5" /> Arquivos
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setView("paginas")}
          className={cn("h-7 gap-1.5 text-[13px] px-3",
            view === "paginas" && "bg-background shadow-sm font-semibold")}
        >
          <NotebookPen className="w-3.5 h-3.5" /> Escritos aqui
        </Button>
      </div>

      {view === "arquivos" ? (
        <DocumentManager
          projectId={projectId}
          phases={phases}
          activities={activities}
          canManageProject={canManageProject}
        />
      ) : (
        <Card className="overflow-hidden">
          <ProjectDocuments projectId={projectId} onActivityCreated={onActivityCreated} />
        </Card>
      )}
    </div>
  );
}
