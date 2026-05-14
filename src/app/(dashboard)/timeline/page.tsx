import { ProjectCronogramaPanel } from "@/components/cronograma/ProjectCronogramaPanel";

/**
 * Cronograma Geral — usa o mesmo painel do cronograma de projeto
 * para manter paridade funcional com a GestãoPro.
 */
export default function TimelinePage() {
  return (
    <div className="px-4 py-4">
      <ProjectCronogramaPanel
        projectIds={null}
        defaultMode="gantt"
        showProjectColumn={true}
      />
    </div>
  );
}
