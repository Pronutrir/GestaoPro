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
import { User, Calendar, Clock, DollarSign, Layers, Tag, X, Flag, Plus, Trash2, CheckCircle2, Circle, BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";

interface Activity {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
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
  phases = [], allActivities = [], projectId,
}: EditActivityDialogProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    title: "", description: "", assigned_to: "",
    start_date: "", end_date: "", cost: "", hours: "",
    phase_id: "", priority: "medium",
    tags: [] as string[], parent_id: "",
    story_points: "0", raci_role: "",
    participants: [] as string[],
  });
  const [newTag, setNewTag] = useState("");
  const [newSubTitle, setNewSubTitle] = useState("");
  const [subActivities, setSubActivities] = useState<Activity[]>([]);
  const [members, setMembers] = useState<{ full_name: string; sector: string | null }[]>([]);

  useEffect(() => {
    if (projectId) {
      supabase.from("project_members").select("user_id").eq("project_id", projectId).then(({ data: memberData }) => {
        if (memberData && memberData.length > 0) {
          const userIds = memberData.map(m => m.user_id);
          supabase.from("profiles").select("full_name, sector").in("id", userIds).then(({ data: profiles }) => {
            if (profiles) setMembers(profiles.filter(p => p.full_name));
          });
        }
      });
    }
  }, [projectId]);

  useEffect(() => {
    if (activity) {
      setFormData({
        title: activity.title || "",
        description: activity.description || "",
        assigned_to: activity.assigned_to || "",
        start_date: activity.start_date || "",
        end_date: activity.end_date || "",
        cost: activity.cost?.toString() || "0",
        hours: formatHoursDisplay(activity.hours || 0),
        phase_id: activity.phase_id || "",
        priority: activity.priority || "medium",
        tags: activity.tags || [],
        parent_id: activity.parent_id || "",
        story_points: (activity as any).story_points?.toString() || "0",
        raci_role: (activity as any).raci_role || "",
        participants: (activity as any).participants || [],
      });
      fetchSubActivities(activity.id);
    }
  }, [activity]);

  const fetchSubActivities = async (parentId: string) => {
    const { data } = await supabase.from("activities").select("*")
      .eq("parent_id", parentId).order("display_order");
    if (data) setSubActivities(data as Activity[]);
  };

  const handleAddSubActivity = async () => {
    if (!newSubTitle.trim() || !activity || !projectId) return;
    await supabase.from("activities").insert({
      project_id: projectId, title: newSubTitle.trim(),
      phase_id: activity.phase_id, parent_id: activity.id,
      display_order: subActivities.length,
    });
    setNewSubTitle("");
    fetchSubActivities(activity.id);
    onActivityUpdated();
  };

  const handleDeleteSubActivity = async (subId: string) => {
    await supabase.from("activities").delete().eq("id", subId);
    if (activity) fetchSubActivities(activity.id);
    onActivityUpdated();
  };

  const handleToggleSubActivity = async (sub: Activity) => {
    const newStatus = sub.status === "completed" ? "pending" : "completed";
    await supabase.from("activities").update({
      status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : null,
    }).eq("id", sub.id);
    if (activity) fetchSubActivities(activity.id);
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
    if (!activity) return;
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
      } as any).eq("id", activity.id);
      if (error) throw error;
      toast({ title: "Atividade atualizada!" });
      onActivityUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);
      toast({ title: "Erro ao atualizar atividade", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Editar Atividade</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-semibold text-foreground">Título *</Label>
            <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required className="font-medium" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-semibold text-foreground">Descrição</Label>
            <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} placeholder="Descreva a atividade..." />
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
              {members.filter(m => m.full_name && !formData.participants.includes(m.full_name!)).map((m) => (
                <option key={m.full_name} value={m.full_name!}>{m.full_name}</option>
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

          <div className="grid grid-cols-2 gap-4">
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
          </div>

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
          {activity && projectId && (
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

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Salvar Alterações</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
