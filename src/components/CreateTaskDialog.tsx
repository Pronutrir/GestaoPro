import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  CalendarIcon,
  Flag,
  User,
  Tag,
  Layers,
  Users as UsersIcon,
  Clock,
  DollarSign,
  Hash,
  Paperclip,
  ChevronDown,
  X,
  Check,
  ListChecks,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface Phase { id: string; title: string }
export interface WorkflowStage { id: string; title: string; color: string; is_final?: boolean }
export interface Member { full_name: string; sector: string | null }

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectTitle?: string;
  phases: Phase[];
  stages?: WorkflowStage[];
  members: Member[];
  /** Pre-selected workflow stage (e.g., when opened from a Kanban column) */
  defaultStageId?: string | null;
  /** Pre-selected phase (e.g., when opened from Phase Manager) */
  defaultPhaseId?: string | null;
  /** Pre-selected parent activity (subactivity creation) */
  defaultParentId?: string | null;
  /** Pre-selected status (defaults to 'pending') */
  defaultStatus?: string;
  /** Called after successful creation. Receives created activity id. */
  onCreated?: (activityId: string) => void;
  /** Optional: open edit drawer for newly created activity */
  onOpenDetails?: (activityId: string) => void;
}

const PRIORITIES = [
  { value: "low", label: "Baixa", color: "bg-muted text-muted-foreground" },
  { value: "medium", label: "Média", color: "bg-warning/20 text-warning" },
  { value: "high", label: "Alta", color: "bg-destructive/20 text-destructive" },
];

function FieldChip({
  icon: Icon,
  active,
  children,
  onClick,
  onClear,
}: {
  icon: any;
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  onClear?: () => void;
}) {
  return (
    <div
      className={`group inline-flex items-center gap-1.5 h-7 pl-2 pr-2 rounded-md border text-xs cursor-pointer select-none transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15"
          : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
      onClick={onClick}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="whitespace-nowrap">{children}</span>
      {active && onClear && (
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 ml-0.5 -mr-1 rounded p-0.5 hover:bg-background/40"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label="Limpar"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export const CreateTaskDialog = ({
  open,
  onOpenChange,
  projectId,
  projectTitle,
  phases,
  stages: stagesProp,
  members,
  defaultStageId,
  defaultPhaseId,
  defaultParentId,
  defaultStatus,
  onCreated,
  onOpenDetails,
}: CreateTaskDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchedStages, setFetchedStages] = useState<WorkflowStage[]>([]);
  const stages = stagesProp && stagesProp.length > 0 ? stagesProp : fetchedStages;

  // Fetch stages internally if not provided
  useEffect(() => {
    if (!open) return;
    if (stagesProp && stagesProp.length > 0) return;
    (async () => {
      const { data } = await supabase
        .from("workflow_stages")
        .select("id, title, color, is_final")
        .eq("project_id", projectId)
        .order("display_order", { ascending: true });
      if (data) setFetchedStages(data as WorkflowStage[]);
    })();
  }, [open, projectId, stagesProp]);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [stageId, setStageId] = useState<string | null>(null);
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [priority, setPriority] = useState<string>("medium");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [hours, setHours] = useState<string>("");
  const [cost, setCost] = useState<string>("");
  const [storyPoints, setStoryPoints] = useState<string>("");
  const [attachment, setAttachment] = useState<File | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setShowDescription(false);
      setStageId(defaultStageId ?? null);
      setPhaseId(defaultPhaseId ?? null);
      setAssignedTo("");
      setParticipants([]);
      setEndDate(null);
      setStartDate(null);
      setPriority("medium");
      setTags([]);
      setTagInput("");
      setHours("");
      setCost("");
      setStoryPoints("");
      setAttachment(null);
      setTimeout(() => titleRef.current?.focus(), 60);
    }
  }, [open, defaultStageId, defaultPhaseId]);

  // Auto-resize description
  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = "auto";
      descRef.current.style.height = descRef.current.scrollHeight + "px";
    }
  }, [description, showDescription]);

  const selectedStage = stages.find((s) => s.id === stageId);
  const selectedPhase = phases.find((p) => p.id === phaseId);
  const selectedPriority = PRIORITIES.find((p) => p.value === priority)!;

  const memberLabel = (m: Member) => `${m.full_name}${m.sector ? ` — ${m.sector}` : ""}`;

  const create = async (afterAction: "close" | "details" | "another") => {
    if (!title.trim() || loading) return;
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        status: defaultStatus || "pending",
        priority,
        workflow_stage_id: stageId,
        phase_id: phaseId,
        parent_id: defaultParentId ?? null,
        assigned_to: assignedTo || null,
        participants: participants.length ? participants : null,
        start_date: startDate ? format(startDate, "yyyy-MM-dd") : null,
        end_date: endDate ? format(endDate, "yyyy-MM-dd") : null,
        hours: hours ? parseFloat(hours) : 0,
        cost: cost ? parseFloat(cost) : 0,
        story_points: storyPoints ? parseInt(storyPoints) : 0,
        tags: tags.length ? tags : null,
      };

      const { data: inserted, error } = await supabase
        .from("activities")
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;

      // Optional attachment upload
      if (attachment && inserted?.id) {
        const path = `${projectId}/${inserted.id}/${Date.now()}-${attachment.name}`;
        const { error: upErr } = await supabase.storage
          .from("csc-attachments")
          .upload(path, attachment, { upsert: false });
        if (!upErr) {
          const { data: urlData } = supabase.storage
            .from("csc-attachments")
            .getPublicUrl(path);
          if (urlData?.publicUrl) {
            await supabase.from("project_documents").insert({
              project_id: projectId,
              activity_id: inserted.id,
              file_name: attachment.name,
              file_url: urlData.publicUrl,
              file_type: attachment.type || null,
              file_size: attachment.size,
            } as never);
          }
        }
      }

      toast({ title: "Tarefa criada!" });
      onCreated?.(inserted!.id);

      if (afterAction === "close") {
        onOpenChange(false);
      } else if (afterAction === "details") {
        onOpenChange(false);
        onOpenDetails?.(inserted!.id);
      } else {
        // "another" — keep dialog, reset only title/description
        setTitle("");
        setDescription("");
        setShowDescription(false);
        setAttachment(null);
        setTimeout(() => titleRef.current?.focus(), 30);
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Erro ao criar tarefa", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[750px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Criar tarefa</DialogTitle>

        {/* Header: Project / Phase context */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-2 border-b border-border/50">
          <Badge variant="secondary" className="rounded-md gap-1 font-normal">
            <Layers className="w-3 h-3" />
            {projectTitle || "Projeto"}
          </Badge>
          {selectedPhase && (
            <Badge variant="outline" className="rounded-md gap-1 font-normal">
              {selectedPhase.title}
            </Badge>
          )}
          {selectedStage && (
            <Badge
              variant="outline"
              className="rounded-md gap-1 font-normal border-0"
              style={{ backgroundColor: `${selectedStage.color}20`, color: selectedStage.color }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedStage.color }} />
              {selectedStage.title}
            </Badge>
          )}
        </div>

        {/* Body */}
        <div className="px-5 pt-4 pb-3 space-y-3">
          <Input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nome da tarefa..."
            className="border-0 px-0 text-lg font-medium shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50 h-auto py-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                create("close");
              }
            }}
          />

          {showDescription ? (
            <Textarea
              ref={descRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Adicionar descrição..."
              className="border-0 px-0 shadow-none focus-visible:ring-0 resize-none min-h-[40px] placeholder:text-muted-foreground/50"
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors"
              onClick={() => setShowDescription(true)}
            >
              📄 Adicionar descrição
            </button>
          )}

          {/* Chips row */}
          <div className="flex flex-wrap gap-1.5 pt-2">
            {/* Status / Stage */}
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FieldChip
                    icon={ListChecks}
                    active={!!stageId}
                    onClear={() => setStageId(null)}
                  >
                    {selectedStage ? selectedStage.title : "Status"}
                  </FieldChip>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1" align="start">
                {stages.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent"
                    onClick={() => setStageId(s.id)}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.title}
                    {stageId === s.id && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Phase */}
            {phases.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <div>
                    <FieldChip
                      icon={Layers}
                      active={!!phaseId}
                      onClear={() => setPhaseId(null)}
                    >
                      {selectedPhase ? selectedPhase.title : "Fase"}
                    </FieldChip>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1 max-h-64 overflow-y-auto" align="start">
                  {phases.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-accent flex items-center"
                      onClick={() => setPhaseId(p.id)}
                    >
                      {p.title}
                      {phaseId === p.id && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}

            {/* Assigned (Líder) */}
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FieldChip
                    icon={User}
                    active={!!assignedTo}
                    onClear={() => setAssignedTo("")}
                  >
                    {assignedTo || "Líder"}
                  </FieldChip>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar pessoa..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma pessoa</CommandEmpty>
                    <CommandGroup>
                      {members.map((m) => (
                        <CommandItem
                          key={m.full_name}
                          value={memberLabel(m)}
                          onSelect={() => setAssignedTo(m.full_name)}
                        >
                          <User className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                          {memberLabel(m)}
                          {assignedTo === m.full_name && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Participants */}
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FieldChip
                    icon={UsersIcon}
                    active={participants.length > 0}
                    onClear={() => setParticipants([])}
                  >
                    {participants.length > 0 ? `${participants.length} participante(s)` : "Participantes"}
                  </FieldChip>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar participantes..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma pessoa</CommandEmpty>
                    <CommandGroup>
                      {members.map((m) => {
                        const checked = participants.includes(m.full_name);
                        return (
                          <CommandItem
                            key={m.full_name}
                            value={memberLabel(m)}
                            onSelect={() => {
                              setParticipants((prev) =>
                                prev.includes(m.full_name)
                                  ? prev.filter((p) => p !== m.full_name)
                                  : [...prev, m.full_name]
                              );
                            }}
                          >
                            <div className={`w-3.5 h-3.5 mr-2 rounded border ${checked ? "bg-primary border-primary" : "border-border"} flex items-center justify-center`}>
                              {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                            </div>
                            {memberLabel(m)}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Due date */}
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FieldChip
                    icon={CalendarIcon}
                    active={!!endDate}
                    onClear={() => setEndDate(null)}
                  >
                    {endDate ? format(endDate, "dd/MM/yyyy") : "Prazo"}
                  </FieldChip>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate ?? undefined}
                  onSelect={(d) => setEndDate(d ?? null)}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Start date */}
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FieldChip
                    icon={CalendarIcon}
                    active={!!startDate}
                    onClear={() => setStartDate(null)}
                  >
                    {startDate ? `Início ${format(startDate, "dd/MM")}` : "Início"}
                  </FieldChip>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate ?? undefined}
                  onSelect={(d) => setStartDate(d ?? null)}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Priority */}
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FieldChip icon={Flag} active={priority !== "medium"}>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${selectedPriority.color}`}>
                      {selectedPriority.label}
                    </span>
                  </FieldChip>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="start">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent"
                    onClick={() => setPriority(p.value)}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {p.label}
                    {priority === p.value && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Tags */}
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FieldChip
                    icon={Tag}
                    active={tags.length > 0}
                    onClear={() => setTags([])}
                  >
                    {tags.length > 0 ? `${tags.length} etiqueta(s)` : "Etiquetas"}
                  </FieldChip>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2 space-y-2" align="start">
                <div className="flex gap-1">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Nova etiqueta..."
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button size="sm" type="button" className="h-7 px-2" onClick={addTag}>
                    +
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1 text-[10px]">
                      {t}
                      <button onClick={() => setTags(tags.filter((x) => x !== t))}>
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Hours */}
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FieldChip icon={Clock} active={!!hours} onClear={() => setHours("")}>
                    {hours ? `${hours}h` : "Horas"}
                  </FieldChip>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2" align="start">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="Horas estimadas"
                  className="h-8 text-sm"
                />
              </PopoverContent>
            </Popover>

            {/* Cost */}
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FieldChip icon={DollarSign} active={!!cost} onClear={() => setCost("")}>
                    {cost ? `R$ ${cost}` : "Custo"}
                  </FieldChip>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2" align="start">
                <CurrencyInput
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0,00"
                  className="h-8 text-sm"
                />
              </PopoverContent>
            </Popover>

            {/* Story points */}
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FieldChip icon={Hash} active={!!storyPoints} onClear={() => setStoryPoints("")}>
                    {storyPoints ? `${storyPoints} pts` : "Pontos"}
                  </FieldChip>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2" align="start">
                <Input
                  type="number"
                  min="0"
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  placeholder="Story points (Fibonacci)"
                  className="h-8 text-sm"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border/50 bg-muted/30">
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
            <Paperclip className="w-3.5 h-3.5" />
            <span className="truncate max-w-[180px]">
              {attachment ? attachment.name : "Anexar arquivo"}
            </span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
            />
            {attachment && (
              <button
                type="button"
                className="ml-1"
                onClick={(e) => {
                  e.preventDefault();
                  setAttachment(null);
                }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </label>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <div className="flex items-stretch rounded-md overflow-hidden">
              <Button
                size="sm"
                disabled={!title.trim() || loading}
                onClick={() => create("close")}
                className="rounded-r-none"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Criar Tarefa
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={!title.trim() || loading}
                    className="rounded-l-none border-l border-primary-foreground/20 px-2"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => create("close")}>
                    Criar e fechar
                  </DropdownMenuItem>
                  {onOpenDetails && (
                    <DropdownMenuItem onClick={() => create("details")}>
                      Criar e abrir detalhes
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => create("another")}>
                    Criar e adicionar outra
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};