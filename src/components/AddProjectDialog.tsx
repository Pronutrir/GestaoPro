import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AddProjectDialogProps {
  onProjectAdded: () => void;
  defaultCategory?: string;
}

export const AddProjectDialog = ({ onProjectAdded, defaultCategory }: AddProjectDialogProps) => {
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
    fetchProfiles();
  }, []);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
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
    category: defaultCategory || "",
    program: "",
    project_type: "",
    objective: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const assigneesArray = formData.assignees
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a);

      const { error } = await supabase.from("projects").insert({
        title: formData.title,
        description: formData.description,
        status: formData.status,
        priority: formData.priority,
        due_date: formData.due_date || null,
        assignees: assigneesArray,
        budget_planned: parseFloat(formData.budget_planned) || 0,
        budget_used: 0,
        owner: formData.owner || null,
        blockers: formData.blockers,
        category: formData.category || "general",
        program: formData.program || null,
        project_type: formData.project_type || null,
        objective: formData.objective || null,
      });

      if (error) throw error;

      toast({
        title: "Projeto criado!",
        description: "O projeto foi adicionado com sucesso.",
      });

      setFormData({
        title: "",
        description: "",
        status: "ideacao",
        priority: "medium",
        due_date: "",
        assignees: "",
        budget_planned: "",
        owner: "",
        blockers: "",
        category: defaultCategory || "general",
        program: "",
        project_type: "",
        objective: "",
      });
      setOpen(false);
      onProjectAdded();
    } catch (error) {
      console.error("Erro ao criar projeto:", error);
      toast({
        title: "Erro ao criar projeto",
        description: "Não foi possível criar o projeto. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Projeto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[750px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Criar Novo Projeto</DialogTitle>
            <DialogDescription>
              Preencha os detalhes do novo projeto abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="budget_planned">Orçamento Planejado (R$)</Label>
                <CurrencyInput
                  id="budget_planned"
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
                <Label htmlFor="due_date">Data de Entrega</Label>
                <Input
                  id="due_date"
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
                <Label htmlFor="status">Status</Label>
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
                <Label htmlFor="priority">Prioridade</Label>
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
            <div className="grid gap-2">
              <Label htmlFor="program">Programa</Label>
              <Input
                id="program"
                placeholder="Nome do programa (opcional)"
                value={formData.program}
                onChange={(e) => setFormData({ ...formData, program: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="blockers">Bloqueios/Impedimentos</Label>
              <Textarea
                id="blockers"
                placeholder="Descreva possíveis bloqueios ou impedimentos..."
                value={formData.blockers}
                onChange={(e) =>
                  setFormData({ ...formData, blockers: e.target.value })
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Criando..." : "Criar Projeto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
