'use client';
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GripVertical, MoreVertical, Pencil, Trash2, Calendar, Hourglass, AlertTriangle } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatProjectDueDate } from "@/lib/projectDeadline";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
interface Project {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  assignees: string[];
  /** Última alteração — base do indicador de tempo parado. Vem do
   *  select('*') da página; opcional para não quebrar quem monta o tipo. */
  updated_at?: string | null;
}

/** Progresso e atrasos derivados das atividades do projeto. */
export interface CardMetrics {
  total: number;
  concluidas: number;
  atrasadas: number;
  percent: number;
}

interface SortableProjectCardProps {
  project: Project;
  assigneeAvatarMap?: Record<string, string>;
  onEdit: (project: Project) => void;
  onDeleteClick: (id: string) => void;
  onCardClick?: (project: Project) => void;
  isAdmin?: boolean;
  metrics?: CardMetrics;
}

const priorityColors: Record<string, string> = {
  high: "bg-destructive/20 text-destructive border-destructive/30",
  medium: "bg-warning/20 text-warning border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

export const ProjectCardPreview = ({ project, assigneeAvatarMap = {} }: { project: Project; assigneeAvatarMap?: Record<string, string> }) => {
  return (
    <Card className="p-4 shadow-lg ring-2 ring-primary bg-card">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1">
            <div className="p-1 rounded bg-muted/60">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-foreground">{project.title}</h4>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={`${priorityColors[project.priority]} text-xs`}>
              {project.priority === "high" && "Alta"}
              {project.priority === "medium" && "Média"}
              {project.priority === "low" && "Baixa"}
            </Badge>
            {project.due_date && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {formatProjectDueDate(project.due_date)}
              </div>
            )}
          </div>

          <div className="flex -space-x-2">
            {project.assignees.map((assignee, index) => (
              <Avatar key={index} className="w-6 h-6 border-2 border-background">
                {(() => {
                  const avatar = resolveAvatarFromLookup(assignee, assignee, assigneeAvatarMap);
                  return avatar ? <AvatarImage src={avatar} alt={assignee} /> : null;
                })()}
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">{getAvatarInitials(assignee)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

/**
 * Dias sem alteração. Só vira sinal a partir de 30 dias: abaixo disso é ritmo
 * normal de trabalho, e um alerta que aparece sempre deixa de ser alerta.
 */
export const diasSemMovimento = (updatedAt?: string | null): number | null => {
  if (!updatedAt) return null;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
};

export const SortableProjectCard = ({ project, assigneeAvatarMap = {}, onEdit, onDeleteClick, onCardClick, isAdmin = false, metrics }: SortableProjectCardProps) => {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging, setActivatorNodeRef,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };


  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-4 cursor-pointer ${isDragging ? "shadow-lg ring-2 ring-primary" : ""}`}
      onClick={() => onCardClick?.(project)}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1">
            <button
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="flex-1">
              <h4 className="font-semibold text-foreground">{project.title}</h4>
            </div>
          </div>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(project); }}>
                  <Pencil className="w-4 h-4 mr-2" /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDeleteClick(project.id); }} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${priorityColors[project.priority]} text-xs`}>
              {project.priority === "high" && "Alta"}
              {project.priority === "medium" && "Média"}
              {project.priority === "low" && "Baixa"}
            </Badge>
            {project.due_date && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {formatProjectDueDate(project.due_date)}
              </div>
            )}
            {/* Tarefas atrasadas — 8 dos 24 projetos ativos têm, e isso não
                aparecia em tela nenhuma. É o sinal que muda uma decisão. */}
            {metrics && metrics.atrasadas > 0 && (
              <div
                className="flex items-center gap-1 text-xs font-medium text-destructive"
                title={`${metrics.atrasadas} tarefa(s) com prazo vencido`}
              >
                <AlertTriangle className="w-3 h-3" />
                {metrics.atrasadas}
              </div>
            )}
            {/* Tempo parado — o dado que faltava. Sem ele todas as colunas
                parecem igualmente saudáveis, e um pipeline serve justamente
                para mostrar onde o trabalho empaca. */}
            {(() => {
              const dias = diasSemMovimento(project.updated_at);
              if (dias === null || dias < 30) return null;
              return (
                <div
                  className={`flex items-center gap-1 text-xs font-medium ${
                    dias >= 90 ? "text-destructive" : "text-warning"
                  }`}
                  title={`Sem alteração há ${dias} dias`}
                >
                  <Hourglass className="w-3 h-3" />
                  {dias}d
                </div>
              );
            })()}
          </div>

          <div className="flex -space-x-2">
            {project.assignees.map((assignee, index) => (
              <Avatar key={index} className="w-6 h-6 border-2 border-background">
                {(() => {
                  const avatar = resolveAvatarFromLookup(assignee, assignee, assigneeAvatarMap);
                  return avatar ? <AvatarImage src={avatar} alt={assignee} /> : null;
                })()}
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">{getAvatarInitials(assignee)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        </div>

        {/* Progresso real das atividades. Só aparece quando HÁ atividade —
            uma barra em 0% para projeto sem tarefa nenhuma informa errado:
            sugere trabalho parado onde não há trabalho cadastrado. */}
        {metrics && metrics.total > 0 && (
          <div className="flex items-center gap-2" title={`${metrics.concluidas} de ${metrics.total} atividades concluídas`}>
            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${metrics.percent}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{metrics.percent}%</span>
          </div>
        )}
      </div>
    </Card>
  );
};
