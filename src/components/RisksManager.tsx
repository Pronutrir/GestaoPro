import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Risk {
  id: string;
  description: string;
  probability: string;
  impact: string;
  status: string;
  mitigation: string | null;
  contingency: string | null;
  responsible: string | null;
  category: string;
  created_at: string;
}

interface RisksManagerProps {
  projectId: string;
}

const PROB_MAP: Record<string, { label: string; class: string }> = {
  low: { label: "Baixa", class: "bg-success/20 text-success border-success/30" },
  medium: { label: "Média", class: "bg-warning/20 text-warning border-warning/30" },
  high: { label: "Alta", class: "bg-destructive/20 text-destructive border-destructive/30" },
};

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  identified: { label: "Identificado", class: "bg-muted text-muted-foreground" },
  mitigating: { label: "Mitigando", class: "bg-warning/20 text-warning border-warning/30" },
  occurred: { label: "Ocorreu", class: "bg-destructive/20 text-destructive border-destructive/30" },
  closed: { label: "Encerrado", class: "bg-success/20 text-success border-success/30" },
};

export const RisksManager = ({ projectId }: RisksManagerProps) => {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Risk[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [probability, setProbability] = useState("medium");
  const [impact, setImpact] = useState("medium");
  const [status, setStatus] = useState("identified");
  const [mitigation, setMitigation] = useState("");
  const [contingency, setContingency] = useState("");
  const [responsible, setResponsible] = useState("");

  const fetchData = async () => {
    const { data } = await supabase.from("risks").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    if (data) setItems(data);
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const resetForm = () => {
    setDescription(""); setProbability("medium"); setImpact("medium"); setStatus("identified");
    setMitigation(""); setContingency(""); setResponsible(""); setEditingId(null); setShowForm(false);
  };

  const handleSave = async () => {
    if (!description.trim()) return;
    const payload = {
      project_id: projectId, description, probability, impact, status,
      mitigation: mitigation || null, contingency: contingency || null, responsible: responsible || null,
    };

    if (editingId) {
      const { error } = await supabase.from("risks").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); return; }
      toast({ title: "Risco atualizado!" });
    } else {
      const { error } = await supabase.from("risks").insert(payload);
      if (error) { toast({ title: "Erro ao criar", variant: "destructive" }); return; }
      toast({ title: "Risco cadastrado!" });
    }
    resetForm(); fetchData();
  };

  const handleEdit = (item: Risk) => {
    setEditingId(item.id); setDescription(item.description); setProbability(item.probability);
    setImpact(item.impact); setStatus(item.status); setMitigation(item.mitigation || "");
    setContingency(item.contingency || ""); setResponsible(item.responsible || ""); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este risco?")) return;
    await supabase.from("risks").delete().eq("id", id);
    toast({ title: "Risco excluído!" }); fetchData();
  };

  const getRiskLevel = (prob: string, imp: string) => {
    const levels: Record<string, number> = { low: 1, medium: 2, high: 3 };
    const score = (levels[prob] || 2) * (levels[imp] || 2);
    if (score >= 6) return { label: "Crítico", class: "bg-destructive text-destructive-foreground" };
    if (score >= 4) return { label: "Alto", class: "bg-warning text-warning-foreground" };
    return { label: "Baixo", class: "bg-success text-success-foreground" };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" /> Riscos ({items.length})
        </h3>
        {isAdmin && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Risco
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-4 space-y-3 border-warning/20 bg-warning/5">
          <Textarea placeholder="Descrição do risco *" value={description} onChange={e => setDescription(e.target.value)} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Probabilidade</label>
              <Select value={probability} onValueChange={setProbability}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROB_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Impacto</label>
              <Select value={impact} onValueChange={setImpact}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROB_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea placeholder="Plano de mitigação (opcional)" value={mitigation} onChange={e => setMitigation(e.target.value)} rows={2} />
          <Textarea placeholder="Plano de contingência (opcional)" value={contingency} onChange={e => setContingency(e.target.value)} rows={2} />
          <Input placeholder="Responsável (opcional)" value={responsible} onChange={e => setResponsible(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>{editingId ? "Atualizar" : "Criar"}</Button>
            <Button size="sm" variant="outline" onClick={resetForm}>Cancelar</Button>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum risco cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const riskLevel = getRiskLevel(item.probability, item.impact);
            return (
              <Card key={item.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-foreground">{item.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={riskLevel.class}>{riskLevel.label}</Badge>
                      <Badge className={PROB_MAP[item.probability]?.class}>P: {PROB_MAP[item.probability]?.label}</Badge>
                      <Badge className={PROB_MAP[item.impact]?.class}>I: {PROB_MAP[item.impact]?.label}</Badge>
                      <Badge className={STATUS_MAP[item.status]?.class}>{STATUS_MAP[item.status]?.label}</Badge>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(item)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  )}
                </div>
                {item.mitigation && <p className="text-xs text-muted-foreground"><strong>Mitigação:</strong> {item.mitigation}</p>}
                {item.contingency && <p className="text-xs text-muted-foreground"><strong>Contingência:</strong> {item.contingency}</p>}
                {item.responsible && <p className="text-xs text-muted-foreground"><strong>Responsável:</strong> {item.responsible}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
