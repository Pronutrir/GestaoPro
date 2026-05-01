import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Objective } from "@/legacy/pages/OKRs";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  objective: Objective | null;
  onSaved: () => void;
}

const CYCLES = ["Q1", "Q2", "Q3", "Q4", "Anual"];
const STATUSES = [
  { value: "on_track", label: "No Caminho" },
  { value: "at_risk", label: "Em Atenção" },
  { value: "off_track", label: "Fora do Caminho" },
  { value: "done", label: "Concluído" },
];

export const ObjectiveDialog = ({ open, onOpenChange, objective, onSaved }: Props) => {
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState({
    title: "",
    description: "",
    owner: "",
    cycle: "Q1",
    year: currentYear,
    status: "on_track",
    progress: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (objective) {
      setForm({
        title: objective.title,
        description: objective.description || "",
        owner: objective.owner || "",
        cycle: objective.cycle,
        year: objective.year,
        status: objective.status,
        progress: Number(objective.progress) || 0,
      });
    } else {
      setForm({
        title: "", description: "", owner: "",
        cycle: "Q1", year: currentYear,
        status: "on_track", progress: 0,
      });
    }
  }, [objective, open, currentYear]);

  const handleSave = async () => {
    if (!form.title.trim()) return toast.error("Informe o título");
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      owner: form.owner.trim() || null,
      cycle: form.cycle,
      year: form.year,
      status: form.status,
      progress: form.progress,
    };
    const { error } = objective
      ? await supabase.from("okr_objectives").update(payload).eq("id", objective.id)
      : await supabase.from("okr_objectives").insert(payload);
    setSaving(false);
    if (error) return toast.error("Erro ao salvar");
    toast.success(objective ? "Objetivo atualizado" : "Objetivo criado");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{objective ? "Editar Objetivo" : "Novo Objetivo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Título *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex.: Liderar a transformação digital do setor"
            />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Responsável</Label>
              <Input
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Ciclo</Label>
              <Select value={form.cycle} onValueChange={(v) => setForm({ ...form, cycle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CYCLES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ano</Label>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) || currentYear })}
              />
            </div>
            <div>
              <Label>Progresso (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};