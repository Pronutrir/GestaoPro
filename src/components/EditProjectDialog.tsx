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
import { GutPriorityField } from "@/components/GutPriorityField";
import { UserPlus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface MemberRow {
  id: string; // project_members.id (existing) or temp uuid for pending add
  user_id: string;
  full_name: string;
  sector: string | null;
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
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string; sector: string | null }[]>([]);
  const [team, setTeam] = useState<MemberRow[]>([]);
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
        ? await supabase.from("profiles").select("id, full_name, sector").in("id", ids)
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
            invitation_status: (m.invitation_status as MemberRow["invitation_status"]) || "pending",
            persisted: true,
          };
        })
      );
      setPickedUserId("");
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
    sponsor: "",
    manager: "",
    objective: "",
    problem_statement: "",
    root_cause: "",
  });

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
        sponsor: (project as any).sponsor || "",
        manager: (project as any).manager || "",
        objective: (project as any).objective || "",
        problem_statement: (project as any).problem_statement || "",
        root_cause: (project as any).root_cause || "",
      });
    }
  }, [project, open]);

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
          gravity: formData.gravity,
          urgency: formData.urgency,
          tendency: formData.tendency,
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

      // Sincroniza equipe (project_members)
      const { data: existingMembers } = await supabase
        .from("project_members")
        .select("id, user_id")
        .eq("project_id", project.id);
      const existingIds = new Set((existingMembers || []).map((m: any) => m.id));
      const keptIds = new Set(team.filter((m) => m.persisted).map((m) => m.id));
      // Remove os que foram retirados na UI
      const toRemove = (existingMembers || []).filter((m: any) => !keptIds.has(m.id));
      if (toRemove.length > 0) {
        await supabase.from("project_members").delete().in("id", toRemove.map((m: any) => m.id));
      }
      // Atualiza RACI dos persistidos (caso tenha mudado)
      for (const m of team.filter((t) => t.persisted)) {
        await supabase
          .from("project_members")
          .update({
            raci: null,
            project_role: "contributor",
            can_create: true,
            can_edit: false,
            can_delete: false,
            can_move: false,
          })
          .eq("id", m.id);
      }
      // Insere novos
      const newOnes = team.filter((m) => !m.persisted);
      if (newOnes.length > 0) {
        const rows = newOnes.map((m) => ({
          project_id: project.id,
          user_id: m.user_id,
          sector: m.sector,
          raci: null,
          project_role: "contributor" as const,
          invitation_status: "pending" as const,
          invited_by: user?.id ?? null,
          can_create: true,
          can_edit: false,
          can_delete: false,
          can_move: false,
        }));
        const { error: memErr } = await supabase
          .from("project_members")
          .upsert(rows, { onConflict: "project_id,user_id", ignoreDuplicates: false });
        if (memErr) throw new Error(`Erro ao salvar equipe: ${memErr.message}`);
        await supabase.from("notifications").insert(
          newOnes.map((m) => ({
            project_id: project.id,
            target_user_id: m.user_id,
            type: "project_invite",
            title: `Convite para o projeto: ${formData.title}`,
            message: `Você foi convidado(a) para participar do projeto "${formData.title}". Aceita participar?`,
          }))
        );
      }

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
                    {formData.owner && !profiles.some((p) => p.full_name === formData.owner) && (
                      <SelectItem value={formData.owner}>{formData.owner}</SelectItem>
                    )}
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

            {/* Equipe do Projeto */}
            <div className="grid gap-2 rounded-lg border border-dashed border-border p-3">
              <Label className="text-sm font-semibold">Equipe do Projeto</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Adicione ou remova membros. Entrar na equipe concede acesso ao projeto e permissão para criar atividades.
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
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        {initials || "?"}
                      </div>
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

              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-border/60">
                <Select value={pickedUserId} onValueChange={setPickedUserId}>
                  <SelectTrigger className="h-9 text-sm flex-1">
                    <SelectValue placeholder="Selecionar membro..." />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles
                      .filter((p) => !team.some((t) => t.user_id === p.id))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name}{p.sector ? ` — ${p.sector}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={!pickedUserId}
                  onClick={() => {
                    if (!pickedUserId) return;
                    const p = profiles.find((x) => x.id === pickedUserId);
                    if (!p) return;
                    setTeam((prev) => [
                      ...prev,
                      {
                        id: `tmp-${p.id}-${Date.now()}`,
                        user_id: p.id,
                        full_name: p.full_name,
                        sector: p.sector,
                        invitation_status: "pending",
                        persisted: false,
                      },
                    ]);
                    setPickedUserId("");
                  }}
                >
                  <UserPlus className="w-4 h-4" /> Adicionar
                </Button>
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
