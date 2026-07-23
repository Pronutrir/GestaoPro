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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PersonCombobox } from "@/components/PersonCombobox";
import { SearchSelect } from "@/components/SearchSelect";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { GutPriorityField } from "@/components/GutPriorityField";
import { UserPlus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { gutLabel, gutScore } from "@/lib/gutPriority";

interface MemberRow {
  id: string; // project_members.id (existing) or temp uuid for pending add
  user_id: string;
  full_name: string;
  sector: string | null;
  avatar_url?: string | null;
  invitation_status: "pending" | "accepted" | "declined";
  persisted: boolean;
}

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
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  sponsor?: string | null;
  manager?: string | null;
  sector?: string | null;
  created_by?: string | null;
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
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string; sector: string | null; role_title?: string | null; avatar_url?: string | null }[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [team, setTeam] = useState<MemberRow[]>([]);
  const [createdByLabel, setCreatedByLabel] = useState<string>("—");

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
    if (open) fetchProfiles();
  }, [open]);

  // Carrega equipe atual do projeto ao abrir
  useEffect(() => {
    const loadTeam = async () => {
      if (!project?.id || !open) return;
      const { data: members } = await supabase
        .from("project_members")
        .select("id, user_id, invitation_status")
        .eq("project_id", project.id);
      if (!members) { setTeam([]); return; }
      const ids = members.map((m: any) => m.user_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name, sector, role_title, avatar_url").in("id", ids)
        : { data: [] as any[] };
      const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
      setTeam(
        members.map((m: any) => {
          const p: any = profMap.get(m.user_id);
          return {
            id: m.id,
            user_id: m.user_id,
            full_name: p?.full_name || "—",
            sector: p?.sector || null,
            avatar_url: p?.avatar_url || null,
            invitation_status: (m.invitation_status as MemberRow["invitation_status"]) || "pending",
            persisted: true,
          };
        })
      );
    };
    loadTeam();
  }, [project?.id, open]);
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
    category: "",
    program: "",
    project_type: "",
    start_date: "",
    actual_start_date: "",
    actual_end_date: "",
    sponsor: "",
    manager: "",
    sector: "",
    objective: "",
    problem_statement: "",
    root_cause: "",
  });
  const isProjectConcluded = project?.status === "concluido";
  const isProjectReadOnly = isProjectConcluded && formData.status === "concluido";

  useEffect(() => {
    if (project && open) {
      setFormData({
        title: project.title,
        description: project.description || "",
        status: project.status,
        priority: project.priority,
        gravity: (project as any).gravity ?? null,
        urgency: (project as any).urgency ?? null,
        tendency: (project as any).tendency ?? null,
        due_date: project.due_date || "",
        assignees: project.assignees.join(", "),
        budget_planned: project.budget_planned?.toString() || "0",
        owner: project.owner || "",
        blockers: project.blockers || "",
        category: (project as any).category || "general",
        program: (project as any).program || "",
        project_type: (project as any).project_type || "",
        start_date: (project as any).start_date || "",
        actual_start_date: (project as any).actual_start_date || "",
        actual_end_date: (project as any).actual_end_date || "",
        sponsor: (project as any).sponsor || "",
        manager: (project as any).manager || "",
        sector: (project as any).sector || "",
        objective: (project as any).objective || "",
        problem_statement: (project as any).problem_statement || "",
        root_cause: (project as any).root_cause || "",
      });
    }
  }, [project, open]);

  useEffect(() => {
    const loadCreator = async () => {
      if (!project || !open) {
        setCreatedByLabel("—");
        return;
      }

      if (!project.created_by) {
        setCreatedByLabel("Não informado");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", project.created_by)
        .maybeSingle();

      const resolvedName = data?.full_name?.trim();
      setCreatedByLabel(resolvedName || project.created_by);
    };

    void loadCreator();
  }, [open, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    if (isProjectReadOnly) {
      toast({
        title: "Projeto concluído",
        description: "Altere o status para reabrir o projeto antes de editar os demais campos.",
        variant: "destructive",
      });
      return;
    }

    if (isProjectConcluded && formData.status !== "concluido") {
      setIsLoading(true);
      try {
        const { error } = await supabase
          .from("projects")
          .update({ status: formData.status })
          .eq("id", project.id);
        if (error) throw error;
        toast({ title: "Projeto reaberto com sucesso!" });
        onOpenChange(false);
        onProjectUpdated();
      } catch (error: any) {
        toast({
          title: "Erro ao reabrir projeto",
          description: error?.message || "Não foi possível reabrir o projeto.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const missingRequiredFields: string[] = [];
    if (!formData.title.trim()) missingRequiredFields.push("Título");
    if (!formData.project_type.trim()) missingRequiredFields.push("Tipo do Projeto");
    if (!formData.start_date) missingRequiredFields.push("Data de Início");
    if (!formData.due_date) missingRequiredFields.push("Data de Entrega");
    if (!formData.status.trim()) missingRequiredFields.push("Status");
    if (!formData.owner.trim()) missingRequiredFields.push("Líder do Projeto");
    if (!formData.sector.trim()) missingRequiredFields.push("Setor Responsável");

    const currentPriority = formData.priority || "pendente";
    if (currentPriority === "pendente") missingRequiredFields.push("Prioridade");

    if (missingRequiredFields.length > 0) {
      toast({
        title: "Campos obrigatórios",
        description: `Preencha: ${missingRequiredFields.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const assigneesArray = formData.assignees
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a);

      const computedGutPriority = gutLabel(gutScore(formData.gravity, formData.urgency, formData.tendency));
      const persistedPriority = computedGutPriority !== "pendente"
        ? computedGutPriority
        : (formData.priority || "pendente");

      const baseUpdatePayload = {
        title: formData.title,
        description: formData.description,
        status: formData.status,
        priority: persistedPriority,
        project_type: formData.project_type || null,
        start_date: formData.start_date || null,
        due_date: formData.due_date || null,
        assignees: assigneesArray,
        budget_planned: parseFloat(formData.budget_planned) || 0,
        owner: formData.owner || null,
        blockers: formData.blockers,
      };

      const extendedUpdatePayload: Record<string, any> = {};
      const assignOptional = (key: string, value: unknown) => {
        if (value === null || value === undefined) return;
        if (typeof value === "string" && value.trim() === "") return;
        extendedUpdatePayload[key] = value;
      };

      assignOptional("gravity", formData.gravity);
      assignOptional("urgency", formData.urgency);
      assignOptional("tendency", formData.tendency);
      assignOptional("category", formData.category);
      assignOptional("program", formData.program);
      assignOptional("actual_start_date", formData.actual_start_date);
      assignOptional("actual_end_date", formData.actual_end_date);
      assignOptional("sponsor", formData.sponsor);
      assignOptional("manager", formData.manager);
      assignOptional("sector", formData.sector);
      assignOptional("objective", formData.objective);
      assignOptional("problem_statement", formData.problem_statement);
      assignOptional("root_cause", formData.root_cause);

      const { error: baseError } = await supabase
        .from("projects")
        .update(baseUpdatePayload)
        .eq("id", project.id);

      if (baseError) {
        throw baseError;
      }

      // Campos opcionais/expandidos: tentativa resiliente para ambientes com schema legado.
      const extractMissingColumn = (message?: string | null) => {
        if (!message) return null;
        const match = message.match(/Could not find the '([^']+)' column/i);
        return match?.[1] || null;
      };

      let optionalFieldsWarning: string | null = null;
      const droppedOptionalColumns: string[] = [];
      const safeExtendedPayload: Record<string, any> = { ...extendedUpdatePayload };

      if (Object.keys(safeExtendedPayload).length > 0) {
        while (Object.keys(safeExtendedPayload).length > 0) {
          const { error: extendedError } = await supabase
            .from("projects")
            .update(safeExtendedPayload as any)
            .eq("id", project.id);

          if (!extendedError) {
            break;
          }

          const missingColumn = extractMissingColumn(extendedError.message);
          if (!missingColumn || !(missingColumn in safeExtendedPayload)) {
            optionalFieldsWarning = extendedError.message || "Alguns campos avançados não foram atualizados.";
            break;
          }

          delete safeExtendedPayload[missingColumn];
          droppedOptionalColumns.push(missingColumn);
        }

        if (!optionalFieldsWarning && droppedOptionalColumns.length > 0) {
          optionalFieldsWarning = `Campos não disponíveis neste ambiente foram ignorados: ${droppedOptionalColumns.join(", ")}`;
        }
      }

      // Sincroniza equipe (project_members)
      let teamSyncError: string | null = null;
      let notifySyncError: string | null = null;
      try {
        const { data: existingMembers, error: existingMembersError } = await supabase
          .from("project_members")
          .select("id, user_id")
          .eq("project_id", project.id);

        if (existingMembersError) {
          throw existingMembersError;
        }

        const keptIds = new Set(team.filter((m) => m.persisted).map((m) => m.id));
        // Remove os que foram retirados na UI
        const toRemove = (existingMembers || []).filter((m: any) => !keptIds.has(m.id));
        if (toRemove.length > 0) {
          const { error: removeError } = await supabase
            .from("project_members")
            .delete()
            .in("id", toRemove.map((m: any) => m.id));
          if (removeError) {
            throw removeError;
          }
        }

        // Membros não têm mais distinção Leitor/Editor — permissões ficam zeradas;
        // a edição vem do papel de participante/responsável da atividade (RLS).
        // Insere novos
        const newOnes = team.filter((m) => !m.persisted);
        if (newOnes.length > 0) {
          const rows = newOnes.map((m) => ({
            project_id: project.id,
            user_id: m.user_id,
            sector: m.sector,
            invitation_status: "accepted" as const,
            responded_at: new Date().toISOString(),
            invited_by: user?.id ?? null,
            can_create: true,
            can_edit: false,
            can_delete: false,
            can_move: false,
          }));
          const { error: memErr } = await supabase.from("project_members").insert(rows);
          if (memErr) {
            throw memErr;
          }

          const { error: notificationError } = await supabase.from("notifications").insert(
            newOnes.map((m) => ({
              project_id: project.id,
              target_user_id: m.user_id,
              type: "project_invite",
              title: `Você foi adicionado(a) ao projeto: ${formData.title}`,
              message: `Seu acesso ao projeto "${formData.title}" já está ativo.`,
            }))
          );
          if (notificationError) {
            notifySyncError = notificationError.message || "Falha ao enviar notificações.";
          }
        }
      } catch (teamErr: any) {
        teamSyncError = teamErr?.message || "Falha ao sincronizar equipe.";
      }

      toast({
        title: "Projeto atualizado!",
        description: "As alterações foram salvas com sucesso.",
      });

      if (teamSyncError) {
        toast({
          title: "Projeto salvo com aviso",
          description: `A equipe não foi sincronizada: ${teamSyncError}`,
          variant: "destructive",
        });
      }

      if (!teamSyncError && notifySyncError) {
        toast({
          title: "Equipe sincronizada com aviso",
          description: `Membros atualizados, mas houve falha nas notificações: ${notifySyncError}`,
          variant: "destructive",
        });
      }

      if (optionalFieldsWarning) {
        toast({
          title: "Projeto salvo com aviso",
          description: `Campos principais (incluindo líder) foram salvos, mas houve falha em campos extras: ${optionalFieldsWarning}`,
          variant: "destructive",
        });
      }

      onOpenChange(false);
      onProjectUpdated();
    } catch (error: any) {
      console.error("Erro ao atualizar projeto:", error);
      toast({
        title: "Erro ao atualizar projeto",
        description: error?.message || "Não foi possível atualizar o projeto. Tente novamente.",
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
              <Label htmlFor="edit-status">Status *</Label>
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

            {isProjectReadOnly && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Projeto concluído: somente o campo de status está liberado para reabertura.
              </p>
            )}

            <fieldset disabled={isProjectReadOnly} className="grid gap-4 disabled:opacity-70">
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
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-description">Descrição</Label>
                <AIAssistButton
                  value={formData.description}
                  onChange={(next) => setFormData({ ...formData, description: next })}
                  context="project_description"
                />
              </div>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descreva o projeto, objetivo e contexto..."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-created-by">Criado por</Label>
              <Input
                id="edit-created-by"
                value={createdByLabel}
                readOnly
                disabled
                className="bg-muted"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-project_type">Tipo do Projeto *</Label>
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
                    <SelectItem value="operacional">Operacional Crítico</SelectItem>
                    <SelectItem value="novos_negocios">Novos Negócios</SelectItem>
                    <SelectItem value="parceria">Parceria</SelectItem>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-start_date">Data de Início *</Label>
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
                <Label htmlFor="edit-due_date">Data de Entrega *</Label>
                <Input
                  id="edit-due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) =>
                    setFormData({ ...formData, due_date: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-actual_start_date">Data de Início Real</Label>
                <Input
                  id="edit-actual_start_date"
                  type="date"
                  value={formData.actual_start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, actual_start_date: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-actual_end_date">Data de Término Real</Label>
                <Input
                  id="edit-actual_end_date"
                  type="date"
                  value={formData.actual_end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, actual_end_date: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
                <Label>Prioridade (GUT) *</Label>
                <GutPriorityField
                  gravity={formData.gravity}
                  urgency={formData.urgency}
                  tendency={formData.tendency}
                  onChange={(v) => {
                    const computed = gutLabel(gutScore(v.gravity, v.urgency, v.tendency));
                    setFormData({
                      ...formData,
                      ...v,
                      priority: computed,
                    });
                  }}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Líder do Projeto *</Label>
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
                Adicione ou remova membros. Novos membros recebem um convite ao salvar.
              </p>

              {team.length > 0 && (
                <div className="space-y-2">
                  {team.map((m) => {
                    const initials = (m.full_name || "?")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((n) => n[0]?.toUpperCase())
                      .join("");
                    return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-border/80 hover:bg-muted/40 transition-colors group"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        {m.avatar_url ? <AvatarImage src={m.avatar_url} alt={m.full_name} /> : null}
                        <AvatarFallback className="text-sm">{initials || "?"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{m.full_name}</span>
                        {m.sector && (
                          <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                            {m.sector}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setTeam((prev) => prev.filter((x) => x.id !== m.id))}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-3 border-t border-border/60">
                <PersonCombobox
                  variant="add"
                  people={profiles.filter((p) => !team.some((t) => t.user_id === p.id))}
                  placeholder="Adicionar membro por nome, setor ou função..."
                  onSelect={(p) => {
                    if (team.some((t) => t.user_id === p.id)) return;
                    setTeam((prev) => [
                      ...prev,
                      {
                        id: `tmp-${p.id}-${Date.now()}`,
                        user_id: p.id,
                        full_name: p.full_name,
                        sector: p.sector ?? null,
                        avatar_url: p.avatar_url || null,
                        invitation_status: "pending",
                        persisted: false,
                      },
                    ]);
                  }}
                />
              </div>
            </div>
            </fieldset>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || isProjectReadOnly}>
              {isLoading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
