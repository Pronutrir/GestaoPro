import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, DollarSign, ExternalLink, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useHealthScore } from "@/hooks/useHealthScore";
import { HealthBadge } from "@/components/HealthBadge";
import { Progress } from "@/components/ui/progress";
import { formatProjectDueDate } from "@/lib/projectDeadline";

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assignees: string[];
  budget_planned: number;
  budget_used: number;
  owner: string | null;
  blockers: string | null;
  category?: string;
  program?: string | null;
}

interface ProjectDrawerProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusLabels: Record<string, string> = {
  ideacao: "Ideação",
  poc: "POC",
  mvp: "MVP",
  blocked: "Bloqueio",
  drawer: "Gaveta",
  "em-execucao": "Em Execução",
};

const priorityLabels: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning text-warning-foreground",
  high: "bg-destructive text-destructive-foreground",
};

export function ProjectDrawer({ project, open, onOpenChange }: ProjectDrawerProps) {
  const navigate = useNavigate();
  const { health } = useHealthScore(project?.id);

  if (!project) return null;

  const budgetProgress = project.budget_planned > 0 ? (project.budget_used / project.budget_planned) * 100 : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border mb-4">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-xl">{project.title}</SheetTitle>
            {health && <HealthBadge health={health} size="md" />}
          </div>
          <SheetDescription>
            {project.description || "Sem descrição"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Status & Priority */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{statusLabels[project.status] || project.status}</Badge>
            <Badge className={priorityColors[project.priority]}>
              {priorityLabels[project.priority] || project.priority}
            </Badge>
            {project.category && (
              <Badge variant="secondary">{project.category}</Badge>
            )}
          </div>

          {/* Health Score Breakdown */}
          {health && (
            <div className="space-y-3 bg-muted/50 rounded-lg p-4">
              <h4 className="font-semibold text-sm text-foreground">Health Score: {health.score}/100</h4>
              <div className="space-y-2">
                {([
                  { label: "Prazo", value: health.breakdown.prazo },
                  { label: "Riscos", value: health.breakdown.riscos },
                  { label: "Engajamento", value: health.breakdown.engajamento },
                  { label: "Financeiro", value: health.breakdown.financeiro },
                ] as const).map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.label}</span>
                      <span>{item.value}%</span>
                    </div>
                    <Progress value={item.value} className="h-1.5" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Budget */}
          {project.budget_planned > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <DollarSign className="w-4 h-4 text-primary" />
                Investimento
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Planejado</span>
                <span>R$ {project.budget_planned.toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Utilizado</span>
                <span>R$ {project.budget_used.toLocaleString("pt-BR")}</span>
              </div>
              <Progress value={Math.min(budgetProgress, 100)} className="h-2" />
            </div>
          )}

          {/* Due Date */}
          {project.due_date && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Prazo:</span>
              <span>{formatProjectDueDate(project.due_date)}</span>
            </div>
          )}

          {/* Owner */}
          {project.owner && (
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Responsável:</span>
              <span>{project.owner}</span>
            </div>
          )}

          {/* Assignees */}
          {project.assignees.length > 0 && (
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">Membros</span>
              <div className="flex gap-2 flex-wrap">
                {project.assignees.map((a, i) => (
                  <Avatar key={i} className="w-8 h-8">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">{a}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
            </div>
          )}

          {/* Blockers */}
          {project.blockers && (
            <div className="space-y-1 bg-destructive/10 rounded-lg p-3">
              <span className="text-sm font-medium text-destructive">Bloqueios</span>
              <p className="text-sm text-foreground">{project.blockers}</p>
            </div>
          )}

          {/* Action */}
          <Button
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              navigate(`/project/${project.id}`);
            }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Abrir Projeto Completo
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
