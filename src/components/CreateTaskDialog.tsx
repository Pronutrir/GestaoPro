'use client';
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  User, Calendar, Clock, DollarSign, Layers, Tag, X, Flag, Plus, Paperclip, ChevronDown, Loader2, AlertTriangle,
} from "lucide-react";
import { AIAssistButton } from "@/components/AIAssistButton";
import { GutPriorityField } from "@/components/GutPriorityField";

export interface Phase { id: string; title: string }
export interface WorkflowStage { id: string; title: string; color: string; is_final?: boolean }
export interface Member { id: string; full_name: string; sector: string | null }
interface ProfileOption { id: string; full_name: string; sector: string | null }

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
  /** Quality project: shows Flag de Prazo and Data de Atualização */
  isQualityProject?: boolean;
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

export const CreateTaskDialog = ({
  open,
  onOpenChange,
  projectId,
  phases,
  stages: stagesProp,
  members,
  defaultStageId,
  defaultPhaseId,
  defaultParentId,
  defaultStatus,
  onCreated,
  onOpenDetails,
  isQualityProject = false,
}: CreateTaskDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchedStages, setFetchedStages] = useState<WorkflowStage[]>([]);
  const stages = stagesProp && stagesProp.length > 0 ? stagesProp : fetchedStages;

  const [allProfiles, setAllProfiles] = useState<ProfileOption[]>([]);

  // Form state - mirrors EditActivityDialog
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assigned_to: "",
    start_date: "",
    end_date: "",
    actual_start_date: "",
    actual_end_date: "",
    cost: "0",
    hours: "",
    phase_id: "",
    priority: "pendente",
    gravity: null as number | null,
    urgency: null as number | null,
    tendency: null as number | null,
    tags: [] as string[],
    story_points: "0",
    participants: [] as string[],
    deadline_flag: "",
    last_update_date: "",
    wbs_code: "",
  });
  const [newTag, setNewTag] = useState("");
  const [stageId, setStageId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);

  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Fetch stages and all profiles when opened
  useEffect(() => {
    if (!open) return;
    if (!stagesProp || stagesProp.length === 0) {
      supabase.from("workflow_stages")
        .select("id, title, color, is_final")
        .eq("project_id", projectId)
        .order("display_order", { ascending: true })
        .then(({ data }) => { if (data) setFetchedStages(data as WorkflowStage[]); });
    }
    supabase.from("profiles").select("id, full_name, sector").eq("is_active", true).then(({ data }) => {
      if (!data) return;
      const valid = data.filter((profile): profile is ProfileOption => Boolean(profile.id && profile.full_name));
      // Dedup por full_name: o valor selecionável é o nome, então perfis
      // distintos com o mesmo nome colidem no <option>/Select. Mantém o 1º.
      const seen = new Set<string>();
      const deduped = valid.filter((p) => {
        const key = p.full_name!.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setAllProfiles(deduped);
    });
  }, [open, projectId, stagesProp]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setFormData({
        title: "",
        description: "",
        assigned_to: "",
        start_date: "",
        end_date: "",
        actual_start_date: "",
        actual_end_date: "",
        cost: "0",
        hours: "",
        phase_id: defaultPhaseId ?? "",
        priority: "pendente",
        gravity: null,
        urgency: null,
        tendency: null,
        tags: [],
        story_points: "0",
        participants: [],
        deadline_flag: "",
        last_update_date: "",
        wbs_code: "",
      });
      setStageId(defaultStageId ?? null);
      setAttachment(null);
      setNewTag("");
      setTimeout(() => titleRef.current?.focus(), 60);
    }
  }, [open, defaultStageId, defaultPhaseId]);

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
    formData.start_date > formData.end_date;

  const create = async (afterAction: "close" | "details" | "another") => {
    if (!formData.title.trim() || loading) return;
    if (dateRangeInvalid) {
      toast({
        title: "Datas inconsistentes",
        description: "A data de início é posterior à data de término.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      // Respeita a coluna escolhida pelo usuário; fallback para Backlog.
      const backlogStage =
        stages.find(s => /backlog/i.test(s.title)) ||
        stages[0]; // fallback: primeira coluna (display_order 0)
      const newStageId = stageId ?? backlogStage?.id;

      // EAP automática para subatividades (parent_id definido).
      let autoWbs: string | null = formData.wbs_code.trim() || null;
      if (!autoWbs && defaultParentId) {
        try {
          const { getNextSubWbs } = await import("@/lib/wbsAuto");
          const { data: parent } = await supabase
            .from("activities").select("wbs_code").eq("id", defaultParentId).maybeSingle();
          const parentWbs = (parent as any)?.wbs_code as string | null | undefined;
          if (parentWbs) {
            const { data: siblings } = await supabase
              .from("activities").select("wbs_code")
              .eq("project_id", projectId)
              .eq("parent_id", defaultParentId);
            autoWbs = getNextSubWbs(parentWbs, (siblings || []).map((s: any) => s.wbs_code));
          }
        } catch { /* ignora — segue sem EAP */ }
      }

      const payload: Record<string, unknown> = {
        project_id: projectId,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        status: "pending",
        gravity: formData.gravity,
        urgency: formData.urgency,
        tendency: formData.tendency,
        workflow_stage_id: newStageId,
        phase_id: formData.phase_id || null,
        parent_id: defaultParentId ?? null,
        assigned_to: formData.assigned_to || null,
        participants: formData.participants.length ? formData.participants : null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        actual_start_date: formData.actual_start_date || null,
        actual_end_date: formData.actual_end_date || null,
        hours: parseHoursInput(formData.hours),
        cost: parseFloat(formData.cost) || 0,
        story_points: parseInt(formData.story_points) || 0,
        tags: formData.tags.length ? formData.tags : null,
        deadline_flag: formData.deadline_flag || null,
        last_update_date: formData.last_update_date || null,
        wbs_code: autoWbs,
      };

      const { data: inserted, error } = await supabase
        .from("activities")
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;

      const createdActivityId = inserted!.id;
      const attachmentSnapshot = attachment;

      toast({ title: "Atividade criada!" });
      onCreated?.(createdActivityId);

      if (afterAction === "close") {
        onOpenChange(false);
      } else if (afterAction === "details") {
        onOpenChange(false);
        onOpenDetails?.(createdActivityId);
      } else {
        // "another" — keep dialog, reset only title/description/attachment
        setFormData((f) => ({ ...f, title: "", description: "" }));
        setAttachment(null);
        setTimeout(() => titleRef.current?.focus(), 30);
      }

      // Upload de anexo em segundo plano para não atrasar a criação da tarefa.
      if (attachmentSnapshot) {
        void (async () => {
          const path = `${projectId}/${createdActivityId}/${Date.now()}-${attachmentSnapshot.name}`;
          const { error: upErr } = await supabase.storage
            .from("csc-attachments")
            .upload(path, attachmentSnapshot, { upsert: false });

          if (upErr) {
            console.warn("Falha ao enviar anexo da atividade:", upErr.message);
            toast({
              title: "Atividade criada com aviso",
              description: `A atividade foi salva, mas o anexo não subiu: ${upErr.message}`,
              variant: "destructive",
            });
            return;
          }

          const { data: urlData } = supabase.storage
            .from("csc-attachments")
            .getPublicUrl(path);

          if (urlData?.publicUrl) {
            const { error: docErr } = await supabase.from("project_documents").insert({
              project_id: projectId,
              activity_id: createdActivityId,
              file_name: attachmentSnapshot.name,
              file_url: urlData.publicUrl,
              file_type: attachmentSnapshot.type || null,
              file_size: attachmentSnapshot.size,
            } as never);

            if (docErr) {
              console.warn("Falha ao vincular anexo da atividade:", docErr.message);
              toast({
                title: "Atividade criada com aviso",
                description: `A atividade foi salva, mas houve falha ao vincular o anexo: ${docErr.message}`,
                variant: "destructive",
              });
            }
          }
        })();
      }
    } catch (e) {
      console.error(e);
      const maybe = e as { message?: string; details?: string; hint?: string; code?: string };
      const detail = [maybe?.message, maybe?.details, maybe?.hint, maybe?.code].filter(Boolean).join(" | ");
      toast({
        title: "Erro ao criar atividade",
        description: detail || "Não foi possível salvar. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create("close");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Nova Atividade</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <Label htmlFor="title" className="text-sm font-semibold text-foreground">Título *</Label>
              <AIAssistButton
                value={formData.title}
                onChange={(next) => setFormData({ ...formData, title: next })}
                context="activity_title"
              />
            </div>
            <Textarea
              id="title"
              ref={titleRef}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              rows={1}
              autoResize
              placeholder="O que precisa ser feito?"
              className="min-h-[44px] w-full min-w-0 font-medium break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  create("close");
                }
              }}
            />
          </div>

          {/* Description */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <Label htmlFor="description" className="text-sm font-semibold text-foreground">Descrição</Label>
              <AIAssistButton
                value={formData.description}
                onChange={(next) => setFormData({ ...formData, description: next })}
                context="activity_description"
              />
            </div>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              autoResize
              placeholder="Descreva a atividade..."
              className="w-full min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
            />
          </div>

          {/* Priority — método GUT */}
          {/* Código EAP */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">Código EAP (opcional)</Label>
            <Input
              value={formData.wbs_code}
              onChange={(e) => setFormData({ ...formData, wbs_code: e.target.value })}
              placeholder={defaultParentId ? "Deixe em branco — gerada automaticamente a partir da atividade pai" : ""}
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              {defaultParentId
                ? <>Subatividade: a EAP é <strong>preenchida automaticamente</strong> (próximo número disponível abaixo do pai). Você pode sobrescrever se quiser.</>
                : <>Padrões: <strong>X.0</strong> Fase • <strong>X.Y</strong> Subentrega • <strong>X.Y.Z</strong> Pacote • <strong>X.Y.Z.W</strong> Atividade</>}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Flag className="w-4 h-4" /> Prioridade (GUT)
            </Label>
            <GutPriorityField
              gravity={formData.gravity}
              urgency={formData.urgency}
              tendency={formData.tendency}
              onChange={(v) => setFormData({ ...formData, ...v })}
            />
          </div>

          {/* Responsável */}
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
                <option key={m.id} value={m.full_name}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Participantes */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
              👥 Participantes
              <span className="text-[11px] font-normal text-muted-foreground">— sem limite</span>
            </Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value=""
              onChange={(e) => {
                const name = e.target.value;
                if (name && !formData.participants.includes(name)) {
                  setFormData({
                    ...formData,
                    participants: [...formData.participants, name],
                  });
                }
              }}
            >
              <option value="">Adicionar participante...</option>
              {allProfiles.filter(m => m.full_name && !formData.participants.includes(m.full_name)).map((m) => (
                <option key={m.id} value={m.full_name}>{m.full_name}{m.sector ? ` — ${m.sector}` : ''}</option>
              ))}
            </select>
            {formData.participants.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {formData.participants.map((p) => (
                  <div key={p} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                    <span className="flex-1 min-w-0 truncate text-xs font-medium text-foreground">{p}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          participants: formData.participants.filter((x) => x !== p),
                        });
                      }}
                      title="Remover participante"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fase + Coluna inicial */}
          <div className="grid grid-cols-2 gap-4">
            {phases.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Fase
                </Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.phase_id}
                  onChange={(e) => setFormData({ ...formData, phase_id: e.target.value })}
                >
                  <option value="">Sem fase</option>
                  {phases.map((phase) => (<option key={phase.id} value={phase.id}>{phase.title}</option>))}
                </select>
              </div>
            )}
            {stages.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  📋 Coluna Inicial
                </Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={stageId ?? ""}
                  onChange={(e) => setStageId(e.target.value || null)}
                >
                  <option value="">— Sem coluna —</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Datas */}
          <div className="space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Data de Início
              </Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className={dateRangeInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Data de Fim
              </Label>
              <Input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className={dateRangeInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </div>
          </div>
          <div className={`grid ${isQualityProject ? "grid-cols-3" : "grid-cols-2"} gap-4`}>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Data de Início Real
              </Label>
              <Input
                type="date"
                value={formData.actual_start_date}
                onChange={(e) => setFormData({ ...formData, actual_start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Data de Término Real
              </Label>
              <Input
                type="date"
                value={formData.actual_end_date}
                onChange={(e) => setFormData({ ...formData, actual_end_date: e.target.value })}
              />
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
          {dateRangeInvalid && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              A data de início é posterior à data de término.
            </p>
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

          {/* Recursos */}
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

          {/* Etiquetas */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Tag className="w-4 h-4" /> Etiquetas
            </Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {formData.tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 text-xs">
                  {t}
                  <button type="button" onClick={() => handleRemoveTag(t)}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
                placeholder="Nova etiqueta..."
                className="h-9"
              />
              <Button type="button" size="sm" variant="outline" onClick={handleAddTag}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Anexo */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Paperclip className="w-4 h-4" /> Anexo (opcional)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                className="h-9"
              />
              {attachment && (
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAttachment(null)}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <div className="inline-flex items-center rounded-md border border-primary overflow-hidden">
              <button
                type="submit"
                disabled={!formData.title.trim() || loading}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={!formData.title.trim() || loading}
                    className="px-2 py-2 bg-primary text-primary-foreground hover:bg-primary/90 border-l border-primary-foreground/20 disabled:opacity-50"
                    aria-label="Mais ações"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => create("close")}>Criar e fechar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => create("details")}>Criar e abrir detalhes</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => create("another")}>Criar e adicionar outra</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
