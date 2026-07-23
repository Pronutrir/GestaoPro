'use client';
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Calendar, Clock, DollarSign, Layers, Tag, X, Flag, Plus, Trash2, CheckCircle2, Circle, ArrowRightLeft, Pencil, Diamond, ArrowRight, Link2, Package } from "lucide-react";
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
import { GutPrioritySelector } from "@/components/GutPrioritySelector";
import { GUT_META, gutLabel, gutScore, normalizeGut, type GutLevel } from "@/lib/gutPriority";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildAvatarLookupMap, getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";

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

// Papéis EAP (PMBOK). O marco não é um item_type — é a flag is_milestone.
//   fase → Fase/Entrega · pacote → Pacote de Trabalho · atividade → trabalho (folha)
type EapType = "fase" | "pacote" | "atividade";

// Normaliza qualquer valor legado de item_type (tarefa/subtarefa/atividade/…)
// para um dos papéis EAP. historia_usuario e desconhecidos caem em "atividade".
const toEapType = (raw: unknown): EapType =>
  raw === "fase" ? "fase" : raw === "pacote" ? "pacote" : "atividade";

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

interface PersonOption {
  id: string;
  full_name: string;
  sector: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

function normalizePersonOptions(options: Array<Partial<PersonOption> | null | undefined>): PersonOption[] {
  const normalized = options
    .filter((option): option is Partial<PersonOption> & { full_name: string } => Boolean(option?.full_name?.trim()))
    .map((option, index) => ({
      id: typeof option.id === "string" && option.id.trim().length > 0
        ? option.id
        : `person-${option.full_name.trim()}-${option.sector ?? "no-sector"}-${index}`,
      full_name: option.full_name.trim(),
      sector: option.sector ?? null,
      email: option.email ?? null,
      avatar_url: option.avatar_url ?? null,
    }));

  // Dedup por full_name: o nome é o valor selecionável (assigned_to/owner são
  // strings de nome), então perfis distintos com o mesmo nome são o mesmo valor
  // — manter os dois quebra o Radix Select (value duplicado). Mantém o 1º.
  const seenNames = new Set<string>();
  return normalized.filter((option) => {
    const key = option.full_name.toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
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
  projectLocked?: boolean;
  defaultStageId?: string | null;
  defaultPhaseId?: string | null;
  defaultParentId?: string | null;
  onActivityCreated?: (activityId: string) => void;
  /** When set, shows a breadcrumb back to the parent activity (used when editing a sub-activity). */
  parentActivityTitle?: string;
  /** Called when user clicks the "Back" arrow — used to close only the nested dialog and return to parent. */
  onBackToParent?: () => void;
  /** Minutes apontados por atividade (fonte: time_entries) para cálculo de tempo real. */
  consumedMinutesByActivity?: Record<string, number>;
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

function parseWbsSegments(code: string | null | undefined): number[] | null {
  const value = (code || "").trim();
  if (!value || !/^\d+(\.\d+)*$/.test(value)) return null;
  return value.split(".").map((part) => Number(part));
}

function compareWbsCodes(a: string | null | undefined, b: string | null | undefined): number {
  const segA = parseWbsSegments(a);
  const segB = parseWbsSegments(b);

  if (segA && segB) {
    const len = Math.max(segA.length, segB.length);
    for (let i = 0; i < len; i++) {
      const av = segA[i] ?? -1;
      const bv = segB[i] ?? -1;
      if (av !== bv) return av - bv;
    }
    return 0;
  }

  if (segA) return -1;
  if (segB) return 1;
  return 0;
}

function sortByWbsThenDisplayOrder<T extends { wbs_code?: string | null; display_order?: number | null; title?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const byWbs = compareWbsCodes(a.wbs_code, b.wbs_code);
    if (byWbs !== 0) return byWbs;

    const da = a.display_order ?? Number.MAX_SAFE_INTEGER;
    const db = b.display_order ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;

    return (a.title || "").localeCompare(b.title || "", "pt-BR", { sensitivity: "base" });
  });
}

const mapLevelToPriority = (level: GutLevel): string => {
  if (level === "pendente") return "pendente";
  return level;
};

const SubActivityGutPopover = ({
  sub,
  dotClass,
  pulse,
  onSave,
}: {
  sub: Activity;
  dotClass: string;
  pulse: boolean;
  onSave: (payload: { gravity: number | null; urgency: number | null; tendency: number | null; priority: string; priority_score: number | null }) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [gravity, setGravity] = useState<number | null>((sub as any).gravity ?? null);
  const [urgency, setUrgency] = useState<number | null>((sub as any).urgency ?? null);
  const [tendency, setTendency] = useState<number | null>((sub as any).tendency ?? null);

  useEffect(() => {
    setGravity((sub as any).gravity ?? null);
    setUrgency((sub as any).urgency ?? null);
    setTendency((sub as any).tendency ?? null);
  }, [sub.id, (sub as any).gravity, (sub as any).urgency, (sub as any).tendency]);

  const score = useMemo(() => gutScore(gravity, urgency, tendency), [gravity, urgency, tendency]);
  const level = useMemo(() => gutLabel(score), [score]);
  const meta = GUT_META[level];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mx-auto h-6 w-6 rounded flex items-center justify-center hover:bg-muted"
          title={`Prioridade: ${meta.label}${score != null ? ` (${score})` : ""}`}
        >
          <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${dotClass} ${pulse ? "animate-pulse" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-3" align="center">
        <div className="text-xs font-semibold text-foreground mb-2">Matriz GUT</div>
        <GutPrioritySelector
          gravity={gravity}
          urgency={urgency}
          tendency={tendency}
          compact
          onChange={(next) => {
            setGravity(next.gravity);
            setUrgency(next.urgency);
            setTendency(next.tendency);
          }}
        />
        <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-border/60">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setGravity(null);
              setUrgency(null);
              setTendency(null);
            }}
          >
            Limpar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              await onSave({
                gravity,
                urgency,
                tendency,
                priority: mapLevelToPriority(level),
                priority_score: score,
              });
              setOpen(false);
            }}
          >
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const EditActivityDialog = ({
  activity, open, onOpenChange, onActivityUpdated,
  phases = [], allActivities = [], projectId, isQualityProject = false,
  initialTab = "details",
  createMode = false, projectLocked = false, defaultStageId = null, defaultPhaseId = null, defaultParentId = null,
  onActivityCreated,
  parentActivityTitle, onBackToParent,
  consumedMinutesByActivity = {},
}: EditActivityDialogProps) => {
  const { toast } = useToast();
  const ensureProjectUnlocked = () => {
    if (!projectLocked) return true;
    toast({
      title: "Projeto concluído",
      description: "Reabra o projeto para alterar atividades.",
      variant: "destructive",
    });
    return false;
  };
  const [draftActivity, setDraftActivity] = useState<Activity | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const effectiveActivity = createMode ? draftActivity : activity;
  const { blockers, isBlocked: isBlockedByOthers } = useTaskBlockers(effectiveActivity?.id);
  const [formData, setFormData] = useState({
    title: "", description: "", assigned_to: "",
    start_date: "", end_date: "", cost: "", hours: "",
    actual_start_date: "",
    actual_end_date: "",
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
    item_type: "atividade" as EapType,
    progress_flag: 0 as number,
    wbs_code: "" as string,
  });
  const [newTag, setNewTag] = useState("");
  const [newSubTitle, setNewSubTitle] = useState("");
  const [subActivities, setSubActivities] = useState<Activity[]>([]);
  const [editingSubActivity, setEditingSubActivity] = useState<Activity | null>(null);
  const [editingSubOpen, setEditingSubOpen] = useState(false);
  const [members, setMembers] = useState<PersonOption[]>([]);
  const memberAvatarMap = useMemo(() => buildAvatarLookupMap(members), [members]);
  const [allProfiles, setAllProfiles] = useState<PersonOption[]>([]);
  const [workflowStages, setWorkflowStages] = useState<{ id: string; title: string; color: string; display_order: number; is_final: boolean }[]>([]);
  const [currentStageId, setCurrentStageId] = useState("");
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [storiesCount, setStoriesCount] = useState<number>(0);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null);
  const [lastEditorName, setLastEditorName] = useState<string | null>(null);
  const [lastEditorEmail, setLastEditorEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "subtasks" | "attachments" | "comments" | "stories" | "history">(initialTab);
  const orderedSubActivities = useMemo(
    () => sortByWbsThenDisplayOrder(subActivities),
    [subActivities]
  );

  // Horas do pai: quando há subatividades, o planejado é um rollup automático
  // (soma dos filhos diretos), somente-leitura — não existe mais divergência
  // possível entre pai e subs, nem bloqueio ao salvar.
  // Só considera subatividades que realmente pertencem ao card aberto. Protege
  // contra estado transitório (subs do card anterior) que corromperia o rollup.
  const ownSubActivities = useMemo(
    () => (effectiveActivity ? subActivities.filter((s) => s.parent_id === effectiveActivity.id) : []),
    [subActivities, effectiveActivity],
  );
  const hasSubActivities = ownSubActivities.length > 0;
  const subHoursTotal = ownSubActivities.reduce((sum, s) => sum + (Number((s as any).hours) || 0), 0);
  const parentHoursNum = hasSubActivities ? subHoursTotal : parseHoursInput(formData.hours);

  // Rollup no banco: sempre que a soma das subs mudar (add/remover/editar horas
  // de uma sub, concluir), persiste o total no pai se estiver defasado. Cobre
  // todos os caminhos de edição de sub deste diálogo num único ponto.
  useEffect(() => {
    if (createMode || !effectiveActivity || !hasSubActivities) return;
    const current = Number((effectiveActivity as any).hours) || 0;
    if (Math.abs(current - subHoursTotal) <= 0.01) return;
    void supabase
      .from("activities")
      .update({ hours: subHoursTotal } as any)
      .eq("id", effectiveActivity.id)
      .then(() => onActivityUpdated());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subHoursTotal, hasSubActivities, effectiveActivity?.id, createMode]);

  // Custo: mesma regra dos 100% — com subs, o custo do pai é a soma das subs
  // (rollup somente-leitura + persistência no banco).
  const subCostTotal = ownSubActivities.reduce((sum, s) => sum + (Number((s as any).cost) || 0), 0);
  useEffect(() => {
    if (createMode || !effectiveActivity || !hasSubActivities) return;
    const current = Number((effectiveActivity as any).cost) || 0;
    if (Math.abs(current - subCostTotal) <= 0.01) return;
    void supabase
      .from("activities")
      .update({ cost: subCostTotal } as any)
      .eq("id", effectiveActivity.id)
      .then(() => onActivityUpdated());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subCostTotal, hasSubActivities, effectiveActivity?.id, createMode]);

  // Horas: Consumidas (automático por conclusão) e Planejadas
  const subsComputed = subActivities.reduce((sum, s) => {
    const auto = s.status === "completed" ? (Number((s as any).hours) || 0) : 0;
    return sum + auto;
  }, 0);
  const ownAutoConsumed = effectiveActivity?.status === "completed" ? parentHoursNum : 0;
  const computedHours = subActivities.length > 0 ? subsComputed : ownAutoConsumed;
  const trackedOwnHours = effectiveActivity ? (Number(consumedMinutesByActivity[effectiveActivity.id]) || 0) / 60 : 0;
  const trackedSubHours = subActivities.reduce((sum, s) => sum + ((Number(consumedMinutesByActivity[s.id]) || 0) / 60), 0);
  const trackedHours = subActivities.length > 0 ? trackedSubHours : trackedOwnHours;
  const consumedHours = trackedHours > 0 ? trackedHours : computedHours;
  const consumedFromTrackedEntries = trackedHours > 0;
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
    if (createMode && projectLocked) {
      toast({
        title: "Projeto concluído",
        description: "Reabra o projeto para criar atividades.",
        variant: "destructive",
      });
      onOpenChange(false);
      return;
    }
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
    supabase.from("profiles").select("id, full_name, sector, email, avatar_url").eq("is_active", true).then(({ data }) => {
      if (data) setAllProfiles(normalizePersonOptions(data));
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
          supabase.from("profiles").select("id, full_name, sector, email, avatar_url").in("id", userIds).then(({ data: profiles }) => {
            if (profiles) setMembers(normalizePersonOptions(profiles));
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
        end_date: act.end_date || ((act as any).is_milestone ? (act.start_date || "") : ""),
        actual_start_date: (act as any).actual_start_date || "",
        actual_end_date: (act as any).actual_end_date || "",
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
        item_type: toEapType((act as any).item_type),
        progress_flag: typeof (act as any).progress_flag === "number" ? (act as any).progress_flag : 0,
        wbs_code: (act as any).wbs_code || "",
      });
      setCurrentStageId((act as any).workflow_stage_id || "");
      // Limpa as subs do card anterior ANTES do fetch async. Sem isso, há uma
      // janela em que o rollup roda com os filhos do card anterior aplicados ao
      // card atual — corrompendo hours/cost (ex.: abrir uma folha logo após um
      // agrupador gravava a soma do agrupador na folha).
      setSubActivities([]);
      fetchSubActivities(act.id);
    }
  }, [activity, draftActivity, createMode]);

  

  const fetchSubActivities = async (parentId: string) => {
    const { data } = await (supabase.from("activities").select("*") as any)
      .eq("parent_id", parentId)
      .eq("is_trashed", false)
      .order("display_order");
    if (data) setSubActivities(sortByWbsThenDisplayOrder(data as Activity[]));
  };

  const getPendingDescendantsCount = async (targetId: string) => {
    if (!projectId) {
      return subActivities.filter((candidate) => candidate.status !== "completed").length;
    }

    const { data: hierarchyRows } = await supabase
      .from("activities")
      .select("id,parent_id,status")
      .eq("project_id", projectId)
      .eq("is_trashed", false);

    const childrenMap = new Map<string, Array<{ id: string; status: string; parent_id: string | null }>>();
    (hierarchyRows || []).forEach((candidate) => {
      if (!candidate.parent_id) return;
      const arr = childrenMap.get(candidate.parent_id) || [];
      arr.push(candidate as { id: string; status: string; parent_id: string | null });
      childrenMap.set(candidate.parent_id, arr);
    });

    const stack = [...(childrenMap.get(targetId) || [])];
    const seen = new Set<string>();
    let pendingCount = 0;

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current.id)) continue;
      seen.add(current.id);

      if (current.status !== "completed") {
        pendingCount += 1;
      }

      const children = childrenMap.get(current.id) || [];
      children.forEach((child) => stack.push(child));
    }

    return pendingCount;
  };

  const handleAddSubActivity = async () => {
    if (!ensureProjectUnlocked()) return;
    const act = effectiveActivity;
    if (!newSubTitle.trim() || !act || !projectId) return;

    // EAP: um pai precisa ser agrupador para ter filhos. Se hoje é folha
    // (atividade/marco), promove a "pacote" antes de inserir — senão o trigger
    // rejeita. Pacote pode conter pacote, então é sempre seguro em qualquer nível.
    // TOLERANTE: se o banco ainda não aceita 'pacote' (CHECK antigo, migration
    // mínima pendente), a promoção falha silenciosamente e seguimos criando o
    // subitem — o pai já funciona como agrupador por ter filhos.
    const parentType = toEapType((act as any).item_type);
    if (parentType === "atividade" || (act as any).is_milestone) {
      const { error: promoteErr } = await supabase
        .from("activities")
        .update({ item_type: "pacote", is_milestone: false } as any)
        .eq("id", act.id);
      if (!promoteErr) {
        setFormData((prev) => ({ ...prev, item_type: "pacote", is_milestone: false }));
      }
    }

    await supabase.from("activities").insert({
      project_id: projectId, title: newSubTitle.trim(),
      phase_id: act.phase_id, parent_id: act.id,
      item_type: "atividade",
      workflow_stage_id: (act as any).workflow_stage_id || null,
      display_order: subActivities.length,
    });
    setNewSubTitle("");
    fetchSubActivities(act.id);
    onActivityUpdated();
  };

  const handleDeleteSubActivity = async (subId: string) => {
    if (!ensureProjectUnlocked()) return;
    await supabase.from("activities").delete().eq("id", subId);
    if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
    onActivityUpdated();
  };

  const handleToggleSubActivity = async (sub: Activity) => {
    if (!ensureProjectUnlocked()) return;
    const newStatus = sub.status === "completed" ? "pending" : "completed";
    const finalStage = workflowStages.find((stage) => stage.is_final);
    const backlogStage = workflowStages.find((stage) => stage.display_order === 0) || workflowStages[0];
    const currentStageId = sub.workflow_stage_id || null;
    // Ao reabrir, NUNCA voltar para a coluna Final — preferir last_progress (se não for a Final),
    // depois a coluna atual (se não for a Final), por fim o Backlog.
    const lastProgressNotFinal =
      sub.last_progress_stage_id && sub.last_progress_stage_id !== finalStage?.id
        ? sub.last_progress_stage_id
        : null;
    const reopenStageId =
      lastProgressNotFinal ||
      (currentStageId && currentStageId !== finalStage?.id ? currentStageId : null) ||
      backlogStage?.id ||
      null;
    const updateData: any = {
      status: newStatus,
      completed_at: newStatus === "completed" ? new Date().toISOString() : null,
    };
    if (newStatus === "completed") {
      updateData.actual_start_date = (sub as any).actual_start_date || new Date().toISOString().slice(0, 10);
      updateData.actual_end_date = new Date().toISOString().slice(0, 10);
      if (finalStage?.id) {
        updateData.workflow_stage_id = finalStage.id;
      }
      if (currentStageId && currentStageId !== finalStage?.id) {
        updateData.last_progress_stage_id = currentStageId;
      }
    } else if (reopenStageId) {
      updateData.workflow_stage_id = reopenStageId;
      updateData.actual_end_date = null;
    }

    // Atualização otimista no estado local para feedback imediato
    setSubActivities((prev) =>
      prev.map((s) =>
        s.id === sub.id
          ? ({
              ...s,
              status: newStatus,
              completed_at: updateData.completed_at,
              actual_start_date: updateData.actual_start_date ?? (s as any).actual_start_date ?? null,
              actual_end_date: updateData.actual_end_date ?? (s as any).actual_end_date ?? null,
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
            actual_start_date: (parent as any).actual_start_date || new Date().toISOString().slice(0, 10),
            actual_end_date: new Date().toISOString().slice(0, 10),
          };
          if (finalStage?.id) parentUpdate.workflow_stage_id = finalStage.id;
          if (parent.workflow_stage_id && parent.workflow_stage_id !== finalStage?.id) {
            parentUpdate.last_progress_stage_id = parent.workflow_stage_id;
          }
          await supabase.from("activities").update(parentUpdate).eq("id", parent.id);
        } else if (newStatus === "pending" && parent.status === "completed") {
          // Reabriu uma sub e o pai estava concluído → reabre o pai
          const parentLastProgressNotFinal =
            parent.last_progress_stage_id && parent.last_progress_stage_id !== finalStage?.id
              ? parent.last_progress_stage_id
              : null;
          const parentReopenStageId =
            parentLastProgressNotFinal ||
            (parent.workflow_stage_id && parent.workflow_stage_id !== finalStage?.id ? parent.workflow_stage_id : null) ||
            backlogStage?.id ||
            null;
          await supabase.from("activities").update({
            status: "pending",
            completed_at: null,
            actual_end_date: null,
            ...(parentReopenStageId ? { workflow_stage_id: parentReopenStageId } : {}),
          }).eq("id", parent.id);
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
    if (!ensureProjectUnlocked()) return;
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

      const updatePayload: any = {
        title: formData.title,
        description: formData.description || null,
        assigned_to: formData.assigned_to || null,
        start_date: formData.is_milestone ? null : (formData.start_date || null),
        actual_start_date: formData.actual_start_date || null,
        actual_end_date: formData.actual_end_date || null,
        end_date: formData.end_date || null,
        cost: hasSubActivities ? subCostTotal : (parseFloat(formData.cost) || 0),
        // Rollup: com subatividades, o planejado do pai é a soma dos filhos.
        hours: hasSubActivities ? subHoursTotal : parseHoursInput(formData.hours),
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
      };

      const compatPayload: Record<string, any> = { ...updatePayload };
      const droppedColumns: string[] = [];
      let error: any = null;
      for (let i = 0; i < 8; i += 1) {
        const result = await supabase
          .from("activities")
          .update(compatPayload as any)
          .eq("id", act.id);
        error = result.error;
        if (!error) break;

        const errorText = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
        const missingMatch =
          errorText.match(/Could not find the '([a-zA-Z0-9_]+)' column/i) ||
          errorText.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of relation/i) ||
          errorText.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i);
        const missingColumn = missingMatch?.[1];

        if (!missingColumn || !(missingColumn in compatPayload)) {
          break;
        }

        delete compatPayload[missingColumn];
        droppedColumns.push(missingColumn);
      }

      if (error) throw error;

      if (droppedColumns.length > 0) {
        toast({
          title: "Atividade salva com aviso",
          description: `Alguns campos não foram salvos neste ambiente: ${droppedColumns.join(", ")}`,
          variant: "destructive",
        });
      }

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
        }
      }

      onActivityUpdated();
      if (createMode) {
        setDraftActivity(null);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);
      const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
      const detail = [maybe?.message, maybe?.details, maybe?.hint, maybe?.code].filter(Boolean).join(" | ");
      const fallback = detail || (typeof error === "string" ? error : "Tente novamente.");
      toast({
        title: "Erro ao atualizar atividade",
        description: fallback,
        variant: "destructive",
      });
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

  const handleDuplicateActivity = async (activityId: string, kind: "atividade" | "subatividade") => {
    if (duplicatingId) return;
    setDuplicatingId(activityId);
    try {
      const { duplicateActivity } = await import("@/lib/duplicateActivity");
      await duplicateActivity({ activityId, includeChildren: true });
      toast({
        title: kind === "subatividade" ? "Subatividade duplicada!" : "Atividade duplicada!",
        description: "A hierarquia de subtarefas tambem foi duplicada.",
      });
      onActivityUpdated();
      if (effectiveActivity) {
        fetchSubActivities(effectiveActivity.id);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Tente novamente";
      toast({
        title: "Erro ao duplicar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDuplicatingId(null);
    }
  };

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
                }}
              >
                {act.id.slice(0, 8)}
                <Copy className="w-3 h-3 opacity-50" />
              </button>
              {!!formData.wbs_code.trim() && (
                <>
                  <span className="opacity-50">·</span>
                  <span
                    className="inline-flex items-center h-5 px-1.5 rounded border border-border bg-muted/40 font-mono text-[10px] text-muted-foreground"
                    title="Código EAP"
                  >
                    EAP {formData.wbs_code.trim()}
                  </span>
                </>
              )}
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
              {!!formData.wbs_code.trim() && (
                <span
                  className="shrink-0 inline-flex items-center h-6 px-2 rounded-md border border-border bg-muted/40 text-[11px] font-mono text-muted-foreground"
                  title="Código EAP"
                >
                  {formData.wbs_code.trim()}
                </span>
              )}
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

                              if (stage.is_final && act) {
                                const pendingCount = await getPendingDescendantsCount(act.id);
                                if (pendingCount > 0) {
                                  toast({
                                    title: "Atividade com pendências",
                                    description: `Não é possível concluir enquanto existirem ${pendingCount} subatividade(s) pendente(s).`,
                                    variant: "destructive",
                                  });
                                  return;
                                }
                              }

                              try {
                                if (!ensureProjectUnlocked()) return;
                                const today = new Date().toISOString().slice(0, 10);
                                const updateData: any = { workflow_stage_id: stage.id };
                                if (stage.is_final) {
                                  updateData.status = "completed";
                                  updateData.completed_at = new Date().toISOString();
                                  updateData.actual_start_date = (act as any).actual_start_date || today;
                                  updateData.actual_end_date = today;
                                } else if (act.status === "completed") {
                                  updateData.status = "pending";
                                  updateData.completed_at = null;
                                  updateData.actual_end_date = null;
                                } else if (!(act as any).actual_start_date && stage.display_order > 0) {
                                  updateData.actual_start_date = today;
                                }
                                const { error } = await supabase.from("activities").update(updateData).eq("id", act.id);
                                if (error) throw error;
                                await supabase.from("user_stories").update({ stage_id: stage.id }).eq("activity_id", act.id);
                                setCurrentStageId(stage.id);
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
                  <div className="flex flex-wrap items-end gap-2 text-xs">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {formData.is_milestone ? "Fim" : "Início"}
                      </span>
                      <Input
                        type="date"
                        value={formData.is_milestone ? formData.end_date : formData.start_date}
                        onChange={(e) =>
                          setFormData(
                            formData.is_milestone
                              ? { ...formData, end_date: e.target.value }
                              : { ...formData, start_date: e.target.value }
                          )
                        }
                        className={`h-7 px-1.5 text-xs w-[130px] ${dateRangeInvalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      />
                    </div>
                    {!formData.is_milestone && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Fim</span>
                        <Input
                          type="date"
                          value={formData.end_date}
                          onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                          className={`h-7 px-1.5 text-xs w-[130px] ${dateRangeInvalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        />
                      </div>
                    )}
                    {!formData.is_milestone && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Início real</span>
                        <Input
                          type="date"
                          value={formData.actual_start_date}
                          onChange={(e) => setFormData({ ...formData, actual_start_date: e.target.value })}
                          className="h-7 px-1.5 text-xs w-[130px]"
                        />
                      </div>
                    )}
                    {!formData.is_milestone && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Término real</span>
                        <Input
                          type="date"
                          value={formData.actual_end_date}
                          onChange={(e) => setFormData({ ...formData, actual_end_date: e.target.value })}
                          className="h-7 px-1.5 text-xs w-[130px]"
                        />
                      </div>
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
                {!isQualityProject && (act?.actual_start_date || act?.actual_end_date) && !formData.is_milestone && (
                  <PropertyRow icon={<Calendar className="w-3.5 h-3.5 text-muted-foreground" />} label="Real">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">
                        {(act?.actual_start_date || "—").split("-").reverse().join("/")}
                      </span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="font-mono">
                        {((act?.actual_end_date || "—") + "").split("-").reverse().join("/")}
                      </span>
                      {(() => {
                        const real = act?.actual_end_date || null;
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
                    <ActivityRelationsInline
                      activityId={act.id}
                      projectId={projectId}
                      onChanged={() => {
                        if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
                        onActivityUpdated();
                      }}
                    />
                  </PropertyRow>
                )}

                {/* Tempo */}
                {!formData.is_milestone && (
                  <PropertyRow icon={<Clock className="w-3.5 h-3.5" />} label="Tempo">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {hasSubActivities ? (
                        // Com subatividades: horas do pai = soma das subs (rollup,
                        // somente-leitura). Sem campo concorrente => sem divergência.
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="h-7 px-2 text-xs w-[140px] flex items-center rounded-md border border-input bg-muted/40 text-muted-foreground cursor-default">
                                {formatHoursDisplay(subHoursTotal) || "0h"}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[240px] text-xs">
                              Somado automaticamente das subatividades. Edite as horas em cada subatividade.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <>
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
                        </>
                      )}
                      {(plannedHours > 0 || consumedHours > 0) && (
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${
                            // Vermelho só quando o consumo ESTOURA o planejado.
                            // Consumir menos ou igual é normal => neutro.
                            plannedHours > 0 && consumedHours > plannedHours
                              ? "text-destructive border-destructive/40 bg-destructive/10"
                              : "text-muted-foreground border-border bg-muted/30"
                          }`}
                          title={
                            consumedFromTrackedEntries
                              ? "Tempo real somado de apontamentos (time_entries)"
                              : subActivities.length > 0
                              ? "Consumido automático das subatividades concluídas"
                              : "Consumido automático da atividade concluída"
                          }
                        >
                          Consumidas ({consumedFromTrackedEntries ? "real" : "auto"}): {formatHoursDisplay(consumedHours) || "0h"} / Planejadas: {formatHoursDisplay(plannedHours) || "0h"}
                        </span>
                      )}
                    </div>
                  </PropertyRow>
                )}

                {/* Custo */}
                {!formData.is_milestone && (
                  <PropertyRow icon={<DollarSign className="w-3.5 h-3.5" />} label="Custo">
                    {hasSubActivities ? (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="h-7 px-2 text-xs w-[140px] flex items-center rounded-md border border-input bg-muted/40 text-muted-foreground cursor-default">
                              {subCostTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[240px] text-xs">
                            Somado automaticamente das subatividades. Edite o custo em cada subatividade.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <CurrencyInput
                        step="0.01"
                        min="0"
                        value={formData.cost}
                        onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                        className="h-7 pl-8 pr-2 py-0 text-xs w-[140px]"
                      />
                    )}
                  </PropertyRow>
                )}
                {/* Líder — exibe TODOS os usuários cadastrados, opcional */}
                <PropertyRow icon={<User className="w-3.5 h-3.5" />} label="Líder">
                  <Select
                    value={formData.assigned_to || "_none"}
                    onValueChange={(value) => setFormData({ ...formData, assigned_to: value === "_none" ? "" : value })}
                  >
                    <SelectTrigger className="h-8 text-xs w-full max-w-[320px]">
                      {(() => {
                        const selected = allProfiles.find((m) => m.full_name === formData.assigned_to);
                        if (!selected && !formData.assigned_to) {
                          return <div className="text-muted-foreground">Sem líder</div>;
                        }
                        if (!selected && formData.assigned_to) {
                          return (
                            <div className="flex items-center gap-1.5 min-w-0 w-full pr-1">
                              <Avatar className="h-5 w-5 shrink-0">
                                <AvatarFallback className="text-[9px]">{getAvatarInitials(formData.assigned_to)}</AvatarFallback>
                              </Avatar>
                              <span className="truncate leading-none">{formData.assigned_to}</span>
                            </div>
                          );
                        }
                        return (
                          <div className="flex items-center gap-1.5 min-w-0 w-full pr-1">
                            <Avatar className="h-5 w-5 shrink-0">
                              {selected?.avatar_url ? <AvatarImage src={selected.avatar_url} alt={selected.full_name} /> : null}
                              <AvatarFallback className="text-[9px]">{getAvatarInitials(selected?.full_name)}</AvatarFallback>
                            </Avatar>
                            <span className="truncate leading-none">
                              {selected?.full_name}{selected?.sector ? ` — ${selected.sector}` : ""}
                            </span>
                          </div>
                        );
                      })()}
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      className="max-h-[min(320px,calc(100vh-180px))] overflow-y-auto"
                    >
                      <SelectItem value="_none">Sem líder</SelectItem>
                      {allProfiles.map((m) => (
                        <SelectItem key={m.id} value={m.full_name}>
                          <div className="flex items-center gap-2 min-w-0 w-full">
                            <Avatar className="h-5 w-5 shrink-0">
                              {m.avatar_url ? <AvatarImage src={m.avatar_url} alt={m.full_name} /> : null}
                              <AvatarFallback className="text-[9px]">{getAvatarInitials(m.full_name)}</AvatarFallback>
                            </Avatar>
                            <span className="truncate leading-none">{m.full_name}{m.sector ? ` — ${m.sector}` : ""}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertyRow>

                {/* Prioridade — método GUT */}
                <PropertyRow icon={<Flag className="w-3.5 h-3.5" />} label="Prioridade (GUT)">
                  <div className="w-full min-w-0 max-w-[680px]">
                    <GutPriorityField
                      gravity={formData.gravity}
                      urgency={formData.urgency}
                      tendency={formData.tendency}
                      onChange={(v) => setFormData({ ...formData, ...v })}
                    />
                  </div>
                </PropertyRow>

                {/* Tipo do item (papéis EAP/PMBOK): Atividade | Pacote | Fase | Marco.
                    Mutuamente exclusivo. Substitui os antigos switches. */}
                {(() => {
                  type Kind = "atividade" | "pacote" | "fase" | "marco";
                  // Tipo manual: reflete exatamente o item_type gravado.
                  const itemKind: Kind = formData.is_milestone ? "marco" : formData.item_type;
                  const setKind = (kind: Kind) =>
                    setFormData({
                      ...formData,
                      is_milestone: kind === "marco",
                      // Marco grava como 'atividade' no item_type (o tipo é a flag is_milestone).
                      item_type: kind === "marco" ? "atividade" : kind,
                      // Marco é um ponto no tempo — não tem intervalo de fim.
                      end_date: kind === "marco" ? "" : formData.end_date,
                    });

                  // Regra de aninhamento EAP por PAPEL (espelha o trigger):
                  // folha (atividade/marco) não pode ter filhos; agrupador
                  // (fase/pacote) pode. Fase/Pacote aninham livremente, então
                  // ter pai não restringe o tipo — só ter filhos restringe.
                  const isGroupKind = (kind: Kind) => kind === "fase" || kind === "pacote";
                  const kindDisabledReason = (kind: Kind): string | null => {
                    if (hasSubActivities && !isGroupKind(kind))
                      return "Este item tem subitens; escolha Pacote ou Fase.";
                    return null;
                  };
                  const KIND_OPTIONS: {
                    kind: Kind;
                    label: string;
                    icon: React.ReactNode;
                    hint: string;
                    activeCls: string;
                  }[] = [
                    {
                      kind: "atividade",
                      label: "Atividade",
                      icon: <Circle className="w-3.5 h-3.5" />,
                      hint: "Trabalho executável (folha da EAP), com estimativa e intervalo de datas próprios.",
                      activeCls: "border-primary bg-primary/10 text-primary",
                    },
                    {
                      kind: "pacote",
                      label: "Pacote",
                      icon: <Package className="w-3.5 h-3.5" />,
                      hint: "Pacote de trabalho: agrupa atividades. Prazo, horas e custo vêm dos itens que ele contém.",
                      activeCls: "border-amber-600 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                    },
                    {
                      kind: "fase",
                      label: "Fase",
                      icon: <Layers className="w-3.5 h-3.5" />,
                      hint: "Fase/entrega: agrupa pacotes e atividades. Datas e valores derivam dos filhos.",
                      activeCls: "border-primary bg-primary/10 text-primary",
                    },
                    {
                      kind: "marco",
                      label: "Marco",
                      icon: <Diamond className={`w-3.5 h-3.5 ${itemKind === "marco" ? "fill-amber-500" : ""}`} />,
                      hint: "Ponto único no tempo (uma data, sem intervalo). Não tem horas nem custo.",
                      activeCls: "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                    },
                  ];
                  const activeHint = KIND_OPTIONS.find((o) => o.kind === itemKind)?.hint;
                  return (
                    <PropertyRow
                      icon={
                        itemKind === "marco" ? (
                          <Diamond className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        ) : itemKind === "fase" ? (
                          <Layers className="w-3.5 h-3.5 text-primary" />
                        ) : itemKind === "pacote" ? (
                          <Package className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <Circle className="w-3.5 h-3.5" />
                        )
                      }
                      label="Tipo"
                    >
                      <div className="flex flex-col gap-1.5 w-full">
                        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30 w-fit">
                          {KIND_OPTIONS.map((opt) => {
                            const active = itemKind === opt.kind;
                            // Regra de aninhamento EAP: desabilita tipos que
                            // violariam a hierarquia (folha com filhos, ou nível
                            // incompatível com o pai). O tipo ativo nunca é
                            // desabilitado (evita travar o estado atual).
                            const reason = active ? null : kindDisabledReason(opt.kind);
                            const disabled = !!reason;
                            return (
                              <button
                                key={opt.kind}
                                type="button"
                                disabled={disabled}
                                onClick={() => setKind(opt.kind)}
                                aria-pressed={active}
                                title={reason ?? undefined}
                                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border ${
                                  active
                                    ? opt.activeCls
                                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                              >
                                {opt.icon}
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        {activeHint && (
                          <span className="text-[11px] text-muted-foreground">{activeHint}</span>
                        )}
                        {hasSubActivities && (
                          <span className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <Package className="w-3 h-3 shrink-0" />
                            Este item agrupa {ownSubActivities.length} subitem(ns) — por isso é um Pacote. Horas e custo são somados dos filhos (veja a aba Subatividades).
                          </span>
                        )}
                      </div>
                    </PropertyRow>
                  );
                })()}

                {/* Código EAP/WBS */}
                <PropertyRow icon={<Hash className="w-3.5 h-3.5" />} label="Código EAP">
                  <div className="flex flex-col gap-1 w-full max-w-[680px]">
                    <Input
                      value={formData.wbs_code}
                      onChange={(e) => setFormData({ ...formData, wbs_code: e.target.value })}
                      placeholder={(formData.parent_id || (act as any)?.parent_id) ? "Em branco = gerado automaticamente ao salvar" : ""}
                      className={cn(
                        "h-7 text-xs font-mono",
                        formData.wbs_code && !/^\d+(\.\d+){0,6}$/.test(formData.wbs_code.trim()) && "border-destructive"
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
                          <Select
                            value={p || "_none"}
                            onValueChange={(value) => {
                              const newName = value === "_none" ? "" : value;
                              if (newName !== p && formData.participants.includes(newName)) return;
                              const nextParticipants = [...formData.participants];
                              nextParticipants[idx] = newName;
                              setFormData({ ...formData, participants: nextParticipants });
                            }}
                          >
                            <SelectTrigger className="h-9 w-full text-sm">
                              {(() => {
                                const selected = allProfiles.find((m) => m.full_name === p);
                                if (!selected && !p) {
                                  return <div className="text-muted-foreground">Selecionar pessoa...</div>;
                                }
                                if (!selected && p) {
                                  return (
                                    <div className="flex items-center gap-2 min-w-0 w-full pr-1">
                                      <Avatar className="h-5 w-5 shrink-0">
                                        <AvatarFallback className="text-[9px]">{getAvatarInitials(p)}</AvatarFallback>
                                      </Avatar>
                                      <span className="truncate leading-none">{p}</span>
                                    </div>
                                  );
                                }
                                return (
                                  <div className="flex items-center gap-2 min-w-0 w-full pr-1">
                                    <Avatar className="h-5 w-5 shrink-0">
                                      {selected?.avatar_url ? <AvatarImage src={selected.avatar_url} alt={selected.full_name} /> : null}
                                      <AvatarFallback className="text-[9px]">{getAvatarInitials(selected?.full_name)}</AvatarFallback>
                                    </Avatar>
                                    <span className="truncate leading-none">{selected?.full_name}{selected?.sector ? ` — ${selected.sector}` : ""}</span>
                                  </div>
                                );
                              })()}
                            </SelectTrigger>
                            <SelectContent
                              position="popper"
                              side="bottom"
                              align="start"
                              sideOffset={6}
                              className="max-h-[min(320px,calc(100vh-180px))] overflow-y-auto"
                            >
                              <SelectItem value="_none">Selecionar pessoa...</SelectItem>
                              {allProfiles
                                .filter((m) => m.full_name && (m.full_name === p || !formData.participants.includes(m.full_name)))
                                .map((m) => (
                                  <SelectItem key={m.id} value={m.full_name}>
                                    <div className="flex items-center gap-2 min-w-0 w-full">
                                      <Avatar className="h-5 w-5 shrink-0">
                                        {m.avatar_url ? <AvatarImage src={m.avatar_url} alt={m.full_name} /> : null}
                                        <AvatarFallback className="text-[9px]">{getAvatarInitials(m.full_name)}</AvatarFallback>
                                      </Avatar>
                                      <span className="truncate leading-none">{m.full_name}{m.sector ? ` — ${m.sector}` : ""}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
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

              {/* Resumo de horas: consumidas e planejadas */}
              {(() => {
                const planned = parentHoursNum;
                const computed = subActivities
                  .reduce((sum, s) => {
                    const auto = s.status === "completed" ? (Number((s as any).hours) || 0) : 0;
                    return sum + auto;
                  }, 0);
                const consumed = computed;
                const pct = planned > 0 ? Math.min(100, (consumed / planned) * 100) : 0;
                const excedeu = planned > 0 && consumed > planned;
                if (planned === 0 && subHoursTotal === 0) return null;
                return (
                  <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Horas consumidas (automático): <strong className={excedeu ? "text-destructive" : "text-foreground"}>{formatHoursDisplay(consumed) || "0h"}</strong>
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
                  {orderedSubActivities.map((sub) => {
                    const gutLevel = normalizeGut(sub.priority);
                    const gutMeta = GUT_META[gutLevel];
                    const prioLabel = gutMeta.label;
                    const prioScore = (sub as any).priority_score as number | null | undefined;
                    const dateShort = sub.end_date
                      ? (() => {
                          const [y, m, d] = sub.end_date.split("-").map(Number);
                          const pad = (n: number) => String(n).padStart(2, "0");
                          return `${pad(d)}/${pad(m)}/${y}`;
                        })()
                      : "—";
                    return (
                      <div
                        key={sub.id}
                        className="grid items-center gap-2 px-2 py-1 border-b border-border/50 last:border-0 hover:bg-muted/40 group min-w-fit"
                        style={{ gridTemplateColumns: subGridTemplate }}
                      >
                        <Button
                          size="icon"
                          variant="ghost"
                          type="button"
                          className="h-5 w-5 shrink-0 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
                                {!!(sub as any).wbs_code && (
                                  <span
                                    className="inline-flex items-center h-4 px-1 rounded border border-border bg-muted/40 text-[10px] font-mono text-muted-foreground shrink-0"
                                    title="Código EAP"
                                  >
                                    {(sub as any).wbs_code}
                                  </span>
                                )}
                                <span className="truncate">{sub.title}</span>
                              </span>
                            );
                          })()}
                        </button>

                        {/* Colunas dinâmicas (na ordem de ALL_COLS, apenas as visíveis) */}
                        {ALL_COLS.filter((c) => visibleCols.includes(c.id)).map(({ id: colId }) => {
                          const updateFields = async (values: Record<string, any>) => {
                            if (!ensureProjectUnlocked()) return;
                            await supabase.from("activities").update(values as any).eq("id", sub.id);
                            if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
                            onActivityUpdated();
                          };
                          const updateField = async (value: any) => {
                            await updateFields({ [colId]: value });
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
                                      <Avatar className="h-6 w-6">
                                        {(() => {
                                          const avatar = resolveAvatarFromLookup(sub.assigned_to, sub.assigned_to, memberAvatarMap);
                                          return avatar ? <AvatarImage src={avatar} alt={sub.assigned_to || "Responsável"} /> : null;
                                        })()}
                                        <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                                          {getAvatarInitials(sub.assigned_to)}
                                        </AvatarFallback>
                                      </Avatar>
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
                                    {members.map((m, index) => (
                                      <button
                                        key={`${m.id}-${index}`}
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
                              <SubActivityGutPopover
                                key={colId}
                                sub={sub}
                                dotClass={gutMeta.dotClass}
                                pulse={gutMeta.pulse}
                                onSave={async (payload) => {
                                  await updateFields({
                                    gravity: payload.gravity,
                                    urgency: payload.urgency,
                                    tendency: payload.tendency,
                                    priority: payload.priority,
                                    priority_score: payload.priority_score,
                                  });
                                }}
                              />
                            );
                          }
                          if (colId === "end_date") {
                            const subInvalid = !!sub.start_date && !!sub.end_date && sub.start_date > sub.end_date;
                            return (
                              <label key={colId} className={`relative cursor-pointer text-xs transition-colors hover:text-foreground ${subInvalid ? "text-destructive font-medium" : "text-muted-foreground group-hover:text-foreground"}`} title={subInvalid ? "Datas inconsistentes" : undefined}>
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
                                  const pad = (n: number) => String(n).padStart(2, "0");
                                  return `${pad(d)}/${pad(m)}/${y}`;
                                })()
                              : "—";
                            return (
                              <label key={colId} className={`relative cursor-pointer text-xs transition-colors hover:text-foreground ${subInvalid ? "text-destructive font-medium" : "text-muted-foreground group-hover:text-foreground"}`} title={subInvalid ? "Datas inconsistentes" : undefined}>
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
                                        if (!ensureProjectUnlocked()) return;
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
                                className="text-[10px] truncate text-left text-muted-foreground transition-colors group-hover:text-foreground hover:text-primary"
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
                                }}
                                className="font-mono text-[10px] text-muted-foreground transition-colors group-hover:text-foreground hover:text-primary text-left truncate"
                                title="Clique para copiar ID completo"
                              >
                                {sub.id.slice(0, 8)}
                              </button>
                            );
                          }
                          return <span key={colId}>—</span>;
                        })}

                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                            disabled={duplicatingId === sub.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDuplicateActivity(sub.id, "subatividade");
                            }}
                            title={duplicatingId === sub.id ? "Duplicando..." : "Duplicar subtarefa"}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteSubActivity(sub.id);
                            }}
                            title="Excluir"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
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
            <ActivityStoriesPanel activityId={act.id} projectId={projectId} projectLocked={projectLocked} />
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

                  const pendingCount = await getPendingDescendantsCount(act.id);
                  if (pendingCount > 0) {
                    toast({
                      title: "Atividade com pendências",
                      description: `Não é possível concluir enquanto existirem ${pendingCount} subatividade(s) pendente(s).`,
                      variant: "destructive",
                    });
                    return;
                  }

                  try {
                    if (!ensureProjectUnlocked()) return;
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
                      actual_start_date: (act as any).actual_start_date || new Date().toISOString().slice(0, 10),
                      actual_end_date: new Date().toISOString().slice(0, 10),
                    };
                    if (finalStage) {
                      updateData.workflow_stage_id = finalStage.id;
                    }

                    const { error } = await supabase.from("activities").update(updateData).eq("id", act.id);
                    if (error) throw error;
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
                  if (!ensureProjectUnlocked()) return;
                  if (!confirm("Arquivar esta atividade? Ela ficará marcada como arquivada e poderá ser consultada no histórico.")) return;
                  try {
                    const { error } = await supabase.from("activities").update({ closed_at: new Date().toISOString() }).eq("id", act.id);
                    if (error) throw error;
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
            {act && !createMode && (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={duplicatingId === act.id}
                onClick={() => handleDuplicateActivity(act.id, "atividade")}
                title={duplicatingId === act.id ? "Duplicando..." : "Duplicar atividade"}
              >
                <Copy className="w-4 h-4" /> Duplicar
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
          consumedMinutesByActivity={consumedMinutesByActivity}
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
