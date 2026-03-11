import { useState, useEffect } from "react";
import { ProjectMembersManager } from "@/components/ProjectMembersManager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assignees: string[];
  budget_planned: number;
  owner: string | null;
  blockers: string | null;
  category?: string;
  program?: string | null;
}

interface EditProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectUpdated: () => void;
}

export const EditProjectDialog = ({
  project,
  open,
  onOpenChange,
  onProjectUpdated,
}: EditProjectDialogProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "ideacao",
    priority: "medium",
    due_date: "",
    assignees: "",
    budget_planned: "",
    owner: "",
    blockers: "",
    category: "",
    program: "",
  });

  useEffect(() => {
    if (project) {
      setFormData({
        title: project.title,
        description: project.description || "",
        status: project.status,
        priority: project.priority,
        due_date: project.due_date || "",
        assignees: project.assignees.join(", "),
        budget_planned: project.budget_planned?.toString() || "0",
        owner: project.owner || "",
        blockers: project.blockers || "",
        category: (project as any).category || "general",
        program: (project as any).program || "",
      });
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    setIsLoading(true);

    try {
      const assigneesArray = formData.assignees
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a);

      const { error } = await supabase
        .from("projects")
        .update({
          title: formData.title,
          description: formData.description,
          status: formData.status,
          priority: formData.priority,
          due_date: formData.due_date || null,
          assignees: assigneesArray,
          budget_planned: parseFloat(formData.budget_planned) || 0,
          owner: formData.owner,
          blockers: formData.blockers,
          category: formData.category || "general",
          program: formData.program || null,
        })
        .eq("id", project.id);

      if (error) throw error;

      toast({
        title: "Projeto atualizado!",
        description: "As alterações foram salvas com sucesso.",
      });

      onOpenChange(false);
      onProjectUpdated();
    } catch (error) {
      console.error("Erro ao atualizar projeto:", error);
      toast({
        title: "Erro ao atualizar projeto",
        description: "Não foi possível atualizar o projeto. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Editar Projeto</DialogTitle>
            <DialogDescription>
              Faça as alterações necessárias no projeto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Título *</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-budget_planned">Orçamento Planejado (R$)</Label>
                <Input
                  id="edit-budget_planned"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={formData.budget_planned}
                  onChange={(e) =>
                    setFormData({ ...formData, budget_planned: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-due_date">Data de Entrega</Label>
                <Input
                  id="edit-due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) =>
                    setFormData({ ...formData, due_date: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ideacao">Ideação</SelectItem>
                    <SelectItem value="poc">POC</SelectItem>
                    <SelectItem value="mvp">MVP</SelectItem>
                    <SelectItem value="blocked">Bloqueio</SelectItem>
                    <SelectItem value="drawer">Gaveta</SelectItem>
                    <SelectItem value="em-execucao">Em Execução</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-priority">Prioridade</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) =>
                    setFormData({ ...formData, priority: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-owner">Responsável pelo Projeto</Label>
              <Input
                id="edit-owner"
                placeholder="Nome do responsável"
                value={formData.owner}
                onChange={(e) =>
                  setFormData({ ...formData, owner: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-program">Programa</Label>
              <Input
                id="edit-program"
                placeholder="Nome do programa (opcional)"
                value={formData.program}
                onChange={(e) => setFormData({ ...formData, program: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-blockers">Bloqueios/Impedimentos</Label>
              <Textarea
                id="edit-blockers"
                placeholder="Descreva possíveis bloqueios ou impedimentos..."
                value={formData.blockers}
                onChange={(e) =>
                  setFormData({ ...formData, blockers: e.target.value })
                }
                rows={2}
              />
            </div>
            {project && (
              <ProjectMembersManager projectId={project.id} />
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
