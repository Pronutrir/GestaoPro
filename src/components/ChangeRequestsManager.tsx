import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, GitPullRequest, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface ChangeRequest {
  id: string;
  title: string;
  description: string | null;
  justification: string | null;
  expected_benefits: string | null;
  impact_scope: string | null;
  impact_schedule: string | null;
  impact_cost: string | null;
  impact_quality: string | null;
  status: string;
  requested_by: string | null;
  approver: string | null;
  decision_date: string | null;
  decision_notes: string | null;
  created_at: string;
}

interface Props {
  projectId: string;
  projectOwner?: string | null;
  onChanged?: () => void;
}

const STATUS_MAP: Record<string, { label: string; class: string; icon: any }> = {
  pending: { label: "Pendente de aprovação", class: "bg-amber-500/20 text-amber-700 border-amber-500/40 dark:text-amber-400", icon: Clock },
  approved: { label: "Aprovada", class: "bg-success/20 text-success border-success/40", icon: CheckCircle2 },
  rejected: { label: "Rejeitada", class: "bg-destructive/20 text-destructive border-destructive/40", icon: XCircle },
  cancelled: { label: "Cancelada", class: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

export const ChangeRequestsManager = ({ projectId, projectOwner, onChanged }: Props) => {
  const { toast } = useToast();
  const { canManage, profile } = useAuth();
  const userName = (profile?.full_name || "").trim();
  const isOwner = !!userName && !!projectOwner && userName.toLowerCase() === projectOwner.trim().toLowerCase();
  const canApprove = canManage || isOwner;

  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [decisionFor, setDecisionFor] = useState<{ id: string; action: "approved" | "rejected" } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [justification, setJustification] = useState("");
  const [benefits, setBenefits] = useState("");
  const [impactScope, setImpactScope] = useState("");
  const [impactSchedule, setImpactSchedule] = useState("");
  const [impactCost, setImpactCost] = useState("");
  const [impactQuality, setImpactQuality] = useState("");

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("change_requests" as any)
      .select("*")
      .eq("project_id", projectId)
      .eq("is_trashed", false)
      .order("created_at", { ascending: false });
    if (data) setItems(data as any);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`change-requests-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "change_requests", filter: `project_id=eq.${projectId}` }, () => {
        fetchData();
        onChanged?.();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, fetchData, onChanged]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setJustification(""); setBenefits("");
    setImpactScope(""); setImpactSchedule(""); setImpactCost(""); setImpactQuality("");
    setEditingId(null); setShowForm(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Informe o título da mudança", variant: "destructive" });
      return;
    }
    const payload: any = {
      project_id: projectId,
      title: title.trim(),
      description: description || null,
      justification: justification || null,
      expected_benefits: benefits || null,
      impact_scope: impactScope || null,
      impact_schedule: impactSchedule || null,
      impact_cost: impactCost || null,
      impact_quality: impactQuality || null,
      requested_by: userName || null,
    };
    if (editingId) {
      const { error } = await supabase.from("change_requests" as any).update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "RFC atualizada!" });
    } else {
      const { error } = await supabase.from("change_requests" as any).insert({ ...payload, status: "pending" });
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "RFC criada — aguardando aprovação" });
    }
    resetForm();
    fetchData();
    onChanged?.();
  };

  const handleEdit = (item: ChangeRequest) => {
    setEditingId(item.id);
    setTitle(item.title);
    setDescription(item.description || "");
    setJustification(item.justification || "");
    setBenefits(item.expected_benefits || "");
    setImpactScope(item.impact_scope || "");
    setImpactSchedule(item.impact_schedule || "");
    setImpactCost(item.impact_cost || "");
    setImpactQuality(item.impact_quality || "");
    setShowForm(true);
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Arquivar esta requisição de mudança?")) return;
    await supabase.from("change_requests" as any)
      .update({ is_trashed: true, trashed_at: new Date().toISOString() })
      .eq("id", id);
    toast({ title: "RFC arquivada" });
    fetchData();
    onChanged?.();
  };

  const handleDecide = async () => {
    if (!decisionFor) return;
    const { error } = await supabase
      .from("change_requests" as any)
      .update({
        status: decisionFor.action,
        approver: userName || null,
        decision_date: new Date().toISOString(),
        decision_notes: decisionNotes || null,
      })
      .eq("id", decisionFor.id);
    if (error) { toast({ title: "Erro ao registrar decisão", variant: "destructive" }); return; }
    toast({ title: decisionFor.action === "approved" ? "RFC aprovada — projeto liberado" : "RFC rejeitada" });
    setDecisionFor(null);
    setDecisionNotes("");
    fetchData();
    onChanged?.();
  };

  const pendingCount = items.filter(i => i.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitPullRequest className="w-5 h-5 text-primary" /> Gestão da Mudança ({items.length})
          {pendingCount > 0 && (
            <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/40 dark:text-amber-400">
              {pendingCount} pendente{pendingCount > 1 ? "s" : ""}
            </Badge>
          )}
        </h3>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Requisição
        </Button>
      </div>

      {showForm && (
        <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Título *</label>
            <Input placeholder="Ex.: Alterar escopo do módulo X" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Descrição da mudança</label>
              <Textarea placeholder="O que será mudado" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Justificativa</label>
              <Textarea placeholder="Por que mudar" value={justification} onChange={e => setJustification(e.target.value)} rows={3} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Benefícios esperados</label>
            <Textarea placeholder="O que se ganha com essa mudança" value={benefits} onChange={e => setBenefits(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Impacto</p>
            <div className="grid md:grid-cols-2 gap-3">
              <Textarea placeholder="Impacto no escopo" value={impactScope} onChange={e => setImpactScope(e.target.value)} rows={2} />
              <Textarea placeholder="Impacto no prazo" value={impactSchedule} onChange={e => setImpactSchedule(e.target.value)} rows={2} />
              <Textarea placeholder="Impacto no custo" value={impactCost} onChange={e => setImpactCost(e.target.value)} rows={2} />
              <Textarea placeholder="Impacto na qualidade" value={impactQuality} onChange={e => setImpactQuality(e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>{editingId ? "Atualizar" : "Criar"}</Button>
            <Button size="sm" variant="outline" onClick={resetForm}>Cancelar</Button>
          </div>
        </Card>
      )}

      {decisionFor && (
        <Card className="p-4 space-y-3 border-2 border-primary/40 bg-card">
          <p className="text-sm font-semibold">
            {decisionFor.action === "approved" ? "Aprovar requisição" : "Rejeitar requisição"}
          </p>
          <Textarea
            placeholder="Parecer da decisão (opcional)"
            value={decisionNotes}
            onChange={e => setDecisionNotes(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleDecide}>Confirmar</Button>
            <Button size="sm" variant="outline" onClick={() => { setDecisionFor(null); setDecisionNotes(""); }}>Cancelar</Button>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma requisição de mudança registrada.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const meta = STATUS_MAP[item.status] || STATUS_MAP.pending;
            const Icon = meta.icon;
            return (
              <Card key={item.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-foreground">{item.title}</h4>
                      <Badge className={`gap-1 ${meta.class}`}>
                        <Icon className="w-3 h-3" /> {meta.label}
                      </Badge>
                    </div>
                    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      Solicitado por <strong>{item.requested_by || "—"}</strong> em{" "}
                      {new Date(item.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {item.status === "pending" && (
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(item)} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {canManage && (
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleArchive(item.id)} title="Arquivar">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {(item.justification || item.expected_benefits) && (
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    {item.justification && (
                      <div><span className="text-xs font-semibold text-muted-foreground">Justificativa:</span> <p>{item.justification}</p></div>
                    )}
                    {item.expected_benefits && (
                      <div><span className="text-xs font-semibold text-muted-foreground">Benefícios:</span> <p>{item.expected_benefits}</p></div>
                    )}
                  </div>
                )}

                {(item.impact_scope || item.impact_schedule || item.impact_cost || item.impact_quality) && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-border">
                    {[
                      { l: "Escopo", v: item.impact_scope },
                      { l: "Prazo", v: item.impact_schedule },
                      { l: "Custo", v: item.impact_cost },
                      { l: "Qualidade", v: item.impact_quality },
                    ].map(x => (
                      <div key={x.l} className="text-xs">
                        <p className="font-semibold text-muted-foreground">{x.l}</p>
                        <p className="text-foreground">{x.v || "—"}</p>
                      </div>
                    ))}
                  </div>
                )}

                {item.status !== "pending" && (item.approver || item.decision_notes) && (
                  <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                    Decidido por <strong>{item.approver || "—"}</strong>
                    {item.decision_date && ` em ${new Date(item.decision_date).toLocaleDateString("pt-BR")}`}
                    {item.decision_notes && <p className="mt-1 italic">"{item.decision_notes}"</p>}
                  </div>
                )}

                {item.status === "pending" && canApprove && (
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <Button size="sm" variant="default" className="gap-2 bg-success hover:bg-success/90 text-success-foreground" onClick={() => { setDecisionFor({ id: item.id, action: "approved" }); setDecisionNotes(""); }}>
                      <CheckCircle2 className="w-4 h-4" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" className="gap-2 text-destructive border-destructive/40" onClick={() => { setDecisionFor({ id: item.id, action: "rejected" }); setDecisionNotes(""); }}>
                      <XCircle className="w-4 h-4" /> Rejeitar
                    </Button>
                  </div>
                )}

                {item.status === "pending" && !canApprove && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                    <AlertCircle className="w-3 h-3" />
                    Aguardando decisão de Admin, Gestor ou Líder do projeto.
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};