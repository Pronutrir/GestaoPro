'use client';
// COMPOSIÇÃO DO ORÇAMENTO (Fase 1) — o orçamento deixa de ser um número
// digitado e passa a ser elaborado item a item, com categoria, quantidade,
// valor unitário e fase. O total do projeto vira consequência da soma.
//
// Também traz o Plano de Gerenciamento de Custos do PMBOK no que ele tem de
// prático: reservas (contingência DENTRO da linha de base, gerencial FORA) e
// limite de alerta.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Layers, ShieldCheck, Download, Sigma } from "lucide-react";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import {
  BUDGET_CATEGORIES, categoryLabel, formatMoney, pertEstimate, pertRange, budgetToCsv,
  type BudgetItem, type BudgetSettings,
} from "@/lib/projectCosts";
import { cn } from "@/lib/utils";

interface Props {
  items: BudgetItem[];
  phases: { id: string; title: string }[];
  settings: BudgetSettings;
  canManage: boolean;
  onSaveItem: (item: Partial<BudgetItem> & { id?: string }) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onSaveSettings: (patch: Partial<BudgetSettings>) => Promise<void>;
}

const emptyForm = {
  description: "", category: "outros", quantity: "1", unit_cost: "",
  phase_id: "", supplier: "", notes: "",
  // Fase 2: quando o custo é reconhecido no tempo — dá forma à curva S.
  accrual: "rateado",
  // Fase 4: estimativa em três pontos (PERT).
  estimate_method: "simples", optimistic_cost: "", likely_cost: "", pessimistic_cost: "",
};

// Regra de reconhecimento do custo (cost accrual do MS Project).
const ACCRUALS: { value: string; label: string; hint: string }[] = [
  { value: "inicio", label: "No início", hint: "todo o custo no primeiro mês do período" },
  { value: "rateado", label: "Rateado", hint: "dividido igualmente pelos meses" },
  { value: "fim", label: "No fim", hint: "todo o custo no último mês" },
];

export function BudgetPlanner({
  items, phases, settings, canManage, onSaveItem, onDeleteItem, onSaveSettings,
}: Props) {
  const appConfirm = useAppConfirm();
  const [itemDialog, setItemDialog] = useState(false);
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [reserveDialog, setReserveDialog] = useState(false);
  const [reserve, setReserve] = useState({
    contingency_pct: String(settings.contingency_pct || ""),
    contingency_amount: String(settings.contingency_amount || ""),
    management_reserve_pct: String(settings.management_reserve_pct || ""),
    management_reserve_amount: String(settings.management_reserve_amount || ""),
    alert_threshold_pct: String(settings.alert_threshold_pct ?? 90),
    currency: settings.currency || "BRL",
    precision: String(settings.precision ?? 2),
  });
  const [saving, setSaving] = useState(false);

  const cur = settings.currency || "BRL";
  const prec = settings.precision ?? 2;
  const money = (v: number) => formatMoney(v, cur, prec);

  const openNew = () => { setEditing(null); setForm(emptyForm); setItemDialog(true); };
  const openEdit = (it: BudgetItem) => {
    setEditing(it);
    setForm({
      description: it.description,
      category: it.category || "outros",
      quantity: String(it.quantity ?? 1),
      unit_cost: String(it.unit_cost ?? ""),
      phase_id: it.phase_id ?? "",
      supplier: it.supplier ?? "",
      notes: it.notes ?? "",
      accrual: it.accrual || "rateado",
      estimate_method: it.estimate_method || "simples",
      optimistic_cost: String(it.optimistic_cost ?? ""),
      likely_cost: String(it.likely_cost ?? ""),
      pessimistic_cost: String(it.pessimistic_cost ?? ""),
    });
    setItemDialog(true);
  };

  const num = (s: string) => Number(String(s).replace(",", ".")) || 0;
  const isPert = form.estimate_method === "pert";
  // No modo PERT o valor unitário é CALCULADO — não digitado.
  const pert = pertEstimate(num(form.optimistic_cost), num(form.likely_cost), num(form.pessimistic_cost));
  const effectiveUnit = isPert ? pert.expected : num(form.unit_cost);

  const submitItem = async () => {
    if (!form.description.trim()) return;
    setSaving(true);
    await onSaveItem({
      id: editing?.id,
      description: form.description.trim(),
      category: form.category,
      quantity: num(form.quantity) || 1,
      unit_cost: effectiveUnit,
      phase_id: form.phase_id || null,
      supplier: form.supplier.trim() || null,
      notes: form.notes.trim() || null,
      accrual: form.accrual,
      ...(isPert
        ? {
            estimate_method: "pert",
            optimistic_cost: num(form.optimistic_cost),
            likely_cost: num(form.likely_cost),
            pessimistic_cost: num(form.pessimistic_cost),
          }
        : { estimate_method: "simples" }),
    });
    setSaving(false);
    setItemDialog(false);
  };

  const exportCsv = () => {
    const csv = budgetToCsv(items, (id) => phases.find((p) => p.id === id)?.title ?? "Projeto inteiro");
    // BOM para o Excel abrir os acentos corretamente.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orcamento-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeItem = async (it: BudgetItem) => {
    const ok = await appConfirm({
      title: "Excluir item do orçamento",
      description: `Remover "${it.description}" (${money(it.total_cost)}) da composição?`,
      confirmText: "Excluir",
      destructive: true,
    });
    if (ok) await onDeleteItem(it.id);
  };

  const submitReserves = async () => {
    setSaving(true);
    await onSaveSettings({
      contingency_pct: Number(reserve.contingency_pct.replace(",", ".")) || 0,
      contingency_amount: Number(reserve.contingency_amount.replace(",", ".")) || 0,
      management_reserve_pct: Number(reserve.management_reserve_pct.replace(",", ".")) || 0,
      management_reserve_amount: Number(reserve.management_reserve_amount.replace(",", ".")) || 0,
      alert_threshold_pct: Number(reserve.alert_threshold_pct.replace(",", ".")) || 90,
      currency: reserve.currency,
      precision: Number(reserve.precision) || 2,
    });
    setSaving(false);
    setReserveDialog(false);
  };

  // Agrupado por categoria: é assim que se lê um orçamento.
  const byCategory = BUDGET_CATEGORIES
    .map((c) => ({
      ...c,
      items: items.filter((i) => (i.category || "outros") === c.value),
    }))
    .filter((g) => g.items.length > 0)
    .map((g) => ({ ...g, total: g.items.reduce((s, i) => s + (Number(i.total_cost) || 0), 0) }));

  const planned = items.reduce((s, i) => s + (Number(i.total_cost) || 0), 0);
  const phaseTitle = (id: string | null) => phases.find((p) => p.id === id)?.title;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Composição do orçamento
        </h3>
        <Badge variant="secondary" className="tabular-nums">{items.length}</Badge>
        <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground tabular-nums">{money(planned)}</strong></span>
        <div className="ml-auto flex items-center gap-2">
          {items.length > 0 && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportCsv} title="Baixar o orçamento em CSV">
              <Download className="w-3.5 h-3.5" /> Exportar
            </Button>
          )}
          {canManage && (
            <>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setReserveDialog(true)}>
                <ShieldCheck className="w-3.5 h-3.5" /> Reservas e limites
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openNew}>
                <Plus className="w-3.5 h-3.5" /> Novo item
              </Button>
            </>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Nenhum item no orçamento.</p>
          <p className="text-xs text-muted-foreground mt-1">
            {canManage
              ? "Adicione itens (pessoal, licenças, serviços…) para compor o valor planejado do projeto."
              : "O orçamento ainda não foi elaborado."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {byCategory.map((g) => (
            <div key={g.value} className="rounded-lg border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
                <span className="text-[13px] font-semibold">{g.label}</span>
                <Badge variant="outline" className="text-[10px] tabular-nums">{g.items.length}</Badge>
                <span className="ml-auto text-[13px] font-semibold tabular-nums">{money(g.total)}</span>
              </div>
              <div>
                {g.items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 group hover:bg-muted/30 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate">{it.description}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {Number(it.quantity)} × {money(Number(it.unit_cost))}
                        {it.supplier ? ` · ${it.supplier}` : ""}
                        {phaseTitle(it.phase_id) ? ` · ${phaseTitle(it.phase_id)}` : ""}
                      </p>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums shrink-0">{money(Number(it.total_cost))}</span>
                    {canManage && (
                      <span className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(it)} title="Editar item">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(it)} title="Excluir item">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Item do orçamento */}
      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar item" : "Novo item do orçamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição *</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ex.: Licença Figma — 5 assentos" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUDGET_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fase (opcional)</Label>
                <Select value={form.phase_id || "__none__"} onValueChange={(v) => setForm({ ...form, phase_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Projeto inteiro" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Projeto inteiro</SelectItem>
                    {phases.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantidade</Label>
                <Input type="number" min="0" step="0.01" value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor unitário</Label>
                {isPert ? (
                  <div className="h-10 px-3 flex items-center rounded-md border bg-muted/40 text-sm tabular-nums text-muted-foreground">
                    {money(pert.expected)}
                  </div>
                ) : (
                  <CurrencyInput value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
                )}
              </div>
            </div>

            {/* Estimativa em três pontos — opcional, para itens incertos */}
            <div className="rounded-md border p-3 space-y-2.5">
              <button type="button"
                onClick={() => setForm({ ...form, estimate_method: isPert ? "simples" : "pert" })}
                className="flex items-center gap-2 text-[13px] font-medium hover:text-primary transition-colors">
                <Sigma className={cn("w-3.5 h-3.5", isPert ? "text-primary" : "text-muted-foreground")} />
                Estimativa em três pontos (PERT)
                <span className={cn("ml-auto text-[11px]", isPert ? "text-primary" : "text-muted-foreground")}>
                  {isPert ? "ativa — clique para desligar" : "clique para usar"}
                </span>
              </button>
              {isPert && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Otimista</Label>
                      <CurrencyInput value={form.optimistic_cost}
                        onChange={(e) => setForm({ ...form, optimistic_cost: e.target.value })} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Mais provável</Label>
                      <CurrencyInput value={form.likely_cost}
                        onChange={(e) => setForm({ ...form, likely_cost: e.target.value })} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Pessimista</Label>
                      <CurrencyInput value={form.pessimistic_cost}
                        onChange={(e) => setForm({ ...form, pessimistic_cost: e.target.value })} className="h-9" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Esperado = (O + 4×M + P) ÷ 6 = <strong className="text-foreground">{money(pert.expected)}</strong>
                    {pert.stdDev > 0 && (
                      <> · faixa provável {money(pertRange(pert.expected, pert.stdDev).min)} a {money(pertRange(pert.expected, pert.stdDev).max)}</>
                    )}
                  </p>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Fornecedor (opcional)</Label>
                <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quando o custo acontece</Label>
                <Select value={form.accrual} onValueChange={(v) => setForm({ ...form, accrual: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCRUALS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {ACCRUALS.find((a) => a.value === form.accrual)?.hint} — define a curva S.
                </p>
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total do item</span>
              <span className="text-sm font-bold tabular-nums">
                {money((num(form.quantity) || 0) * effectiveUnit)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setItemDialog(false)}>Cancelar</Button>
            <Button onClick={submitItem} disabled={saving || !form.description.trim()}>
              {saving ? "Salvando..." : editing ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reservas — a distinção do PMBOK que quase nenhuma ferramenta faz */}
      <Dialog open={reserveDialog} onOpenChange={setReserveDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Reservas e limites
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-primary/25 bg-primary/5 p-3">
              <p className="text-[13px] font-medium mb-1">Reserva de contingência</p>
              <p className="text-[11px] text-muted-foreground mb-2.5">
                Para riscos <strong>identificados</strong>. Entra na linha de base — o gestor usa por decisão própria.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">% sobre o orçado</Label>
                  <Input type="number" min="0" step="0.1" value={reserve.contingency_pct}
                    onChange={(e) => setReserve({ ...reserve, contingency_pct: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">+ Valor fixo</Label>
                  <CurrencyInput value={reserve.contingency_amount}
                    onChange={(e) => setReserve({ ...reserve, contingency_amount: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[13px] font-medium mb-1">Reserva gerencial</p>
              <p className="text-[11px] text-muted-foreground mb-2.5">
                Para riscos <strong>não identificados</strong>. Fica <strong>fora</strong> da linha de base — usá-la exige aprovação e gera nova versão do orçamento.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">% sobre a linha de base</Label>
                  <Input type="number" min="0" step="0.1" value={reserve.management_reserve_pct}
                    onChange={(e) => setReserve({ ...reserve, management_reserve_pct: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">+ Valor fixo</Label>
                  <CurrencyInput value={reserve.management_reserve_amount}
                    onChange={(e) => setReserve({ ...reserve, management_reserve_amount: e.target.value })} />
                </div>
              </div>
            </div>
            {/* Plano de gerenciamento de custos: unidade, precisão e limite —
                os campos que o PMBOK pede, num formulário só. */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Moeda</Label>
                <Select value={reserve.currency} onValueChange={(v) => setReserve({ ...reserve, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">Real (R$)</SelectItem>
                    <SelectItem value="USD">Dólar (US$)</SelectItem>
                    <SelectItem value="EUR">Euro (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Casas decimais</Label>
                <Select value={reserve.precision} onValueChange={(v) => setReserve({ ...reserve, precision: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sem centavos</SelectItem>
                    <SelectItem value="2">2 (padrão)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Alertar em (%)</Label>
                <Input type="number" min="1" max="200" value={reserve.alert_threshold_pct}
                  onChange={(e) => setReserve({ ...reserve, alert_threshold_pct: e.target.value })} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Limite de controle: ao consumir esse % da linha de base, o painel sinaliza.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReserveDialog(false)}>Cancelar</Button>
            <Button onClick={submitReserves} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
