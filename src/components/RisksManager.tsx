import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, AlertTriangle, ArrowLeft } from "lucide-react";
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
  gravity?: number | null;
  urgency?: number | null;
  tendency?: number | null;
  severity_score?: number | null;
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
  const { canManage: isAdmin } = useAuth();
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
  // When user clicks a matrix cell, store the filter to show filtered list
  const [matrixFilter, setMatrixFilter] = useState<{ prob: string; imp: string } | null>(null);
  // GUT Matrix fields
  const [gravity, setGravity] = useState<number>(3);
  const [urgency, setUrgency] = useState<number>(3);
  const [tendency, setTendency] = useState<number>(3);
  const [showGut, setShowGut] = useState(false);

  const fetchData = async () => {
    const { data } = await supabase.from("risks").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    if (data) setItems(data);
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const resetForm = () => {
    setDescription(""); setProbability("medium"); setImpact("medium"); setStatus("identified");
    setMitigation(""); setContingency(""); setResponsible(""); setEditingId(null); setShowForm(false);
    setGravity(3); setUrgency(3); setTendency(3);
  };

  const handleSave = async () => {
    if (!description.trim()) return;
    const severity = gravity * urgency * tendency;
    const payload = {
      project_id: projectId, description, probability, impact, status,
      mitigation: mitigation || null, contingency: contingency || null, responsible: responsible || null,
      gravity, urgency, tendency, severity_score: severity,
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
    setGravity(item.gravity ?? 3); setUrgency(item.urgency ?? 3); setTendency(item.tendency ?? 3);
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

  // Filtered risks when clicking a matrix cell
  const filteredRisks = matrixFilter
    ? items.filter(r => r.probability === matrixFilter.prob && r.impact === matrixFilter.imp && r.status !== "closed")
    : [];

  const renderRiskCard = (item: Risk) => {
    const riskLevel = getRiskLevel(item.probability, item.impact);
    const score = item.severity_score ?? (item.gravity && item.urgency && item.tendency ? item.gravity * item.urgency * item.tendency : null);
    const gutBadge = score === null ? null : score >= 75 ? { label: `P1 · ${score}`, cls: "bg-destructive/15 text-destructive border-destructive/40" }
      : score >= 30 ? { label: `P2 · ${score}`, cls: "bg-warning/15 text-warning border-warning/40" }
      : { label: `P3 · ${score}`, cls: "bg-success/15 text-success border-success/40" };
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
              {gutBadge && <Badge className={gutBadge.cls}>GUT {gutBadge.label}</Badge>}
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
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" /> Riscos ({items.length})
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant={showGut ? "secondary" : "outline"} onClick={() => setShowGut(!showGut)} className="gap-2">
            {showGut ? "Ocultar GUT" : "Matriz GUT"}
          </Button>
          <Button size="sm" variant={showMatrix ? "secondary" : "outline"} onClick={() => { setShowMatrix(!showMatrix); setMatrixFilter(null); }} className="gap-2">
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
          <div className="border-t border-border/50 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground">📊 Matriz GUT (1-5) — Pontuação: <span className="text-foreground font-bold">{gravity * urgency * tendency}</span></label>
              <Badge className={(() => { const s = gravity * urgency * tendency; return s >= 75 ? "bg-destructive/15 text-destructive border-destructive/40" : s >= 30 ? "bg-warning/15 text-warning border-warning/40" : "bg-success/15 text-success border-success/40"; })()}>
                {(() => { const s = gravity * urgency * tendency; return s >= 75 ? "P1 - Crítico" : s >= 30 ? "P2 - Alto" : "P3 - Baixo"; })()}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "G", val: gravity, set: setGravity, label: "Gravidade" },
                { key: "U", val: urgency, set: setUrgency, label: "Urgência" },
                { key: "T", val: tendency, set: setTendency, label: "Tendência" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-[10px] text-muted-foreground">{f.key} - {f.label}</label>
                  <Select value={String(f.val)} onValueChange={(v) => f.set(parseInt(v))}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>{editingId ? "Atualizar" : "Criar"}</Button>
            <Button size="sm" variant="outline" onClick={resetForm}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* GUT Matrix view: ranked list by severity */}
      {showGut && (
        <Card className="p-4 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            📊 Ranking GUT (Gravidade × Urgência × Tendência)
          </h4>
          {items.filter(i => i.severity_score).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum risco com pontuação GUT. Edite um risco para informar G, U e T.</p>
          ) : (
            <div className="space-y-1.5">
              {[...items].filter(i => i.severity_score).sort((a, b) => (b.severity_score || 0) - (a.severity_score || 0)).map((r, idx) => {
                const s = r.severity_score || 0;
                const cls = s >= 75 ? "bg-destructive/10 border-destructive/30" : s >= 30 ? "bg-warning/10 border-warning/30" : "bg-success/10 border-success/30";
                const tier = s >= 75 ? "P1" : s >= 30 ? "P2" : "P3";
                return (
                  <div key={r.id} className={`flex items-center gap-3 border rounded-md p-2 ${cls}`}>
                    <span className="text-xs font-bold text-muted-foreground w-6">{idx + 1}º</span>
                    <Badge variant="outline" className="font-bold">{tier}</Badge>
                    <span className="text-xs font-mono text-muted-foreground">{r.gravity}×{r.urgency}×{r.tendency}={s}</span>
                    <span className="text-sm flex-1 truncate">{r.description}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Risk Matrix 3x3 */}
      {showMatrix && !matrixFilter && (
        <Card className="p-4">
          <div className="flex items-end gap-2">
            <div className="flex flex-col items-center mr-2">
              <span className="text-xs font-semibold text-muted-foreground -rotate-90 whitespace-nowrap mb-8">← Probabilidade →</span>
            </div>
            <div className="flex-1">
              <div className="text-center text-xs font-semibold text-muted-foreground mb-2">← Impacto →</div>
              <div className="grid grid-cols-3 gap-1 mb-1">
                {["Baixo", "Médio", "Alto"].map(l => (
                  <div key={l} className="text-center text-[10px] font-medium text-muted-foreground">{l}</div>
                ))}
              </div>
              {(["high", "medium", "low"] as const).map(prob => (
                <div key={prob} className="grid grid-cols-3 gap-1 mb-1">
                  {(["low", "medium", "high"] as const).map(imp => {
                    const risks = matrixGrid[`${prob}-${imp}`] || [];
                    return (
                      <div
                        key={`${prob}-${imp}`}
                        className={`border rounded-md p-2 text-center min-h-[56px] flex flex-col items-center justify-center transition-colors cursor-pointer ${matrixCellColor(prob, imp)}`}
                        onClick={() => setMatrixFilter({ prob, imp })}
                        title={`Clique para ver riscos: P=${LEVEL_LABELS[prob]}, I=${LEVEL_LABELS[imp]}`}
                      >
                        <span className="text-lg font-bold text-foreground">{risks.length}</span>
                        {risks.length > 0 && (
                          <span className="text-[9px] text-muted-foreground leading-tight line-clamp-1">
                            {risks[0].description.slice(0, 20)}...
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="grid grid-cols-3 gap-1 mt-1">
                {["Baixo", "Médio", "Alto"].map((l, i) => (
                  <div key={i} className="text-center text-[10px] text-muted-foreground">{["🟢", "🟡", "🔴"][i]}</div>
                ))}
              </div>
            </div>
            <div className="flex flex-col justify-between h-full ml-2">
              {["Alta", "Média", "Baixa"].map(l => (
                <div key={l} className="text-[10px] font-medium text-muted-foreground h-[56px] flex items-center">{l}</div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Filtered list from matrix click */}
      {showMatrix && matrixFilter && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMatrixFilter(null)} className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Voltar à Matriz
            </Button>
            <Badge variant="outline" className={matrixCellColor(matrixFilter.prob, matrixFilter.imp)}>
              P: {LEVEL_LABELS[matrixFilter.prob]} × I: {LEVEL_LABELS[matrixFilter.imp]}
            </Badge>
            <span className="text-sm text-muted-foreground">— {filteredRisks.length} risco(s)</span>
          </div>
          {filteredRisks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum risco mapeado nesta posição.</p>
          ) : (
            <div className="space-y-2">
              {filteredRisks.map(renderRiskCard)}
            </div>
          )}
        </div>
      )}

      {!showMatrix && (
        <>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum risco cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {items.map(renderRiskCard)}
            </div>
          )}
        </>
      )}
    </div>
  );
};
