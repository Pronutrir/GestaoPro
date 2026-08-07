'use client';
import { useState, useEffect, useMemo } from "react";
import { DateField } from "@/components/ui/date-field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateChip } from "@/components/DateChip";
import { PersonCombobox } from "@/components/PersonCombobox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Calendar, Clock, DollarSign, Layers, Tag, X, Flag, Plus, Trash2, CheckCircle2, Circle, ArrowRightLeft, Pencil, Diamond, ArrowRight, Link2, IndentIncrease, CornerDownRight } from "lucide-react";
// Validação de movimento na EAP — a MESMA que o Backlog e o Kanban usam, para
// as três telas recusarem exatamente as mesmas coisas (ciclo, self, marco).
import { eapCanMoveInto, eapDescendantIds, type EapNodeLike } from "@/lib/eapModel";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cascadeDates } from "@/lib/criticalPath";
import { endVariance, varianceTone, varianceClasses } from "@/lib/dateVariance";
import { ActivityAttachments } from "@/components/ActivityAttachments";
import { ActivityRegistro } from "@/components/ActivityRegistro";
import { TaskRelations } from "@/components/TaskRelations";
import { useTaskBlockers } from "@/hooks/useTaskBlockers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GutPriorityField } from "@/components/GutPriorityField";
import { GutPrioritySelector } from "@/components/GutPrioritySelector";
import { GUT_META, gutLabel, gutScore, normalizeGut, type GutLevel } from "@/lib/gutPriority";
import { History, ChevronDown, Hash, Copy, UserCircle, Lock, AlertOctagon, Wand2, EyeOff } from "lucide-react";
import { BookOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

/** Date -> "YYYY-MM-DD" pelo fuso LOCAL (toISOString à noite em UTC-3 já é o dia seguinte). */
const localYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
import { UserPlus2 } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { AIAssistButton } from "@/components/AIAssistButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ActivityRelationsInline } from "@/components/ActivityRelationsInline";
import { MessageSquare, Paperclip, ListTree, FileText, Users } from "lucide-react";
import { ActivityStoriesPanel } from "@/components/ActivityStoriesPanel";
import { SHOW_USER_STORIES } from "@/lib/featureFlags";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildAvatarLookupMap, getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";

/** Linha de propriedade densa (ícone + label cinza + valor) usada no painel ClickUp-like. */
// Campo denso da aba Detalhes: rótulo (uppercase, discreto) EM CIMA do controle.
// `wide` faz o campo ocupar a linha inteira da grade (para Prazo/Prioridade/Tipo/EAP).
const PropertyRow = ({ icon, label, children, wide, iconClassName }: {
  icon: React.ReactNode; label: string; children: React.ReactNode; wide?: boolean;
  /** Cor do ícone do rótulo — dá vida à informação (padrão: cinza discreto). */
  iconClassName?: string;
}) => (
  <div className={cn("flex flex-col gap-1 min-w-0", wide && "sm:col-span-2")}>
    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span className={cn("text-muted-foreground/70", iconClassName)}>{icon}</span>
      {label}
    </span>
    <div className="min-w-0 flex items-center flex-wrap gap-1.5 min-h-[32px]">{children}</div>
  </div>
);

// Faixa temática do painel de propriedades. A grade plana de 2 colunas não
// tinha hierarquia: Status ao lado de Tempo, Líder ao lado de Custo — assuntos
// diferentes disputando a mesma linha, e o olho lia em zigue-zague. Cada faixa
// responde UMA pergunta, na ordem em que se preenche.
const FieldBand = ({ step, title, children }: {
  step: number; title: string; children: React.ReactNode;
}) => (
  <div className="rounded-lg border border-border overflow-hidden">
    {/* ARDÓSIA em vez de azul: a faixa AGRUPA campos, não pede clique. Com o
        primary aqui, o topo de cada card competia com botões e links — e o
        azul, aparecendo em tudo, deixava de significar "acionável".
        As TRÊS faixas são IDÊNTICAS: mesmo fundo, mesmo número sólido. O
        número ordena a leitura, não hierarquiza — nenhuma seção é mais
        importante que as outras.

        Nada de opacidade fracionada aqui: classes como `text-band/80` não são
        geradas neste projeto, e o elemento acabava sem cor nenhuma. */}
    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b border-border bg-band-soft text-band">
      {/* Número SÓLIDO nas três. O contorno usado nas faixas 2 e 3 tinha peso
          visual muito menor que o quadrado cheio da 1 — com o mesmo fundo, o
          olho ainda lia a primeira como "diferente das outras". Agora as três
          são idênticas: a numeração ordena, sem hierarquia de destaque. */}
      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold shrink-0 bg-band text-band-foreground">
        {step}
      </span>
      {title}
    </div>
    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">{children}</div>
  </div>
);

// Campos OPCIONAIS da aba Detalhes que colapsam quando vazios (padrão ClickUp/Jira/Linear).
// Essenciais (Status, Tipo, Prazo, Líder) e Prioridade não entram aqui — têm regra própria.
type OptionalFieldKey = "hours" | "cost" | "wbs";

// item_type persistido. Marco não é item_type — é a flag is_milestone.
// A UI usa 3 papéis: Fase/Entrega (agrupa) · Atividade (folha) · Marco.
// 'pacote' é um agrupador LEGADO no banco: lido e exibido como Fase/Entrega,
// não é mais oferecido como opção de tipo.
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
  role_title?: string | null;
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
      role_title: option.role_title ?? null,
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
  /**
   * Permissão de edição no PROJETO. Sem isto o diálogo deixava preencher tudo e
   * só falhava ao salvar, com erro genérico — 34 dos 75 membros nessa situação.
   * Quem é responsável pela atividade edita mesmo sem isto (ver `canEditThis`).
   */
  canEditProject?: boolean;
}

/** Parse hours as decimal from "Xh Ym" or plain number */
function parseHoursInput(val: string): number {
  const s = (val || "").trim();
  // Formato h:mm (ex.: 2:05 = 2 horas 5 minutos)
  const hmm = s.match(/^(\d+)\s*:\s*([0-5]?\d)$/);
  if (hmm) return parseInt(hmm[1]) + parseInt(hmm[2]) / 60;
  // Formato "2h 30m"
  const hm = s.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60;
  // Só horas: "2h", "2", "1.5" ou "1,5"
  const hOnly = s.match(/^(\d+(?:[.,]\d+)?)\s*h?$/i);
  if (hOnly) return parseFloat(hOnly[1].replace(",", "."));
  // Só minutos: "90m"
  const mOnly = s.match(/^(\d+)\s*m$/i);
  if (mOnly) return parseInt(mOnly[1]) / 60;
  return parseFloat(s.replace(",", ".")) || 0;
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

/** Presets de tempo (curtos, realistas) para o menu rolável do campo Tempo. */
const HOURS_PRESETS: { value: string; label: string }[] = [
  { value: "15m", label: "15 minutos" },
  { value: "30m", label: "30 minutos" },
  { value: "45m", label: "45 minutos" },
  { value: "1h", label: "1 hora" },
  { value: "2h", label: "2 horas" },
  { value: "3h", label: "3 horas" },
  { value: "4h", label: "4 horas" },
  { value: "6h", label: "6 horas" },
  { value: "8h", label: "8 horas (1 dia)" },
  { value: "16h", label: "16 horas (2 dias)" },
  { value: "40h", label: "40 horas (1 semana)" },
];

/** Format decimal hours to natural language "2 horas 5 minutos" */
function formatHoursNatural(hours: number): string {
  if (!hours || hours <= 0) return "";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} ${h === 1 ? "hora" : "horas"}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? "minuto" : "minutos"}`);
  return parts.join(" e ");
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
  canEditProject = true,
}: EditActivityDialogProps) => {
  const { toast } = useToast();
  const { user: authUser, profile: authProfile } = useAuth();
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

  /**
   * Espelha a regra do banco (`can_member_action` OR `is_activity_owner`): quem
   * é responsável ou participante edita a própria atividade mesmo sem permissão
   * geral no projeto — modelo do Asana, e o que EditProjectDialog já assumia ao
   * gravar novos membros com can_edit=false.
   *
   * Os campos são texto livre (uuid, e-mail ou nome digitado), por isso a
   * comparação testa as três formas. Valores vazios são descartados:
   * sem isso, um perfil sem e-mail casaria com assigned_to vazio e daria
   * permissão a qualquer um numa atividade sem responsável.
   */
  const souResponsavel = (() => {
    if (!effectiveActivity || !authUser?.id) return false;
    const identidades = new Set(
      [authUser.id, authProfile?.email, authProfile?.full_name]
        .filter((v): v is string => !!v && v.trim().length > 0)
        .map((v) => v.trim().toLowerCase()),
    );
    const bate = (v?: string | null) => !!v && identidades.has(v.trim().toLowerCase());
    if (bate(effectiveActivity.assigned_to)) return true;
    return ((effectiveActivity as { participants?: string[] }).participants ?? []).some(bate);
  })();

  // createMode: quem está criando obviamente pode preencher o que criou.
  const canEditThis = createMode || canEditProject || souResponsavel;
  const readOnly = !canEditThis;
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
  // Popover aberto na linha de subatividade (chave `${subId}:${coluna}`) — sem
  // isto o calendário/seletor ficava aberto depois de escolher o valor.
  const [openSubPopover, setOpenSubPopover] = useState<string | null>(null);
  const [editingSubActivity, setEditingSubActivity] = useState<Activity | null>(null);
  const [editingSubOpen, setEditingSubOpen] = useState(false);
  // Popover de responsável por subatividade: guarda o id da sub com o popover
  // aberto (controlado) para que ele feche ao escolher uma opção.
  const [openAssigneeSubId, setOpenAssigneeSubId] = useState<string | null>(null);
  const [hoursPopoverOpen, setHoursPopoverOpen] = useState(false);
  const [generatingWbs, setGeneratingWbs] = useState(false);
  // Candidatas a "Dentro de" — a EAP do projeto inteira, para validar o
  // movimento (ciclo/profundidade) sem ida ao servidor a cada troca.
  const [eapNodes, setEapNodes] = useState<EapNodeLike[]>([]);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  // Campos OPCIONAIS revelados manualmente pelo "+ Adicionar campo" nesta sessão.
  // Um campo aparece se: já tem valor, OU foi revelado aqui. (padrão ClickUp/Jira/Linear)
  const [revealedFields, setRevealedFields] = useState<Set<OptionalFieldKey>>(new Set());
  // Total de dependências, reportado pelo componente inline — exibido no
  // rótulo do campo para dar o sinal de quantidade sem precisar abrir nada.
  const [relationsCount, setRelationsCount] = useState(0);
  const revealField = (k: OptionalFieldKey) =>
    setRevealedFields((prev) => new Set(prev).add(k));
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [members, setMembers] = useState<PersonOption[]>([]);
  const memberAvatarMap = useMemo(() => buildAvatarLookupMap(members), [members]);
  const [allProfiles, setAllProfiles] = useState<PersonOption[]>([]);
  const [workflowStages, setWorkflowStages] = useState<{ id: string; title: string; color: string; display_order: number; is_final: boolean; is_visible?: boolean }[]>([]);
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
  // Marco não tem aba Subatividades; se o item virar marco enquanto ela estiver
  // aberta, volta para Detalhes (evita ficar numa aba invisível).
  useEffect(() => {
    if (formData.is_milestone && activeTab === "subtasks") setActiveTab("details");
  }, [formData.is_milestone, activeTab]);

  // EAP do projeto, para o campo "Dentro de": valida o movimento no cliente
  // (ciclo/profundidade) e mostra a árvore como ela é, em vez de uma lista
  // alfabética onde não dá para saber ONDE o item vai parar.
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelado = false;
    // is_trashed (e não trashed_at): é o campo que este arquivo usa em todas as
    // outras consultas, e o que existe em ambientes sem a migration nova.
    void (supabase
      .from("activities")
      .select("id, title, parent_id, item_type, is_milestone, wbs_code, display_order")
      .eq("project_id", projectId) as any)
      .eq("is_trashed", false)
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        // Falha aqui não derruba a aba: o campo "Dentro de" some e o resto do
        // diálogo continua utilizável — degradar é melhor que quebrar.
        if (cancelado || error) return;
        setEapNodes((data || []) as EapNodeLike[]);
      });
    return () => { cancelado = true; };
  }, [open, projectId]);

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
    supabase.from("profiles").select("id, full_name, sector, role_title, email, avatar_url").eq("is_active", true).then(({ data }) => {
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
      // is_visible entra na consulta para o seletor AVISAR quando a coluna não
      // aparece no quadro. A opção continua na lista de propósito: a tarefa
      // pode já estar nela, e removê-la deixaria o campo sem valor válido —
      // trocaria um problema de visibilidade por um de dado.
      supabase.from("workflow_stages").select("id, title, color, display_order, is_final, is_visible")
        .eq("project_id", projectId).order("display_order").then(({ data }) => {
          if (data) setWorkflowStages(data as any);
        });

      supabase.from("project_members").select("user_id").eq("project_id", projectId).then(({ data: memberData }) => {
        if (memberData && memberData.length > 0) {
          const userIds = memberData.map(m => m.user_id);
          supabase.from("profiles").select("id, full_name, sector, role_title, email, avatar_url").in("id", userIds).then(({ data: profiles }) => {
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
      // Campos opcionais revelados são por-atividade: ao trocar de card, recolhe
      // de volta os que estavam vazios (os com valor reaparecem pela regra de visibilidade).
      setRevealedFields(new Set());
      setRelationsCount(0);
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
    // (atividade/marco), promove a Fase/Entrega antes de inserir — Fase agrupa
    // em qualquer nível. TOLERANTE: se a promoção falhar, seguimos criando o
    // subitem (o pai já funciona como agrupador por ter filhos).
    const parentType = toEapType((act as any).item_type);
    if (parentType === "atividade" || (act as any).is_milestone) {
      const { error: promoteErr } = await supabase
        .from("activities")
        .update({ item_type: "fase", is_milestone: false } as any)
        .eq("id", act.id);
      if (!promoteErr) {
        setFormData((prev) => ({ ...prev, item_type: "fase", is_milestone: false }));
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
      // Datas reais sao manuais — nao preenche automaticamente ao concluir.
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

  // Gera o próximo código EAP com base no contexto (pai → fase → topo) e nos
  // irmãos existentes. Preenche o campo; o usuário ainda pode editar.
  const handleAutoWbs = async () => {
    if (!projectId) return;
    setGeneratingWbs(true);
    try {
      const { getNextSubWbs, getNextTopWbs } = await import("@/lib/wbsAuto");
      const currentId = (createMode ? draftActivity : activity)?.id;
      const parentId = formData.parent_id || (activity as any)?.parent_id || null;

      if (parentId) {
        // Sob um item pai: código = pai + próximo sufixo entre irmãos.
        const { data: parent } = await supabase
          .from("activities").select("wbs_code").eq("id", parentId).maybeSingle();
        const parentWbs = (parent as any)?.wbs_code as string | null | undefined;
        const { data: siblings } = await supabase
          .from("activities").select("id, wbs_code")
          .eq("project_id", projectId).eq("parent_id", parentId);
        const others = (siblings || []).filter((s: any) => s.id !== currentId).map((s: any) => s.wbs_code);
        const next = getNextSubWbs(parentWbs || null, others);
        if (next) { setFormData((f) => ({ ...f, wbs_code: next })); return; }
      }

      // Topo: deriva da fase (se houver) + próximo nº entre os irmãos do nível.
      const phaseId = formData.phase_id || null;
      let phaseWbs: string | null = null;
      if (phaseId) {
        const { data: ph } = await supabase
          .from("phases").select("wbs_code").eq("id", phaseId).maybeSingle();
        phaseWbs = (ph as any)?.wbs_code || null;
      }
      // Irmãos de topo: itens sem pai, na mesma fase (ou sem fase).
      const { data: tops } = await supabase
        .from("activities").select("id, wbs_code, phase_id, parent_id")
        .eq("project_id", projectId).is("parent_id", null);
      const sameLevel = (tops || []).filter((t: any) =>
        t.id !== currentId && (phaseId ? t.phase_id === phaseId : !t.phase_id));
      const next = getNextTopWbs(phaseWbs, sameLevel.map((t: any) => t.wbs_code));
      setFormData((f) => ({ ...f, wbs_code: next }));
    } catch (e) {
      console.error("Erro ao gerar código EAP:", e);
      toast({ title: "Não foi possível gerar o código EAP", variant: "destructive" });
    } finally {
      setGeneratingWbs(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ensureProjectUnlocked()) return;
    // Rede de segurança: os campos já estão desabilitados, mas o formulário
    // ainda pode ser submetido por Enter. Antes o pedido ia ao banco, era
    // recusado pelo RLS e voltava como "Erro ao salvar" — genérico o bastante
    // para parecer falha do sistema em vez de falta de permissão.
    if (readOnly) {
      toast({
        title: "Sem permissão para editar",
        description: "Você pode ver esta atividade, mas não alterá-la. Fale com o gestor do projeto.",
        variant: "destructive",
      });
      return;
    }
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

      // Trocou de pai? O trigger eap_nesting_rule só aceita agrupador
      // ('fase'/'pacote') como pai — se o destino for folha, promove ANTES,
      // senão o update volta como check_violation crua. Mesmo tratamento do
      // LinkParentDialog; o rótulo exibido continua vindo do nível do wbs_code,
      // então um "1.1" promovido segue aparecendo como Entrega, não vira Fase.
      const novoPaiId = formData.parent_id || null;
      const paiAnterior = (act as { parent_id?: string | null }).parent_id ?? null;
      if (novoPaiId && novoPaiId !== paiAnterior) {
        const { data: paiRow } = await supabase
          .from("activities")
          .select("id, item_type")
          .eq("id", novoPaiId)
          .maybeSingle();
        const tipoPai = ((paiRow as { item_type?: string } | null)?.item_type || "atividade").toLowerCase();
        if (paiRow && tipoPai !== "fase" && tipoPai !== "pacote") {
          // Falha aqui não aborta o save: se o ambiente ainda não aceita 'fase'
          // (migration de item_type pendente), o update abaixo dá o aviso certo.
          await supabase.from("activities").update({ item_type: "fase" } as any).eq("id", novoPaiId);
        }
      }

      const compatPayload: Record<string, any> = { ...updatePayload };
      const droppedColumns: string[] = [];
      let downgradedItemType = false;
      let error: any = null;
      for (let i = 0; i < 8; i += 1) {
        const result = await supabase
          .from("activities")
          .update(compatPayload as any)
          .eq("id", act.id);
        error = result.error;
        if (!error) break;

        const errorText = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;

        // CHECK de item_type ainda sem 'pacote'/'fase' (migration pendente):
        // regrava como 'atividade' em vez de abortar o save inteiro — o papel
        // é inferido pela árvore até a migration entrar.
        const isItemTypeCheck =
          error?.code === "23514" && /item_type/i.test(errorText);
        if (
          isItemTypeCheck &&
          !downgradedItemType &&
          (compatPayload.item_type === "pacote" || compatPayload.item_type === "fase")
        ) {
          compatPayload.item_type = "atividade";
          downgradedItemType = true;
          continue;
        }

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

      if (downgradedItemType) {
        toast({
          title: "Atividade salva com aviso",
          description:
            "Este ambiente ainda não aceita o tipo Fase/Entrega; o item foi salvo como Atividade. Aplique a migration do item_type na VM.",
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
          <DialogTitle className="text-base font-semibold">
            {createMode ? "Nova Atividade" : parentActivityTitle ? "Editar Sub-atividade" : "Editar Atividade"}
          </DialogTitle>
          {act && !createMode && (
            <div
              className="flex items-center gap-2 text-[11px] text-muted-foreground pt-0.5 min-w-0 overflow-hidden whitespace-nowrap"
              title={[
                `Criada em ${new Date(act.created_at).toLocaleDateString("pt-BR")}`,
                (creatorName || creatorEmail) && `por ${creatorName || creatorEmail}`,
                act.completed_at && `Concluída em ${new Date(act.completed_at).toLocaleDateString("pt-BR")}`,
                (lastEditorName || lastEditorEmail) && `última edição por ${lastEditorName || lastEditorEmail}`,
                act.closed_at && `Arquivada em ${new Date(act.closed_at).toLocaleDateString("pt-BR")}`,
              ].filter(Boolean).join(" · ")}
            >
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
              {SHOW_USER_STORIES && storiesCount > 0 && projectId && (
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

        {/* Diz ANTES por que os campos estão travados. Sem isto a pessoa
            preenchia tudo e só descobria ao salvar, com erro genérico. */}
        {readOnly && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-[13px] text-warning">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              <b className="font-semibold">Somente leitura.</b> Você não tem permissão
              para editar atividades neste projeto. Se for o responsável por ela,
              a edição libera automaticamente.
            </span>
          </div>
        )}
        {/* Quem edita só por ser responsável precisa saber de onde vem o acesso
            — senão parece inconsistente poder mexer numa atividade e não noutra. */}
        {!readOnly && !canEditProject && souResponsavel && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[13px] text-primary">
            <UserCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Você está editando porque é <b className="font-semibold">responsável</b> por
              esta atividade.
            </span>
          </div>
        )}

        {/* Conversa em 400px (era 360, e o card interno tinha ~300 úteis):
            cada frase quebrava em três linhas no espaço de interação do time. */}
        <form onSubmit={handleSubmit} className="contents">
        {/* fieldset em vez de `disabled` campo a campo: são dezenas de inputs,
            e um esquecido deixaria a pessoa digitar num campo que não grava.
            O elemento nativo desabilita tudo dentro dele de uma vez. */}
        <fieldset
          disabled={readOnly}
          className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5 border-0 p-0 m-0 min-w-0 disabled:opacity-95"
        >
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

          {/* ABAS no topo: ficavam DEPOIS do painel de propriedades, em cinza,
              e quem não rolava a tela não descobria Equipe/Subatividades/Anexos. */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="w-full justify-start h-auto bg-muted/50 rounded-lg p-1 gap-1 flex-wrap">
              <TabsTrigger value="details" className="text-[13px] gap-1.5 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground hover:text-foreground">
                <FileText className="w-3.5 h-3.5" /> Detalhes
              </TabsTrigger>
              <TabsTrigger value="team" className="text-[13px] gap-1.5 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground hover:text-foreground">
                <Users className="w-3.5 h-3.5" /> Equipe
                {formData.participants.filter(Boolean).length > 0 && (
                  <span className="text-[10px] px-1.5 py-0 rounded-full bg-primary/15 text-primary font-semibold">{formData.participants.filter(Boolean).length}</span>
                )}
              </TabsTrigger>
              {/* Subatividades: só para itens que AGRUPAM na EAP. Marco é um ponto
                  no tempo (folha) — nunca tem subitens, então a aba é ocultada. */}
              {act && projectId && !formData.is_milestone && (
                <TabsTrigger value="subtasks" className="text-[13px] gap-1.5 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground hover:text-foreground">
                  <ListTree className="w-3.5 h-3.5" /> Subatividades
                  {subActivities.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0 rounded-full bg-primary/15 text-primary font-semibold">{subActivities.length}</span>
                  )}
                </TabsTrigger>
              )}
              {act && projectId && (
                <TabsTrigger value="attachments" className="text-[13px] gap-1.5 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground hover:text-foreground">
                  <Paperclip className="w-3.5 h-3.5" /> Anexos
                </TabsTrigger>
              )}
              {/* Comentários e Histórico foram movidos para o painel lateral à direita */}
              {SHOW_USER_STORIES && act && projectId && (
                <TabsTrigger value="stories" className="text-[13px] gap-1.5 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground hover:text-foreground">
                  <BookOpen className="w-3.5 h-3.5" /> Histórias
                  {storiesCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0 rounded-full bg-primary/15 text-primary font-semibold">{storiesCount}</span>
                  )}
                </TabsTrigger>
              )}
              {/* Histórico vive no painel lateral */}
            </TabsList>

            {/* ===== ABA DETALHES: propriedades + descrição ===== */}
            <TabsContent value="details" className="space-y-4 pt-4 mt-0">
            {/* Painel de propriedades em 3 faixas temáticas */}
            {act && (() => {
              // ---- Visibilidade dos campos OPCIONAIS (auto-colapso) ----
              // Regra: aparece se tem valor, é rollup de Fase, ou foi revelado pelo "+".
              const hasWbs = !!formData.wbs_code.trim();
              // Tempo e custo são SEMPRE visíveis (exceto em marco, que não tem
              // nem um nem outro). Eram opcionais atrás do "+ Adicionar campo",
              // mas são o esforço e o dinheiro da EAP — a faixa se chama
              // "Esforço" e abria vazia, só com um botão. Some o motivo original
              // do colapso agora que a importação traz horas e custo da
              // planilha: o dado chegava preenchido e o campo seguia escondido.
              const showHours = !formData.is_milestone;
              const showCost = !formData.is_milestone;
              const showWbs = hasWbs || revealedFields.has("wbs");
              // Chips do "+ Adicionar campo": só os que estão ocultos no momento.
              // Dependências não entra: passou a ser sempre visível (é informação de
              // sequenciamento, não campo opcional — quem não vê, não sabe que existe).
              const hiddenChips: { key: OptionalFieldKey; label: string; icon: React.ReactNode }[] = [
                !showWbs && { key: "wbs" as const, label: "Código EAP", icon: <Hash className="w-3 h-3" /> },
              ].filter(Boolean) as { key: OptionalFieldKey; label: string; icon: React.ReactNode }[];
              return (
              <div className="space-y-2.5">
                {/* ---- FAIXA 1: O QUE É (status, tipo, dependências, EAP) ---- */}
                <FieldBand step={1} title="O que é">
                  {/* Status / Etapa */}
                  {workflowStages.length > 0 && (
                     <PropertyRow iconClassName="text-primary" icon={<ArrowRightLeft className="w-3.5 h-3.5" />} label="Status">
                       <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 h-8 w-full px-2.5 rounded-md text-xs font-medium border bg-background hover:bg-muted/40 transition-colors"
                            style={(() => {
                              const s = workflowStages.find(s => s.id === currentStageId);
                              return s ? { borderColor: s.color, color: s.color } : {};
                            })()}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: workflowStages.find(s => s.id === currentStageId)?.color || "hsl(var(--muted-foreground))" }} />
                            <span className="truncate">{workflowStages.find(s => s.id === currentStageId)?.title || "Sem coluna"}</span>
                            {/* A tarefa JÁ ESTÁ numa coluna oculta: some do
                                quadro sem nenhum sinal. Avisar aqui é o mínimo
                                — é o estado em que a pessoa mais precisa saber. */}
                            {workflowStages.find(s => s.id === currentStageId)?.is_visible === false && (
                              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-warning"
                                    title="Esta coluna está oculta no quadro: a tarefa não aparece no Kanban.">
                                <EyeOff className="w-3 h-3" /> oculta
                              </span>
                            )}
                            <ChevronDown className="w-3 h-3 opacity-60 ml-auto shrink-0" />
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
                                  // Datas reais sao manuais — nao mexe em actual_*.
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
                                  onActivityUpdated();
                                } catch {
                                  toast({ title: "Erro ao mover", variant: "destructive" });
                                }
                              }}
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
                              <span className="truncate">{stage.title}</span>
                              {/* A coluna existe no fluxo mas não aparece no
                                  quadro: mover a tarefa para cá faz ela sumir
                                  do Kanban de todo mundo. Escolher às cegas era
                                  o problema — a marca aqui é o aviso. */}
                              {stage.is_visible === false && (
                                <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[10px] text-warning"
                                      title="Esta coluna está oculta no quadro: a tarefa não aparecerá no Kanban.">
                                  <EyeOff className="w-3 h-3" /> oculta
                                </span>
                              )}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </PropertyRow>
                  )}
  
                  {/* Tipo do item (papéis EAP): Fase/Entrega | Atividade | Marco.
                      Mutuamente exclusivo. Agrupador legado ('pacote') exibe como Fase. */}
                  {(() => {
                    type Kind = "fase" | "atividade" | "marco";
                    // Papel EXIBIDO: agrupador legado ('pacote' ou com subitens) vira Fase.
                    const itemKind: Kind = formData.is_milestone
                      ? "marco"
                      : (formData.item_type === "fase" || formData.item_type === "pacote" || hasSubActivities)
                        ? "fase"
                        : "atividade";
                    const setKind = (kind: Kind) =>
                      setFormData({
                        ...formData,
                        is_milestone: kind === "marco",
                        // Marco grava como 'atividade' (o tipo é a flag is_milestone).
                        // Fase/Entrega grava 'fase'; folha grava 'atividade'.
                        item_type: kind === "marco" ? "atividade" : kind,
                        // Marco é um ponto no tempo — não tem intervalo de fim.
                        end_date: kind === "marco" ? "" : formData.end_date,
                      });
  
                    // Atividade também pode agrupar: o que define o rótulo é o
                    // NÍVEL na EAP, não o fato de ter subitens. Só Marco segue
                    // barrado com filhos — marco é folha de controle, um marco
                    // que agrupa não faz sentido.
                    const kindDisabledReason = (kind: Kind): string | null => {
                      if (hasSubActivities && kind === "marco")
                        return "Este item tem subitens; Marco não agrupa.";
                      return null;
                    };
                    const KIND_OPTIONS: {
                      kind: Kind;
                      label: string;
                      icon: React.ReactNode;
                      hint: string;
                      activeCls: string;
                    }[] = [
                      // O selecionado usa cor SÓLIDA. Com bg-primary/10 sobre o
                      // trilho bg-muted/30 o realce quase sumia — o botão ativo
                      // ficava só "um pouco mais claro" que os outros e não se
                      // lia como marcado.
                      {
                        kind: "fase",
                        label: "Fase / Entrega",
                        icon: <Layers className="w-3.5 h-3.5" />,
                        hint: "Nível 1 da EAP (1, 2, 3…). Agrupa entregas; datas, horas e custo derivam dos filhos.",
                        activeCls: "border-primary bg-primary text-primary-foreground shadow-sm",
                      },
                      {
                        kind: "atividade",
                        label: "Atividade",
                        icon: <Circle className="w-3.5 h-3.5" />,
                        hint: "Do nível 1.1 em diante. Pode ter subitens — aí horas e custo somam dos filhos.",
                        activeCls: "border-primary bg-primary text-primary-foreground shadow-sm",
                      },
                      {
                        kind: "marco",
                        label: "Marco",
                        icon: <Diamond className={`w-3.5 h-3.5 ${itemKind === "marco" ? "fill-current" : ""}`} />,
                        hint: "Ponto único no tempo (uma data, sem intervalo). Não tem horas nem custo.",
                        activeCls: "border-amber-500 bg-amber-500 text-white shadow-sm",
                      },
                    ];
                    return (
                      <PropertyRow
                        iconClassName={itemKind === "marco" ? "text-amber-500" : "text-primary"}
                        icon={
                          itemKind === "marco" ? (
                            <Diamond className="w-3.5 h-3.5 fill-amber-500" />
                          ) : itemKind === "fase" ? (
                            <Layers className="w-3.5 h-3.5" />
                          ) : (
                            <Circle className="w-3.5 h-3.5" />
                          )
                        }
                        label="Tipo"
                        wide
                      >
                        <div className="flex flex-col gap-1.5 w-full">
                          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30 w-fit">
                            {KIND_OPTIONS.map((opt) => {
                              const active = itemKind === opt.kind;
                              const reason = active ? null : kindDisabledReason(opt.kind);
                              const disabled = !!reason;
                              return (
                                <button
                                  key={opt.kind}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => setKind(opt.kind)}
                                  aria-pressed={active}
                                  title={reason ?? opt.hint}
                                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors border ${
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
                          {hasSubActivities && (
                            <span className="text-[10.5px] text-primary flex items-center gap-1 min-w-0" title="Este item agrupa subitens — por isso é uma Fase/Entrega. Horas e custo são somados dos filhos (veja a aba Subatividades).">
                              <Layers className="w-3 h-3 shrink-0" />
                              <span className="truncate">Agrupa {ownSubActivities.length} subitem(ns) — horas e custo somados dos filhos.</span>
                            </span>
                          )}
                        </div>
                      </PropertyRow>
                    );
                  })()}
  
                  {/* Dependências (predecessoras/sucessoras) — SEMPRE visível.
                      Era um campo opcional colapsado chamado "Relações": ficava
                      escondido justamente de quem ainda não tinha criado nenhuma,
                      ou seja, quem mais precisava descobrir que o recurso existe. */}
                  {projectId && (
                    <div className="min-w-0 sm:col-span-2">
                      <PropertyRow
                        wide
                        iconClassName="text-primary"
                        icon={<Link2 className="w-3.5 h-3.5" />}
                        label={relationsCount > 0 ? `Dependências (${relationsCount})` : "Dependências"}
                      >
                        <ActivityRelationsInline
                          activityId={act.id}
                          projectId={projectId}
                          onCountChange={setRelationsCount}
                          onChanged={() => {
                            if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
                            onActivityUpdated();
                          }}
                        />
                      </PropertyRow>
                    </div>
                  )}
  
                  {/* Dentro de — onde o item fica na EAP. Vizinho do Código EAP
                      porque os dois dizem a mesma coisa por vias diferentes: um
                      pela posição real (parent_id), outro pela numeração.
                      Só fora do createMode: na criação o pai já vem do contexto
                      (quick-add sob um item) e o item ainda não tem descendentes
                      para validar. */}
                  {!createMode && (() => {
                    const meuId = effectiveActivity?.id;
                    if (!meuId) return null;

                    // Self + descendentes: mover para lá desligaria os dois da raiz.
                    const bloqueados = new Set<string>([meuId]);
                    eapDescendantIds(eapNodes, [meuId]).forEach((id) => bloqueados.add(id));

                    const porId = new Map(eapNodes.map((n) => [n.id, n]));
                    const paiAtual = formData.parent_id ? porId.get(formData.parent_id) : null;

                    // Árvore ordenada (pai seguido dos filhos) — a lista precisa
                    // mostrar a hierarquia, senão não dá para saber onde se está.
                    const filhosDe = new Map<string, EapNodeLike[]>();
                    const raizes: EapNodeLike[] = [];
                    eapNodes.forEach((n) => {
                      if (n.parent_id && porId.has(n.parent_id)) {
                        const arr = filhosDe.get(n.parent_id) || [];
                        arr.push(n);
                        filhosDe.set(n.parent_id, arr);
                      } else raizes.push(n);
                    });
                    const linhas: Array<{ node: EapNodeLike; depth: number }> = [];
                    const vistos = new Set<string>(); // dado já com ciclo não trava a lista
                    const andar = (lista: EapNodeLike[], depth: number) => {
                      for (const n of lista) {
                        if (vistos.has(n.id)) continue;
                        vistos.add(n.id);
                        linhas.push({ node: n, depth });
                        andar(filhosDe.get(n.id) || [], depth + 1);
                      }
                    };
                    andar(raizes, 1);
                    const busca = parentSearch.trim().toLowerCase();
                    const opcoes = linhas
                      .filter(({ node }) => !bloqueados.has(node.id) && !node.is_milestone)
                      .filter(({ node }) => {
                        if (!busca) return true;
                        const titulo = ((node as { title?: string }).title || "").toLowerCase();
                        return titulo.includes(busca) || (node.wbs_code || "").toLowerCase().includes(busca);
                      });

                    const escolher = (destinoId: string | null) => {
                      const check = eapCanMoveInto(eapNodes, [meuId], destinoId);
                      if (!check.ok) {
                        toast({
                          title: "Não dá para mover para aí",
                          description: check.message,
                          variant: "destructive",
                        });
                        return;
                      }
                      // Avisa mas deixa seguir: a base já tem árvores de 6 níveis
                      // e travar impediria justamente de reorganizá-las.
                      if (check.warning) {
                        toast({ title: "EAP ficando profunda", description: check.warning });
                      }
                      setFormData((f) => ({ ...f, parent_id: destinoId || "" }));
                      setParentPickerOpen(false);
                      setParentSearch("");
                    };

                    // MEIA coluna, não `wide`. A faixa é uma grade de 2 colunas
                    // e Status é o único outro campo de meia largura aqui —
                    // Tipo e Dependências ocupam a linha inteira. Com este
                    // campo em `wide`, o Status ficava sozinho na linha e o
                    // Código EAP era empurrado para baixo, deixando um buraco à
                    // direita. Em meia coluna os pares voltam: Status | Dentro
                    // de, e depois o Código EAP.
                    return (
                      <PropertyRow
                        iconClassName="text-primary"
                        icon={<IndentIncrease className="w-3.5 h-3.5" />}
                        label="Dentro de"
                      >
                        <div className="flex items-center gap-1.5 w-full min-w-0">
                          <Popover
                            open={parentPickerOpen}
                            onOpenChange={(o) => {
                              setParentPickerOpen(o);
                              // Limpa ao fechar: senão reabre já filtrado pela
                              // busca anterior e parece que a EAP encolheu.
                              if (!o) setParentSearch("");
                            }}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={readOnly}
                                className="h-8 flex-1 min-w-0 justify-between text-xs font-normal gap-1.5 px-2.5"
                              >
                                <span className="flex items-center gap-1.5 min-w-0">
                                  {paiAtual ? (
                                    <>
                                      <CornerDownRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      {paiAtual.wbs_code && (
                                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                          {paiAtual.wbs_code}
                                        </span>
                                      )}
                                      <span className="truncate">
                                        {(paiAtual as { title?: string }).title || "item"}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      No topo da EAP
                                    </span>
                                  )}
                                </span>
                                {/* Chevron: sem ele o campo parecia um rótulo
                                    somente-leitura, não um seletor. */}
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[380px] p-0" align="start">
                              {/* Busca: a EAP de um projeto grande não cabe na
                                  lista, e rolar até achar o destino não é caminho. */}
                              <div className="p-2 border-b">
                                <Input
                                  autoFocus
                                  value={parentSearch}
                                  onChange={(e) => setParentSearch(e.target.value)}
                                  placeholder="Buscar por título ou código..."
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="max-h-[280px] overflow-y-auto">
                                <button
                                  type="button"
                                  onClick={() => escolher(null)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b text-muted-foreground"
                                >
                                  No topo da EAP (sem item acima)
                                </button>
                                {opcoes.length === 0 ? (
                                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                                    {parentSearch ? "Nenhum item encontrado." : "Nenhum destino disponível."}
                                  </p>
                                ) : (
                                  opcoes.map(({ node, depth }) => (
                                    <button
                                      key={node.id}
                                      type="button"
                                      onClick={() => escolher(node.id)}
                                      className={cn(
                                        "w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-xs hover:bg-muted",
                                        node.id === formData.parent_id && "bg-muted/60 font-medium",
                                      )}
                                      style={{ paddingLeft: `${12 + (depth - 1) * 12}px` }}
                                    >
                                      {depth > 1 && (
                                        <CornerDownRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                                      )}
                                      {node.wbs_code && (
                                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                          {node.wbs_code}
                                        </span>
                                      )}
                                      <span className="truncate flex-1">
                                        {(node as { title?: string }).title || "(sem título)"}
                                      </span>
                                      {depth >= 5 && (
                                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                      )}
                                    </button>
                                  ))
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>

                          {/* Tirar de dentro sem abrir o seletor: era a única
                              forma de voltar à raiz e exigia abrir a lista. */}
                          {paiAtual && !readOnly && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                              title="Tirar de dentro (mover para o topo da EAP)"
                              onClick={() => escolher(null)}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </PropertyRow>
                    );
                  })()}

                  {/* Código EAP/WBS (opcional — colapsa quando vazio) */}
                  {showWbs && (
                  <PropertyRow iconClassName="text-primary" icon={<Hash className="w-3.5 h-3.5" />} label="Código EAP">
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={formData.wbs_code}
                          onChange={(e) => setFormData({ ...formData, wbs_code: e.target.value })}
                          placeholder="Digite ou gere automaticamente"
                          className={cn(
                            "h-7 text-xs font-mono flex-1",
                            formData.wbs_code && !/^\d+(\.\d+){0,6}$/.test(formData.wbs_code.trim()) && "border-destructive"
                          )}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant={formData.wbs_code.trim() ? "ghost" : "outline"}
                          onClick={handleAutoWbs}
                          disabled={generatingWbs}
                          className={cn(
                            "h-7 px-2.5 text-xs gap-1.5 shrink-0",
                            !formData.wbs_code.trim() && "text-primary border-primary/40 bg-primary/5 hover:bg-primary/10"
                          )}
                          title="Gerar o próximo código com base no item pai (ou fase) e nos irmãos. O nível define o papel: 1, 2, 3… são Fase; 1.1, 1.1.1… são Atividade."
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          {formData.wbs_code.trim() ? "Regerar" : "Gerar"}
                        </Button>
                      </div>
                    </div>
                  </PropertyRow>
                  )}
  
                </FieldBand>
  
                {/* ---- FAIXA 2: QUEM E QUANDO (líder, prioridade, prazo) ---- */}
                <FieldBand step={2} title="Quem e quando">
                  {/* Líder — exibe TODOS os usuários cadastrados, opcional */}
                  <PropertyRow iconClassName="text-primary" icon={<User className="w-3.5 h-3.5" />} label="Líder">
                    <div className="w-full">
                      <PersonCombobox
                        people={allProfiles}
                        value={allProfiles.find((m) => m.full_name === formData.assigned_to)?.id ?? null}
                        placeholder="Sem líder"
                        onSelect={(p) => setFormData({ ...formData, assigned_to: p.full_name })}
                        onClear={() => setFormData({ ...formData, assigned_to: "" })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </PropertyRow>
  
                  {/* Prioridade — método GUT.
                      Colapsa em meia coluna quando "Pendente" (chip discreto); ao
                      definir G×U×T, expande para linha inteira com o badge completo. */}
                  {(() => {
                    // Cor do ícone do rótulo = cor do nível GUT (dá vida à informação).
                    const gutLevel = gutLabel(gutScore(formData.gravity, formData.urgency, formData.tendency));
                    const gutIconColor: Record<GutLevel, string> = {
                      pendente: "text-muted-foreground/70",
                      baixa: "text-emerald-500",
                      media: "text-amber-500",
                      alta: "text-orange-500",
                      critica: "text-red-500",
                      urgente: "text-fuchsia-500",
                    };
                    return (
                      <PropertyRow iconClassName={gutIconColor[gutLevel]} icon={<Flag className="w-3.5 h-3.5" />} label="Prioridade (GUT)">
                        {/* A dica sai de DENTRO do controle (onde inchava o campo
                            com "Clique para definir G × U × T") e vira nota abaixo. */}
                        <div className="w-full min-w-0 flex flex-col gap-1">
                          <GutPriorityField
                            gravity={formData.gravity}
                            urgency={formData.urgency}
                            tendency={formData.tendency}
                            onChange={(v) => setFormData({ ...formData, ...v })}
                            buttonClassName="h-8 w-full px-2.5 text-xs"
                          />
                          {gutLevel === "pendente" && (
                            <span className="text-[10.5px] text-muted-foreground">
                              Defina Gravidade × Urgência × Tendência para calcular a prioridade.
                            </span>
                          )}
                        </div>
                      </PropertyRow>
                    );
                  })()}
  
                  {/* Datas — planejado e execução real na MESMA linha.
                      Meia coluna por padrão (Início→Vencimento cabe); só ocupa a
                      linha inteira quando o bloco de datas reais está expandido. */}
                  {/* Linha inteira, com planejado e real LADO A LADO: os quatro
                      chips cabem na largura e quebrar para baixo desperdiçava a
                      metade direita. `flex-wrap` no container preserva o
                      comportamento em tela estreita — aí sim cai para a segunda
                      fileira, em vez de espremer os campos. */}
                  <PropertyRow
                    wide
                    iconClassName="text-primary"
                    icon={<Calendar className="w-3.5 h-3.5" />}
                    label={formData.is_milestone ? "Data" : "Prazo"}
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 w-full min-h-[32px]">
                      {/* PLANEJADO — chips compactos com calendário. O rótulo
                          "Previsto" espelha o "Real" ao lado: os dois pares ficam
                          nomeados do mesmo jeito, e a comparação fica óbvia. */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {!formData.is_milestone && (
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">Previsto</span>
                        )}
                        <DateChip
                          value={formData.is_milestone ? formData.end_date : formData.start_date}
                          onChange={(v) =>
                            setFormData(
                              formData.is_milestone
                                ? { ...formData, end_date: v }
                                : { ...formData, start_date: v }
                            )
                          }
                          // "Início/Término previsto" para casar com o par real
                          // ao lado: "Início → Vencimento" não deixava claro que
                          // são o mesmo par, um planejado e outro realizado.
                          // Rótulo curto no chip: quem diz "previsto" é o rótulo
                          // da fileira. Repetir a palavra em cada chip estourava
                          // a largura e empurrava o par real para baixo.
                          placeholder={formData.is_milestone ? "Data do marco" : "Início"}
                          tooltip={formData.is_milestone ? "Definir data do marco" : "Definir início previsto"}
                          invalid={dateRangeInvalid}
                        />
                        {!formData.is_milestone && (
                          <>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                            <DateChip
                              value={formData.end_date}
                              onChange={(v) => setFormData({ ...formData, end_date: v })}
                              placeholder="Término"
                              tooltip="Definir término previsto"
                              invalid={dateRangeInvalid}
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
  
                      {/* EXECUÇÃO REAL — sempre visível, na fileira de baixo.
                          Era um "+ datas reais" que escondia os campos atrás de
                          um clique: com a importação passando a trazer início e
                          fim reais da planilha, o dado chegava preenchido e o
                          bloco continuava colapsado. Há espaço na linha, e
                          planejado × real lado a lado é o par que se compara. */}
                      {!formData.is_milestone && (() => {
                        const hasReal = !!(formData.actual_start_date || formData.actual_end_date);
                        const v = endVariance(formData.actual_end_date || null, (act as any)?.baseline_end_date, formData.end_date);
                        const tone = v !== null ? varianceTone(v) : null;
                        // Limpar só aparece com data preenchida: é a única forma
                        // de apagar o dado, então confirma antes.
                        const limparReal = () => {
                          const ok = window.confirm(
                            "Limpar as datas reais preenchidas? Esta acao apaga inicio e termino reais."
                          );
                          if (!ok) return;
                          setFormData((prev) => ({ ...prev, actual_start_date: "", actual_end_date: "" }));
                        };
                        // Separador VERTICAL: fica ao LADO do planejado, não
                        // embaixo — a borda superior tracejada dividia fileiras
                        // que não existem mais.
                        return (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs sm:pl-4 sm:border-l sm:border-dashed sm:border-border/70">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">Real</span>
                            <DateChip
                              value={formData.actual_start_date}
                              onChange={(v) => setFormData({ ...formData, actual_start_date: v })}
                              placeholder="Início"
                              tooltip="Definir início real"
                            />
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <DateChip
                              value={formData.actual_end_date}
                              onChange={(v) => setFormData({ ...formData, actual_end_date: v })}
                              placeholder="Término"
                              tooltip="Definir término real"
                            />
                            {v !== null && tone && (
                              <span className={cn("px-1.5 py-0 rounded border text-[10px] font-mono shrink-0", varianceClasses(tone))}
                                    title={(act as any)?.baseline_end_date ? "Real − Linha de Base" : "Real − Planejado"}>
                                {v > 0 ? `${Math.abs(v)}d de atraso` : v < 0 ? `${Math.abs(v)}d adiantado` : "no prazo"}
                              </span>
                            )}
                            {hasReal && (
                              <button
                                type="button"
                                onClick={limparReal}
                                title="Limpar datas reais"
                                className="text-muted-foreground hover:text-foreground shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </PropertyRow>
  
                </FieldBand>
  
                {/* ---- FAIXA 3: ESFORÇO (tempo, custo, campos opcionais) ----
                    Tempo e Custo ocupam meia coluna cada, lado a lado. */}
                <FieldBand step={3} title="Esforço">
                  {/* Tempo — sempre visível (exceto em marco). */}
                  {showHours && (
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
                            {/* Input livre (2:05 / 2h 30m / 90m) + menu compacto rolável */}
                            <div className="relative w-[140px]">
                              <Input
                                placeholder="Ex: 2:05, 2h 30m, 90m"
                                value={formData.hours}
                                onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                                onFocus={(e) => e.currentTarget.select()}
                                className="h-7 pl-2 pr-7 text-xs"
                              />
                              <Popover open={hoursPopoverOpen} onOpenChange={setHoursPopoverOpen}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="Escolher tempo"
                                    className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted"
                                  >
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="end" sideOffset={4} className="w-[180px] p-1">
                                  <div className="max-h-56 overflow-y-auto">
                                    {HOURS_PRESETS.map((p) => {
                                      const active = parseHoursInput(formData.hours) === parseHoursInput(p.value);
                                      return (
                                        <button
                                          key={p.value}
                                          type="button"
                                          onClick={() => { setFormData({ ...formData, hours: p.value }); setHoursPopoverOpen(false); }}
                                          className={`w-full flex items-baseline justify-between gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                                            active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                                          }`}
                                        >
                                          <span className="text-xs font-medium tabular-nums">{p.value}</span>
                                          <span className="text-[11px] text-muted-foreground">{p.label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                            {/* Confirmação em linguagem natural do que foi digitado */}
                            {(() => {
                              const natural = formatHoursNatural(parseHoursInput(formData.hours));
                              if (!natural) return null;
                              return (
                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-1.5 py-0.5">
                                  <CheckCircle2 className="w-3 h-3" /> {natural}
                                </span>
                              );
                            })()}
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
  
                  {/* Custo — sempre visível (exceto em marco). */}
                  {showCost && (
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
                  {/* "+ Adicionar campo": um único botão que abre um menu com os
                      campos opcionais ocultos (padrão ClickUp/Jira). Só aparece se
                      houver algo a adicionar. */}
                  {/* Tracejado cinza sobre fundo claro tinha a aparência exata de
                      um controle DESABILITADO — e é a porta de entrada de Tempo,
                      Custo e Código EAP. Ganha a cor da plataforma e diz o que falta. */}
                  {hiddenChips.length > 0 && (
                    <div className="sm:col-span-2">
                      <Popover open={addFieldOpen} onOpenChange={setAddFieldOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 h-8 text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/60 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar campo: {hiddenChips.map((c) => c.label).join(" · ")}
                            <ChevronDown className="w-3 h-3 opacity-70" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-52 p-1" align="start">
                          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                            Campos disponíveis
                          </p>
                          {hiddenChips.map((chip) => (
                            <button
                              key={chip.key}
                              type="button"
                              onClick={() => { revealField(chip.key); setAddFieldOpen(false); }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
                            >
                              <span className="text-muted-foreground">{chip.icon}</span>
                              {chip.label}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </FieldBand>
              </div>
              );
            })()}

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
                <DateField value={formData.last_update_date} onChange={(v) => setFormData({ ...formData, last_update_date: v })} />
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
                              <Popover
                                key={colId}
                                open={openAssigneeSubId === sub.id}
                                onOpenChange={(o) => setOpenAssigneeSubId(o ? sub.id : null)}
                              >
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
                                      onClick={() => { setOpenAssigneeSubId(null); updateField(null); }}
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
                                        onClick={() => { setOpenAssigneeSubId(null); updateField(m.full_name); }}
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
                              <Popover key={colId} open={openSubPopover === `${sub.id}:${colId}`} onOpenChange={(o) => setOpenSubPopover(o ? `${sub.id}:${colId}` : null)}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className={`cursor-pointer text-xs transition-colors hover:text-foreground ${subInvalid ? "text-destructive font-medium" : "text-muted-foreground group-hover:text-foreground"}`}
                                    title={subInvalid ? "Datas inconsistentes" : "Definir data de término"}
                                  >
                                    {dateShort}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start" collisionPadding={12}>
                                  <CalendarPicker
                                    mode="single"
                                    locale={ptBR}
                                    selected={sub.end_date ? new Date(`${sub.end_date}T12:00:00`) : undefined}
                                    onSelect={(d) => { updateField(d ? localYmd(d) : null); setOpenSubPopover(null); }}
                                    initialFocus
                                    className="p-3 pointer-events-auto"
                                  />
                                </PopoverContent>
                              </Popover>
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
                              <Popover key={colId} open={openSubPopover === `${sub.id}:${colId}`} onOpenChange={(o) => setOpenSubPopover(o ? `${sub.id}:${colId}` : null)}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className={`cursor-pointer text-xs transition-colors hover:text-foreground ${subInvalid ? "text-destructive font-medium" : "text-muted-foreground group-hover:text-foreground"}`}
                                    title={subInvalid ? "Datas inconsistentes" : "Definir data de início"}
                                  >
                                    {ds}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start" collisionPadding={12}>
                                  <CalendarPicker
                                    mode="single"
                                    locale={ptBR}
                                    selected={sub.start_date ? new Date(`${sub.start_date}T12:00:00`) : undefined}
                                    onSelect={(d) => { updateField(d ? localYmd(d) : null); setOpenSubPopover(null); }}
                                    initialFocus
                                    className="p-3 pointer-events-auto"
                                  />
                                </PopoverContent>
                              </Popover>
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
                              <Popover key={colId} open={openSubPopover === `${sub.id}:${colId}`} onOpenChange={(o) => setOpenSubPopover(o ? `${sub.id}:${colId}` : null)}>
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
                                        setOpenSubPopover(null);
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

            {/* ===== ABA HISTÓRIAS (oculta por padrão — ver featureFlags) ===== */}
            <TabsContent value="stories" className="pt-4 mt-0">
          {SHOW_USER_STORIES && act && projectId && (
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

          {/* ========= PAINEL LATERAL (direita) — CONVERSA ========= */}
          {act && (
            <aside className="lg:border-l lg:border-border lg:pl-5 min-w-0 flex flex-col gap-3 lg:sticky lg:top-0 lg:h-[calc(95vh-150px)]">
              {/* Card com identidade própria: a Conversa é o espaço de interação do time. */}
              <div className="rounded-xl border border-primary/25 bg-card flex-1 min-h-0 flex flex-col overflow-hidden shadow-sm">
                {/* Faixa de destaque na cor primária */}
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-primary/10 border-b border-primary/20">
                  <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/15 text-primary shrink-0">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground leading-tight">Conversa da atividade</p>
                    <p className="text-[10.5px] text-muted-foreground leading-tight">Comente, cite pessoas com @ e acompanhe o histórico</p>
                  </div>
                </div>
                <div className="p-3 flex-1 min-h-0 flex flex-col">
                  <ActivityRegistro
                    activityId={act.id}
                    projectId={projectId}
                    phaseId={act.phase_id || null}
                    includeSubActivities
                    locked={projectLocked}
                  />
                </div>
              </div>
            </aside>
          )}
        </fieldset>

        {/* Rodapé FORA do fieldset: "Cancelar" e "Fechar" precisam funcionar
            mesmo em somente-leitura. Só "Salvar" é desabilitado, por readOnly. */}
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
            <Button
              type="submit"
              disabled={readOnly}
              title={readOnly ? "Você não tem permissão para editar esta atividade" : undefined}
            >
              {createMode ? "Criar Atividade" : "Salvar Alterações"}
            </Button>
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
