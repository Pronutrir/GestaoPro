import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import type { RoadmapItem } from "@/pages/Roadmap";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem: RoadmapItem | null;
}

const defaultForm = {
  title: "",
  description: "",
  theme: "produto",
  status: "ideacao",
  reach: 5,
  impact: 1,
  confidence: 0.8,
  effort: 5,
  target_quarter: "Q1",
};

export function RoadmapDrawer({ open, onOpenChange, editItem }: Props) {
  const [form, setForm] = useState(defaultForm);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (editItem) {
      setForm({
        title: editItem.title,
        description: editItem.description || "",
        theme: editItem.theme,
        status: editItem.status,
        reach: editItem.reach,
        impact: editItem.impact,
        confidence: editItem.confidence,
        effort: editItem.effort,
        target_quarter: editItem.target_quarter || "Q1",
      });
    } else {
      setForm(defaultForm);
    }
  }, [editItem, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form };
      if (editItem) {
        const { error } = await supabase
          .from("roadmap_items" as any)
          .update(payload as any)
          .eq("id", editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("roadmap_items" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap_items"] });
      onOpenChange(false);
      toast({ title: editItem ? "Ideia atualizada!" : "Ideia criada!" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editItem) return;
      const { error } = await supabase
        .from("roadmap_items" as any)
        .delete()
        .eq("id", editItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap_items"] });
      onOpenChange(false);
      toast({ title: "Ideia removida" });
    },
  });

  const computedScore =
    form.effort > 0
      ? ((form.reach * form.impact * form.confidence) / form.effort).toFixed(1)
      : "—";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editItem ? "Editar Ideia" : "Nova Ideia"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div>
            <Label>Título *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Nome da ideia"
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
              <Label>Tema</Label>
              <Select value={form.theme} onValueChange={(v) => setForm({ ...form, theme: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="produto">Produto</SelectItem>
                  <SelectItem value="mercado">Mercado</SelectItem>
                  <SelectItem value="operacoes">Operações</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ideacao">Ideação</SelectItem>
                  <SelectItem value="em_analise">Em Análise</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="descartado">Descartado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Trimestre Alvo</Label>
            <Select value={form.target_quarter} onValueChange={(v) => setForm({ ...form, target_quarter: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Q1">Q1</SelectItem>
                <SelectItem value="Q2">Q2</SelectItem>
                <SelectItem value="Q3">Q3</SelectItem>
                <SelectItem value="Q4">Q4</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h4 className="font-semibold text-sm">Scoring RICE</h4>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Reach (Alcance)</span>
                <span className="font-mono">{form.reach}</span>
              </div>
              <Slider
                min={1} max={10} step={1}
                value={[form.reach]}
                onValueChange={([v]) => setForm({ ...form, reach: v })}
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Impact (Impacto)</span>
                <span className="font-mono">{form.impact}</span>
              </div>
              <Slider
                min={0.25} max={3} step={0.25}
                value={[form.impact]}
                onValueChange={([v]) => setForm({ ...form, impact: v })}
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Confidence (Confiança)</span>
                <span className="font-mono">{Math.round(form.confidence * 100)}%</span>
              </div>
              <Slider
                min={0.5} max={1} step={0.05}
                value={[form.confidence]}
                onValueChange={([v]) => setForm({ ...form, confidence: v })}
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Effort (Esforço)</span>
                <span className="font-mono">{form.effort}</span>
              </div>
              <Slider
                min={1} max={10} step={1}
                value={[form.effort]}
                onValueChange={([v]) => setForm({ ...form, effort: v })}
              />
            </div>

            <div className="text-center pt-2 border-t">
              <span className="text-xs text-muted-foreground">Score RICE:</span>
              <span className="ml-2 text-lg font-bold text-primary">{computedScore}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending} className="flex-1">
              {editItem ? "Salvar" : "Criar Ideia"}
            </Button>
            {editItem && (
              <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                Excluir
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
