'use client';
import { useState, useEffect, useRef } from "react";
import { DateField } from "@/components/ui/date-field";
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
import { cn } from "@/lib/utils";

interface MemberRow {
  id: string; // project_members.id (existing) or temp uuid for pending add
  user_id: string;
  full_name: string;
  sector: string | null;
  avatar_url?: string | null;
  invitation_status: "pending" | "accepted" | "declined";
  persisted: boolean;
  /** Papel na matriz RACI. A coluna já existia em project_members, mas nunca
   *  teve seletor: 56 dos 71 membros ficaram gravados como "I" só porque é o
   *  valor padrão — o sistema achava que ninguém executa e ninguém aprova. */
  raci: RaciRole | null;
  /** O que a pessoa PODE FAZER — eixo separado do RACI (ver PAPEIS). */
  papel: PapelId;
}

/** R executa · A aprova (só um) · C é consultado · I acompanha. */
type RaciRole = "R" | "A" | "C" | "I";

const RACI_OPCOES: { v: RaciRole; label: string; hint: string }[] = [
  { v: "R", label: "R", hint: "Responsável — executa" },
  { v: "A", label: "A", hint: "Aprova — aval final (só um por projeto)" },
  { v: "C", label: "C", hint: "Consultado — opina antes da decisão" },
  { v: "I", label: "I", hint: "Informado — só acompanha" },
];

/**
 * PERMISSÃO — o outro eixo, que faltava nesta tela.
 *
 * Só a matriz RACI aparecia aqui, e a permissão era decidida em silêncio:
 * todo membro novo era gravado com `can_edit: false, can_move: false`. Quem
 * adicionava alguém à equipe via só as letras R/A/C/I e supunha que aquilo
 * definia acesso — não define. RACI é governança; acesso são as quatro
 * colunas `can_*`.
 *
 * A confusão tinha efeito medido em 18/08/2026: 44 das 50 pessoas rotuladas
 * "I — só acompanha" podiam mexer no projeto, 34 delas com permissão total.
 *
 * `Executar` é o padrão porque é o que "adicionar à equipe" significa na
 * maioria das vezes. O silêncio deixa de significar "sem permissão".
 */
type PapelId = "acompanhar" | "executar" | "coordenar";

const PAPEIS: { id: PapelId; nome: string; hint: string; perms: Record<string, boolean> }[] = [
  { id: "acompanhar", nome: "Acompanhar", hint: "lê e comenta",
    perms: { can_create: false, can_edit: false, can_delete: false, can_move: false } },
  { id: "executar", nome: "Executar", hint: "cria, edita e move atividades",
    perms: { can_create: true, can_edit: true, can_delete: false, can_move: true } },
  { id: "coordenar", nome: "Coordenar", hint: "tudo isso e mais excluir",
    perms: { can_create: true, can_edit: true, can_delete: true, can_move: true } },
];

const PAPEL_PADRAO: PapelId = "executar";

/** Das quatro colunas para o papel — para a tela abrir mostrando o que vale. */
const papelDePermissoes = (p: {
  can_create?: boolean | null; can_edit?: boolean | null;
  can_delete?: boolean | null; can_move?: boolean | null;
}): PapelId => {
  if (p.can_delete) return "coordenar";
  if (p.can_edit || p.can_move) return "executar";
  return "acompanhar";
};

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
  // Âncoras dos campos de cargo: o "Trocar" da linha de Líder/Gestor na equipe
  // leva até o campo que realmente define o papel, em vez de duplicar o
  // seletor em dois lugares da mesma tela.
  const ownerFieldRef = useRef<HTMLDivElement>(null);
  const managerFieldRef = useRef<HTMLDivElement>(null);
  const focusRoleField = (role: "Líder" | "Gestor") => {
    const el = (role === "Líder" ? ownerFieldRef : managerFieldRef).current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // ABRE o seletor, não só foca: focar o gatilho destacava o campo mas não
    // mostrava lista nenhuma — parecia que "Trocar" não fazia nada. O clique
    // espera o scroll suave terminar, para o popover ancorar no lugar certo.
    window.setTimeout(() => el.querySelector("button")?.click(), 320);
  };

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

  /**
   * Define o papel RACI de um membro.
   *
   * Regra do A único: é o consenso mais forte da literatura de RACI — dois
   * aprovadores significa nenhum decidindo. Marcar um novo A rebaixa o
   * anterior a C (Consultado), que é o papel mais próximo de quem antes
   * aprovava: continua opinando, mas não dá o aval final.
   */
  const definirRaci = (memberId: string, papel: RaciRole | null) => {
    setTeam((prev) => {
      const anteriorA = papel === "A" ? prev.find((m) => m.raci === "A" && m.id !== memberId) : null;
      if (anteriorA) {
        toast({
          title: "Aprovador substituído",
          description: `${anteriorA.full_name} passou a Consultado — só uma pessoa aprova por projeto.`,
        });
      }
      return prev.map((m) => {
        if (m.id === memberId) return { ...m, raci: papel };
        if (papel === "A" && m.raci === "A") return { ...m, raci: "C" as RaciRole };
        return m;
      });
    });
  };

  /** Troca o que a pessoa pode fazer. Eixo separado do RACI, de propósito. */
  const definirPapel = (memberId: string, papel: PapelId) => {
    setTeam((prev) => prev.map((m) => (m.id === memberId ? { ...m, papel } : m)));
  };

  // Carrega equipe atual do projeto ao abrir
  useEffect(() => {
    const loadTeam = async () => {
      if (!project?.id || !open) return;
      const { data: members } = await supabase
        .from("project_members")
        .select("id, user_id, invitation_status, raci, can_create, can_edit, can_delete, can_move")
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
            // "I" gravado por default não é escolha de ninguém — trata como
            // não definido, para a matriz começar honesta em vez de mentir
            // que todo mundo é Informado.
            raci: (m.raci === "R" || m.raci === "A" || m.raci === "C" ? m.raci : null) as RaciRole | null,
            papel: papelDePermissoes(m),
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
    if (!formData.sector.trim()) missingRequiredFields.push("Setor de Origem");

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
      // Omitir vazio protege contra apagar coluna que talvez nem exista neste
      // ambiente (o payload estendido é tolerante a schema desatualizado).
      const assignOptional = (key: string, value: unknown) => {
        if (value === null || value === undefined) return;
        if (typeof value === "string" && value.trim() === "") return;
        extendedUpdatePayload[key] = value;
      };
      // ...mas para campo de PESSOA, "vazio" é uma escolha do usuário: ele
      // limpou o Gestor de propósito. Com assignOptional, o campo saía do
      // UPDATE e o gestor antigo continuava gravado — remover não removia.
      const assignPerson = (key: string, value: string) => {
        extendedUpdatePayload[key] = value.trim() === "" ? null : value;
      };

      assignOptional("gravity", formData.gravity);
      assignOptional("urgency", formData.urgency);
      assignOptional("tendency", formData.tendency);
      assignOptional("category", formData.category);
      assignOptional("program", formData.program);
      assignOptional("actual_start_date", formData.actual_start_date);
      assignOptional("actual_end_date", formData.actual_end_date);
      assignPerson("sponsor", formData.sponsor);
      assignPerson("manager", formData.manager);
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

        // Líder e Gestor são membros com acesso total pelo cargo que ocupam —
        // nunca podem ser removidos pela sincronização da equipe.
        const leaderId = profiles.find((p) => p.full_name === formData.owner)?.id ?? null;
        const managerId = profiles.find((p) => p.full_name === formData.manager)?.id ?? null;
        const responsibleIds = new Set([leaderId, managerId].filter(Boolean) as string[]);

        const keptIds = new Set(team.filter((m) => m.persisted).map((m) => m.id));
        // Remove os que foram retirados na UI (exceto Líder/Gestor atuais)
        const toRemove = (existingMembers || []).filter(
          (m: any) => !keptIds.has(m.id) && !responsibleIds.has(m.user_id),
        );
        if (toRemove.length > 0) {
          const { error: removeError } = await supabase
            .from("project_members")
            .delete()
            .in("id", toRemove.map((m: any) => m.id));
          if (removeError) {
            throw removeError;
          }
        }

        // Líder/Gestor que ainda não são membros entram com ACESSO TOTAL.
        // Antes ficavam só no texto projects.owner/manager: quem era promovido
        // a Líder não aparecia na equipe nem herdava permissão do cargo.
        const removedIds = new Set(toRemove.map((m: { id: string }) => m.id));
        const currentMemberIds = new Set(
          (existingMembers || [])
            .filter((m) => !removedIds.has(m.id))
            .map((m) => m.user_id as string),
        );
        const missingResponsibles = Array.from(responsibleIds).filter((uid) => !currentMemberIds.has(uid));
        if (missingResponsibles.length > 0) {
          const { error: respErr } = await supabase.from("project_members").insert(
            // Aqui "accepted" é CORRETO, ao contrário dos demais membros: quem
            // é designado Líder ou Gestor não está sendo convidado a
            // participar — foi nomeado ao cargo e já responde pelo projeto.
            // Deixar pendente permitiria "recusar" um cargo já atribuído.
            missingResponsibles.map((uid) => ({
              project_id: project.id,
              user_id: uid,
              invitation_status: "accepted" as const,
              responded_at: new Date().toISOString(),
              invited_by: user?.id ?? null,
              can_create: true,
              can_edit: true,
              can_delete: true,
              can_move: true,
            })),
          );
          if (respErr) throw respErr;
        }

        // As permissões ficavam ZERADAS aqui, com a justificativa de que "a
        // edição vem do papel de participante/responsável da atividade (RLS)".
        // A RLS não dispensa `can_edit` — ela exige `can_edit` OU vínculo com
        // a atividade. Quem entrava na equipe sem ser responsável por nada não
        // passava em nenhuma das duas vias.
        //
        // Medido em 18/08/2026: das 1.258 edições que a tela permitia, o banco
        // recusava 1.089 (86,6%), atingindo 7 pessoas. Agora a permissão é
        // escolhida na tela, e o padrão é `Executar`.
        // Insere novos (sem repetir quem já entrou como Líder/Gestor)
        const newOnes = team.filter((m) => !m.persisted && !responsibleIds.has(m.user_id));
        if (newOnes.length > 0) {
          // O membro entra como CONVIDADO, não como aceito. Antes gravava
          // invitation_status="accepted" com responded_at preenchido: o sistema
          // registrava que a pessoa respondeu sem ela ter respondido, enquanto
          // a própria tela prometia "novos membros recebem um convite".
          // O aceite existe e funciona — vem da notificação, pela RPC
          // respond_project_invite_v2 (ver NotificationBell).
          const rows = newOnes.map((m) => ({
            project_id: project.id,
            user_id: m.user_id,
            sector: m.sector,
            invitation_status: "pending" as const,
            invited_at: new Date().toISOString(),
            invited_by: user?.id ?? null,
            ...(PAPEIS.find((p) => p.id === m.papel) ?? PAPEIS.find((p) => p.id === PAPEL_PADRAO)!).perms,
            raci: m.raci,
          }));
          const { error: memErr } = await supabase.from("project_members").insert(rows);
          if (memErr) {
            throw memErr;
          }

          // A notificação é o convite: é por ela que a pessoa aceita ou recusa
          // (NotificationBell → respond_project_invite_v2). Fica junto do
          // insert dos novos membros — sem ela, o membro ficaria "aguardando"
          // para sempre, sem nunca saber que foi convidado.
          const { error: notificationError } = await supabase.from("notifications").insert(
            newOnes.map((m) => ({
              project_id: project.id,
              target_user_id: m.user_id,
              type: "project_invite",
              title: `Convite para o projeto: ${formData.title}`,
              message: `Você foi convidado(a) para participar de "${formData.title}". Aceite ou recuse por aqui.`,
            }))
          );
          if (notificationError) {
            notifySyncError = notificationError.message || "Falha ao enviar notificações.";
          }
        }

        // Permissão e papel RACI de quem JÁ era membro. Vai em UPDATEs
        // separados porque cada linha tem valores diferentes — e falha aqui
        // não pode derrubar o salvamento do projeto, que já foi gravado acima.
        const paraAtualizar = team.filter((m) => m.persisted);
        if (paraAtualizar.length > 0) {
          await Promise.all(
            paraAtualizar.map((m) =>
              supabase
                .from("project_members")
                .update({
                  raci: m.raci,
                  ...(PAPEIS.find((p) => p.id === m.papel) ?? PAPEIS.find((p) => p.id === PAPEL_PADRAO)!).perms,
                })
                .eq("id", m.id),
            ),
          );
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
                <DateField
                  id="edit-start_date"
                  value={formData.start_date}
                  onChange={(v) =>
                    setFormData({ ...formData, start_date: v })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-due_date">Data de Entrega *</Label>
                <DateField
                  id="edit-due_date"
                  value={formData.due_date}
                  onChange={(v) =>
                    setFormData({ ...formData, due_date: v })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-actual_start_date">Data de Início Real</Label>
                <DateField
                  id="edit-actual_start_date"
                  value={formData.actual_start_date}
                  onChange={(v) =>
                    setFormData({ ...formData, actual_start_date: v })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-actual_end_date">Data de Término Real</Label>
                <DateField
                  id="edit-actual_end_date"
                  value={formData.actual_end_date}
                  onChange={(v) =>
                    setFormData({ ...formData, actual_end_date: v })
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
            {/* items-start: as colunas se alinham pelo topo mesmo que uma cresça. */}
            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="grid gap-2 content-start" ref={managerFieldRef}>
                <Label>Gestor do Projeto</Label>
                <PersonCombobox
                  people={profiles}
                  value={profiles.find((p) => p.full_name === formData.manager)?.id ?? null}
                  placeholder="Selecione o gestor"
                  onSelect={(p) => {
                    setFormData({ ...formData, manager: p.full_name });
                    setTeam((prev) => prev.filter((m) => m.user_id !== p.id));
                  }}
                  onClear={() => setFormData({ ...formData, manager: "" })}
                />
              </div>
              <div className="grid gap-2 content-start" ref={ownerFieldRef}>
                <Label>Líder do Projeto *</Label>
                <PersonCombobox
                  people={profiles}
                  value={profiles.find((p) => p.full_name === formData.owner)?.id ?? null}
                  placeholder="Selecione o líder"
                  onSelect={(p) => {
                    setFormData({
                      ...formData,
                      owner: p.full_name,
                      sector: formData.sector || p.sector || "",
                    });
                    // Promovido a Líder sai da equipe: entra com acesso total.
                    setTeam((prev) => prev.filter((m) => m.user_id !== p.id));
                  }}
                  onClear={() => setFormData({ ...formData, owner: "" })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Setor de Origem *</Label>
              <SearchSelect
                options={sectors.map((s) => ({ value: s.name, label: s.name }))}
                value={formData.sector || null}
                onSelect={(v) => setFormData({ ...formData, sector: v })}
                onClear={() => setFormData({ ...formData, sector: "" })}
                placeholder="Selecione o setor"
                searchPlaceholder="Buscar setor..."
                emptyText="Nenhum setor encontrado."
              />
              <p className="text-[11px] text-muted-foreground">Setor de onde o projeto se origina. Pode ser diferente do setor do líder.</p>
            </div>

            {/* Equipe do Projeto */}
            <div className="grid gap-2 rounded-lg border border-dashed border-border p-3">
              <Label className="text-sm font-semibold">Equipe do Projeto</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Adicione ou remova membros. Novos membros recebem um convite ao salvar.
              </p>

              {/* Líder e Gestor: membros por CARGO, com acesso total. Aparecem
                  aqui para o time ficar visível num lugar só; para trocá-los,
                  usa-se o campo acima (não o X da lista). */}
              {(() => {
                const roleRows = [
                  { role: "Gestor", name: formData.manager },
                  { role: "Líder", name: formData.owner },
                ].filter((r) => !!r.name);
                if (roleRows.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    {roleRows.map((r) => {
                      const p = profiles.find((x) => x.full_name === r.name);
                      return (
                        <div key={r.role} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/25">
                          <Avatar className="h-6 w-6 shrink-0">
                            {p?.avatar_url ? <AvatarImage src={p.avatar_url} alt={r.name} /> : null}
                            <AvatarFallback className="text-[9px]">
                              {r.name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                            <span className="text-sm font-medium truncate">{r.name}</span>
                            {p?.sector && <span className="text-[11px] text-muted-foreground truncate shrink-0">· {p.sector}</span>}
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5 shrink-0">
                            {r.role}
                          </span>
                          {/* O X de remover não serve aqui (deixaria o projeto
                              sem responsável em silêncio) — mas sem nada a linha
                              parecia travada. "Trocar" leva ao campo do cargo. */}
                          <button
                            type="button"
                            onClick={() => focusRoleField(r.role as "Líder" | "Gestor")}
                            title={`Trocar o ${r.role} no campo acima`}
                            className="text-[11px] font-medium text-primary hover:underline shrink-0 px-1"
                          >
                            Trocar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {team.length > 0 && (
                <div className="space-y-2">
                  {/* Quem é Líder/Gestor já aparece no bloco de cargos acima —
                      sai daqui para não constar duas vezes na mesma equipe. */}
                  {team.filter((m) => m.full_name !== formData.owner && m.full_name !== formData.manager).map((m) => {
                    const initials = (m.full_name || "?")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((n) => n[0]?.toUpperCase())
                      .join("");
                    return (
                    <div
                      key={m.id}
                      className="flex flex-col gap-2 px-2 py-2 rounded-md border border-border hover:border-border/80 hover:bg-muted/40 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6 shrink-0">
                        {m.avatar_url ? <AvatarImage src={m.avatar_url} alt={m.full_name} /> : null}
                        <AvatarFallback className="text-[9px]">{initials || "?"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{m.full_name}</span>
                        {m.sector && (
                          <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                            {m.sector}
                          </span>
                        )}
                        {/* Situação do convite. Sem isto o "aguardando" seria
                            invisível: a lista mostrava todo mundo igual, como
                            se já tivesse aceitado. */}
                        {m.invitation_status !== "accepted" && (
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                            m.invitation_status === "declined"
                              ? "bg-destructive/10 text-destructive border-destructive/30"
                              : "bg-warning/10 text-warning border-warning/30",
                          )}>
                            {m.invitation_status === "declined" ? "Recusou" : "Aguardando aceite"}
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

                    {/* OS DOIS EIXOS, rotulados e separados.
                        Antes só a matriz RACI aparecia nesta linha, e a
                        permissão era decidida em silêncio (todo mundo entrava
                        com can_edit=false). Quem via as letras R/A/C/I supunha
                        que aquilo definia acesso — não define. Agora a tela faz
                        as duas perguntas, com o nome de cada uma. */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-8">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-[68px] shrink-0">
                          Pode fazer
                        </span>
                        <div className="flex rounded-md border border-border overflow-hidden">
                          {PAPEIS.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              title={p.hint}
                              onClick={() => definirPapel(m.id, p.id)}
                              className={cn(
                                "px-2.5 py-1 text-[11px] transition-colors border-r border-border last:border-r-0",
                                m.papel === p.id
                                  ? "bg-primary text-primary-foreground font-semibold"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              {p.nome}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Matriz RACI — quem executa, aprova, é consultado ou
                          só acompanha. Clicar no papel já marcado desmarca.
                          É RÓTULO de governança: não concede nem tira acesso.
                          Hoje sua única consequência é sugerir o aprovador do
                          TAP (quem é "A"). */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-[68px] shrink-0">
                          No projeto
                        </span>
                        <div className="flex items-center gap-0.5">
                          {RACI_OPCOES.map((op) => {
                            const ativo = m.raci === op.v;
                            return (
                              <button
                                key={op.v}
                                type="button"
                                title={op.hint}
                                onClick={() => definirRaci(m.id, ativo ? null : op.v)}
                                className={cn(
                                  "w-7 h-7 rounded text-[11px] font-bold transition-colors",
                                  ativo
                                    ? op.v === "A"
                                      ? "bg-success/15 text-success ring-1 ring-success/40"
                                      : "bg-primary/10 text-primary ring-1 ring-primary/40"
                                    : "text-muted-foreground/50 hover:bg-muted hover:text-foreground",
                                )}
                              >
                                {op.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-3 border-t border-border/60">
                <PersonCombobox
                  variant="add"
                  people={profiles.filter(
                    (p) =>
                      !team.some((t) => t.user_id === p.id) &&
                      p.full_name !== formData.owner &&
                      p.full_name !== formData.manager,
                  )}
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
                        // Entra sem papel RACI: quem adiciona decide na matriz.
                        raci: null,
                        // Mas COM permissão: "adicionar à equipe" quer dizer
                        // que a pessoa vai trabalhar no projeto. O silêncio
                        // não deve significar "sem acesso".
                        papel: PAPEL_PADRAO,
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
