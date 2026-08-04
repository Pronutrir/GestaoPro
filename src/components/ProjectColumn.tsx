'use client';
import { Badge } from "@/components/ui/badge";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { ChevronsLeft } from "lucide-react";
import { SortableProjectCard } from "./SortableProjectCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useEffect } from "react";

interface Project {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  assignees: string[];
}

interface ProjectColumnProps {
  title: string;
  status: string;
  projects: Project[];
  assigneeAvatarMap?: Record<string, string>;
  onEdit: (project: Project) => void;
  onDelete: (projectId: string) => void;
  onStatusChange: (projectId: string, newStatus: string) => void;
  onCardClick?: (project: Project) => void;
  isAdmin?: boolean;
}

export const ProjectColumn = ({
  title,
  status,
  projects,
  assigneeAvatarMap = {},
  onEdit,
  onDelete,
  onStatusChange,
  onCardClick,
  isAdmin = false,
}: ProjectColumnProps) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  /** Coluna vazia aberta por clique — volta a colapsar ao recarregar. */
  const [expandidaManual, setExpandidaManual] = useState(false);

  // Recebeu projeto? A abertura manual deixa de fazer sentido — a coluna abre
  // por ter conteúdo. Sem isto, esvaziá-la de novo a deixaria presa aberta,
  // com o estado antigo mandando.
  useEffect(() => {
    if (projects.length > 0 && expandidaManual) setExpandidaManual(false);
  }, [projects.length, expandidaManual]);
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status}` });

  const handleDeleteClick = (projectId: string) => {
    setProjectToDelete(projectId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (projectToDelete) {
      onDelete(projectToDelete);
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    }
  };

  const projectIds = projects.map((p) => p.id);

  /**
   * Coluna vazia COLAPSA numa faixa fina com o nome na vertical.
   *
   * Medido em 04/08/2026: 3 dos 7 estágios (MVP, Bloqueio, Gaveta) estão
   * zerados — 43% da largura da tela exibindo "Arraste aqui". A faixa mantém
   * o funil legível de ponta a ponta (quem precisa saber que MVP existe
   * continua vendo) sem consumir o espaço de uma coluna cheia.
   *
   * Expande sozinha ao arrastar algo por cima (isOver) — senão não haveria
   * onde soltar, que é justamente o propósito de uma coluna vazia.
   */
  const colapsada = projects.length === 0 && !isOver && !expandidaManual;

  if (colapsada) {
    return (
      <div className="hidden lg:flex">
        <button
          type="button"
          onClick={() => setExpandidaManual(true)}
          title={`${title} — sem projetos. Clique para abrir.`}
          ref={setNodeRef}
          className="w-8 min-h-[160px] rounded-lg border border-dashed border-border/50 bg-card/40 hover:bg-muted/50 hover:border-border transition-colors flex items-center justify-center py-3"
        >
          <span
            className="text-[10px] text-muted-foreground/70 tracking-wide whitespace-nowrap"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {title} · 0
          </span>
        </button>
      </div>
    );
  }

  return (
    // lg:flex-1 + min-w-0: no desktop o container é flex, então cada coluna
    // com conteúdo divide o espaço que sobra das faixas colapsadas.
    <div className="flex flex-col gap-4 lg:flex-1 lg:min-w-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <Badge variant="secondary" className="rounded-full">
            {projects.length}
          </Badge>
          {/* Volta a colapsar. Sem isto, abrir uma coluna vazia era caminho só
              de ida: ela ficava ocupando a largura de uma coluna cheia até
              recarregar a página. */}
          {expandidaManual && projects.length === 0 && (
            <button
              type="button"
              onClick={() => setExpandidaManual(false)}
              title="Recolher coluna vazia"
              className="hidden lg:inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`space-y-3 min-h-[100px] rounded-lg transition-colors ${isOver ? "bg-primary/5 ring-2 ring-primary/20 ring-inset" : ""}`}
        >
          {projects.length === 0 ? (
            <div className="flex items-center justify-center h-24 border-2 border-dashed border-border/30 rounded-lg">
              <p className="text-[11px] text-muted-foreground/50">Arraste aqui</p>
            </div>
          ) : (
            projects.map((project) => (
              <SortableProjectCard
                key={project.id}
                project={project}
                assigneeAvatarMap={assigneeAvatarMap}
                onEdit={onEdit}
                onDeleteClick={handleDeleteClick}
                onCardClick={onCardClick}
                isAdmin={isAdmin}
              />
            ))
          )}
        </div>
      </SortableContext>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este projeto? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
