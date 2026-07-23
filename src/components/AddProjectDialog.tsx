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
import { PersonCombobox } from "@/components/PersonCombobox";
import { SearchSelect } from "@/components/SearchSelect";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  avatar_url?: string | null;
}

interface AddProjectDialogProps {
  onProjectAdded: () => void;
  defaultCategory?: string;
}

export const AddProjectDialog = ({ onProjectAdded, defaultCategory }: AddProjectDialogProps) => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<{ id: string; full_name: string; sector: string | null; role_title?: string | null; avatar_url?: string | null }[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [team, setTeam] = useState<PendingMember[]>([]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const [{ data: profileData }, { data: adminRoles }, { data: sectorData }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, sector, role_title, avatar_url").not("full_name", "is", null).order("full_name"),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
        supabase.from("sectors").select("id, name").order("name"),
      ]);
      const adminIds = new Set((adminRoles || []).map(r => r.user_id));
      if (profileData) setProfiles(profileData.filter(p => p.full_name && !adminIds.has(p.id)));
      if (sectorData) setSectors(sectorData);
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
    actual_start_date: "",
    actual_end_date: "",
    sponsor: "",
    manager: "",
    sector: "",
    problem_statement: "",
    root_cause: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!formData.sector.trim()) {
        toast({
          title: "Campo obrigatório",
          description: "Selecione o setor responsável pelo projeto.",
          variant: "destructive",
        });
        return;
      }

      const assigneesArray = formData.assignees
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a);

      const extractMissingColumn = (message?: string | null) => {
        if (!message) return null;
        const match = message.match(/Could not find the '([^']+)' column/i);
        return match?.[1] || null;
      };

      const insertPayload: Record<string, any> = {
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
        actual_start_date: formData.actual_start_date || null,
        actual_end_date: formData.actual_end_date || null,
        sponsor: formData.sponsor || null,
        manager: formData.manager || null,
        sector: formData.sector || null,
        problem_statement: formData.problem_statement || null,
        root_cause: formData.root_cause || null,
      };

      const safeInsertPayload: Record<string, any> = { ...insertPayload };
      let created: { id: string } | null = null;
      let error: any = null;
      const droppedOptionalColumns: string[] = [];

      while (Object.keys(safeInsertPayload).length > 0) {
        const result = await supabase.from("projects").insert(safeInsertPayload as any).select("id").single();
        if (!result.error) {
          created = result.data;
          error = null;
          break;
        }

        const missingColumn = extractMissingColumn(result.error.message);
        if (!missingColumn || !(missingColumn in safeInsertPayload)) {
          error = result.error;
          break;
        }

        delete safeInsertPayload[missingColumn];
        droppedOptionalColumns.push(missingColumn);
      }

      if (error) throw error;
      if (!created) throw new Error("Falha ao criar projeto.");

      if (droppedOptionalColumns.includes("sector")) {
        toast({
          title: "Projeto criado com aviso",
          description: "O campo Setor Responsável não está disponível neste ambiente e não pôde ser salvo no projeto.",
          variant: "destructive",
        });
      }

      // Adiciona o criador como membro com acesso total
      if (created?.id && user?.id) {
        const { error: creatorMemberError } = await supabase.from("project_members").insert({
          project_id: created.id,
          user_id: user.id,
          invitation_status: "accepted",
          invited_by: user.id,
          can_create: true,
          can_edit: true,
          can_delete: true,
          can_move: true,
        });
        if (creatorMemberError) {
          console.warn("Erro ao vincular criador como membro:", creatorMemberError.message);
        }
      }

      const createdProjectId = created?.id;
      const createdProjectTitle = formData.title;
      const teamSnapshot = [...team];
      const invitedBy = user?.id ?? null;

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
        actual_start_date: "",
        actual_end_date: "",
        sponsor: "",
        manager: "",
        sector: "",
        problem_statement: "",
        root_cause: "",
      });
      setTeam([]);
      setOpen(false);
      onProjectAdded();

      // Inserções secundárias (equipe/notificações) em background para não
      // bloquear feedback da criação principal.
      if (createdProjectId && teamSnapshot.length > 0) {
        void (async () => {
          const rows = teamSnapshot.map((m) => ({
            project_id: createdProjectId,
            user_id: m.user_id,
            sector: m.sector,
            invitation_status: "accepted" as const,
            responded_at: new Date().toISOString(),
            invited_by: invitedBy,
            can_create: true,
            can_edit: false,
            can_delete: false,
            can_move: false,
          }));

          const { error: memErr } = await supabase.from("project_members").insert(rows);
          if (memErr) {
            console.warn("Erro ao adicionar equipe:", memErr.message);
            toast({
              title: "Projeto criado com aviso",
              description: `O projeto foi salvo, mas houve falha ao sincronizar equipe: ${memErr.message}`,
              variant: "destructive",
            });
            return;
          }

          const { error: notifErr } = await supabase.from("notifications").insert(
            teamSnapshot.map((m) => ({
              project_id: createdProjectId,
              target_user_id: m.user_id,
              type: "project_invite",
              title: `Você foi adicionado(a) ao projeto: ${createdProjectTitle}`,
              message: `Seu acesso ao projeto "${createdProjectTitle}" já está ativo.`,
            })),
          );

          if (notifErr) {
            console.warn("Erro ao criar notificações de convite:", notifErr.message);
            toast({
              title: "Projeto criado com aviso",
              description: `Equipe sincronizada, mas houve falha nas notificações: ${notifErr.message}`,
              variant: "destructive",
            });
          }
        })();
      }
    } catch (error) {
      const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
      const detail = [maybe?.message, maybe?.details, maybe?.hint, maybe?.code].filter(Boolean).join(" | ");
      // O PostgrestError tem props nao-enumeraveis (loga {}); serializa manual.
      console.error("Erro ao criar projeto:", detail || error);
      // 42501 = violacao de RLS: falta a policy de INSERT no banco (migration
      // pendente na VM). Mensagem amigavel em vez do texto tecnico.
      const isRls = maybe?.code === "42501" || /row-level security/i.test(maybe?.message || "");
      toast({
        title: "Erro ao criar projeto",
        description: isRls
          ? "Permissão insuficiente no banco para criar projetos. É necessário aplicar a migration de permissão (RLS) no servidor. Avise o administrador."
          : detail || "Não foi possível criar o projeto. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addTeamMember = (p: { id: string; full_name: string; sector?: string | null; avatar_url?: string | null }) => {
    if (team.some((t) => t.user_id === p.id)) return;
    setTeam((prev) => [
      ...prev,
      { user_id: p.id, full_name: p.full_name, sector: p.sector ?? null, avatar_url: p.avatar_url || null },
    ]);
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
                <Label htmlFor="actual_start_date">Data de Início Real</Label>
                <Input
                  id="actual_start_date"
                  type="date"
                  value={formData.actual_start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, actual_start_date: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="actual_end_date">Data de Término Real</Label>
                <Input
                  id="actual_end_date"
                  type="date"
                  value={formData.actual_end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, actual_end_date: e.target.value })
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
                    <SelectItem value="concluido">Concluído</SelectItem>
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
                <PersonCombobox
                  people={profiles}
                  value={profiles.find((p) => p.full_name === formData.owner)?.id ?? null}
                  placeholder="Selecione o líder"
                  onSelect={(p) =>
                    setFormData({
                      ...formData,
                      owner: p.full_name,
                      sector: formData.sector || p.sector || "",
                    })
                  }
                  onClear={() => setFormData({ ...formData, owner: "" })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Setor do Projeto (Responsável) *</Label>
                <SearchSelect
                  options={sectors.map((s) => ({ value: s.name, label: s.name }))}
                  value={formData.sector || null}
                  onSelect={(v) => setFormData({ ...formData, sector: v })}
                  onClear={() => setFormData({ ...formData, sector: "" })}
                  placeholder="Selecione o setor"
                  searchPlaceholder="Buscar setor..."
                  emptyText="Nenhum setor encontrado."
                />
                <p className="text-[11px] text-muted-foreground">Define o setor do projeto. Pode ser diferente do setor do líder.</p>
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
                    <div key={m.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/40 border border-border">
                      <Avatar className="h-6 w-6 shrink-0">
                        {m.avatar_url ? <AvatarImage src={m.avatar_url} alt={m.full_name} /> : null}
                        <AvatarFallback className="text-[9px]">{m.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                        <span className="text-sm font-medium truncate">{m.full_name}</span>
                        {m.sector && <span className="text-[11px] text-muted-foreground truncate shrink-0">· {m.sector}</span>}
                      </div>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeTeamMember(m.user_id)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <PersonCombobox
                variant="add"
                people={availableForTeam}
                placeholder="Adicionar membro por nome, setor ou função..."
                onSelect={(p) => addTeamMember(p)}
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
