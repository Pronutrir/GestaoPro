'use client';
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
import { Plus, X, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AIAssistButton } from "@/components/AIAssistButton";
import { GutPriorityField } from "@/components/GutPriorityField";
import { useAuth } from "@/contexts/AuthContext";

interface PendingMember {
  user_id: string;
  full_name: string;
  sector: string | null;
}

interface AddProjectDialogProps {
  onProjectAdded: () => void;
  defaultCategory?: string;
}

export const AddProjectDialog = ({ onProjectAdded, defaultCategory }: AddProjectDialogProps) => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<{ id: string; full_name: string; sector: string | null }[]>([]);
  const [team, setTeam] = useState<PendingMember[]>([]);
  const [pickedUserId, setPickedUserId] = useState<string>("");

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
    priority: "pendente",
    gravity: null as number | null,
    urgency: null as number | null,
    tendency: null as number | null,
    due_date: "",
    assignees: "",
    budget_planned: "",
    owner: "",
    blockers: "",
    category: defaultCategory || "",
    program: "",
    project_type: "",
    objective: "",
    start_date: "",
    sponsor: "",
    manager: "",
    problem_statement: "",
    root_cause: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const assigneesArray = formData.assignees
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a);

      const { data: created, error } = await supabase.from("projects").insert({
        title: formData.title,
        description: formData.description,
        status: formData.status,
        gravity: formData.gravity,
        urgency: formData.urgency,
        tendency: formData.tendency,
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
        start_date: formData.start_date || null,
        sponsor: formData.sponsor || null,
        manager: formData.manager || null,
        problem_statement: formData.problem_statement || null,
        root_cause: formData.root_cause || null,
      }).select("id").single();

      if (error) throw error;

      // Insere equipe + envia convites individuais
      if (created?.id && team.length > 0) {
        const rows = team.map((m) => ({
          project_id: created.id,
          user_id: m.user_id,
          sector: m.sector,
          invitation_status: "pending" as const,
          invited_by: user?.id ?? null,
          can_create: false,
          can_edit: false,
          can_delete: false,
          can_move: false,
        }));
        const { error: memErr } = await supabase.from("project_members").insert(rows);
        if (memErr) {
          console.warn("Erro ao adicionar equipe:", memErr.message);
        } else {
          // Notificações direcionadas
          await supabase.from("notifications").insert(
            team.map((m) => ({
              project_id: created.id,
              target_user_id: m.user_id,
              type: "project_invite",
              title: `Convite para o projeto: ${formData.title}`,
              message: `Você foi convidado(a) a participar do projeto "${formData.title}". Aceita?`,
            }))
          );
        }
      }

      toast({
        title: "Projeto criado!",
        description: "O projeto foi adicionado com sucesso.",
      });

      setFormData({
        title: "",
        description: "",
        status: "ideacao",
        priority: "pendente",
        gravity: null,
        urgency: null,
        tendency: null,
        due_date: "",
        assignees: "",
        budget_planned: "",
        owner: "",
        blockers: "",
        category: defaultCategory || "general",
        program: "",
        project_type: "",
        objective: "",
        start_date: "",
        sponsor: "",
        manager: "",
        problem_statement: "",
        root_cause: "",
      });
      setTeam([]);
      setPickedUserId("");
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

  const addTeamMember = () => {
    if (!pickedUserId) return;
    const p = profiles.find((x) => x.id === pickedUserId);
    if (!p) return;
    setTeam((prev) => [
      ...prev,
      { user_id: p.id, full_name: p.full_name, sector: p.sector },
    ]);
    setPickedUserId("");
  };

  const removeTeamMember = (uid: string) =>
    setTeam((prev) => prev.filter((m) => m.user_id !== uid));

  const availableForTeam = profiles.filter((p) => !team.some((t) => t.user_id === p.id));

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
              <div className="flex items-center justify-between">
                <Label htmlFor="title">Título *</Label>
                <AIAssistButton
                  value={formData.title}
                  onChange={(next) => setFormData({ ...formData, title: next })}
                  context="project_title"
                />
              </div>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="project_type">Tipo do Projeto</Label>
                <Select
                  value={formData.project_type || "_none"}
                  onValueChange={(v) =>
                    setFormData({ ...formData, project_type: v === "_none" ? "" : v })
                  }
                >
                  <SelectTrigger id="project_type">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Não definido</SelectItem>
                    <SelectItem value="estrategico">Estratégico</SelectItem>
                    <SelectItem value="operacional">Operacional Crítico</SelectItem>
                    <SelectItem value="novos_negocios">Novos Negócios</SelectItem>
                    <SelectItem value="parceria">Parceria</SelectItem>
                    <SelectItem value="inovacao">Inovação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="start_date">Data de Início</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
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
                <Label>Prioridade (GUT)</Label>
                <GutPriorityField
                  gravity={formData.gravity}
                  urgency={formData.urgency}
                  tendency={formData.tendency}
                  onChange={(v) => setFormData({ ...formData, ...v })}
                />
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
                      <SelectItem key={`ld-${p.id}`} value={p.full_name!}>
                        {p.full_name}
                        {p.sector ? ` — ${p.sector}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Setor (do Líder)</Label>
                <Input
                  value={(() => {
                    const match = profiles.find(p => p.full_name === formData.owner);
                    return match?.sector || "";
                  })()}
                  readOnly
                  disabled
                  placeholder="Preenchido ao escolher o líder"
                  className="bg-muted"
                />
              </div>
            </div>

            {/* Equipe do Projeto */}
            <div className="grid gap-2 rounded-lg border border-dashed border-border p-3">
              <Label className="text-sm font-semibold">Equipe do Projeto</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Cada pessoa receberá um convite e poderá aceitar ou recusar a participação.
              </p>

              {team.length > 0 && (
                <div className="space-y-1.5">
                  {team.map((m) => (
                    <div key={m.user_id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40 border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.full_name}</p>
                        {m.sector && <p className="text-[11px] text-muted-foreground truncate">{m.sector}</p>}
                      </div>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeTeamMember(m.user_id)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Select value={pickedUserId} onValueChange={setPickedUserId}>
                  <SelectTrigger className="h-9 text-sm flex-1">
                    <SelectValue placeholder="Selecionar membro..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForTeam.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}{p.sector ? ` — ${p.sector}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" variant="outline" className="h-9 gap-1" onClick={addTeamMember} disabled={!pickedUserId}>
                  <UserPlus className="w-4 h-4" /> Adicionar
                </Button>
              </div>
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
