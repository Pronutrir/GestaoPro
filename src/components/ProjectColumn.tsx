'use client';
import { Badge } from "@/components/ui/badge";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
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
import { useState } from "react";

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <Badge variant="secondary" className="rounded-full">
            {projects.length}
          </Badge>
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
