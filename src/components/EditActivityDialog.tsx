'use client';
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Calendar, Clock, DollarSign, Layers, Tag, X, Flag, Plus, Trash2, CheckCircle2, Circle, ArrowRightLeft, Pencil, Diamond, ArrowRight, Link2 } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cascadeDates } from "@/lib/criticalPath";
import { endVariance, varianceTone, varianceClasses, formatVariance } from "@/lib/dateVariance";
import { AuditLogPanel } from "@/components/AuditLogPanel";
import { ActivityAttachments } from "@/components/ActivityAttachments";
import { ActivityComments } from "@/components/ActivityComments";
import { TaskRelations } from "@/components/TaskRelations";
import { useTaskBlockers } from "@/hooks/useTaskBlockers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GutPriorityField } from "@/components/GutPriorityField";
import { GUT_META, normalizeGut, type GutLevel } from "@/lib/gutPriority";
import { History, ChevronDown, Hash, Copy, UserCircle, Lock, AlertOctagon } from "lucide-react";
import { BookOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { UserPlus2 } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { AIAssistButton } from "@/components/AIAssistButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ActivityRelationsInline } from "@/components/ActivityRelationsInline";
import { MessageSquare, Paperclip, ListTree, FileText, Users } from "lucide-react";
import { ActivityStoriesPanel } from "@/components/ActivityStoriesPanel";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Linha de propriedade densa (ícone + label cinza + valor) usada no painel ClickUp-like. */
const PropertyRow = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 min-h-[32px] py-1">
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 w-[110px] pt-1">
      <span className="text-muted-foreground/70">{icon}</span>
      {label}
    </span>
    <div className="flex-1 min-w-0 flex items-center flex-wrap gap-1.5">{children}</div>
  </div>
);

interface Activity {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at?: string;
  closed_at?: string | null;
  created_by_email?: string | null;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  baseline_start_date?: string | null;
  baseline_end_date?: string | null;
  cost: number;
  hours: number;
  phase_id: string | null;
  priority?: string;
  tags?: string[];
  parent_id?: string | null;
  workflow_stage_id?: string | null;
  last_progress_stage_id?: string | null;
}

interface Phase {
  id: string;
  title: string;
}

interface EditActivityDialogProps {
  activity: Activity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivityUpdated: () => void;
  phases?: Phase[];
  allActivities?: Activity[];
  projectId?: string;
  isQualityProject?: boolean;
  initialTab?: "details" | "subtasks" | "attachments" | "comments" | "stories" | "history";
  /** When true, opens in create mode: inserts a draft activity on open and lets user fill all fields with full feature parity. */
  createMode?: boolean;
  defaultStageId?: string | null;
  defaultPhaseId?: string | null;
  defaultParentId?: string | null;
  onActivityCreated?: (activityId: string) => void;
  /** When set, shows a breadcrumb back to the parent activity (used when editing a sub-activity). */
  parentActivityTitle?: string;
  /** Called when user clicks the "Back" arrow — used to close only the nested dialog and return to parent. */
  onBackToParent?: () => void;
}

/** Parse hours as decimal from "Xh Ym" or plain number */
function parseHoursInput(val: string): number {
  const hm = val.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60;
  const hOnly = val.match(/^(\d+(?:\.\d+)?)\s*h?$/i);
  if (hOnly) return parseFloat(hOnly[1]);
  const mOnly = val.match(/^(\d+)\s*m$/i);
  if (mOnly) return parseInt(mOnly[1]) / 60;
  return parseFloat(val) || 0;
}

/** Format decimal hours to "Xh Ym" */
function formatHoursDisplay(hours: number): string {
  if (!hours) return "";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "0h";
}

export const EditActivityDialog = ({
  activity, open, onOpenChange, onActivityUpdated,
  phases = [], allActivities = [], projectId, isQualityProject = false,
  initialTab = "details",
  createMode = false, defaultStageId = null, defaultPhaseId = null, defaultParentId = null,
  onActivityCreated,
  parentActivityTitle, onBackToParent,
}: EditActivityDialogProps) => {
  const { toast } = useToast();
  const [draftActivity, setDraftActivity] = useState<Activity | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const effectiveActivity = createMode ? draftActivity : activity;
  const { blockers, isBlocked: isBlockedByOthers } = useTaskBlockers(effectiveActivity?.id);
  const [formData, setFormData] = useState({
    title: "", description: "", assigned_to: "",
    start_date: "", end_date: "", cost: "", hours: "",
    phase_id: "", priority: "pendente",
    gravity: null as number | null,
    urgency: null as number | null,
    tendency: null as number | null,
    tags: [] as string[], parent_id: "",
    story_points: "0",
    participants: [] as string[],
    deadline_flag: "" as string,
    last_update_date: "",
    ui_color_tag: "" as string,
    is_milestone: false,
    item_type: "tarefa" as "fase" | "tarefa",
    progress_flag: 0 as number,
    wbs_code: "" as string,
  });
  const [newTag, setNewTag] = useState("");
  const [newSubTitle, setNewSubTitle] = useState("");
  const [subActivities, setSubActivities] = useState<Activity[]>([]);
  const [editingSubActivity, setEditingSubActivity] = useState<Activity | null>(null);
  const [editingSubOpen, setEditingSubOpen] = useState(false);
  const [members, setMembers] = useState<{ full_name: string; sector: string | null }[]>([]);
  const [allProfiles, setAllProfiles] = useState<{ full_name: string; sector: string | null }[]>([]);
  const [workflowStages, setWorkflowStages] = useState<{ id: string; title: string; color: string; display_order: number; is_final: boolean }[]>([]);
  const [currentStageId, setCurrentStageId] = useState("");
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [storiesCount, setStoriesCount] = useState<number>(0);
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null);
  const [lastEditorName, setLastEditorName] = useState<string | null>(null);
  const [lastEditorEmail, setLastEditorEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "subtasks" | "attachments" | "comments" | "stories" | "history">(initialTab);

  // Divergências pai vs subatividades (alerta apenas, sem bloqueio)
  const subHoursTotal = subActivities.reduce((sum, s) => sum + (Number((s as any).hours) || 0), 0);
  const parentHoursNum = parseHoursInput(formData.hours);
  const hoursDivergence =
    subActivities.length > 0 &&
    parentHoursNum > 0 &&
    Math.abs(parentHoursNum - subHoursTotal) > 0.01;

  // Horas consumidas (consolidado pai + subs, evitando duplicidade)
  const subsConsumed = subActivities
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + (Number((s as any).hours) || 0), 0);
  const ownConsumed = effectiveActivity?.status === "completed" ? parentHoursNum : 0;
  const consumedHours = subActivities.length > 0 ? subsConsumed : ownConsumed;
  const plannedHours = parentHoursNum > 0 ? parentHoursNum : subHoursTotal;

  const subStartDates = subActivities.map((s) => s.start_date).filter(Boolean) as string[];
  const subEndDates = subActivities.map((s) => s.end_date).filter(Boolean) as string[];
  const minSubStart = subStartDates.length ? subStartDates.slice().sort()[0] : null;
  const maxSubEnd = subEndDates.length ? subEndDates.slice().sort().pop()! : null;
  const startDivergence =
    !!minSubStart && !!formData.start_date && minSubStart < formData.start_date;
  const endDivergence =
    !!maxSubEnd && !!formData.end_date && maxSubEnd > formData.end_date;

  // Colunas opcionais na tabela de sub-atividades (todas selecionáveis; persistido por usuário no localStorage)
  const SUB_COLS_KEY = "subActivityCols.v2";
  const ALL_COLS: { id: string; label: string; width: string }[] = [
    { id: "assigned_to", label: "Resp.", width: "72px" },
    { id: "priority", label: "Prio.", width: "56px" },
    { id: "end_date", label: "Vencimento", width: "84px" },
    { id: "start_date", label: "Início", width: "84px" },
    { id: "hours", label: "Horas", width: "64px" },
    { id: "cost", label: "Custo", width: "84px" },
    { id: "story_points", label: "Pontos", width: "56px" },
    { id: "status", label: "Status", width: "96px" },
    { id: "tags", label: "Etiquetas", width: "120px" },
    { id: "id_short", label: "ID", width: "72px" },
  ];
  const DEFAULT_COLS = ["assigned_to", "priority", "end_date"];
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COLS;
    try {
      const stored = localStorage.getItem(SUB_COLS_KEY);
      if (!stored) return DEFAULT_COLS;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_COLS;
      return parsed;
    } catch {
      return DEFAULT_COLS;
    }
  });
  const toggleCol = (id: string) => {
    setVisibleCols((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      try {
        localStorage.setItem(SUB_COLS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  // grid-template-columns dinâmico: [check][nome][...colunas][ações]
  const subGridTemplate = `24px minmax(140px,1fr) ${ALL_COLS
    .filter((c) => visibleCols.includes(c.id))
    .map((c) => c.width)
    .join(" ")} 28px`;

  useEffect(() => {
    if (!open) return;
    // Create a draft activity when opening in create mode
    if (createMode && !draftActivity && !creatingDraft && projectId) {
      setCreatingDraft(true);
      const draftId = crypto.randomUUID();
      const insertPayload: any = {
        id: draftId,
        project_id: projectId,
        title: "Nova atividade",
        status: "pending",
        priority: "medium",
        workflow_stage_id: defaultStageId || null,
        phase_id: defaultPhaseId || null,
        parent_id: defaultParentId || null,
      };
      supabase.from("activities").insert(insertPayload).then(({ error }) => {
        setCreatingDraft(false);
        if (error) {
          console.error("Erro ao iniciar rascunho de atividade:", error);
          toast({ title: "Erro ao iniciar nova atividade", variant: "destructive" });
          onOpenChange(false);
          return;
        }
        setDraftActivity({
          id: draftId,
          project_id: projectId,
          title: "Nova atividade",
          description: null,
          status: "pending",
          completed_at: null,
          created_at: new Date().toISOString(),
          assigned_to: null,
          start_date: null,
          end_date: null,
          cost: 0,
          hours: 0,
          phase_id: defaultPhaseId || null,
          priority: "medium",
          tags: [],
          parent_id: defaultParentId || null,
          workflow_stage_id: defaultStageId || null,
        } as Activity & { project_id: string; workflow_stage_id: string | null });
        onActivityCreated?.(draftId);
        // Pre-fill title empty so user types fresh
        setFormData((prev) => ({ ...prev, title: "" }));
      });
    }

    // Fetch all active profiles for participants dropdown
    supabase.from("profiles").select("full_name, sector").eq("is_active", true).then(({ data }) => {
      if (data) setAllProfiles(data.filter(p => p.full_name));
    });

    // Resolve creator's full name from email
    const act = createMode ? draftActivity : activity;
    if (act?.created_by_email) {
      supabase.from("profiles").select("full_name").eq("email", act.created_by_email).maybeSingle().then(({ data }) => {
        setCreatorName(data?.full_name || null);
      });
      setCreatorEmail(act.created_by_email);
    } else {
      setCreatorName(null);
      setCreatorEmail(null);
    }

    // Fallback / additional metadata via audit log: original creator + last editor
    if (act?.id && !createMode) {
      supabase
        .from("audit_log")
        .select("operation, changed_by_email, created_at")
        .eq("table_name", "activities")
        .eq("record_id", act.id)
        .order("created_at", { ascending: true })
        .then(async ({ data }) => {
          if (!data || data.length === 0) {
            setLastEditorName(null);
            setLastEditorEmail(null);
            return;
          }
          const insertEntry = data.find((e: any) => e.operation === "INSERT");
          const updates = data.filter((e: any) => e.operation === "UPDATE");
          const lastUpdate = updates[updates.length - 1];

          // Backfill creator if missing on the row
          if (!act.created_by_email && insertEntry?.changed_by_email) {
            setCreatorEmail(insertEntry.changed_by_email);
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("email", insertEntry.changed_by_email)
              .maybeSingle();
            setCreatorName(prof?.full_name || null);
          }

          if (lastUpdate?.changed_by_email) {
            setLastEditorEmail(lastUpdate.changed_by_email);
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("email", lastUpdate.changed_by_email)
              .maybeSingle();
            setLastEditorName(prof?.full_name || null);
          } else {
            setLastEditorEmail(null);
            setLastEditorName(null);
          }
        });
    } else {
      setLastEditorEmail(null);
      setLastEditorName(null);
    }

    // Count linked user stories
    if (act?.id) {
      supabase
        .from("user_stories")
        .select("id", { count: "exact", head: true })
        .eq("activity_id", act.id)
        .then(({ count }) => setStoriesCount(count || 0));
    } else {
      setStoriesCount(0);
    }

    if (projectId) {
      // Always refetch workflow stages when dialog opens (catches newly created columns)
      supabase.from("workflow_stages").select("id, title, color, display_order, is_final")
        .eq("project_id", projectId).order("display_order").then(({ data }) => {
          if (data) setWorkflowStages(data);
        });

      supabase.from("project_members").select("user_id").eq("project_id", projectId).then(({ data: memberData }) => {
        if (memberData && memberData.length > 0) {
          const userIds = memberData.map(m => m.user_id);
          supabase.from("profiles").select("full_name, sector").in("id", userIds).then(({ data: profiles }) => {
            if (profiles) setMembers(profiles.filter(p => p.full_name));
          });
        }
      });
    }
  }, [projectId, open, activity?.id, createMode]);

  useEffect(() => {
    const act = createMode ? draftActivity : activity;
    if (act) {
      setFormData({
        title: createMode ? "" : (act.title || ""),
        description: act.description || "",
        assigned_to: act.assigned_to || "",
        start_date: act.start_date || "",
        end_date: act.end_date || "",
        cost: act.cost?.toString() || "0",
        hours: formatHoursDisplay(act.hours || 0),
        phase_id: act.phase_id || "",
        priority: act.priority || "pendente",
        gravity: (act as any).gravity ?? null,
        urgency: (act as any).urgency ?? null,
        tendency: (act as any).tendency ?? null,
        tags: act.tags || [],
        parent_id: act.parent_id || "",
        story_points: (act as any).story_points?.toString() || "0",
        participants: (act as any).participants || [],
        deadline_flag: (act as any).deadline_flag || "",
        last_update_date: (act as any).last_update_date || "",
        ui_color_tag: (act as any).ui_color_tag || "",
        is_milestone: !!(act as any).is_milestone,
        item_type: ((act as any).item_type === "fase" ? "fase" : "tarefa"),
        progress_flag: typeof (act as any).progress_flag === "number" ? (act as any).progress_flag : 0,
        wbs_code: (act as any).wbs_code || "",
      });
      setCurrentStageId((act as any).workflow_stage_id || "");
      fetchSubActivities(act.id);
    }
  }, [activity, draftActivity, createMode]);

  

  const fetchSubActivities = async (parentId: string) => {
    const { data } = await (supabase.from("activities").select("*") as any)
      .eq("parent_id", parentId)
      .eq("is_trashed", false)
      .order("display_order");
    if (data) setSubActivities(data as Activity[]);
  };

  const handleAddSubActivity = async () => {
    const act = effectiveActivity;
    if (!newSubTitle.trim() || !act || !projectId) return;
    await supabase.from("activities").insert({
      project_id: projectId, title: newSubTitle.trim(),
      phase_id: act.phase_id, parent_id: act.id,
      workflow_stage_id: (act as any).workflow_stage_id || null,
      display_order: subActivities.length,
    });
    setNewSubTitle("");
    fetchSubActivities(act.id);
    onActivityUpdated();
  };

  const handleDeleteSubActivity = async (subId: string) => {
    await supabase.from("activities").delete().eq("id", subId);
    if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
    onActivityUpdated();
  };

  const handleToggleSubActivity = async (sub: Activity) => {
    const newStatus = sub.status === "completed" ? "pending" : "completed";
    const finalStage = workflowStages.find((stage) => stage.is_final);
    const backlogStage = workflowStages.find((stage) => stage.display_order === 0) || workflowStages[0];
    const currentStageId = sub.workflow_stage_id || null;
    const reopenStageId =
      sub.last_progress_stage_id ||
      (currentStageId && currentStageId !== finalStage?.id ? currentStageId : null) ||
      backlogStage?.id ||
      null;
    const updateData: any = {
      status: newStatus,
      completed_at: newStatus === "completed" ? new Date().toISOString() : null,
    };
    if (newStatus === "completed") {
      if (finalStage?.id) {
        updateData.workflow_stage_id = finalStage.id;
      }
      if (currentStageId && currentStageId !== finalStage?.id) {
        updateData.last_progress_stage_id = currentStageId;
      }
    } else if (reopenStageId) {
      updateData.workflow_stage_id = reopenStageId;
    }

    // Atualização otimista no estado local para feedback imediato
    setSubActivities((prev) =>
      prev.map((s) =>
        s.id === sub.id
          ? ({
              ...s,
              status: newStatus,
              completed_at: updateData.completed_at,
              workflow_stage_id: updateData.workflow_stage_id ?? s.workflow_stage_id ?? null,
              last_progress_stage_id: updateData.last_progress_stage_id ?? s.last_progress_stage_id ?? null,
            } as Activity)
          : s
      )
    );
    const { error: subErr } = await supabase
      .from("activities")
      .update(updateData)
      .eq("id", sub.id);
    if (subErr) {
      console.error("[handleToggleSubActivity] erro ao atualizar subatividade:", subErr);
      toast({
        title: "Não foi possível atualizar a subatividade",
        description: subErr.message || "Verifique suas permissões no projeto.",
        variant: "destructive",
      });
      // Reverte a atualização otimista
      if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
      return;
    }

    // Propagação para a atividade-pai (regra B):
    const parent = effectiveActivity;
    if (parent && projectId) {
      // Busca todas as subs ATUAIS do pai (já com a alteração aplicada acima)
      const { data: siblings } = await (supabase.from("activities").select("id, status") as any)
        .eq("parent_id", parent.id)
        .eq("is_trashed", false);
      const subs = (siblings || []) as Array<{ id: string; status: string }>;

      if (subs.length > 0) {
        const allDone = subs.every((s) => s.status === "completed");

        if (newStatus === "completed" && allDone && parent.status !== "completed") {
          // Todas concluídas → move o pai para "Final" e marca completed
          const parentUpdate: any = {
            status: "completed",
            completed_at: new Date().toISOString(),
          };
          if (finalStage?.id) parentUpdate.workflow_stage_id = finalStage.id;
          if (parent.workflow_stage_id && parent.workflow_stage_id !== finalStage?.id) {
            parentUpdate.last_progress_stage_id = parent.workflow_stage_id;
          }
          await supabase.from("activities").update(parentUpdate).eq("id", parent.id);
          toast({ title: "Atividade concluída", description: "Todas as subatividades foram concluídas — a atividade-pai foi movida para Final." });
        } else if (newStatus === "pending" && parent.status === "completed") {
          // Reabriu uma sub e o pai estava concluído → reabre o pai
          const parentReopenStageId =
            parent.last_progress_stage_id ||
            (parent.workflow_stage_id && parent.workflow_stage_id !== finalStage?.id ? parent.workflow_stage_id : null) ||
            backlogStage?.id ||
            null;
          await supabase.from("activities").update({
            status: "pending",
            completed_at: null,
            ...(parentReopenStageId ? { workflow_stage_id: parentReopenStageId } : {}),
          }).eq("id", parent.id);
          toast({ title: "Atividade reaberta", description: "Uma subatividade foi reaberta — a atividade-pai voltou para pendente." });
        }
      }
    }

    if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
    onActivityUpdated();
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, newTag.trim()] });
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) });
  };

  const dateRangeInvalid =
    !!formData.start_date &&
    !!formData.end_date &&
    !formData.is_milestone &&
    formData.start_date > formData.end_date;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const act = createMode ? draftActivity : activity;
    if (!act) return;
    if (dateRangeInvalid) {
      toast({
        title: "Datas inconsistentes",
        description: "A data de início é posterior à data de término.",
        variant: "destructive",
      });
      return;
    }
    const previousEndDate = act.end_date;
    try {
      // EAP automática para subatividades sem código manual
      let wbsToSave: string | null = (formData.wbs_code || "").trim() || null;
      const parentId = formData.parent_id || (act as any).parent_id;
      if (!wbsToSave && parentId && projectId) {
        try {
          const { getNextSubWbs } = await import("@/lib/wbsAuto");
          const { data: parent } = await supabase
            .from("activities").select("wbs_code").eq("id", parentId).maybeSingle();
          const parentWbs = (parent as any)?.wbs_code as string | null | undefined;
          if (parentWbs) {
            const { data: siblings } = await supabase
              .from("activities").select("id, wbs_code")
              .eq("project_id", projectId).eq("parent_id", parentId);
            const others = (siblings || []).filter((s: any) => s.id !== act.id).map((s: any) => s.wbs_code);
            wbsToSave = getNextSubWbs(parentWbs, others);
          }
        } catch { /* ignora */ }
      }

      const { error } = await supabase.from("activities").update({
        title: formData.title,
        description: formData.description || null,
        assigned_to: formData.assigned_to || null,
        start_date: formData.start_date || null,
        end_date: formData.is_milestone ? null : (formData.end_date || null),
        cost: parseFloat(formData.cost) || 0,
        hours: parseHoursInput(formData.hours),
        phase_id: formData.phase_id || null,
        gravity: formData.gravity,
        urgency: formData.urgency,
        tendency: formData.tendency,
        tags: formData.tags,
        parent_id: formData.parent_id || null,
        story_points: parseInt(formData.story_points) || 0,
        participants: formData.participants.filter((p) => p && p.trim().length > 0),
        deadline_flag: formData.deadline_flag || null,
        last_update_date: formData.last_update_date || null,
        ui_color_tag: formData.ui_color_tag || null,
        is_milestone: formData.is_milestone,
        item_type: formData.item_type,
        progress_flag: formData.progress_flag ?? 0,
        wbs_code: wbsToSave,
      } as any).eq("id", act.id);
      if (error) throw error;

      // Cascade dates to successors when end_date moved (skip quality projects)
      if (
        !isQualityProject &&
        projectId &&
        formData.end_date &&
        formData.end_date !== previousEndDate
      ) {
        const [{ data: deps }, { data: acts }] = await Promise.all([
          supabase.from("task_dependencies").select("predecessor_id, successor_id, lag_days, dependency_type"),
          supabase.from("activities").select("id, start_date, end_date").eq("project_id", projectId),
        ]);
        const updates = cascadeDates(
          act.id,
          formData.end_date,
          (acts || []) as any,
          (deps || []) as any,
        );
        if (updates.length > 0) {
          await Promise.all(
            updates.map(u =>
              supabase.from("activities")
                .update({ start_date: u.start_date, end_date: u.end_date })
                .eq("id", u.id),
            ),
          );
          toast({ title: `${updates.length} sucessor(es) replanejado(s) automaticamente` });
        }
      }

      toast({ title: createMode ? "Atividade criada!" : "Atividade atualizada!" });
      onActivityUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);
      toast({ title: "Erro ao atualizar atividade", variant: "destructive" });
    }
  };

  const handleClose = async (newOpen: boolean) => {
    if (!newOpen && createMode && draftActivity) {
      // Discard draft if title is still empty (user cancelled without typing)
      if (!formData.title.trim()) {
        await supabase.from("activities").delete().eq("id", draftActivity.id);
        onActivityUpdated();
      }
      setDraftActivity(null);
    }
    onOpenChange(newOpen);
  };

  // Use effective activity (draft when creating, real when editing) in JSX
  const act = effectiveActivity;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="!max-w-[96vw] w-[96vw] h-[95vh] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          {parentActivityTitle && onBackToParent && (
            <button
              type="button"
              onClick={onBackToParent}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mb-2 w-fit"
              title="Voltar para a atividade principal"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="truncate max-w-[480px]">
                Voltar para <span className="font-medium text-foreground">{parentActivityTitle}</span>
              </span>
            </button>
          )}
          <DialogTitle className="text-xl font-bold">
            {createMode ? "Nova Atividade" : parentActivityTitle ? "Editar Sub-atividade" : "Editar Atividade"}
          </DialogTitle>
          {act && !createMode && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <Hash className="w-3 h-3" />
              <button
                type="button"
                className="font-mono hover:text-foreground transition-colors flex items-center gap-1"
                title="Clique para copiar ID completo"
                onClick={() => {
                  navigator.clipboard.writeText(act.id);
                  toast({ title: "ID copiado!" });
                }}
              >
                {act.id.slice(0, 8)}
                <Copy className="w-3 h-3 opacity-50" />
              </button>
              <span className="opacity-50">·</span>
              <span>
                Criada em {new Date(act.created_at).toLocaleDateString("pt-BR")}
              </span>
              {act.completed_at && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="text-success">
                    Concluída em {new Date(act.completed_at).toLocaleDateString("pt-BR")}
                  </span>
                </>
              )}
              {(creatorName || creatorEmail) && (
                <>
                  <span className="opacity-50">·</span>
                  <span title={creatorEmail || ""}>
                    por <span className="font-semibold text-foreground">{creatorName || creatorEmail}</span>
                  </span>
                </>
              )}
              {(lastEditorName || lastEditorEmail) && (
                <>
                  <span className="opacity-50">·</span>
                  <span title={lastEditorEmail || ""} className="italic">
                    última edição por <span className="font-semibold text-foreground not-italic">{lastEditorName || lastEditorEmail}</span>
                  </span>
                </>
              )}
              {act.closed_at && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="text-primary flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Arquivada em {new Date(act.closed_at).toLocaleDateString("pt-BR")}
                  </span>
                </>
              )}
              {storiesCount > 0 && projectId && (
                <>
                  <span className="opacity-50">·</span>
                  <a
                    href={`/project/${projectId}?tab=stories&activity=${act.id}`}
                    className="flex items-center gap-1 text-primary hover:underline"
                    title="Ver histórias vinculadas"
                  >
                    <BookOpen className="w-3 h-3" />
                    {storiesCount} {storiesCount === 1 ? "história vinculada" : "histórias vinculadas"}
                  </a>
                </>
              )}
            </div>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
          {/* ========= COLUNA PRINCIPAL (esquerda) ========= */}
          <div className="space-y-5 min-w-0">
          {/* ============= CABEÇALHO COMPACTO (estilo ClickUp) ============= */}
          {/* Título grande inline */}
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1 shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
              <Textarea
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                rows={1}
                autoResize
                placeholder="Título da atividade..."
                className="min-h-[28px] flex-1 min-w-0 text-base font-semibold leading-tight break-words whitespace-pre-wrap [overflow-wrap:anywhere] border-0 px-0 py-1 shadow-none focus-visible:ring-0 rounded-none resize-none bg-transparent"
              />
              <div className="shrink-0">
                <AIAssistButton
                  value={formData.title}
                  onChange={(next) => setFormData({ ...formData, title: next })}
                  context="activity_title"
                />
              </div>
            </div>
          </div>

          {/* Painel de propriedades — 2 colunas, linhas densas (label + valor) */}
          {act && (
            <div className="flex flex-col divide-y divide-border/60 p-3 rounded-lg border border-border bg-muted/10">
              {/* Lista vertical única — evita sobreposição entre campos largos (GUT, Marco) e estreitos (Status) */}
              <div className="flex flex-col">
                {/* Status / Etapa */}
                {workflowStages.length > 0 && (
                   <PropertyRow icon={<ArrowRightLeft className="w-3.5 h-3.5" />} label="Status">
                     <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border hover:bg-muted/40 transition-colors"
                          style={(() => {
                            const s = workflowStages.find(s => s.id === currentStageId);
                            return s ? { borderColor: s.color, color: s.color } : {};
                          })()}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ background: workflowStages.find(s => s.id === currentStageId)?.color || "hsl(var(--muted-foreground))" }} />
                          {workflowStages.find(s => s.id === currentStageId)?.title || "Sem coluna"}
                          <ChevronDown className="w-3 h-3 opacity-60" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-1" align="start">
                        {workflowStages.map((stage) => (
                          <button
                            key={stage.id}
                            type="button"
                            className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted ${currentStageId === stage.id ? "bg-primary/10 text-primary font-medium" : ""}`}
                            onClick={async () => {
                              if (currentStageId === stage.id) return;
                              setStatusPopoverOpen(false);
                              if (stage.is_final && isBlockedByOthers) {
                                toast({ title: "Tarefa bloqueada", description: `Há ${blockers.length} bloqueio(s) pendente(s).`, variant: "destructive" });
                                return;
                              }
                              try {
                                const updateData: any = { workflow_stage_id: stage.id };
                                if (stage.is_final) {
                                  updateData.status = "completed";
                                  updateData.completed_at = new Date().toISOString();
                                } else if (act.status === "completed") {
                                  updateData.status = "pending";
                                  updateData.completed_at = null;
                                }
                                const { error } = await supabase.from("activities").update(updateData).eq("id", act.id);
                                if (error) throw error;
                                await supabase.from("user_stories").update({ stage_id: stage.id }).eq("activity_id", act.id);
                                setCurrentStageId(stage.id);
                                toast({ title: `Movida para "${stage.title}"` });
                                onActivityUpdated();
                              } catch {
                                toast({ title: "Erro ao mover", variant: "destructive" });
                              }
                            }}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                            {stage.title}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </PropertyRow>
                )}

                {/* Datas inline */}
                <PropertyRow icon={<Calendar className="w-3.5 h-3.5" />} label={formData.is_milestone ? "Data" : "Datas"}>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      className={`h-7 px-1.5 text-xs w-[130px] ${dateRangeInvalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {!formData.is_milestone && (
                      <>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <Input
                          type="date"
                          value={formData.end_date}
                          onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                          className={`h-7 px-1.5 text-xs w-[130px] ${dateRangeInvalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        />
                      </>
                    )}
                    {dateRangeInvalid && (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center justify-center text-destructive">
                              <AlertTriangle className="w-4 h-4" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[260px] text-xs">
                            Datas inconsistentes: a data de início é posterior à data de término.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {(startDivergence || endDivergence) && (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex items-center justify-center text-amber-600 dark:text-amber-400 hover:opacity-80">
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[260px] text-xs">
                            Divergência com subatividades:
                            {startDivergence && minSubStart && (
                              <div>• sub começa em <strong>{minSubStart.split("-").reverse().join("/")}</strong> (antes do pai)</div>
                            )}
                            {endDivergence && maxSubEnd && (
                              <div>• sub termina em <strong>{maxSubEnd.split("-").reverse().join("/")}</strong> (depois do pai)</div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </PropertyRow>

                {/* Datas Reais (somente leitura) + chip de Desvio — não se aplica a Qualidade */}
                {!isQualityProject && (act?.actual_start_date || act?.actual_end_date || act?.completed_at) && !formData.is_milestone && (
                  <PropertyRow icon={<Calendar className="w-3.5 h-3.5 text-muted-foreground" />} label="Real">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">
                        {(act?.actual_start_date || "—").split("-").reverse().join("/")}
                      </span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="font-mono">
                        {((act?.actual_end_date || act?.completed_at?.slice?.(0,10) || "—") + "").split("-").reverse().join("/")}
                      </span>
                      {(() => {
                        const real = act?.actual_end_date || (act?.completed_at ? String(act.completed_at).slice(0,10) : null);
                        const v = endVariance(real, (act as any)?.baseline_end_date, act?.end_date);
                        if (v === null) return null;
                        const tone = varianceTone(v);
                        return (
                          <span className={cn("ml-1 px-1.5 py-0 rounded border text-[10px] font-mono", varianceClasses(tone))}
                                title={(act as any)?.baseline_end_date ? "Real − Linha de Base" : "Real − Previsto"}>
                            Desvio {formatVariance(v)}
                          </span>
                        );
                      })()}
                    </div>
                  </PropertyRow>
                )}

                {/* Relacionamentos inline */}
                {projectId && (
                  <PropertyRow icon={<Link2 className="w-3.5 h-3.5" />} label="Relações">
                    <ActivityRelationsInline activityId={act.id} projectId={projectId} />
                  </PropertyRow>
                )}

                {/* Tempo */}
                {!formData.is_milestone && (
                  <PropertyRow icon={<Clock className="w-3.5 h-3.5" />} label="Tempo">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Input
                        list="hours-options"
                        placeholder="Ex: 2h 30m"
                        value={formData.hours}
                        onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-7 px-2 text-xs w-[140px] cursor-pointer"
                      />
                      <datalist id="hours-options">
                        <option value="15m" label="15 minutos" />
                        <option value="30m" label="30 minutos" />
                        <option value="45m" label="45 minutos" />
                        {Array.from({ length: 80 }, (_, i) => i + 1).map((h) => (
                          <option key={h} value={`${h}h`} label={h === 1 ? "1 hora" : `${h} horas`} />
                        ))}
                      </datalist>
                      {hoursDivergence && (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center justify-center text-amber-600 dark:text-amber-400 hover:opacity-80">
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[260px] text-xs">
                              Horas do pai (<strong>{formatHoursDisplay(parentHoursNum)}</strong>) diferem da soma das subatividades (<strong>{formatHoursDisplay(subHoursTotal)}</strong>). Evite duplicidade — registre no pai <em>ou</em> nas subs.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {plannedHours > 0 && (
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${
                            consumedHours > plannedHours
                              ? "text-destructive border-destructive/40 bg-destructive/10"
                              : consumedHours > 0
                              ? "text-emerald-700 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                              : "text-muted-foreground border-border bg-muted/30"
                          }`}
                          title={
                            subActivities.length > 0
                              ? "Consumido nas subatividades concluídas"
                              : "Consumido (atividade concluída)"
                          }
                        >
                          Consumidas: {formatHoursDisplay(consumedHours) || "0h"} / {formatHoursDisplay(plannedHours)}
                        </span>
                      )}
                    </div>
                  </PropertyRow>
                )}

                {/* Custo */}
                {!formData.is_milestone && (
                  <PropertyRow icon={<DollarSign className="w-3.5 h-3.5" />} label="Custo">
                    <CurrencyInput
                      step="0.01"
                      min="0"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      className="h-7 pl-8 pr-2 py-0 text-xs w-[140px]"
                    />
                  </PropertyRow>
                )}
                {/* Líder — exibe TODOS os usuários cadastrados, opcional */}
                <PropertyRow icon={<User className="w-3.5 h-3.5" />} label="Líder">
                  <select
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs w-full max-w-[280px] truncate"
                    value={formData.assigned_to}
                    onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  >
                    <option value="">Sem líder</option>
                    {allProfiles.map((m) => (
                      <option key={m.full_name} value={m.full_name!}>
                        {m.full_name}{m.sector ? ` — ${m.sector}` : ""}
                      </option>
                    ))}
                  </select>
                </PropertyRow>

                {/* Prioridade — método GUT */}
                <PropertyRow icon={<Flag className="w-3.5 h-3.5" />} label="Prioridade (GUT)">
                  <div className="w-full min-w-0">
                    <GutPriorityField
                      gravity={formData.gravity}
                      urgency={formData.urgency}
                      tendency={formData.tendency}
                      onChange={(v) => setFormData({ ...formData, ...v })}
                    />
                  </div>
                </PropertyRow>

                {/* Marco */}
                <PropertyRow icon={<Diamond className={`w-3.5 h-3.5 ${formData.is_milestone ? "fill-amber-500 text-amber-500" : ""}`} />} label="Marco">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_milestone}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          is_milestone: checked,
                          // Marcos não têm data de fim — limpa ao ativar
                          end_date: checked ? "" : formData.end_date,
                        })
                      }
                      className="data-[state=checked]:bg-amber-500"
                    />
                    <span className="text-xs text-muted-foreground">
                      {formData.is_milestone ? "É um marco" : "Não é marco"}
                    </span>
                  </div>
                </PropertyRow>

                {/* É uma fase? */}
                <PropertyRow icon={<Layers className={`w-3.5 h-3.5 ${formData.item_type === "fase" ? "text-primary" : ""}`} />} label="É uma fase">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.item_type === "fase"}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, item_type: checked ? "fase" : "tarefa" })
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {formData.item_type === "fase"
                        ? "Esta tarefa agrupa subtarefas como uma fase"
                        : "Tarefa comum"}
                    </span>
                  </div>
                </PropertyRow>

                {/* Código EAP/WBS */}
                <PropertyRow icon={<Hash className="w-3.5 h-3.5" />} label="Código EAP">
                  <div className="flex flex-col gap-1 w-full">
                    <Input
                      value={formData.wbs_code}
                      onChange={(e) => setFormData({ ...formData, wbs_code: e.target.value })}
                      placeholder={(formData.parent_id || (act as any)?.parent_id) ? "Em branco = gerado automaticamente ao salvar" : ""}
                      className={cn(
                        "h-7 text-xs font-mono",
                        formData.wbs_code && !/^\d+(\.\d+){0,3}$/.test(formData.wbs_code.trim()) && "border-destructive"
                      )}
                    />
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {(formData.parent_id || (act as any)?.parent_id)
                        ? <>Subatividade: a EAP é <strong>preenchida automaticamente</strong> a partir da atividade pai. Você pode sobrescrever.</>
                        : <>Padrões: <strong>X.0</strong> Fase/Entregável • <strong>X.Y</strong> Subentrega • <strong>X.Y.Z</strong> Pacote • <strong>X.Y.Z.W</strong> Atividade</>}
                    </span>
                  </div>
                </PropertyRow>
              </div>
            </div>
          )}

          {/* ============= ABAS ============= */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="w-full justify-start h-9 bg-transparent border-b border-border rounded-none p-0 gap-1">
              <TabsTrigger value="details" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <FileText className="w-3.5 h-3.5" /> Detalhes
              </TabsTrigger>
              <TabsTrigger value="team" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <Users className="w-3.5 h-3.5" /> Equipe
                {formData.participants.filter(Boolean).length > 0 && (
                  <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted">{formData.participants.filter(Boolean).length}</span>
                )}
              </TabsTrigger>
              {act && projectId && (
                <TabsTrigger value="subtasks" className="text-xs gap-1.5 data-[state=active]:bg-background">
                  <ListTree className="w-3.5 h-3.5" /> Subatividades
                  {subActivities.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted">{subActivities.length}</span>
                  )}
                </TabsTrigger>
              )}
              {act && projectId && (
                <TabsTrigger value="attachments" className="text-xs gap-1.5 data-[state=active]:bg-background">
                  <Paperclip className="w-3.5 h-3.5" /> Anexos
                </TabsTrigger>
              )}
              {/* Comentários e Histórico foram movidos para o painel lateral à direita */}
              {act && projectId && (
                <TabsTrigger value="stories" className="text-xs gap-1.5 data-[state=active]:bg-background">
                  <BookOpen className="w-3.5 h-3.5" /> Histórias
                  {storiesCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted">{storiesCount}</span>
                  )}
                </TabsTrigger>
              )}
              {/* Histórico vive no painel lateral */}
            </TabsList>

            {/* ===== ABA DETALHES ===== */}
            <TabsContent value="details" className="space-y-5 pt-4 mt-0">

          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <Label htmlFor="description" className="text-sm font-semibold text-foreground">Descrição</Label>
              <AIAssistButton
                value={formData.description}
                onChange={(next) => setFormData({ ...formData, description: next })}
                context="activity_description"
              />
            </div>
            <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} autoResize placeholder="Descreva a atividade..." className="w-full min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]" />
          </div>

          {/* Datas Início/Fim já estão no painel superior; mantemos apenas Data de Atualização (qualidade) */}
          {isQualityProject && (
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Data de Atualização
                </Label>
                <Input type="date" value={formData.last_update_date} onChange={(e) => setFormData({ ...formData, last_update_date: e.target.value })} />
              </div>
            </div>
          )}

          {/* Flag de Prazo - Apenas Qualidade */}
          {isQualityProject && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Flag className="w-4 h-4" /> Flag de Prazo
              </Label>
              <div className="flex gap-2">
                {[
                  { value: "", label: "Nenhuma", color: "border-border text-muted-foreground" },
                  { value: "green", label: "🟢 Em dia", color: "bg-emerald-500/20 text-emerald-600 border-emerald-500" },
                  { value: "orange", label: "🟠 Atenção", color: "bg-orange-500/20 text-orange-600 border-orange-500" },
                  { value: "red", label: "🔴 Vencido", color: "bg-destructive/20 text-destructive border-destructive" },
                ].map((f) => (
                  <button key={f.value} type="button"
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${formData.deadline_flag === f.value ? `${f.color} ring-2 ring-current/20` : "border-border text-muted-foreground hover:border-foreground/30"}`}
                    onClick={() => setFormData({ ...formData, deadline_flag: f.value })}
                  >{f.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Tempo, Custo já estão no painel superior. Story Points removidos. */}

            </TabsContent>

            {/* ===== ABA EQUIPE DO PROJETO ===== */}
            <TabsContent value="team" className="pt-4 mt-0">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" /> Equipe do Projeto
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => {
                      if (formData.participants.includes("")) return;
                      setFormData({
                        ...formData,
                        participants: [...formData.participants, ""],
                      });
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Incluir participante
                  </Button>
                </div>

                <div className="rounded-md border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_36px] items-center bg-muted/40 px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Participante</span>
                    <span className="sr-only">Ações</span>
                  </div>
                  {formData.participants.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Nenhum participante adicionado. Clique em <strong>+ Incluir participante</strong> para começar.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {formData.participants.map((p, idx) => (
                        <div key={`${p}-${idx}`} className="grid grid-cols-[1fr_36px] items-center gap-2 px-3 py-2 bg-background">
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={p}
                            onChange={(e) => {
                              const newName = e.target.value;
                              if (newName !== p && formData.participants.includes(newName)) return;
                              const nextParticipants = [...formData.participants];
                              nextParticipants[idx] = newName;
                              setFormData({ ...formData, participants: nextParticipants });
                            }}
                          >
                            <option value="">Selecionar pessoa...</option>
                            {allProfiles
                              .filter((m) => m.full_name && (m.full_name === p || !formData.participants.includes(m.full_name!)))
                              .map((m) => (
                                <option key={m.full_name} value={m.full_name!}>
                                  {m.full_name}{m.sector ? ` — ${m.sector}` : ""}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                participants: formData.participants.filter((_, i) => i !== idx),
                              });
                            }}
                            title="Remover participante"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA SUBATIVIDADES ===== */}
            <TabsContent value="subtasks" className="pt-4 mt-0">
          {act && projectId && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Sub-atividades ({subActivities.length})
              </h3>

              {/* Resumo de horas: consumido (subs concluídas) vs planejado (pai) */}
              {(() => {
                const planned = parentHoursNum;
                const consumed = subActivities
                  .filter((s) => s.status === "completed")
                  .reduce((sum, s) => sum + (Number((s as any).hours) || 0), 0);
                const planejadoSubs = subHoursTotal;
                const pct = planned > 0 ? Math.min(100, (consumed / planned) * 100) : 0;
                const excedeu = planned > 0 && consumed > planned;
                if (planned === 0 && planejadoSubs === 0) return null;
                return (
                  <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Horas consumidas (subs concluídas):{" "}
                        <strong className={excedeu ? "text-destructive" : "text-foreground"}>
                          {formatHoursDisplay(consumed) || "0h"}
                        </strong>
                        {planned > 0 && (
                          <> de <strong className="text-foreground">{formatHoursDisplay(planned)}</strong> planejadas no pai</>
                        )}
                      </span>
                      {planned > 0 && (
                        <span className={`text-[11px] font-semibold ${excedeu ? "text-destructive" : "text-muted-foreground"}`}>
                          {pct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {planned > 0 && (
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full transition-all ${excedeu ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    {planejadoSubs > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        Soma planejada das subatividades: <strong>{formatHoursDisplay(planejadoSubs)}</strong>
                        {planned > 0 && Math.abs(planejadoSubs - planned) > 0.01 && (
                          <span className="text-amber-600 dark:text-amber-400"> · diverge do pai</span>
                        )}
                      </div>
                    )}
                    {excedeu && (
                      <div className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Consumo já ultrapassou as horas planejadas no pai.
                      </div>
                    )}
                  </div>
                );
              })()}

              {subActivities.length > 0 && (
                <div className="rounded-md border border-border overflow-x-auto">
                  <div
                    className="grid items-center gap-2 px-2 py-1 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border min-w-fit"
                    style={{ gridTemplateColumns: subGridTemplate }}
                  >
                    <span></span>
                    <span>Nome</span>
                    {ALL_COLS.filter((c) => visibleCols.includes(c.id)).map((col) => (
                      <span
                        key={col.id}
                        className={col.id === "assigned_to" || col.id === "priority" ? "text-center" : ""}
                      >
                        {col.label}
                      </span>
                    ))}
                    <span className="flex justify-end">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="h-5 w-5 inline-flex items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground hover:text-primary hover:border-primary/50"
                            title="Adicionar colunas"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="end">
                          <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 normal-case">
                            Colunas visíveis
                          </div>
                          <div className="space-y-0.5">
                            {ALL_COLS.map((col) => {
                              const checked = visibleCols.includes(col.id);
                              return (
                                <label
                                  key={col.id}
                                  className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted cursor-pointer text-xs normal-case font-normal"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggleCol(col.id)}
                                  />
                                  <span>{col.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </span>
                  </div>
                  {subActivities.map((sub) => {
                    const initials = (sub.assigned_to || "")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((n) => n[0]?.toUpperCase())
                      .join("");
                    const gutLevel = normalizeGut(sub.priority);
                    const gutMeta = GUT_META[gutLevel];
                    const prioLabel = gutMeta.label;
                    const prioScore = (sub as any).priority_score as number | null | undefined;
                    const dateShort = sub.end_date
                      ? (() => {
                          const [y, m, d] = sub.end_date.split("-").map(Number);
                          return `${m}/${d}/${String(y).slice(-2)}`;
                        })()
                      : "—";
                    return (
                      <div
                        key={sub.id}
                        className="grid items-center gap-2 px-2 py-1 border-b border-border/50 last:border-0 hover:bg-muted/20 group min-w-fit"
                        style={{ gridTemplateColumns: subGridTemplate }}
                      >
                        <Button
                          size="icon"
                          variant="ghost"
                          type="button"
                          className="h-5 w-5 shrink-0"
                          onClick={() => handleToggleSubActivity(sub)}
                          title={sub.status === "completed" ? "Reabrir" : "Concluir"}
                        >
                          {sub.status === "completed" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </Button>
                        <button
                          type="button"
                          onClick={() => { setEditingSubActivity(sub); setEditingSubOpen(true); }}
                          className={`text-xs truncate text-left ${
                            sub.status === "completed" ? "line-through text-muted-foreground" : "text-foreground hover:text-primary"
                          }`}
                          title={sub.title}
                        >
                          {(() => {
                            const subStage = workflowStages.find((s) => s.id === (sub as any).workflow_stage_id);
                            const stageColor = subStage?.color || "hsl(var(--muted-foreground))";
                            const stageLabel = subStage?.title || "Sem coluna";
                            return (
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="inline-block w-2 h-2 rounded-full shrink-0 ring-1 ring-border"
                                  style={{ background: stageColor }}
                                  title={`Coluna: ${stageLabel}`}
                                />
                                <span className="truncate">{sub.title}</span>
                              </span>
                            );
                          })()}
                        </button>

                        {/* Colunas dinâmicas (na ordem de ALL_COLS, apenas as visíveis) */}
                        {ALL_COLS.filter((c) => visibleCols.includes(c.id)).map(({ id: colId }) => {
                          const updateField = async (value: any) => {
                            await supabase.from("activities").update({ [colId]: value } as any).eq("id", sub.id);
                            if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
                            onActivityUpdated();
                          };
                          if (colId === "assigned_to") {
                            return (
                              <Popover key={colId}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="mx-auto h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all hover:ring-2 hover:ring-primary/30"
                                    title={sub.assigned_to || "Atribuir responsável"}
                                  >
                                    {sub.assigned_to ? (
                                      <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                        {initials}
                                      </span>
                                    ) : (
                                      <span className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground flex items-center justify-center">
                                        <UserPlus2 className="w-3 h-3" />
                                      </span>
                                    )}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-1" align="center">
                                  <div className="max-h-56 overflow-y-auto">
                                    <button
                                      type="button"
                                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted"
                                      onClick={() => updateField(null)}
                                    >
                                      Sem responsável
                                    </button>
                                    {members.map((m) => (
                                      <button
                                        key={m.full_name}
                                        type="button"
                                        className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted ${
                                          sub.assigned_to === m.full_name ? "bg-primary/10 text-primary font-medium" : ""
                                        }`}
                                        onClick={() => updateField(m.full_name)}
                                      >
                                        {m.full_name}
                                        {m.sector && <span className="text-muted-foreground"> — {m.sector}</span>}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          }
                          if (colId === "priority") {
                            return (
                              <Popover key={colId}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="mx-auto h-6 w-6 rounded flex items-center justify-center hover:bg-muted"
                                    title={`Prioridade: ${prioLabel}${prioScore != null ? ` (${prioScore})` : ""}`}
                                  >
                                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${gutMeta.dotClass} ${gutMeta.pulse ? "animate-pulse" : ""}`} />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-40 p-1" align="center">
                                  {[
                                    { v: "baixa" as GutLevel, l: "Baixa" },
                                    { v: "media" as GutLevel, l: "Média" },
                                    { v: "alta" as GutLevel, l: "Alta" },
                                    { v: "critica" as GutLevel, l: "Crítica" },
                                    { v: "urgente" as GutLevel, l: "Urgente" },
                                  ].map((opt) => (
                                    <button
                                      key={opt.v}
                                      type="button"
                                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted ${
                                        gutLevel === opt.v ? "bg-primary/10 text-primary font-medium" : ""
                                      }`}
                                      onClick={() => updateField(opt.v)}
                                    >
                                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${GUT_META[opt.v].dotClass}`} /> {opt.l}
                                    </button>
                                  ))}
                                </PopoverContent>
                              </Popover>
                            );
                          }
                          if (colId === "end_date") {
                            const subInvalid = !!sub.start_date && !!sub.end_date && sub.start_date > sub.end_date;
                            return (
                              <label key={colId} className={`relative cursor-pointer text-xs hover:text-foreground ${subInvalid ? "text-destructive font-medium" : "text-muted-foreground"}`} title={subInvalid ? "Datas inconsistentes" : undefined}>
                                <span>{dateShort}</span>
                                <input
                                  type="date"
                                  value={sub.end_date || ""}
                                  onChange={(e) => updateField(e.target.value || null)}
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                              </label>
                            );
                          }
                          if (colId === "start_date") {
                            const subInvalid = !!sub.start_date && !!sub.end_date && sub.start_date > sub.end_date;
                            const ds = sub.start_date
                              ? (() => {
                                  const [y, m, d] = sub.start_date!.split("-").map(Number);
                                  return `${m}/${d}/${String(y).slice(-2)}`;
                                })()
                              : "—";
                            return (
                              <label key={colId} className={`relative cursor-pointer text-xs hover:text-foreground ${subInvalid ? "text-destructive font-medium" : "text-muted-foreground"}`} title={subInvalid ? "Datas inconsistentes" : undefined}>
                                <span>{ds}</span>
                                <input
                                  type="date"
                                  value={sub.start_date || ""}
                                  onChange={(e) => updateField(e.target.value || null)}
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                              </label>
                            );
                          }
                          if (colId === "hours") {
                            return (
                              <input
                                key={colId}
                                type="number"
                                step="0.5"
                                value={sub.hours ?? ""}
                                onChange={(e) => updateField(e.target.value === "" ? null : parseFloat(e.target.value))}
                                className="h-6 w-full text-xs px-1.5 rounded border border-input bg-background"
                                placeholder="0"
                              />
                            );
                          }
                          if (colId === "cost") {
                            return (
                              <input
                                key={colId}
                                type="number"
                                step="0.01"
                                value={sub.cost ?? ""}
                                onChange={(e) => updateField(e.target.value === "" ? null : parseFloat(e.target.value))}
                                className="h-6 w-full text-xs px-1.5 rounded border border-input bg-background"
                                placeholder="R$"
                              />
                            );
                          }
                          if (colId === "story_points") {
                            return (
                              <input
                                key={colId}
                                type="number"
                                value={(sub as any).story_points ?? ""}
                                onChange={(e) => updateField(e.target.value === "" ? null : parseInt(e.target.value))}
                                className="h-6 w-full text-xs px-1.5 rounded border border-input bg-background text-center"
                                placeholder="0"
                              />
                            );
                          }
                          if (colId === "status") {
                            const stageId = (sub as any).workflow_stage_id || "";
                            const stage = workflowStages.find((s) => s.id === stageId);
                            return (
                              <Popover key={colId}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="h-6 px-1.5 rounded text-[10px] font-medium border truncate hover:bg-muted"
                                    style={stage ? { borderColor: stage.color, color: stage.color } : {}}
                                    title={stage?.title || "Sem coluna"}
                                  >
                                    {stage?.title || "—"}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-44 p-1" align="center">
                                  {workflowStages.map((s) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted ${
                                        stageId === s.id ? "bg-primary/10 text-primary font-medium" : ""
                                      }`}
                                      onClick={async () => {
                                        const upd: any = { workflow_stage_id: s.id };
                                        if (s.is_final) {
                                          upd.status = "completed";
                                          upd.completed_at = new Date().toISOString();
                                        }
                                        await supabase.from("activities").update(upd).eq("id", sub.id);
                                        if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
                                        onActivityUpdated();
                                      }}
                                    >
                                      <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                                      {s.title}
                                    </button>
                                  ))}
                                </PopoverContent>
                              </Popover>
                            );
                          }
                          if (colId === "tags") {
                            const tags = (sub as any).tags as string[] | null;
                            return (
                              <button
                                key={colId}
                                type="button"
                                onClick={() => { setEditingSubActivity(sub); setEditingSubOpen(true); }}
                                className="text-[10px] truncate text-left text-muted-foreground hover:text-primary"
                                title={tags?.join(", ") || "Adicionar etiquetas"}
                              >
                                {tags && tags.length > 0 ? tags.join(", ") : "—"}
                              </button>
                            );
                          }
                          if (colId === "id_short") {
                            return (
                              <button
                                key={colId}
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(sub.id);
                                  toast({ title: "ID copiado!" });
                                }}
                                className="font-mono text-[10px] text-muted-foreground hover:text-primary text-left truncate"
                                title="Clique para copiar ID completo"
                              >
                                {sub.id.slice(0, 8)}
                              </button>
                            );
                          }
                          return <span key={colId}>—</span>;
                        })}

                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive"
                          onClick={() => handleDeleteSubActivity(sub.id)}
                          title="Excluir"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Adicionar sub-atividade..."
                  value={newSubTitle}
                  onChange={(e) => setNewSubTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddSubActivity(); } }}
                  className="h-8 text-sm flex-1"
                />
                <AIAssistButton
                  value={newSubTitle}
                  onChange={setNewSubTitle}
                  context="activity_title"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={handleAddSubActivity}
                  disabled={!newSubTitle.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

            </TabsContent>

            {/* ===== ABA ANEXOS ===== */}
            <TabsContent value="attachments" className="pt-4 mt-0">
          {act && projectId && (
            <ActivityAttachments activityId={act.id} projectId={projectId} />
          )}
            </TabsContent>

            {/* ===== ABA HISTÓRIAS ===== */}
            <TabsContent value="stories" className="pt-4 mt-0">
          {act && projectId && (
            <ActivityStoriesPanel activityId={act.id} projectId={projectId} />
          )}
            </TabsContent>
          </Tabs>

          {/* Aviso de bloqueio pendente */}
          {act && isBlockedByOthers && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive">
              <AlertOctagon className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-bold mb-1">Esta tarefa está BLOQUEADA por {blockers.length} tarefa{blockers.length > 1 ? "s" : ""}:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {blockers.map((b) => (
                    <li key={b.relationId}>{b.title}</li>
                  ))}
                </ul>
                <p className="mt-1.5 italic">Conclua os bloqueios antes de marcar esta como concluída.</p>
              </div>
            </div>
          )}

          </div>

          {/* ========= PAINEL LATERAL (direita) ========= */}
          {act && (
            <aside className="lg:border-l lg:border-border lg:pl-5 min-w-0 flex flex-col gap-4 lg:max-h-[calc(95vh-180px)] lg:overflow-y-auto">
              <div className="rounded-lg border border-border bg-card p-3">
                <Tabs defaultValue="comments" className="w-full">
                  <TabsList className="w-full justify-start h-9 bg-muted/40 border border-border/60 rounded-md p-0.5 gap-0.5">
                    <TabsTrigger
                      value="comments"
                      className="text-xs gap-1.5 flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Comentários
                    </TabsTrigger>
                    {!createMode && (
                      <TabsTrigger
                        value="history"
                        className="text-xs gap-1.5 flex-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                      >
                        <History className="w-3.5 h-3.5" /> Histórico
                      </TabsTrigger>
                    )}
                  </TabsList>
                  <TabsContent value="comments" className="mt-3">
                    <ActivityComments activityId={act.id} includeSubActivities />
                  </TabsContent>
                  {!createMode && (
                    <TabsContent value="history" className="mt-3">
                      <AuditLogPanel recordId={act.id} tableName="activities" />
                    </TabsContent>
                  )}
                </Tabs>
              </div>
            </aside>
          )}

          <DialogFooter className="gap-2 lg:col-span-2">
            {act && !createMode && act.status !== "completed" && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto gap-2 text-success border-success/30 hover:bg-success/10 disabled:opacity-50"
                disabled={isBlockedByOthers}
                title={isBlockedByOthers ? "Conclua as tarefas bloqueadoras primeiro" : "Concluir atividade"}
                onClick={async () => {
                  if (!act || !projectId) return;
                  if (isBlockedByOthers) {
                    toast({
                      title: "Tarefa bloqueada",
                      description: `Existem ${blockers.length} bloqueio(s) pendente(s). Conclua-os antes.`,
                      variant: "destructive",
                    });
                    return;
                  }
                  try {
                    // Find the final workflow stage
                    const { data: finalStage } = await supabase
                      .from("workflow_stages")
                      .select("id")
                      .eq("project_id", projectId)
                      .eq("is_final", true)
                      .limit(1)
                      .maybeSingle();

                    const updateData: any = {
                      status: "completed",
                      completed_at: new Date().toISOString(),
                    };
                    if (finalStage) {
                      updateData.workflow_stage_id = finalStage.id;
                    }

                    const { error } = await supabase.from("activities").update(updateData).eq("id", act.id);
                    if (error) throw error;
                    toast({ title: "Atividade concluída!" });
                    onActivityUpdated();
                    onOpenChange(false);
                  } catch {
                    toast({ title: "Erro ao concluir", variant: "destructive" });
                  }
                }}
              >
                <CheckCircle2 className="w-4 h-4" /> Concluir Atividade
              </Button>
            )}
            {act && !createMode && !act.closed_at && (
              <Button
                type="button"
                variant="outline"
                className="gap-2 text-primary border-primary/30 hover:bg-primary/10"
                onClick={async () => {
                  if (!act) return;
                  if (!confirm("Arquivar esta atividade? Ela ficará marcada como arquivada e poderá ser consultada no histórico.")) return;
                  try {
                    const { error } = await supabase.from("activities").update({ closed_at: new Date().toISOString() }).eq("id", act.id);
                    if (error) throw error;
                    toast({ title: "Atividade arquivada!" });
                    onActivityUpdated();
                    onOpenChange(false);
                  } catch {
                    toast({ title: "Erro ao arquivar", variant: "destructive" });
                  }
                }}
              >
                <Lock className="w-4 h-4" /> Arquivar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
            <Button type="submit">{createMode ? "Criar Atividade" : "Salvar Alterações"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {/* Editor aninhado para sub-atividade — mesmos campos da atividade principal */}
      {editingSubActivity && (
        <EditActivityDialog
          activity={editingSubActivity}
          open={editingSubOpen}
          onOpenChange={(o) => {
            setEditingSubOpen(o);
            if (!o) setEditingSubActivity(null);
          }}
          onActivityUpdated={() => {
            if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
            onActivityUpdated();
          }}
          phases={phases}
          allActivities={allActivities}
          projectId={projectId}
          isQualityProject={isQualityProject}
          parentActivityTitle={effectiveActivity?.title}
          onBackToParent={() => {
            setEditingSubOpen(false);
            setEditingSubActivity(null);
          }}
        />
      )}
    </Dialog>
  );
};
