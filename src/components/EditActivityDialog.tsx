import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Calendar, Clock, DollarSign, Layers, Tag, X, Flag, Plus, Trash2, CheckCircle2, Circle, ArrowRightLeft, Pencil, Diamond, ArrowRight, Link2 } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cascadeDates } from "@/lib/criticalPath";
import { AuditLogPanel } from "@/components/AuditLogPanel";
import { ActivityAttachments } from "@/components/ActivityAttachments";
import { ActivityComments } from "@/components/ActivityComments";
import { TaskRelations } from "@/components/TaskRelations";
import { useTaskBlockers } from "@/hooks/useTaskBlockers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { History, ChevronDown, Hash, Copy, UserCircle, Lock, AlertOctagon } from "lucide-react";
import { BookOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserPlus2 } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { AIAssistButton } from "@/components/AIAssistButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ActivityRelationsInline } from "@/components/ActivityRelationsInline";
import { MessageSquare, Paperclip, ListTree, FileText } from "lucide-react";
import { ActivityStoriesPanel } from "@/components/ActivityStoriesPanel";

/** Linha de propriedade densa (ícone + label cinza + valor) usada no painel ClickUp-like. */
const PropertyRow = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 min-h-[28px]">
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 w-[88px]">
      <span className="text-muted-foreground/70">{icon}</span>
      {label}
    </span>
    <div className="flex-1 min-w-0">{children}</div>
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
  cost: number;
  hours: number;
  phase_id: string | null;
  priority?: string;
  tags?: string[];
  parent_id?: string | null;
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

const RACI_OPTIONS = [
  { value: "", label: "Nenhum" },
  { value: "R", label: "R - Responsável" },
  { value: "A", label: "A - Autoridade" },
  { value: "C", label: "C - Consultado" },
  { value: "I", label: "I - Informado" },
];

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
    phase_id: "", priority: "medium",
    tags: [] as string[], parent_id: "",
    story_points: "0", raci_role: "",
    participants: [] as string[],
    deadline_flag: "" as string,
    last_update_date: "",
    ui_color_tag: "" as string,
    is_milestone: false,
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
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [storiesCount, setStoriesCount] = useState<number>(0);
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null);
  const [lastEditorName, setLastEditorName] = useState<string | null>(null);
  const [lastEditorEmail, setLastEditorEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "subtasks" | "attachments" | "comments" | "stories" | "history">("details");

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
    { id: "raci_role", label: "RACI", width: "56px" },
    { id: "id_short", label: "ID", width: "72px" },
  ];
  const DEFAULT_COLS = ["assigned_to", "priority", "end_date"];
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COLS;
    try {
      const stored = localStorage.getItem(SUB_COLS_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_COLS;
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
      const insertPayload: any = {
        project_id: projectId,
        title: "Nova atividade",
        status: "pending",
        priority: "medium",
        workflow_stage_id: defaultStageId || null,
        phase_id: defaultPhaseId || null,
        parent_id: defaultParentId || null,
      };
      supabase.from("activities").insert(insertPayload).select("*").single().then(({ data, error }) => {
        setCreatingDraft(false);
        if (error || !data) {
          toast({ title: "Erro ao iniciar nova atividade", variant: "destructive" });
          onOpenChange(false);
          return;
        }
        setDraftActivity(data as Activity);
        onActivityCreated?.((data as any).id);
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
        priority: act.priority || "medium",
        tags: act.tags || [],
        parent_id: act.parent_id || "",
        story_points: (act as any).story_points?.toString() || "0",
        raci_role: (act as any).raci_role || "",
        participants: (act as any).participants || [],
        deadline_flag: (act as any).deadline_flag || "",
        last_update_date: (act as any).last_update_date || "",
        ui_color_tag: (act as any).ui_color_tag || "",
        is_milestone: !!(act as any).is_milestone,
      });
      setCurrentStageId((act as any).workflow_stage_id || "");
      fetchSubActivities(act.id);
    }
  }, [activity, draftActivity, createMode]);

  

  const fetchSubActivities = async (parentId: string) => {
    const { data } = await supabase.from("activities").select("*")
      .eq("parent_id", parentId).order("display_order");
    if (data) setSubActivities(data as Activity[]);
  };

  const handleAddSubActivity = async () => {
    const act = effectiveActivity;
    if (!newSubTitle.trim() || !act || !projectId) return;
    await supabase.from("activities").insert({
      project_id: projectId, title: newSubTitle.trim(),
      phase_id: act.phase_id, parent_id: act.id,
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
    await supabase.from("activities").update({
      status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : null,
    }).eq("id", sub.id);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const act = createMode ? draftActivity : activity;
    if (!act) return;
    const previousEndDate = act.end_date;
    try {
      const { error } = await supabase.from("activities").update({
        title: formData.title,
        description: formData.description || null,
        assigned_to: formData.assigned_to || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        cost: parseFloat(formData.cost) || 0,
        hours: parseHoursInput(formData.hours),
        phase_id: formData.phase_id || null,
        priority: formData.priority,
        tags: formData.tags,
        parent_id: formData.parent_id || null,
        story_points: parseInt(formData.story_points) || 0,
        raci_role: formData.raci_role || null,
        participants: formData.participants,
        deadline_flag: formData.deadline_flag || null,
        last_update_date: formData.last_update_date || null,
        ui_color_tag: formData.ui_color_tag || null,
        is_milestone: formData.is_milestone,
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
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ============= CABEÇALHO COMPACTO (estilo ClickUp) ============= */}
          {/* Título grande inline */}
          <div className="space-y-1 min-w-0">
            <div className="flex items-start gap-2">
              <Textarea
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                rows={1}
                autoResize
                placeholder="Título da atividade..."
                className="min-h-[44px] flex-1 min-w-0 text-xl font-bold break-words whitespace-pre-wrap [overflow-wrap:anywhere] border-0 px-0 shadow-none focus-visible:ring-0 focus-visible:border-b focus-visible:border-primary rounded-none resize-none"
              />
              <div className="pt-2 shrink-0">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 p-3 rounded-lg border border-border bg-muted/10">
              {/* Coluna esquerda */}
              <div className="space-y-1.5">
                {/* Status / Etapa */}
                {workflowStages.length > 0 && (
                  <PropertyRow icon={<ArrowRightLeft className="w-3.5 h-3.5" />} label="Status">
                    <Popover>
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
                <PropertyRow icon={<Calendar className="w-3.5 h-3.5" />} label="Datas">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      className="h-7 px-1.5 text-xs w-[130px]"
                    />
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <Input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      className="h-7 px-1.5 text-xs w-[130px]"
                    />
                  </div>
                </PropertyRow>

                {/* Tempo */}
                {!formData.is_milestone && (
                  <PropertyRow icon={<Clock className="w-3.5 h-3.5" />} label="Tempo">
                    <Input
                      placeholder="Ex: 2h 30m"
                      value={formData.hours}
                      onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                      className="h-7 px-2 text-xs w-[120px]"
                    />
                  </PropertyRow>
                )}

                {/* Relacionamentos inline */}
                {projectId && (
                  <PropertyRow icon={<Link2 className="w-3.5 h-3.5" />} label="Relações">
                    <ActivityRelationsInline activityId={act.id} projectId={projectId} />
                  </PropertyRow>
                )}
              </div>

              {/* Coluna direita */}
              <div className="space-y-1.5">
                {/* Líder — exibe TODOS os usuários cadastrados, opcional */}
                <PropertyRow icon={<User className="w-3.5 h-3.5" />} label="Líder">
                  <select
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs max-w-[220px] truncate"
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

                {/* Prioridade compacta */}
                <PropertyRow icon={<Flag className="w-3.5 h-3.5" />} label="Prioridade">
                  <div className="flex gap-1">
                    {[
                      { value: "low", label: "Baixa", color: "bg-muted text-muted-foreground border-border" },
                      { value: "medium", label: "Média", color: "bg-warning/15 text-warning border-warning/30" },
                      { value: "high", label: "Alta", color: "bg-destructive/15 text-destructive border-destructive/30" },
                    ].map((p) => (
                      <button key={p.value} type="button"
                        className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-all ${formData.priority === p.value ? `${p.color} ring-1 ring-current/30` : "border-border text-muted-foreground hover:border-foreground/30"}`}
                        onClick={() => setFormData({ ...formData, priority: p.value })}
                      >{p.label}</button>
                    ))}
                  </div>
                </PropertyRow>

                {/* Marco */}
                <PropertyRow icon={<Diamond className={`w-3.5 h-3.5 ${formData.is_milestone ? "fill-amber-500 text-amber-500" : ""}`} />} label="Marco">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={formData.is_milestone}
                      onChange={(e) => setFormData({ ...formData, is_milestone: e.target.checked })}
                      className="h-3 w-3 rounded border-border accent-amber-500 cursor-pointer"
                    />
                    <span>{formData.is_milestone ? "Sim" : "Não"}</span>
                  </label>
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
              {act && (
                <TabsTrigger value="comments" className="text-xs gap-1.5 data-[state=active]:bg-background">
                  <MessageSquare className="w-3.5 h-3.5" /> Comentários
                </TabsTrigger>
              )}
              {act && projectId && (
                <TabsTrigger value="stories" className="text-xs gap-1.5 data-[state=active]:bg-background">
                  <BookOpen className="w-3.5 h-3.5" /> Histórias
                  {storiesCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted">{storiesCount}</span>
                  )}
                </TabsTrigger>
              )}
              {act && !createMode && (
                <TabsTrigger value="history" className="text-xs gap-1.5 data-[state=active]:bg-background">
                  <History className="w-3.5 h-3.5" /> Histórico
                </TabsTrigger>
              )}
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

          {/* RACI (Líder e Prioridade já estão no painel superior) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                🏷️ Papel RACI
              </Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.raci_role}
                onChange={(e) => setFormData({ ...formData, raci_role: e.target.value })}
              >
                {RACI_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            {phases.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Fase
                </Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.phase_id} onChange={(e) => setFormData({ ...formData, phase_id: e.target.value })}>
                  <option value="">Sem fase</option>
                  {phases.map((phase) => (<option key={phase.id} value={phase.id}>{phase.title}</option>))}
                </select>
              </div>
            )}
          </div>

          {/* Participantes */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
              👥 Participantes
            </Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {formData.participants.map((p) => (
                <Badge key={p} variant="secondary" className="gap-1 text-xs">
                  {p}
                  <button type="button" onClick={() => setFormData({ ...formData, participants: formData.participants.filter(x => x !== p) })}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value=""
              onChange={(e) => {
                if (e.target.value && !formData.participants.includes(e.target.value)) {
                  setFormData({ ...formData, participants: [...formData.participants, e.target.value] });
                }
              }}
            >
              <option value="">Adicionar participante...</option>
              {allProfiles.filter(m => m.full_name && !formData.participants.includes(m.full_name!)).map((m) => (
                <option key={m.full_name} value={m.full_name!}>{m.full_name}{m.sector ? ` — ${m.sector}` : ''}</option>
              ))}
            </select>
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

          {!formData.is_milestone && (
          <div className="p-4 bg-accent/30 rounded-lg border border-border space-y-4">
            <h3 className="text-sm font-bold text-foreground">Recursos da Atividade</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> Horas Estimadas
                </Label>
                <Input
                  placeholder="Ex: 2h 30m"
                  value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                  className="font-semibold text-lg"
                />
                {/* Atalhos rápidos: clique para preencher */}
                <div className="flex gap-1 flex-wrap">
                  {[0.25, 0.5, 1, 2, 4, 8].map((h) => {
                    const label = h < 1 ? `${h * 60}m` : `${h}h`;
                    const active = String(formData.hours).trim() === String(h);
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setFormData({ ...formData, hours: String(h) })}
                        className={`px-2 h-6 rounded-md text-[11px] font-medium border transition-all ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">Formato: 2h 30m, 1.5h ou 90m</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-success" /> Custo
                </Label>
                <CurrencyInput step="0.01" min="0" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} className="font-semibold text-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  🎯 Story Points
                </Label>
                <div className="flex gap-1 flex-wrap">
                  {[0, 1, 2, 3, 5, 8, 13, 21].map((sp) => (
                    <button key={sp} type="button"
                      className={`w-9 h-9 rounded-md text-sm font-bold border transition-all ${parseInt(formData.story_points) === sp ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                      onClick={() => setFormData({ ...formData, story_points: sp.toString() })}
                    >{sp}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}

            </TabsContent>

            {/* ===== ABA SUBATIVIDADES ===== */}
            <TabsContent value="subtasks" className="pt-4 mt-0">
          {act && projectId && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Sub-atividades ({subActivities.length})
              </h3>
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
                    const prio = sub.priority || "medium";
                    const prioClass =
                      prio === "critical" ? "text-red-600"
                      : prio === "high" ? "text-orange-500"
                      : prio === "low" ? "text-muted-foreground"
                      : "text-amber-500";
                    const prioLabel =
                      prio === "critical" ? "Crítica"
                      : prio === "high" ? "Alta"
                      : prio === "low" ? "Baixa" : "Média";
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
                          {sub.title}
                        </button>

                        {/* Colunas dinâmicas (na ordem de ALL_COLS, apenas as visíveis) */}
                        {ALL_COLS.filter((c) => visibleCols.includes(c.id)).map(({ id: colId }) => {
                          const updateField = async (value: any) => {
                            await supabase.from("activities").update({ [colId]: value }).eq("id", sub.id);
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
                                    title={`Prioridade: ${prioLabel}`}
                                  >
                                    <Flag className={`w-3.5 h-3.5 ${prioClass}`} />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-40 p-1" align="center">
                                  {[
                                    { v: "low", l: "Baixa", c: "text-muted-foreground" },
                                    { v: "medium", l: "Média", c: "text-amber-500" },
                                    { v: "high", l: "Alta", c: "text-orange-500" },
                                    { v: "critical", l: "Crítica", c: "text-red-600" },
                                  ].map((opt) => (
                                    <button
                                      key={opt.v}
                                      type="button"
                                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted ${
                                        prio === opt.v ? "bg-primary/10 text-primary font-medium" : ""
                                      }`}
                                      onClick={() => updateField(opt.v)}
                                    >
                                      <Flag className={`w-3.5 h-3.5 ${opt.c}`} /> {opt.l}
                                    </button>
                                  ))}
                                </PopoverContent>
                              </Popover>
                            );
                          }
                          if (colId === "end_date") {
                            return (
                              <label key={colId} className="relative cursor-pointer text-xs text-muted-foreground hover:text-foreground">
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
                            const ds = sub.start_date
                              ? (() => {
                                  const [y, m, d] = sub.start_date!.split("-").map(Number);
                                  return `${m}/${d}/${String(y).slice(-2)}`;
                                })()
                              : "—";
                            return (
                              <label key={colId} className="relative cursor-pointer text-xs text-muted-foreground hover:text-foreground">
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
                          if (colId === "raci_role") {
                            const raci = (sub as any).raci_role || "";
                            return (
                              <select
                                key={colId}
                                value={raci}
                                onChange={(e) => updateField(e.target.value || null)}
                                className="h-6 w-full text-xs px-1 rounded border border-input bg-background text-center"
                              >
                                <option value="">—</option>
                                <option value="R">R</option>
                                <option value="A">A</option>
                                <option value="C">C</option>
                                <option value="I">I</option>
                              </select>
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
                {newSubTitle.trim() && (
                  <AIAssistButton
                    value={newSubTitle}
                    onChange={setNewSubTitle}
                    context="activity_title"
                  />
                )}
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

            {/* ===== ABA COMENTÁRIOS ===== */}
            <TabsContent value="comments" className="pt-4 mt-0">
          {act && (
            <ActivityComments activityId={act.id} />
          )}
            </TabsContent>

            {/* ===== ABA HISTÓRIAS ===== */}
            <TabsContent value="stories" className="pt-4 mt-0">
          {act && projectId && (
            <ActivityStoriesPanel activityId={act.id} projectId={projectId} />
          )}
            </TabsContent>

            {/* ===== ABA HISTÓRICO ===== */}
            <TabsContent value="history" className="pt-4 mt-0">
          {act && !createMode && (
            <AuditLogPanel recordId={act.id} tableName="activities" />
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

          <DialogFooter className="gap-2">
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
