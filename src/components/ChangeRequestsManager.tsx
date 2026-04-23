import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, GitPullRequest, CheckCircle2, XCircle, AlertCircle, Clock, Lock, ChevronDown, ChevronUp, ListTodo, Layers, UserCheck, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { AIAssistButton } from "@/components/AIAssistButton";

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

interface ScopeItem {
  id: string;
  change_request_id: string;
  item_type: "activity" | "phase";
  activity_id: string | null;
  phase_id: string | null;
}
interface ActivityLite { id: string; title: string; phase_id: string | null }
interface PhaseLite { id: string; title: string }
interface ApproverItem { id: string; change_request_id: string; user_id: string; user_name: string | null }
interface ProfileLite { id: string; full_name: string | null; email: string | null; sector: string | null }

export const ChangeRequestsManager = ({ projectId, projectOwner, onChanged }: Props) => {
  const { toast } = useToast();
  const { canManage, profile, user } = useAuth();
  const userName = (profile?.full_name || "").trim();
  const isOwner = !!userName && !!projectOwner && userName.toLowerCase() === projectOwner.trim().toLowerCase();
  const canAssignApprovers = canManage || isOwner;

  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [approvers, setApprovers] = useState<ApproverItem[]>([]);
  const [activeProfiles, setActiveProfiles] = useState<ProfileLite[]>([]);
  const [activities, setActivities] = useState<ActivityLite[]>([]);
  const [phases, setPhases] = useState<PhaseLite[]>([]);
  const [expandedScope, setExpandedScope] = useState<Set<string>>(new Set());
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
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
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(new Set());
  const [selectedPhaseIds, setSelectedPhaseIds] = useState<Set<string>>(new Set());
  const [selectedApproverIds, setSelectedApproverIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    const [reqRes, actRes, phaseRes, profRes] = await Promise.all([
      supabase
        .from("change_requests" as any)
        .select("*")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("activities")
        .select("id, title, phase_id")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .order("title"),
      supabase
        .from("phases")
        .select("id, title")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .order("display_order"),
      supabase
        .from("profiles")
        .select("id, full_name, email, sector")
        .eq("is_active", true)
        .order("full_name"),
    ]);
    if (reqRes.data) setItems(reqRes.data as any);
    if (actRes.data) setActivities(actRes.data as any);
    if (phaseRes.data) setPhases(phaseRes.data as any);
    if (profRes.data) setActiveProfiles(profRes.data as any);

    const reqIds = ((reqRes.data as any[]) || []).map(r => r.id);
    if (reqIds.length > 0) {
      const [{ data: scopeData }, { data: apprData }] = await Promise.all([
        supabase.from("change_request_scope_items" as any).select("*").in("change_request_id", reqIds),
        supabase.from("change_request_approvers" as any).select("*").in("change_request_id", reqIds),
      ]);
      setScopeItems((scopeData as any) || []);
      setApprovers((apprData as any) || []);
    } else {
      setScopeItems([]);
      setApprovers([]);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`change-requests-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "change_requests", filter: `project_id=eq.${projectId}` }, () => {
        fetchData();
        onChanged?.();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "change_request_scope_items" }, () => {
        fetchData();
        onChanged?.();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "change_request_approvers" }, () => {
        fetchData();
        onChanged?.();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, fetchData, onChanged]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setJustification(""); setBenefits("");
    setImpactScope(""); setImpactSchedule(""); setImpactCost(""); setImpactQuality("");
    setSelectedActivityIds(new Set()); setSelectedPhaseIds(new Set());
    setSelectedApproverIds(new Set());
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
    let rfcId: string | null = null;
    if (editingId) {
      const { error } = await supabase.from("change_requests" as any).update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      rfcId = editingId;
      toast({ title: "Solicitação de mudança atualizada!" });
    } else {
      const { data, error } = await supabase
        .from("change_requests" as any)
        .insert({ ...payload, status: "pending" })
        .select("id")
        .single();
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      rfcId = (data as any)?.id ?? null;
      toast({ title: "Solicitação criada — aguardando aprovação" });
    }

    if (rfcId) {
      // Reset escopo e regravar a partir das seleções
      await supabase.from("change_request_scope_items" as any).delete().eq("change_request_id", rfcId);
      const scopeRows: any[] = [];
      selectedActivityIds.forEach(aid => scopeRows.push({ change_request_id: rfcId, item_type: "activity", activity_id: aid }));
      selectedPhaseIds.forEach(pid => scopeRows.push({ change_request_id: rfcId, item_type: "phase", phase_id: pid }));
      if (scopeRows.length > 0) {
        await supabase.from("change_request_scope_items" as any).insert(scopeRows);
      }

      // Reset decisores e regravar
      const { data: prevApprovers } = await supabase
        .from("change_request_approvers" as any)
        .select("user_id")
        .eq("change_request_id", rfcId);
      const prevSet = new Set(((prevApprovers as any[]) || []).map(a => a.user_id));
      await supabase.from("change_request_approvers" as any).delete().eq("change_request_id", rfcId);
      if (selectedApproverIds.size > 0) {
        const profById = new Map(activeProfiles.map(p => [p.id, p]));
        const apprRows = Array.from(selectedApproverIds).map(uid => ({
          change_request_id: rfcId,
          user_id: uid,
          user_name: profById.get(uid)?.full_name || profById.get(uid)?.email || null,
        }));
        await supabase.from("change_request_approvers" as any).insert(apprRows);

        // Notifica decisores recém-designados (somente os novos)
        const newOnes = Array.from(selectedApproverIds).filter(uid => !prevSet.has(uid));
        if (newOnes.length > 0) {
          await supabase.from("notifications").insert(newOnes.map(_uid => ({
            project_id: projectId,
            type: "change_request_decision",
            title: "🔔 Você foi designado como decisor",
            message: `Solicitação de mudança "${title.trim()}" aguarda sua aprovação.`,
          })));
        }
      }
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
    const itemScope = scopeItems.filter(s => s.change_request_id === item.id);
    setSelectedActivityIds(new Set(itemScope.filter(s => s.item_type === "activity" && s.activity_id).map(s => s.activity_id as string)));
    setSelectedPhaseIds(new Set(itemScope.filter(s => s.item_type === "phase" && s.phase_id).map(s => s.phase_id as string)));
    const itemApprovers = approvers.filter(a => a.change_request_id === item.id);
    setSelectedApproverIds(new Set(itemApprovers.map(a => a.user_id)));
    setShowForm(true);
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Arquivar esta solicitação de mudança?")) return;
    await supabase.from("change_requests" as any)
      .update({ is_trashed: true, trashed_at: new Date().toISOString() })
      .eq("id", id);
    toast({ title: "Solicitação arquivada" });
    fetchData();
    onChanged?.();
  };

  const handleDecide = async () => {
    if (!decisionFor) return;
    const itemApprovers = approvers.filter(a => a.change_request_id === decisionFor.id);
    if (itemApprovers.length > 0 && user?.id && !itemApprovers.some(a => a.user_id === user.id)) {
      toast({
        title: "Decisão restrita",
        description: "Apenas decisores designados podem aprovar ou rejeitar esta solicitação.",
        variant: "destructive",
      });
      return;
    }
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
    if (decisionFor.action === "approved") {
      // Liberação imediata via mudança de status (hook só bloqueia status='pending').
      // Mantemos os itens de escopo para preservar o histórico do que foi solicitado/liberado.
      toast({ title: "Mudança aprovada — atividades liberadas" });
    } else {
      toast({ title: "Mudança rejeitada — atividades permanecem bloqueadas até arquivar" });
    }
    setDecisionFor(null);
    setDecisionNotes("");
    fetchData();
    onChanged?.();
  };

  const pendingCount = items.filter(i => i.status === "pending").length;

  const toggleSelected = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const phaseTitleById = new Map(phases.map(p => [p.id, p.title]));
  const activityById = new Map(activities.map(a => [a.id, a]));

  const toggleExpanded = (id: string) => {
    const next = new Set(expandedScope);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedScope(next);
  };

  const toggleDetails = (id: string) => {
    const next = new Set(expandedDetails);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedDetails(next);
  };

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
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Título *</label>
              <AIAssistButton value={title} onChange={setTitle} context="generic" />
            </div>
            <Input placeholder="Ex.: Alterar escopo do módulo X" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Descrição da mudança</label>
                <AIAssistButton value={description} onChange={setDescription} context="generic" />
              </div>
              <Textarea placeholder="O que será mudado" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Justificativa</label>
                <AIAssistButton value={justification} onChange={setJustification} context="generic" />
              </div>
              <Textarea placeholder="Por que mudar" value={justification} onChange={e => setJustification(e.target.value)} rows={3} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Benefícios esperados</label>
              <AIAssistButton value={benefits} onChange={setBenefits} context="generic" />
            </div>
            <Textarea placeholder="O que se ganha com essa mudança" value={benefits} onChange={e => setBenefits(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Impacto</p>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between"><label className="text-xs text-muted-foreground">Escopo</label><AIAssistButton value={impactScope} onChange={setImpactScope} context="generic" /></div>
                <Textarea placeholder="Impacto no escopo" value={impactScope} onChange={e => setImpactScope(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between"><label className="text-xs text-muted-foreground">Prazo</label><AIAssistButton value={impactSchedule} onChange={setImpactSchedule} context="generic" /></div>
                <Textarea placeholder="Impacto no prazo" value={impactSchedule} onChange={e => setImpactSchedule(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between"><label className="text-xs text-muted-foreground">Custo</label><AIAssistButton value={impactCost} onChange={setImpactCost} context="generic" /></div>
                <Textarea placeholder="Impacto no custo" value={impactCost} onChange={e => setImpactCost(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between"><label className="text-xs text-muted-foreground">Qualidade</label><AIAssistButton value={impactQuality} onChange={setImpactQuality} context="generic" /></div>
                <Textarea placeholder="Impacto na qualidade" value={impactQuality} onChange={e => setImpactQuality(e.target.value)} rows={2} />
              </div>
            </div>
          </div>

          {/* Escopo do bloqueio */}
          <div className="space-y-2 pt-2 border-t border-primary/20">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> O que será bloqueado durante a aprovação?
              </p>
              <p className="text-[11px] text-muted-foreground italic">
                Selecione nada = bloquear o projeto inteiro
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-primary" /> Fases ({selectedPhaseIds.size})</p>
                <div className="border border-border rounded-md max-h-40 overflow-y-auto bg-background">
                  {phases.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">Nenhuma fase cadastrada.</p>
                  ) : phases.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted cursor-pointer">
                      <Checkbox checked={selectedPhaseIds.has(p.id)} onCheckedChange={() => toggleSelected(selectedPhaseIds, p.id, setSelectedPhaseIds)} />
                      <span className="truncate">{p.title}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5"><ListTodo className="w-3.5 h-3.5 text-primary" /> Atividades ({selectedActivityIds.size})</p>
                <div className="border border-border rounded-md max-h-40 overflow-y-auto bg-background">
                  {activities.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">Nenhuma atividade cadastrada.</p>
                  ) : activities.map(a => (
                    <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted cursor-pointer">
                      <Checkbox checked={selectedActivityIds.has(a.id)} onCheckedChange={() => toggleSelected(selectedActivityIds, a.id, setSelectedActivityIds)} />
                      <span className="truncate">{a.title}</span>
                      {a.phase_id && phaseTitleById.get(a.phase_id) && (
                        <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{phaseTitleById.get(a.phase_id)}</Badge>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Decisores designados */}
          <div className="space-y-2 pt-2 border-t border-primary/20">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" /> Quem vai decidir? ({selectedApproverIds.size})
              </p>
              <p className="text-[11px] text-muted-foreground italic">
                {canAssignApprovers
                  ? "Selecione um ou mais usuários — basta um aprovar"
                  : "Apenas Admin, Gestor ou Líder do projeto podem designar"}
              </p>
            </div>
            <div className="border border-border rounded-md max-h-40 overflow-y-auto bg-background">
              {activeProfiles.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">Nenhum usuário ativo encontrado.</p>
              ) : activeProfiles.map(p => (
                <label
                  key={p.id}
                  className={`flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted ${canAssignApprovers ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <Checkbox
                    checked={selectedApproverIds.has(p.id)}
                    disabled={!canAssignApprovers}
                    onCheckedChange={() => canAssignApprovers && toggleSelected(selectedApproverIds, p.id, setSelectedApproverIds)}
                  />
                  <span className="truncate">{p.full_name || p.email}</span>
                  {p.sector && <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{p.sector}</Badge>}
                </label>
              ))}
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
          {decisionFor.action === "rejected" && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2">
              ⚠ Ao rejeitar, as atividades permanecem bloqueadas até alguém arquivar esta solicitação.
            </p>
          )}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Parecer</label>
            <AIAssistButton value={decisionNotes} onChange={setDecisionNotes} context="generic" />
          </div>
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
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma solicitação de mudança registrada.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const meta = STATUS_MAP[item.status] || STATUS_MAP.pending;
            const Icon = meta.icon;
            const itemScope = scopeItems.filter(s => s.change_request_id === item.id);
            const lockedActivities = itemScope.filter(s => s.item_type === "activity" && s.activity_id);
            const lockedPhases = itemScope.filter(s => s.item_type === "phase" && s.phase_id);
            const isFullBlock = item.status === "pending" && itemScope.length === 0;
            const isExpanded = expandedScope.has(item.id);
            const stillBlocking = item.status === "pending" || item.status === "rejected";
            const itemApprovers = approvers.filter(a => a.change_request_id === item.id);
            const isDesignatedDecider = !!user?.id && itemApprovers.some(a => a.user_id === user.id);
            // Regra: se há decisores designados, SOMENTE eles podem aprovar/rejeitar.
            // Sem decisores designados, fallback para Admin/Gestor/Líder do projeto.
            const canDecide = itemApprovers.length > 0
              ? isDesignatedDecider
              : (canManage || isOwner);
            const isAwaitingMyDecision = item.status === "pending" && isDesignatedDecider;
            const hasDetails = !!(item.justification || item.expected_benefits || item.impact_scope || item.impact_schedule || item.impact_cost || item.impact_quality || item.decision_notes || item.approver);
            // Pendentes mostram tudo aberto; decididas só abrem quando o usuário clica em "Ver detalhes".
            const showDetails = item.status === "pending" || expandedDetails.has(item.id);
            return (
              <Card key={item.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-foreground">{item.title}</h4>
                      <Badge className={`gap-1 ${meta.class}`}>
                        <Icon className="w-3 h-3" /> {meta.label}
                      </Badge>
                      {isAwaitingMyDecision && (
                        <Badge className="gap-1 bg-primary/15 text-primary border border-primary/40 animate-pulse">
                          <Bell className="w-3 h-3" /> Aguardando sua decisão
                        </Badge>
                      )}
                       {stillBlocking && (
                         isFullBlock ? (
                           <Badge variant="outline" className="gap-1 border-amber-500/60 text-amber-700 dark:text-amber-400">
                             <Lock className="w-3 h-3" /> Projeto inteiro bloqueado
                           </Badge>
                         ) : itemScope.length > 0 ? (
                           <Badge variant="outline" className="gap-1 border-amber-500/60 text-amber-700 dark:text-amber-400">
                             <Lock className="w-3 h-3" /> {lockedActivities.length} atividade{lockedActivities.length !== 1 ? "s" : ""} bloqueada{lockedActivities.length !== 1 ? "s" : ""}{lockedPhases.length > 0 ? ` • ${lockedPhases.length} fase${lockedPhases.length !== 1 ? "s" : ""}` : ""}
                           </Badge>
                         ) : null
                       )}
                    </div>
                    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      Solicitado por <strong>{item.requested_by || "—"}</strong> em{" "}
                      {new Date(item.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    {itemApprovers.length > 0 && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1.5 flex-wrap">
                        <UserCheck className="w-3 h-3 mt-0.5 text-primary shrink-0" />
                        <span>
                          <strong>Decisor{itemApprovers.length > 1 ? "es" : ""} designado{itemApprovers.length > 1 ? "s" : ""}:</strong>{" "}
                          {itemApprovers.map(a => a.user_name || "—").join(", ")}
                        </span>
                      </p>
                    )}
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

                {itemScope.length > 0 && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5">
                     <button
                       type="button"
                       onClick={() => toggleExpanded(item.id)}
                       className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-500/10"
                     >
                       <span className="flex items-center gap-1.5">
                         <Lock className="w-3.5 h-3.5" />
                         Atividades bloqueadas por esta solicitação
                       </span>
                       {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                     </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-2 text-sm">
                        {lockedPhases.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase">Fases</p>
                            <ul className="list-disc list-inside text-foreground">
                              {lockedPhases.map(s => (
                                <li key={s.id}>{phaseTitleById.get(s.phase_id!) || "(fase removida)"}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {lockedActivities.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase">Atividades</p>
                            <ul className="list-disc list-inside text-foreground">
                              {lockedActivities.map(s => (
                                <li key={s.id}>{activityById.get(s.activity_id!)?.title || "(atividade removida)"}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Botão para decididas: alterna detalhes (justificativa, impactos, parecer) */}
                {item.status !== "pending" && hasDetails && (
                  <button
                    type="button"
                    onClick={() => toggleDetails(item.id)}
                    className="w-full flex items-center justify-between rounded-md border border-border bg-muted/40 hover:bg-muted px-3 py-2 text-xs font-medium text-foreground"
                  >
                    <span>Ver detalhes da solicitação (justificativa, impactos e parecer)</span>
                    {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}

                {showDetails && (item.justification || item.expected_benefits) && (
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    {item.justification && (
                      <div><span className="text-xs font-semibold text-muted-foreground">Justificativa:</span> <p>{item.justification}</p></div>
                    )}
                    {item.expected_benefits && (
                      <div><span className="text-xs font-semibold text-muted-foreground">Benefícios:</span> <p>{item.expected_benefits}</p></div>
                    )}
                  </div>
                )}

                {showDetails && (item.impact_scope || item.impact_schedule || item.impact_cost || item.impact_quality) && (
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

                {showDetails && item.status !== "pending" && (item.approver || item.decision_notes) && (
                  <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                    Decidido por <strong>{item.approver || "—"}</strong>
                    {item.decision_date && ` em ${new Date(item.decision_date).toLocaleDateString("pt-BR")}`}
                    {item.decision_notes && (
                      <div className="mt-2 p-2 rounded border border-border bg-muted/30 text-foreground">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Parecer da decisão</p>
                        <p className="italic">"{item.decision_notes}"</p>
                      </div>
                    )}
                     {item.status === "rejected" && itemScope.length > 0 && (
                       <p className="mt-1 text-amber-700 dark:text-amber-400">
                         ⚠ Atividades permanecem bloqueadas — arquive esta solicitação para liberar.
                       </p>
                     )}
                  </div>
                )}

                {item.status === "pending" && canDecide && (
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <Button size="sm" variant="default" className="gap-2 bg-success hover:bg-success/90 text-success-foreground" onClick={() => { setDecisionFor({ id: item.id, action: "approved" }); setDecisionNotes(""); }}>
                      <CheckCircle2 className="w-4 h-4" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" className="gap-2 text-destructive border-destructive/40" onClick={() => { setDecisionFor({ id: item.id, action: "rejected" }); setDecisionNotes(""); }}>
                      <XCircle className="w-4 h-4" /> Rejeitar
                    </Button>
                  </div>
                )}

                {item.status === "pending" && !canDecide && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                    <AlertCircle className="w-3 h-3" />
                    {itemApprovers.length > 0
                      ? `Aguardando decisão de: ${itemApprovers.map(a => a.user_name || "—").join(", ")}`
                      : "Aguardando decisão de Admin, Gestor ou Líder do projeto."}
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