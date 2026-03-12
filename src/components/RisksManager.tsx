import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

const LEVEL_LABELS: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto" };

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
  const [showMatrix, setShowMatrix] = useState(false);

  const fetchData = async () => {
    const { data } = await supabase.from("risks").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    if (data) setItems(data);
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const resetForm = () => {
    setDescription(""); setProbability("medium"); setImpact("medium"); setStatus("identified");
    setMitigation(""); setContingency(""); setResponsible(""); setEditingId(null); setShowForm(false);
  };

  const openFormWithPreset = (prob: string, imp: string) => {
    resetForm();
    setProbability(prob);
    setImpact(imp);
    setShowForm(true);
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

  const matrixGrid = (() => {
    const levels = ["low", "medium", "high"] as const;
    const grid: Record<string, Risk[]> = {};
    levels.forEach(p => levels.forEach(i => { grid[`${p}-${i}`] = []; }));
    items.filter(r => r.status !== "closed").forEach(r => {
      const key = `${r.probability}-${r.impact}`;
      if (grid[key]) grid[key].push(r);
    });
    return grid;
  })();

  const matrixCellColor = (prob: string, imp: string) => {
    const levels: Record<string, number> = { low: 1, medium: 2, high: 3 };
    const score = (levels[prob] || 1) * (levels[imp] || 1);
    if (score >= 6) return "bg-destructive/20 border-destructive/40 hover:bg-destructive/30";
    if (score >= 4) return "bg-warning/20 border-warning/40 hover:bg-warning/30";
    if (score >= 2) return "bg-info/20 border-info/40 hover:bg-info/30";
    return "bg-success/20 border-success/40 hover:bg-success/30";
  };

  const MatrixCell = ({ prob, imp }: { prob: string; imp: string }) => {
    const risks = matrixGrid[`${prob}-${imp}`] || [];
    const hasRisks = risks.length > 0;

    const cell = (
      <div
        className={`border rounded-lg p-3 text-center min-h-[72px] flex flex-col items-center justify-center transition-all cursor-pointer ${matrixCellColor(prob, imp)}`}
        onClick={() => {
          if (!hasRisks && isAdmin) openFormWithPreset(prob, imp);
        }}
      >
        <span className="text-2xl font-bold text-foreground">{risks.length}</span>
        {hasRisks ? (
          <span className="text-[10px] text-muted-foreground leading-tight line-clamp-1 mt-0.5">
            {risks[0].description.slice(0, 25)}{risks[0].description.length > 25 ? "…" : ""}
          </span>
        ) : isAdmin ? (
          <span className="text-[10px] text-muted-foreground/60 mt-0.5">+ Adicionar</span>
        ) : null}
      </div>
    );

    if (!hasRisks) return cell;

    return (
      <Popover>
        <PopoverTrigger asChild>{cell}</PopoverTrigger>
        <PopoverContent className="w-72 p-3 space-y-2" side="right">
          <p className="text-xs font-semibold text-muted-foreground">
            P: {LEVEL_LABELS[prob]} × I: {LEVEL_LABELS[imp]} — {risks.length} risco(s)
          </p>
          {risks.map(r => (
            <div key={r.id} className="border rounded p-2 space-y-1">
              <p className="text-sm font-medium">{r.description}</p>
              <Badge className={STATUS_MAP[r.status]?.class} variant="outline">
                {STATUS_MAP[r.status]?.label}
              </Badge>
              {r.mitigation && <p className="text-[11px] text-muted-foreground">Mitigação: {r.mitigation}</p>}
              {isAdmin && (
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handleEdit(r)}>
                  <Pencil className="w-3 h-3 mr-1" /> Editar
                </Button>
              )}
            </div>
          ))}
          {isAdmin && (
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => openFormWithPreset(prob, imp)}>
              <Plus className="w-3 h-3 mr-1" /> Novo risco aqui
            </Button>
          )}
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" /> Riscos ({items.length})
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant={showMatrix ? "secondary" : "outline"} onClick={() => setShowMatrix(!showMatrix)} className="gap-2">
            {showMatrix ? "Lista" : "Matriz 3×3"}
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> Novo Risco
            </Button>
          )}
        </div>
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

      {showMatrix && (
        <Card className="p-4">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div className="flex items-center justify-center">
              <span className="text-xs font-semibold text-muted-foreground -rotate-90 whitespace-nowrap">Probabilidade</span>
            </div>
            <div>
              <div className="text-center text-xs font-semibold text-muted-foreground mb-2">Impacto</div>
              <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-1">
                <div />
                {(["low", "medium", "high"] as const).map(imp => (
                  <div key={imp} className="text-center text-[11px] font-medium text-muted-foreground pb-1">
                    {LEVEL_LABELS[imp]}
                  </div>
                ))}
                {(["high", "medium", "low"] as const).map(prob => (
                  <div key={prob} className="contents">
                    <div className="text-[11px] font-medium text-muted-foreground flex items-center pr-2 justify-end">
                      {LEVEL_LABELS[prob]}
                    </div>
                    {(["low", "medium", "high"] as const).map(imp => (
                      <MatrixCell key={`${prob}-${imp}`} prob={prob} imp={imp} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {!showMatrix && (
        <>
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
        </>
      )}
    </div>
  );
};
