import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AIAssistButton } from "@/components/AIAssistButton";
import { Plus, Pencil, Trash2, AlertTriangle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Risk {
  id: string;
  description: string;
  probability: string; // low|medium|high == 30%|60%|90%
  impact: string;       // low|medium|high == 30%|60%|90%
  status: string;       // monitorar|mitigar|aceitar|transferir|eliminar|ocorreu
  mitigation: string | null;   // Contramedida
  contingency: string | null;  // (legado, não usado no formulário)
  responsible: string | null;
  category: string;
  created_at: string;
}

interface RisksManagerProps {
  projectId: string;
}

// Mapping low/medium/high → 30/60/90%
const PCT_LABEL: Record<string, string> = { low: "30%", medium: "60%", high: "90%" };
const PCT_FULL: Record<string, string> = { low: "Baixa (30%)", medium: "Média (60%)", high: "Alta (90%)" };

// 5-level matrix: rows = Impacto (low/med/high), cols = Probabilidade (low/med/high)
// Returns level + tailwind classes
type Level = { label: string; cellClass: string; badgeClass: string };
const LEVELS: Record<string, Level> = {
  muito_baixa: { label: "Muito Baixa", cellClass: "bg-blue-500/30 border-blue-500/50 hover:bg-blue-500/40 text-foreground", badgeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40" },
  baixa:       { label: "Baixa",        cellClass: "bg-green-500/30 border-green-500/50 hover:bg-green-500/40 text-foreground", badgeClass: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/40" },
  media:       { label: "Média",        cellClass: "bg-yellow-400/40 border-yellow-500/50 hover:bg-yellow-400/50 text-foreground", badgeClass: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/40" },
  alta:        { label: "Alta",         cellClass: "bg-orange-500/40 border-orange-500/50 hover:bg-orange-500/50 text-foreground", badgeClass: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40" },
  muito_alta:  { label: "Muito Alta",   cellClass: "bg-red-500/40 border-red-500/60 hover:bg-red-500/50 text-foreground", badgeClass: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/50" },
};

// Matriz conforme imagem do usuário (eixos: Impacto × Probabilidade)
// Linha = Impacto (low=30, med=60, high=90), Coluna = Probabilidade (low=30, med=60, high=90)
const MATRIX_KEY = (imp: string, prob: string): keyof typeof LEVELS => {
  const m: Record<string, keyof typeof LEVELS> = {
    "low-low": "muito_baixa",
    "low-medium": "baixa",
    "low-high": "media",
    "medium-low": "baixa",
    "medium-medium": "media",
    "medium-high": "alta",
    "high-low": "media",
    "high-medium": "alta",
    "high-high": "muito_alta",
  };
  return m[`${imp}-${prob}`] || "media";
};

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  monitorar:  { label: "Monitorar",  class: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  mitigar:    { label: "Mitigar",    class: "bg-warning/20 text-warning border-warning/30" },
  aceitar:    { label: "Aceitar",    class: "bg-muted text-muted-foreground" },
  transferir: { label: "Transferir", class: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30" },
  eliminar:   { label: "Eliminar",   class: "bg-success/20 text-success border-success/30" },
  ocorreu:    { label: "Ocorreu",    class: "bg-destructive/20 text-destructive border-destructive/30" },
};

export const RisksManager = ({ projectId }: RisksManagerProps) => {
  const { toast } = useToast();
  const { canManage: isAdmin } = useAuth();
  const [items, setItems] = useState<Risk[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [responsible, setResponsible] = useState("");
  const [status, setStatus] = useState("monitorar");
  const [probability, setProbability] = useState("medium");
  const [impact, setImpact] = useState("medium");
  const [occurred, setOccurred] = useState<"sim" | "nao">("nao");
  const [contramedida, setContramedida] = useState("");
  const [showMatrix, setShowMatrix] = useState(false);
  const [matrixFilter, setMatrixFilter] = useState<{ prob: string; imp: string } | null>(null);

  const fetchData = async () => {
    const { data } = await supabase.from("risks").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    if (data) setItems(data as Risk[]);
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const resetForm = () => {
    setDescription(""); setResponsible(""); setStatus("monitorar");
    setProbability("medium"); setImpact("medium");
    setOccurred("nao"); setContramedida("");
    setEditingId(null); setShowForm(false);
  };

  const handleSave = async () => {
    if (!description.trim()) return;
    // Persist "ocorreu" inside status to keep schema stable
    const finalStatus = occurred === "sim" ? "ocorreu" : status;
    const payload = {
      project_id: projectId,
      description,
      probability,
      impact,
      status: finalStatus,
      mitigation: contramedida || null,
      responsible: responsible || null,
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
    setEditingId(item.id);
    setDescription(item.description);
    setResponsible(item.responsible || "");
    setProbability(item.probability);
    setImpact(item.impact);
    setContramedida(item.mitigation || "");
    if (item.status === "ocorreu") {
      setOccurred("sim");
      setStatus("monitorar");
    } else {
      setOccurred("nao");
      setStatus(STATUS_MAP[item.status] ? item.status : "monitorar");
    }
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este risco?")) return;
    await supabase.from("risks").delete().eq("id", id);
    toast({ title: "Risco excluído!" }); fetchData();
  };

  // Build matrix grid
  const matrixGrid = (() => {
    const levels = ["low", "medium", "high"] as const;
    const grid: Record<string, Risk[]> = {};
    levels.forEach(p => levels.forEach(i => { grid[`${p}-${i}`] = []; }));
    items.filter(r => r.status !== "ocorreu").forEach(r => {
      const key = `${r.probability}-${r.impact}`;
      if (grid[key]) grid[key].push(r);
    });
    return grid;
  })();

  const filteredRisks = matrixFilter
    ? items.filter(r => r.probability === matrixFilter.prob && r.impact === matrixFilter.imp)
    : [];

  const renderRiskCard = (item: Risk) => {
    const lvlKey = MATRIX_KEY(item.impact, item.probability);
    const lvl = LEVELS[lvlKey];
    const occ = item.status === "ocorreu";
    return (
      <Card key={item.id} className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-foreground">{item.description}</p>
            <div className="flex flex-wrap gap-2">
              <Badge className={lvl.badgeClass}>{lvl.label}</Badge>
              <Badge variant="outline">Prob: {PCT_LABEL[item.probability]}</Badge>
              <Badge variant="outline">Impacto: {PCT_LABEL[item.impact]}</Badge>
              <Badge className={STATUS_MAP[item.status]?.class || "bg-muted"}>{STATUS_MAP[item.status]?.label || item.status}</Badge>
              {occ && <Badge className="bg-destructive/15 text-destructive border-destructive/40">Ocorreu: Sim</Badge>}
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => handleEdit(item)}><Pencil className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          )}
        </div>
        {item.mitigation && <p className="text-xs text-muted-foreground"><strong>Contramedida:</strong> {item.mitigation}</p>}
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
          <Button size="sm" variant={showMatrix ? "secondary" : "outline"} onClick={() => { setShowMatrix(!showMatrix); setMatrixFilter(null); }} className="gap-2">
            {showMatrix ? "Lista" : "Matriz de Risco"}
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> Novo Risco
            </Button>
          )}
        </div>
      </div>

      {showForm && (
        <Card className="p-5 space-y-4 border-warning/20 bg-warning/5">
          <h4 className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" /> Itens do Risco
          </h4>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] items-center gap-3">
              <label className="text-sm font-medium text-right md:text-right"><span className="text-destructive">*</span> Descrição</label>
              <div className="space-y-1">
                <div className="flex justify-end">
                  <AIAssistButton value={description} onChange={setDescription} context="risk_description" />
                </div>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] items-center gap-3">
              <label className="text-sm font-medium text-right"><span className="text-destructive">*</span> Responsável</label>
              <Input value={responsible} onChange={e => setResponsible(e.target.value)} placeholder="Nome do responsável" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] items-center gap-3">
              <label className="text-sm font-medium text-right"><span className="text-destructive">*</span> Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monitorar">Monitorar</SelectItem>
                  <SelectItem value="mitigar">Mitigar</SelectItem>
                  <SelectItem value="aceitar">Aceitar</SelectItem>
                  <SelectItem value="transferir">Transferir</SelectItem>
                  <SelectItem value="eliminar">Eliminar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Matriz interativa */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-sm font-medium mb-3"><span className="text-destructive">*</span> Nível - Avaliação do Risco</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border border-border bg-muted/50 p-2 text-xs font-semibold w-24"></th>
                    <th colSpan={3} className="border border-border bg-muted/50 p-2 text-xs font-semibold">Probabilidade</th>
                  </tr>
                  <tr>
                    <th className="border border-border bg-muted/50 p-2 text-xs font-semibold">Impacto</th>
                    <th className="border border-border bg-card p-2 text-xs font-semibold">30%</th>
                    <th className="border border-border bg-card p-2 text-xs font-semibold">60%</th>
                    <th className="border border-border bg-card p-2 text-xs font-semibold">90%</th>
                  </tr>
                </thead>
                <tbody>
                  {(["low", "medium", "high"] as const).map(imp => (
                    <tr key={imp}>
                      <th className="border border-border bg-card p-2 text-xs font-semibold">{PCT_LABEL[imp]}</th>
                      {(["low", "medium", "high"] as const).map(prob => {
                        const lvl = LEVELS[MATRIX_KEY(imp, prob)];
                        const selected = impact === imp && probability === prob;
                        return (
                          <td
                            key={prob}
                            onClick={() => { setImpact(imp); setProbability(prob); }}
                            className={`border-2 p-3 text-center cursor-pointer transition-all ${lvl.cellClass} ${selected ? "ring-2 ring-primary ring-offset-1 font-bold" : "opacity-70 hover:opacity-100"}`}
                          >
                            <span className="text-xs font-medium">{lvl.label}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Clique em uma célula para selecionar o nível de risco.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] items-center gap-3 pt-2 border-t border-border/50">
            <label className="text-sm font-medium text-right">Ocorreu</label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={occurred === "sim" ? "default" : "outline"}
                onClick={() => setOccurred("sim")}
                className="rounded-r-none"
              >Sim</Button>
              <Button
                type="button"
                size="sm"
                variant={occurred === "nao" ? "default" : "outline"}
                onClick={() => setOccurred("nao")}
                className="rounded-l-none"
              >Não</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] items-start gap-3">
            <label className="text-sm font-medium text-right pt-2">Contramedida</label>
            <div className="space-y-1">
              <div className="flex justify-end">
                <AIAssistButton value={contramedida} onChange={setContramedida} context="risk_mitigation" />
              </div>
              <Textarea value={contramedida} onChange={e => setContramedida(e.target.value)} rows={3} placeholder="Plano de ação para responder ao risco" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>{editingId ? "Salvar" : "Salvar e adicionar novo"}</Button>
          </div>
        </Card>
      )}

      {/* Matriz visualização */}
      {showMatrix && !matrixFilter && (
        <Card className="p-5">
          <h4 className="text-sm font-semibold mb-4">Matriz de Risco — Impacto × Probabilidade</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-border bg-muted/50 p-2 w-24"></th>
                  <th colSpan={3} className="border border-border bg-muted/50 p-2 text-xs font-semibold">Probabilidade</th>
                </tr>
                <tr>
                  <th className="border border-border bg-muted/50 p-2 text-xs font-semibold">Impacto</th>
                  <th className="border border-border bg-card p-2 text-xs font-semibold">30%</th>
                  <th className="border border-border bg-card p-2 text-xs font-semibold">60%</th>
                  <th className="border border-border bg-card p-2 text-xs font-semibold">90%</th>
                </tr>
              </thead>
              <tbody>
                {(["low", "medium", "high"] as const).map(imp => (
                  <tr key={imp}>
                    <th className="border border-border bg-card p-2 text-xs font-semibold">{PCT_LABEL[imp]}</th>
                    {(["low", "medium", "high"] as const).map(prob => {
                      const lvl = LEVELS[MATRIX_KEY(imp, prob)];
                      const cellRisks = matrixGrid[`${prob}-${imp}`] || [];
                      return (
                        <td
                          key={prob}
                          onClick={() => setMatrixFilter({ prob, imp })}
                          className={`border-2 p-3 text-center cursor-pointer min-h-[70px] ${lvl.cellClass}`}
                        >
                          <div className="text-lg font-bold">{cellRisks.length}</div>
                          <div className="text-[10px] font-medium">{lvl.label}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">Clique em uma célula para filtrar os riscos correspondentes.</p>
        </Card>
      )}

      {showMatrix && matrixFilter && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMatrixFilter(null)} className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Voltar à Matriz
            </Button>
            <Badge variant="outline">
              Impacto {PCT_LABEL[matrixFilter.imp]} × Probabilidade {PCT_LABEL[matrixFilter.prob]}
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
