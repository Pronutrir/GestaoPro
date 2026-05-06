import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar as CalendarIcon, Plus, Trash2, Plane, Pencil } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppConfirm } from "@/components/AppConfirmProvider";

interface VacationPeriod { start: string; end: string; }
interface Profile { id: string; full_name: string | null; email: string | null; sector: string | null; }
interface Schedule { user_id: string; weekly_hours: any; vacation_periods: VacationPeriod[]; }

export const UserVacationsManager = () => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [form, setForm] = useState<{ start?: Date; end?: Date }>({});

  useEffect(() => {
    supabase.from("profiles").select("id,full_name,email,sector").eq("is_active", true).order("full_name")
      .then(({ data }) => setUsers((data || []) as Profile[]));
  }, []);

  useEffect(() => {
    if (!selectedUserId) { setSchedule(null); return; }
    setLoading(true);
    supabase.from("user_work_schedules").select("*").eq("user_id", selectedUserId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSchedule({
            user_id: data.user_id,
            weekly_hours: data.weekly_hours,
            vacation_periods: (data.vacation_periods as unknown as VacationPeriod[]) || [],
          });
        } else {
          setSchedule({ user_id: selectedUserId, weekly_hours: { monday:8, tuesday:8, wednesday:8, thursday:8, friday:8, saturday:0, sunday:0 }, vacation_periods: [] });
        }
        setLoading(false);
      });
  }, [selectedUserId]);

  const persist = async (next: VacationPeriod[]) => {
    if (!schedule) return;
    const { error } = await supabase.from("user_work_schedules").upsert({
      user_id: schedule.user_id,
      weekly_hours: schedule.weekly_hours,
      vacation_periods: next as any,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setSchedule({ ...schedule, vacation_periods: next });
    toast({ title: "Férias salvas" });
  };

  const openNew = () => { setEditIndex(null); setForm({}); setDialogOpen(true); };
  const openEdit = (i: number) => {
    const v = schedule!.vacation_periods[i];
    setEditIndex(i); setForm({ start: parseISO(v.start), end: parseISO(v.end) }); setDialogOpen(true);
  };
  const save = async () => {
    if (!form.start || !form.end) { toast({ title: "Preencha início e fim", variant: "destructive" }); return; }
    if (form.end < form.start) { toast({ title: "Data fim antes do início", variant: "destructive" }); return; }
    const novo = { start: format(form.start, "yyyy-MM-dd"), end: format(form.end, "yyyy-MM-dd") };
    const list = [...(schedule?.vacation_periods || [])];
    if (editIndex !== null) list[editIndex] = novo; else list.push(novo);
    await persist(list);
    setDialogOpen(false);
  };
  const remove = async (i: number) => {
    const ok = await appConfirm({
      title: "Excluir período",
      description: "Excluir este período de férias?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const list = [...(schedule?.vacation_periods || [])];
    list.splice(i, 1);
    await persist(list);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Plane className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">Férias dos Usuários</h2>
      </div>

      <div className="space-y-2 mb-4">
        <Label>Selecione o usuário</Label>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger><SelectValue placeholder="Escolha um usuário" /></SelectTrigger>
          <SelectContent>
            {users.map(u => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name || u.email}{u.sector ? ` — ${u.sector}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedUserId && (
        <>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Períodos cadastrados</h3>
            <Button size="sm" onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Novo período</Button>
          </div>
          <div className="space-y-1">
            {loading && <div className="text-sm text-muted-foreground p-4 text-center">Carregando...</div>}
            {!loading && (!schedule?.vacation_periods?.length) && (
              <div className="text-sm text-muted-foreground p-4 text-center bg-muted/30 rounded">
                Nenhum período de férias cadastrado para este usuário.
              </div>
            )}
            {schedule?.vacation_periods?.map((v, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded hover:bg-accent/50 group">
                <div className="text-sm">
                  <span className="font-medium">{format(parseISO(v.start), "dd/MM/yyyy")}</span>
                  {" → "}
                  <span className="font-medium">{format(parseISO(v.end), "dd/MM/yyyy")}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(i)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader><DialogTitle>{editIndex !== null ? "Editar Férias" : "Novas Férias"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {form.start ? format(form.start, "PPP", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.start} onSelect={d => setForm({ ...form, start: d })} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {form.end ? format(form.end, "PPP", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.end} onSelect={d => setForm({ ...form, end: d })} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editIndex !== null ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
