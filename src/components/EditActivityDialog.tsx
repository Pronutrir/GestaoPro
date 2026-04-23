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
import { User, Calendar, Clock, DollarSign, Layers, Tag, X, Flag, Plus, Trash2, CheckCircle2, Circle, ArrowRightLeft, Pencil } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cascadeDates } from "@/lib/criticalPath";
import { AuditLogPanel } from "@/components/AuditLogPanel";
import { ActivityAttachments } from "@/components/ActivityAttachments";
import { ActivityDependencies } from "@/components/ActivityDependencies";
import { ActivityComments } from "@/components/ActivityComments";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { History, ChevronDown, Hash, Copy, UserCircle, Lock } from "lucide-react";
import { BookOpen } from "lucide-react";

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
}: EditActivityDialogProps) => {
  const { toast } = useToast();
  const [draftActivity, setDraftActivity] = useState<Activity | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const effectiveActivity = createMode ? draftActivity : activity;
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
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{createMode ? "Nova Atividade" : "Editar Atividade"}</DialogTitle>
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
              {act.closed_at && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="text-primary flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Encerrada em {new Date(act.closed_at).toLocaleDateString("pt-BR")}
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
          <div className="space-y-2 min-w-0">
            <Label htmlFor="title" className="text-sm font-semibold text-foreground">Título *</Label>
            <Textarea
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              rows={1}
              autoResize
              className="min-h-[44px] w-full min-w-0 font-medium break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
            />
          </div>

          <div className="space-y-2 min-w-0">
            <Label htmlFor="description" className="text-sm font-semibold text-foreground">Descrição</Label>
            <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} autoResize placeholder="Descreva a atividade..." className="w-full min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]" />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Flag className="w-4 h-4" /> Prioridade
            </Label>
            <div className="flex gap-2">
              {[
                { value: "low", label: "Baixa", color: "bg-muted text-muted-foreground" },
                { value: "medium", label: "Média", color: "bg-warning/20 text-warning" },
                { value: "high", label: "Alta", color: "bg-destructive/20 text-destructive" },
              ].map((p) => (
                <button key={p.value} type="button"
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${formData.priority === p.value ? `${p.color} border-current ring-2 ring-current/20` : "border-border text-muted-foreground hover:border-foreground/30"}`}
                  onClick={() => setFormData({ ...formData, priority: p.value })}
                >{p.label}</button>
              ))}
            </div>
          </div>

          {/* Responsável + RACI */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <User className="w-4 h-4" /> Responsável
              </Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.assigned_to}
                onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
              >
                <option value="">Sem responsável</option>
                {members.map((m) => (
                  <option key={m.full_name} value={m.full_name!}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>
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

          <div className="grid grid-cols-2 gap-4">
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

          <div className={`grid ${isQualityProject ? "grid-cols-3" : "grid-cols-2"} gap-4`}>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Data de Início
              </Label>
              <Input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Data de Fim
              </Label>
              <Input type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
            </div>
            {isQualityProject && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Data de Atualização
                </Label>
                <Input type="date" value={formData.last_update_date} onChange={(e) => setFormData({ ...formData, last_update_date: e.target.value })} />
              </div>
            )}
          </div>

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

          {/* Sub-atividades */}
          {act && projectId && (
            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Sub-atividades ({subActivities.length})
              </h3>
              {subActivities.length > 0 && (
                <div className="space-y-1.5">
                  {subActivities.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border border-border/50 group">
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => handleToggleSubActivity(sub)}>
                        {sub.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground" />}
                      </Button>
                      <p className={`text-xs font-medium truncate flex-1 ${sub.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {sub.title}
                      </p>
                      {sub.assigned_to && <span className="text-[10px] text-muted-foreground">👤 {sub.assigned_to}</span>}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={() => { setEditingSubActivity(sub); setEditingSubOpen(true); }}
                        title="Editar sub-atividade"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => handleDeleteSubActivity(sub.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input placeholder="Adicionar sub-atividade..." value={newSubTitle} onChange={(e) => setNewSubTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddSubActivity(); } }} className="h-8 text-sm" />
                <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={handleAddSubActivity}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Mover para Coluna */}
          {act && projectId && workflowStages.length > 0 && (
            <div className="border-t border-border pt-4 space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-primary" /> Mover para Coluna
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {workflowStages.map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                      currentStageId === stage.id
                        ? "ring-2 ring-primary/30 border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:bg-accent/30"
                    }`}
                    onClick={async () => {
                      if (currentStageId === stage.id) return;
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
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: stage.color }} />
                    {stage.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Anexos */}
          {act && projectId && (
            <div className="border-t border-border pt-4">
              <ActivityAttachments activityId={act.id} projectId={projectId} />
            </div>
          )}

          {/* Tarefas vinculadas (predecessoras / sucessoras) */}
          {act && projectId && (
            <div className="border-t border-border pt-4">
              <ActivityDependencies activityId={act.id} projectId={projectId} />
            </div>
          )}

          {/* Comentários */}
          {act && (
            <div className="border-t border-border pt-4">
              <ActivityComments activityId={act.id} />
            </div>
          )}

          {act && !createMode && (
            <Collapsible className="border border-border rounded-lg">
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-accent/30 transition-colors rounded-lg">
                <span className="text-sm font-semibold flex items-center gap-2">
                  <History className="w-4 h-4" /> Histórico de alterações
                </span>
                <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="p-3 pt-0">
                <AuditLogPanel recordId={act.id} tableName="activities" />
              </CollapsibleContent>
            </Collapsible>
          )}

          <DialogFooter className="gap-2">
            {act && !createMode && act.status !== "completed" && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto gap-2 text-success border-success/30 hover:bg-success/10"
                onClick={async () => {
                  if (!act || !projectId) return;
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
                  if (!confirm("Encerrar esta atividade? Após o encerramento, ela ficará marcada como finalizada administrativamente.")) return;
                  try {
                    const { error } = await supabase.from("activities").update({ closed_at: new Date().toISOString() }).eq("id", act.id);
                    if (error) throw error;
                    toast({ title: "Atividade encerrada!" });
                    onActivityUpdated();
                    onOpenChange(false);
                  } catch {
                    toast({ title: "Erro ao encerrar", variant: "destructive" });
                  }
                }}
              >
                <Lock className="w-4 h-4" /> Encerrar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
            <Button type="submit">{createMode ? "Criar Atividade" : "Salvar Alterações"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
