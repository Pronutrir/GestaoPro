import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar as CalendarIcon, Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useAppConfirm } from "@/components/AppConfirmProvider";

interface Holiday { id: string; date: string; name: string; is_national: boolean; }

export const HolidaysManager = () => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [list, setList] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState<{ date?: Date; name: string; is_national: boolean }>({ name: "", is_national: true });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("holidays").select("*").order("date");
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else setList((data || []) as Holiday[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ name: "", is_national: true, date: undefined }); setDialogOpen(true); };
  const openEdit = (h: Holiday) => {
    setEditing(h);
    setForm({ name: h.name, is_national: h.is_national, date: parseISO(h.date) });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.date || !form.name.trim()) { toast({ title: "Preencha data e nome", variant: "destructive" }); return; }
    const payload = { date: format(form.date, "yyyy-MM-dd"), name: form.name.trim(), is_national: form.is_national };
    const { error } = editing
      ? await supabase.from("holidays").update(payload).eq("id", editing.id)
      : await supabase.from("holidays").insert(payload);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Feriado atualizado" : "Feriado criado" });
    setDialogOpen(false); load();
  };

  const remove = async (h: Holiday) => {
    const ok = await appConfirm({
      title: "Excluir feriado",
      description: `Excluir feriado "${h.name}"?`,
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("holidays").delete().eq("id", h.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Feriado excluído" }); load();
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Feriados</h2>
        </div>
        <Button size="sm" onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Novo Feriado</Button>
      </div>

      <div className="space-y-1 max-h-[500px] overflow-y-auto">
        {loading && <div className="text-sm text-muted-foreground p-4 text-center">Carregando...</div>}
        {!loading && list.length === 0 && <div className="text-sm text-muted-foreground p-4 text-center">Nenhum feriado cadastrado</div>}
        {list.map(h => (
          <div key={h.id} className="flex items-center justify-between p-2 rounded hover:bg-accent/50 group">
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-xs font-mono bg-destructive/10 text-destructive px-2 py-1 rounded">
                {format(parseISO(h.date), "dd/MM/yyyy")}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{h.name}</div>
                <div className="text-xs text-muted-foreground">{h.is_national ? "Nacional" : "Regional"}</div>
              </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(h)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(h)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader><DialogTitle>{editing ? "Editar Feriado" : "Novo Feriado"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {form.date ? format(form.date, "PPP", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.date} onSelect={d => setForm({ ...form, date: d })} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Natal" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Feriado nacional</Label>
              <Switch checked={form.is_national} onCheckedChange={v => setForm({ ...form, is_national: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
