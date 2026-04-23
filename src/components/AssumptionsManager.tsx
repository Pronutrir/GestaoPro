import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AIAssistButton } from "@/components/AIAssistButton";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Assumption {
  id: string;
  description: string;
  status: string;
  category: string;
  impact: string | null;
  created_at: string;
}

interface AssumptionsManagerProps {
  projectId: string;
}

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  active: { label: "Ativa", class: "bg-primary/20 text-primary border-primary/30" },
  validated: { label: "Validada", class: "bg-success/20 text-success border-success/30" },
  invalidated: { label: "Invalidada", class: "bg-destructive/20 text-destructive border-destructive/30" },
};

const CATEGORIES = ["general", "technical", "organizational", "external"];
const CAT_LABELS: Record<string, string> = { general: "Geral", technical: "Técnica", organizational: "Organizacional", external: "Externa" };

export const AssumptionsManager = ({ projectId }: AssumptionsManagerProps) => {
  const { toast } = useToast();
  const { canManage: isAdmin } = useAuth();
  const [items, setItems] = useState<Assumption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [category, setCategory] = useState("general");
  const [impact, setImpact] = useState("");

  const fetchData = async () => {
    const { data } = await supabase
      .from("assumptions")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_trashed", false)
      .order("created_at", { ascending: false });
    if (data) setItems(data);
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const resetForm = () => {
    setDescription(""); setStatus("active"); setCategory("general"); setImpact("");
    setEditingId(null); setShowForm(false);
  };

  const handleSave = async () => {
    if (!description.trim()) return;
    const payload = { project_id: projectId, description, status, category, impact: impact || null };
    
    if (editingId) {
      const { error } = await supabase.from("assumptions").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); return; }
      toast({ title: "Premissa atualizada!" });
    } else {
      const { error } = await supabase.from("assumptions").insert(payload);
      if (error) { toast({ title: "Erro ao criar", variant: "destructive" }); return; }
      toast({ title: "Premissa criada!" });
    }
    resetForm(); fetchData();
  };

  const handleEdit = (item: Assumption) => {
    setEditingId(item.id); setDescription(item.description); setStatus(item.status);
    setCategory(item.category); setImpact(item.impact || ""); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta premissa?")) return;
    await supabase.from("assumptions").update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq("id", id);
    toast({ title: "Premissa movida para a lixeira" }); fetchData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> Premissas ({items.length})
        </h3>
        {isAdmin && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Nova Premissa
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-4 space-y-3 border-primary/20 bg-primary/5">
          <div className="space-y-1">
            <div className="flex justify-end">
              <AIAssistButton value={description} onChange={setDescription} context="assumption_description" />
            </div>
            <Textarea placeholder="Descrição da premissa *" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CAT_LABELS[c]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Impacto (opcional)" value={impact} onChange={e => setImpact(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>{editingId ? "Atualizar" : "Criar"}</Button>
            <Button size="sm" variant="outline" onClick={resetForm}>Cancelar</Button>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma premissa cadastrada.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <Card key={item.id} className="p-4 flex items-start justify-between gap-4">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">{item.description}</p>
                <div className="flex gap-2">
                  <Badge className={STATUS_MAP[item.status]?.class || ""}>{STATUS_MAP[item.status]?.label || item.status}</Badge>
                  <Badge variant="outline">{CAT_LABELS[item.category] || item.category}</Badge>
                </div>
                {item.impact && <p className="text-xs text-muted-foreground">Impacto: {item.impact}</p>}
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(item)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
