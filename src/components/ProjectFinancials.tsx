import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DollarSign, Plus, TrendingUp, TrendingDown, Pencil, Trash2, Wallet, Receipt, PiggyBank } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Investment {
  id: string;
  activity_id: string;
  amount: number;
  description: string | null;
  responsible: string | null;
  category: string | null;
  recorded_at: string;
  project_id: string | null;
}

interface ProjectFinancialsProps {
  projectId: string;
  budgetPlanned: number;
  budgetUsed: number;
  onProjectUpdated: () => void;
}

const categoryLabels: Record<string, string> = {
  geral: "Geral",
  pessoal: "Pessoal",
  infraestrutura: "Infraestrutura",
  software: "Software",
  consultoria: "Consultoria",
  equipamentos: "Equipamentos",
  viagem: "Viagem",
  treinamento: "Treinamento",
  outros: "Outros",
};

export const ProjectFinancials = ({ projectId, budgetPlanned, budgetUsed, onProjectUpdated }: ProjectFinancialsProps) => {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [activities, setActivities] = useState<{ id: string; title: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [newBudgetPlanned, setNewBudgetPlanned] = useState(String(budgetPlanned || ""));
  const [newBudgetUsed, setNewBudgetUsed] = useState(String(budgetUsed || ""));

  const [form, setForm] = useState({
    activity_id: "", amount: "", description: "", responsible: "", category: "geral",
  });

  const fetchData = async () => {
    setIsLoading(true);
    const [{ data: invData }, { data: actData }] = await Promise.all([
      supabase.from("activity_investments").select("*").eq("project_id", projectId).order("recorded_at", { ascending: false }),
      supabase.from("activities").select("id, title").eq("project_id", projectId).order("title"),
    ]);
    if (invData) setInvestments(invData);
    if (actData) setActivities(actData);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const totalInvestments = useMemo(() => investments.reduce((s, i) => s + i.amount, 0), [investments]);
  const totalConsolidated = budgetUsed + totalInvestments;
  const budgetPct = budgetPlanned > 0 ? Math.min((totalConsolidated / budgetPlanned) * 100, 100) : 0;
  const isOverBudget = budgetPlanned > 0 && totalConsolidated > budgetPlanned;

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    investments.forEach(i => {
      const cat = i.category || "geral";
      map[cat] = (map[cat] || 0) + i.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [investments]);

  const resetForm = () => setForm({ activity_id: "", amount: "", description: "", responsible: "", category: "geral" });

  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast({ title: "Informe um valor válido", variant: "destructive" });
      return;
    }
    if (!form.activity_id) {
      toast({ title: "Selecione uma atividade", variant: "destructive" });
      return;
    }

    try {
      const payload = {
        activity_id: form.activity_id,
        project_id: projectId,
        amount: parseFloat(form.amount),
        description: form.description || null,
        responsible: form.responsible || null,
        category: form.category,
      };

      if (editingInvestment) {
        await supabase.from("activity_investments").update(payload).eq("id", editingInvestment.id);
        toast({ title: "Investimento atualizado!" });
      } else {
        await supabase.from("activity_investments").insert(payload);
        toast({ title: "Investimento registrado!" });
      }

      resetForm();
      setEditingInvestment(null);
      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleEdit = (inv: Investment) => {
    setEditingInvestment(inv);
    setForm({
      activity_id: inv.activity_id,
      amount: String(inv.amount),
      description: inv.description || "",
      responsible: inv.responsible || "",
      category: inv.category || "geral",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("activity_investments").delete().eq("id", id);
    toast({ title: "Investimento excluído!" });
    setDeleteConfirm(null);
    fetchData();
  };

  const handleUpdateBudget = async () => {
    await supabase.from("projects").update({
      budget_planned: parseFloat(newBudgetPlanned) || 0,
      budget_used: parseFloat(newBudgetUsed) || 0,
    }).eq("id", projectId);
    toast({ title: "Orçamento atualizado!" });
    setBudgetDialogOpen(false);
    onProjectUpdated();
  };

  const formatCurrency = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <PiggyBank className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Orçamento Planejado</span>
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(budgetPlanned)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-warning" />
            <span className="text-xs text-muted-foreground">Custo do Projeto</span>
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(budgetUsed)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="w-4 h-4 text-accent-foreground" />
            <span className="text-xs text-muted-foreground">Investimentos (Atividades)</span>
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalInvestments)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            {isOverBudget ? <TrendingDown className="w-4 h-4 text-destructive" /> : <TrendingUp className="w-4 h-4 text-success" />}
            <span className="text-xs text-muted-foreground">Total Consolidado</span>
          </div>
          <p className={`text-xl font-bold ${isOverBudget ? "text-destructive" : "text-foreground"}`}>{formatCurrency(totalConsolidated)}</p>
        </Card>
      </div>

      {/* Budget Progress */}
      {budgetPlanned > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Consumo do Orçamento</span>
            <span className={`text-sm font-bold ${isOverBudget ? "text-destructive" : "text-foreground"}`}>
              {budgetPct.toFixed(1)}%
            </span>
          </div>
          <Progress value={budgetPct} className="h-2.5" />
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>Utilizado: {formatCurrency(totalConsolidated)}</span>
            <span>Disponível: {formatCurrency(Math.max(budgetPlanned - totalConsolidated, 0))}</span>
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {isAdmin && (
          <>
            <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); setEditingInvestment(null); } setDialogOpen(open); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Registrar Investimento</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingInvestment ? "Editar" : "Novo"} Investimento</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Atividade *</Label>
                    <Select value={form.activity_id} onValueChange={(v) => setForm({ ...form, activity_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione a atividade" /></SelectTrigger>
                      <SelectContent>
                        {activities.map(a => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Valor (R$) *</Label>
                      <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Categoria</Label>
                      <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Descrição</Label>
                    <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descreva o investimento" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Responsável</Label>
                    <Input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} placeholder="Quem autorizou / realizou" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); setEditingInvestment(null); }}>Cancelar</Button>
                  <Button onClick={handleSave}>{editingInvestment ? "Salvar" : "Registrar"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setNewBudgetPlanned(String(budgetPlanned || "")); setNewBudgetUsed(String(budgetUsed || "")); }}>
                  <DollarSign className="w-4 h-4" /> Editar Orçamento
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Editar Orçamento do Projeto</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Orçamento Planejado (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={newBudgetPlanned} onChange={(e) => setNewBudgetPlanned(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Custo Utilizado (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={newBudgetUsed} onChange={(e) => setNewBudgetUsed(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleUpdateBudget}>Salvar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      {/* Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Investimentos por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {categoryBreakdown.map(([cat, amount]) => {
                const pct = totalInvestments > 0 ? (amount / totalInvestments) * 100 : 0;
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-28 truncate">{categoryLabels[cat] || cat}</span>
                    <Progress value={pct} className="h-2 flex-1" />
                    <span className="text-sm font-medium text-foreground w-28 text-right">{formatCurrency(amount)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Investments Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Registro de Investimentos ({investments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {investments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum investimento registrado neste projeto.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    {isAdmin && <TableHead className="w-20">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((inv) => {
                    const activity = activities.find(a => a.id === inv.activity_id);
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="text-sm">{new Date(inv.recorded_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="text-sm font-medium truncate max-w-[150px]">{activity?.title || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{inv.description || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{categoryLabels[inv.category || "geral"] || inv.category}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{inv.responsible || "—"}</TableCell>
                        <TableCell className="text-right font-medium text-sm">{formatCurrency(inv.amount)}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(inv)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirm(inv.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Investimento</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este registro de investimento?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
