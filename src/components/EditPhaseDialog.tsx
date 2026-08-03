'use client';
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { Layers, Save } from "lucide-react";

/**
 * Edição da FASE (tabela `phases`).
 *
 * A fase só tinha título e ordem, sem tela própria: dava para criar e arquivar,
 * mas não para abrir e ajustar. Com a importação passando a trazer datas na
 * linha da fase, faltava onde vê-las e corrigi-las.
 *
 * As datas aqui são o PLANEJADO da fase — dado diferente do intervalo somado
 * das atividades, que aparece ao lado para comparação. Quando divergem, a
 * diferença é a informação.
 */

export interface PhaseLike {
  id: string;
  title: string;
  description?: string | null;
  wbs_code?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
}

interface Props {
  phase: PhaseLike | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Resumo do que está dentro, para comparar com o planejado da fase. */
  resumo?: { total: number; concluidas: number; horas: number; inicio?: string | null; fim?: string | null };
  canEdit?: boolean;
}

const fmt = (iso?: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

export const EditPhaseDialog = ({ phase, open, onOpenChange, onSaved, resumo, canEdit = true }: Props) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", wbs_code: "",
    start_date: "", end_date: "", actual_start_date: "", actual_end_date: "",
  });

  useEffect(() => {
    if (!open || !phase) return;
    setForm({
      title: phase.title ?? "",
      description: phase.description ?? "",
      wbs_code: phase.wbs_code ?? "",
      start_date: phase.start_date?.slice(0, 10) ?? "",
      end_date: phase.end_date?.slice(0, 10) ?? "",
      actual_start_date: phase.actual_start_date?.slice(0, 10) ?? "",
      actual_end_date: phase.actual_end_date?.slice(0, 10) ?? "",
    });
  }, [open, phase]);

  const salvar = async () => {
    if (!phase || !form.title.trim()) return;
    setSaving(true);

    const payload: Record<string, any> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      wbs_code: form.wbs_code.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      actual_start_date: form.actual_start_date || null,
      actual_end_date: form.actual_end_date || null,
    };

    // Degrada por coluna ausente: as datas e o wbs_code vêm de migrations que
    // podem não ter rodado neste ambiente. Melhor salvar o título do que
    // recusar a edição inteira.
    let res = await supabase.from("phases").update(payload as any).eq("id", phase.id);
    const descartadas: string[] = [];
    for (let i = 0; i < 8 && res.error; i++) {
      const miss = /Could not find the '([^']+)' column/.exec(res.error.message)?.[1];
      if (!miss || !(miss in payload)) break;
      delete payload[miss];
      descartadas.push(miss);
      res = await supabase.from("phases").update(payload as any).eq("id", phase.id);
    }

    setSaving(false);
    if (res.error) {
      toast({ title: "Erro ao salvar a fase", description: res.error.message, variant: "destructive" });
      return;
    }
    if (descartadas.length > 0) {
      toast({
        title: "Fase salva sem alguns campos",
        description: `Este banco ainda não tem: ${descartadas.join(", ")}. Aplique as migrations pendentes na VM.`,
      });
    } else {
      toast({ title: "Fase salva" });
    }
    onOpenChange(false);
    onSaved();
  };

  if (!phase) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="w-4 h-4 text-primary" /> Fase / Entrega
          </DialogTitle>
          <DialogDescription>
            As datas aqui são o planejado da fase. O que as atividades somam
            aparece abaixo, para comparação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nº EAP</Label>
              <Input
                value={form.wbs_code}
                onChange={(e) => setForm({ ...form, wbs_code: e.target.value })}
                disabled={!canEdit}
                placeholder="1"
                className="h-9 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                disabled={!canEdit}
                className="h-9"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={!canEdit}
              rows={2}
              placeholder="O que esta fase entrega"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* DateField, não <input type="date">: o nativo herda o idioma do
                NAVEGADOR e exibe mm/dd/aaaa para quem usa Chrome em inglês,
                invertendo dia e mês em silêncio. Aqui a máscara é sempre
                dd/mm/aaaa e o valor trafega em YYYY-MM-DD, como o banco espera. */}
            <div className="space-y-1.5">
              <Label className="text-xs">Início previsto</Label>
              <DateField value={form.start_date} disabled={!canEdit}
                onChange={(v) => setForm({ ...form, start_date: v })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fim previsto</Label>
              <DateField value={form.end_date} disabled={!canEdit}
                onChange={(v) => setForm({ ...form, end_date: v })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Início real</Label>
              <DateField value={form.actual_start_date} disabled={!canEdit}
                onChange={(v) => setForm({ ...form, actual_start_date: v })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fim real</Label>
              <DateField value={form.actual_end_date} disabled={!canEdit}
                onChange={(v) => setForm({ ...form, actual_end_date: v })} />
            </div>
          </div>

          {resumo && resumo.total > 0 && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">{resumo.concluidas}/{resumo.total}</span> concluída(s)
              {resumo.horas > 0 && <> · <span className="font-medium text-foreground">{resumo.horas}h</span> somadas</>}
              {(resumo.inicio || resumo.fim) && (
                <> · atividades de <span className="font-medium text-foreground">{fmt(resumo.inicio)}</span> a{" "}
                  <span className="font-medium text-foreground">{fmt(resumo.fim)}</span></>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {canEdit ? "Cancelar" : "Fechar"}
          </Button>
          {canEdit && (
            <Button onClick={salvar} disabled={saving || !form.title.trim()} className="gap-1.5">
              <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
