import { useState, useEffect } from "react";
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
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AIAssistButton } from "@/components/AIAssistButton";

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
  project_type?: string | null;
  start_date?: string | null;
  sponsor?: string | null;
  manager?: string | null;
  objective?: string | null;
  problem_statement?: string | null;
  root_cause?: string | null;
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
  const [profiles, setProfiles] = useState<{ id: string; full_name: string; sector: string | null }[]>([]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const [{ data: profileData }, { data: adminRoles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, sector").not("full_name", "is", null).order("full_name"),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);
      const adminIds = new Set((adminRoles || []).map(r => r.user_id));
      if (profileData) setProfiles(profileData.filter(p => p.full_name && !adminIds.has(p.id)));
    };
    if (open) fetchProfiles();
  }, [open]);
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
    project_type: "",
    start_date: "",
    sponsor: "",
    manager: "",
    objective: "",
    problem_statement: "",
    root_cause: "",
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
        project_type: (project as any).project_type || "",
        start_date: (project as any).start_date || "",
        sponsor: (project as any).sponsor || "",
        manager: (project as any).manager || "",
        objective: (project as any).objective || "",
        problem_statement: (project as any).problem_statement || "",
        root_cause: (project as any).root_cause || "",
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
          owner: formData.owner || null,
          blockers: formData.blockers,
          category: formData.category || "general",
          program: formData.program || null,
          project_type: formData.project_type || null,
          start_date: formData.start_date || null,
          sponsor: formData.sponsor || null,
          manager: formData.manager || null,
          objective: formData.objective || null,
          problem_statement: formData.problem_statement || null,
          root_cause: formData.root_cause || null,
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
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-title">Título *</Label>
                <AIAssistButton
                  value={formData.title}
                  onChange={(next) => setFormData({ ...formData, title: next })}
                  context="project_title"
                />
              </div>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-project_type">Tipo do Projeto</Label>
                <Select
                  value={formData.project_type || "_none"}
                  onValueChange={(v) =>
                    setFormData({ ...formData, project_type: v === "_none" ? "" : v })
                  }
                >
                  <SelectTrigger id="edit-project_type">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Não definido</SelectItem>
                    <SelectItem value="estrategico">Estratégico</SelectItem>
                    <SelectItem value="operacional">Operacional</SelectItem>
                    <SelectItem value="novos_negocios">Novos Negócios</SelectItem>
                    <SelectItem value="parceria">Parceria</SelectItem>
                    <SelectItem value="melhoria_processo">Melhoria de Processo</SelectItem>
                    <SelectItem value="inovacao">Inovação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-budget_planned">Orçamento Planejado (R$)</Label>
                <CurrencyInput
                  id="edit-budget_planned"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={formData.budget_planned}
                  onChange={(e) =>
                    setFormData({ ...formData, budget_planned: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-start_date">Data de Início</Label>
                <Input
                  id="edit-start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
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
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Líder do Projeto</Label>
                <Select
                  value={formData.owner || "_none"}
                  onValueChange={(v) => setFormData({ ...formData, owner: v === "_none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o líder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sem líder</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.full_name!} value={p.full_name!}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Setor</Label>
                <Input
                  value={(() => {
                    const match = profiles.find(p => p.full_name === formData.owner);
                    return match?.sector || "";
                  })()}
                  readOnly
                  disabled
                  placeholder="Selecione um líder"
                  className="bg-muted"
                />
              </div>
            </div>
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
