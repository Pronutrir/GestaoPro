'use client';
// TAXAS DE CUSTO — por PAPEL, com exceção por PESSOA (decisão do usuário).
//
// Cadastra-se "Desenvolvedor: R$ 90/h" uma vez e vale para todos daquele cargo;
// quem foge à regra (o especialista caro) ganha uma linha própria, que vence a
// do papel. É o modelo do Wrike, e evita o cadastro pessoa a pessoa.
//
// A VIGÊNCIA é o detalhe que não pode faltar: sem ela, um reajuste hoje
// reescreveria o custo já apurado nos meses anteriores.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateField } from "@/components/ui/date-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Coins, User, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { formatMoney, type CostRate } from "@/lib/projectCosts";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Row = CostRate & { job_title_name?: string | null; user_name?: string | null };

export const CostRatesManager = () => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [jobTitles, setJobTitles] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    target: "job" as "job" | "user",
    job_title_id: "",
    user_id: "",
    cost_rate: "",
    bill_rate: "",
    effective_from: new Date().toISOString().slice(0, 10),
  });

  const load = async () => {
    const [ratesRes, jobsRes, peopleRes] = await Promise.all([
      sb.from("cost_rates").select("*").order("effective_from", { ascending: false }),
      sb.from("job_titles").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name").not("full_name", "is", null).order("full_name"),
    ]);
    if (ratesRes.error && /cost_rates|does not exist|schema cache/i.test(ratesRes.error.message || "")) {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    const jobs = jobsRes.data || [];
    const profs = peopleRes.data || [];
    setJobTitles(jobs);
    setPeople(profs.filter((p: { full_name: string | null }) => p.full_name) as { id: string; full_name: string }[]);
    setRows(
      ((ratesRes.data as CostRate[]) || []).map((r) => ({
        ...r,
        job_title_name: jobs.find((j: { id: string }) => j.id === r.job_title_id)?.name ?? null,
        user_name: profs.find((p: { id: string }) => p.id === r.user_id)?.full_name ?? null,
      })),
    );
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const isJob = form.target === "job";
    if (isJob && !form.job_title_id) return;
    if (!isJob && !form.user_id) return;
    setSaving(true);
    const { error } = await sb.from("cost_rates").insert({
      job_title_id: isJob ? form.job_title_id : null,
      user_id: isJob ? null : form.user_id,
      cost_rate: Number(form.cost_rate.replace(",", ".")) || 0,
      bill_rate: form.bill_rate ? Number(form.bill_rate.replace(",", ".")) : null,
      effective_from: form.effective_from || new Date().toISOString().slice(0, 10),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar a taxa", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Taxa cadastrada", description: "Vale para os apontamentos a partir da data de vigência." });
    setDialogOpen(false);
    setForm({ ...form, cost_rate: "", bill_rate: "" });
    load();
  };

  const remove = async (r: Row) => {
    const ok = await appConfirm({
      title: "Excluir taxa",
      description: "O custo já apurado com esta taxa deixará de ser calculado. Continuar?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await sb.from("cost_rates").delete().eq("id", r.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Taxa excluída" });
    load();
  };

  const byJob = rows.filter((r) => r.job_title_id);
  const byUser = rows.filter((r) => r.user_id);

  if (unavailable) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Coins className="w-4 h-4 text-primary" />
          <h2 className="text-[15px] font-semibold">Taxas de custo</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Recurso indisponível neste ambiente — rode{" "}
          <code className="font-mono text-xs">scripts/apply-project-budget-fase1.sh</code> na VM para habilitar.
        </p>
      </Card>
    );
  }

  const renderRow = (r: Row) => (
    <div key={r.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 group hover:bg-muted/30 transition-colors">
      <span className={cn("w-6 h-6 rounded flex items-center justify-center shrink-0",
        r.user_id ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary")}>
        {r.user_id ? <User className="w-3.5 h-3.5" /> : <Briefcase className="w-3.5 h-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium truncate">{r.job_title_name || r.user_name || "—"}</p>
        <p className="text-[11px] text-muted-foreground">
          Vigente desde {r.effective_from.split("-").reverse().join("/")}
          {r.effective_to ? ` até ${r.effective_to.split("-").reverse().join("/")}` : ""}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[13px] font-semibold tabular-nums">{formatMoney(r.cost_rate)}/h</p>
        {r.bill_rate ? (
          <p className="text-[11px] text-muted-foreground tabular-nums">cobrança {formatMoney(r.bill_rate)}/h</p>
        ) : null}
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={() => remove(r)} title="Excluir taxa">
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-primary" />
          <h2 className="text-[15px] font-semibold">Taxas de custo</h2>
          <Badge variant="secondary" className="tabular-nums">{rows.length}</Badge>
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" /> Nova taxa
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground mb-3">
        As horas apontadas viram custo pela taxa vigente na data do apontamento. A taxa do
        <strong className="text-foreground"> papel</strong> vale para todos daquele cargo; a da
        <strong className="text-foreground"> pessoa</strong> é exceção e tem prioridade.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">Nenhuma taxa cadastrada.</p>
          <p className="text-xs text-muted-foreground mt-1">Sem taxa, as horas apontadas não viram custo nos projetos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {byJob.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Por papel / cargo
              </div>
              {byJob.map(renderRow)}
            </div>
          )}
          {byUser.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Exceções por pessoa
              </div>
              {byUser.map(renderRow)}
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova taxa de custo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Aplicar a</Label>
              <Select value={form.target} onValueChange={(v) => setForm({ ...form, target: v as "job" | "user" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="job">Papel / cargo (vale para todos)</SelectItem>
                  <SelectItem value="user">Pessoa específica (exceção)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.target === "job" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Cargo *</Label>
                <Select value={form.job_title_id} onValueChange={(v) => setForm({ ...form, job_title_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                  <SelectContent>
                    {jobTitles.map((j) => <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {jobTitles.length === 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Nenhum cargo cadastrado — crie em Configurações → Organização.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Pessoa *</Label>
                <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a pessoa" /></SelectTrigger>
                  <SelectContent>
                    {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Custo por hora *</Label>
                <CurrencyInput value={form.cost_rate} onChange={(e) => setForm({ ...form, cost_rate: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">o que custa à empresa</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cobrança por hora</Label>
                <CurrencyInput value={form.bill_rate} onChange={(e) => setForm({ ...form, bill_rate: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">opcional, para margem</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vigente a partir de *</Label>
              <DateField value={form.effective_from} onChange={(v) => setForm({ ...form, effective_from: v })} />
              <p className="text-[11px] text-muted-foreground">
                Apontamentos anteriores mantêm a taxa antiga — o histórico não é reescrito.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.cost_rate}>{saving ? "Salvando..." : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
