'use client';
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileText, Save, ClipboardList, CheckCircle2, Ban, Printer, Eye, Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AIAssistButton, AIContext } from "@/components/AIAssistButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriorityBadge } from "@/components/PriorityBadge";
import { BaselineBlock } from "@/components/BaselineBlock";

/* -------- AutoTextarea: cresce conforme conteúdo -------- */
const AutoTextarea = ({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={`text-sm resize-none min-h-[2rem] py-1.5 leading-snug overflow-hidden ${className || ""}`}
    />
  );
};

interface Phase { id: string; title: string }
interface Risk { id: string; description: string; probability: string; impact: string; status: string }
interface MemberRow {
  id: string;
  user_id: string;
  full_name: string;
  sector: string | null;
  invitation_status: "pending" | "accepted" | "declined";
  decline_reason: string | null;
}
const inviteBadge = (s: MemberRow["invitation_status"]) => {
  if (s === "accepted") return { label: "Aceito", cls: "bg-success/15 text-success border-success/40" };
  if (s === "declined") return { label: "Recusado", cls: "bg-destructive/15 text-destructive border-destructive/40" };
  return { label: "Aguardando", cls: "bg-warning/15 text-warning border-warning/40 animate-pulse" };
};

interface ProjectCharterProps {
  projectId: string;
  project: {
    title: string;
    description: string | null;
    owner: string | null;
    due_date: string | null;
    start_date?: string | null;
    status: string;
    priority?: string | null;
    objective?: string | null;
    problem_statement?: string | null;
    scope?: string | null;
    out_of_scope?: string | null;
    restrictions?: string | null;
    expected_benefits?: string | null;
    budget_planned?: number | null;
  };
  phases: Phase[];
  members: { full_name: string; sector: string | null }[];
  onMembersChanged?: () => void;
}

interface CharterData {
  sponsor: string;
  start_date: string;
  justification: string;
  deliverables: string;
  assumptions: string;
  approval_requirements: string;
  // novos
  smart_specific?: string;
  smart_measurable?: string;
  smart_achievable?: string;
  smart_relevant?: string;
  smart_temporal?: string;
  success_criteria?: string;
  approvals?: { role: string; name: string; date: string }[];
  code?: string;
  benefits_table?: { benefit: string; indicator: string; goal: string; deadline: string }[];
}

/* -------- TextField -------- */
interface TextFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
  aiContext?: AIContext;
  editing: boolean;
  className?: string;
}
const TextField = ({
  value, onChange, placeholder, multiline = true, rows = 3, aiContext, editing, className,
}: TextFieldProps) => {
  if (editing) {
    return multiline ? (
      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`text-sm resize-none ${aiContext ? "pr-10" : ""} ${className || ""}`}
        />
        {aiContext && (
          <div className="absolute top-1 right-1">
            <AIAssistButton value={value} onChange={onChange} context={aiContext} size="icon" />
          </div>
        )}
      </div>
    ) : (
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`text-sm ${className || ""}`} />
    );
  }
  return value ? (
    <p className={`text-sm text-foreground whitespace-pre-line ${className || ""}`}>{value}</p>
  ) : (
    <p className="text-sm text-muted-foreground italic">—</p>
  );
};

/* -------- Section header faixa azul-marinho -------- */
const SectionHeader = ({ n, title }: { n: number; title: string }) => (
  <div className="bg-primary text-primary-foreground px-4 py-2 rounded-t-md flex items-center gap-3 print:bg-primary print:text-primary-foreground">
    <span className="text-xs font-bold bg-primary-foreground/20 rounded px-2 py-0.5">{n}</span>
    <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
  </div>
);

const SectionBlock = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <Card className="overflow-hidden border-primary/20 print:break-inside-avoid">
    <SectionHeader n={n} title={title} />
    <div className="p-4 space-y-3 bg-card">{children}</div>
  </Card>
);

/* ============================================================ */
export const ProjectCharter = ({ projectId, project, phases, members, onMembersChanged }: ProjectCharterProps) => {
  const { toast } = useToast();
  const { canManage: isAdmin, user } = useAuth();

  const [editing, setEditing] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [assumptionsList, setAssumptionsList] = useState<{ id: string; description: string; category: string | null; impact: string | null }[]>([]);
  const [allProfiles, setAllProfiles] = useState<{ id: string; full_name: string; sector: string | null }[]>([]);
  const [memberRows, setMemberRows] = useState<MemberRow[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [addingMember, setAddingMember] = useState(false);

  const [data, setData] = useState<CharterData>({
    sponsor: "", start_date: "", justification: "", deliverables: "",
    assumptions: "", approval_requirements: "",
    smart_specific: "", smart_measurable: "", smart_achievable: "",
    smart_relevant: "", smart_temporal: "", success_criteria: "",
    approvals: [], code: "", benefits_table: [],
  });

  const [form, setForm] = useState({
    objective: project.objective || "",
    problem_statement: project.problem_statement || "",
    scope: project.scope || "",
    out_of_scope: project.out_of_scope || "",
    restrictions: project.restrictions || "",
    expected_benefits: project.expected_benefits || "",
  });

  useEffect(() => {
    setForm({
      objective: project.objective || "",
      problem_statement: project.problem_statement || "",
      scope: project.scope || "",
      out_of_scope: project.out_of_scope || "",
      restrictions: project.restrictions || "",
      expected_benefits: project.expected_benefits || "",
    });
    try {
      const charter: any = (project as any).charter_data;
      const parsed =
        charter && typeof charter === "object"
          ? charter
          : project.description?.startsWith("{")
          ? JSON.parse(project.description)
          : null;
      if (parsed && (parsed.__charter || (project as any).charter_data)) {
          setData((prev) => ({
            ...prev,
            sponsor: parsed.sponsor || "",
            start_date: parsed.start_date || "",
            justification: parsed.justification || "",
            deliverables: parsed.deliverables || "",
            assumptions: parsed.assumptions || "",
            approval_requirements: parsed.approval_requirements || "",
            smart_specific: parsed.smart_specific || "",
            smart_measurable: parsed.smart_measurable || "",
            smart_achievable: parsed.smart_achievable || "",
            smart_relevant: parsed.smart_relevant || "",
            smart_temporal: parsed.smart_temporal || "",
            success_criteria: parsed.success_criteria || "",
            approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
            code: parsed.code || "",
            benefits_table: Array.isArray(parsed.benefits_table) ? parsed.benefits_table : [],
          }));
      }
    } catch {}
  }, [project]);

  useEffect(() => { fetchRelations(); }, [projectId]);

  const fetchRelations = async () => {
    const [r, a, prof, adminRoles, mem] = await Promise.all([
      supabase.from("risks").select("id, description, probability, impact, status").eq("project_id", projectId).eq("is_trashed", false).order("created_at", { ascending: false }),
      supabase.from("assumptions").select("id, description, category, impact").eq("project_id", projectId).eq("is_trashed", false).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, sector").not("full_name", "is", null).order("full_name"),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase.from("project_members").select("id, user_id, invitation_status, decline_reason").eq("project_id", projectId),
    ]);
    if (r.data) setRisks(r.data);
    if (a.data) setAssumptionsList(a.data);
    const adminIds = new Set((adminRoles.data || []).map((x: any) => x.user_id));
    const profiles = (prof.data || []).filter((p: any) => p.full_name && !adminIds.has(p.id));
    setAllProfiles(profiles);
    if (mem.data) {
      const rows = mem.data.map((m: any) => {
        const p = profiles.find((pp) => pp.id === m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          full_name: p?.full_name || "—",
          sector: p?.sector || null,
          invitation_status: (m.invitation_status as MemberRow["invitation_status"]) || "pending",
          decline_reason: m.decline_reason || null,
        };
      });
      setMemberRows(rows);
    }
  };

  const handleAddStakeholder = async () => {
    if (!selectedProfileId) return;
    setAddingMember(true);
    const profile = allProfiles.find((p) => p.id === selectedProfileId);
    const { error } = await supabase.from("project_members").insert({
      project_id: projectId, user_id: selectedProfileId, sector: profile?.sector || null,
      invitation_status: "pending",
      invited_by: user?.id ?? null,
      can_create: false, can_edit: false, can_delete: false, can_move: false,
    });
    setAddingMember(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    // dispara convite direcionado
    await supabase.from("notifications").insert({
      project_id: projectId,
      target_user_id: selectedProfileId,
      type: "project_invite",
      title: `Convite para o projeto: ${project.title}`,
      message: `Você foi convidado(a) a participar do projeto "${project.title}". Aceita?`,
    });
    setSelectedProfileId("");
    await fetchRelations();
    onMembersChanged?.();
    toast({ title: "Convite enviado!" });
  };

  const handleRemoveStakeholder = async (memberId: string) => {
    const { error } = await supabase.from("project_members").delete().eq("id", memberId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await fetchRelations();
    onMembersChanged?.();
  };

  const handleResendInvite = async (m: MemberRow) => {
    await supabase.from("notifications").insert({
      project_id: projectId,
      target_user_id: m.user_id,
      type: "project_invite",
      title: `Convite reenviado: ${project.title}`,
      message: `Reenvio do convite para participar do projeto "${project.title}".`,
    });
    await supabase.from("project_members").update({ invitation_status: "pending", responded_at: null, decline_reason: null }).eq("id", m.id);
    await fetchRelations();
    toast({ title: "Convite reenviado" });
  };

  const handleManualAccept = async (m: MemberRow) => {
    await supabase.from("project_members").update({ invitation_status: "accepted", responded_at: new Date().toISOString() }).eq("id", m.id);
    await fetchRelations();
    toast({ title: "Aceite manual registrado" });
  };

  const handleSave = async () => {
    setSaving(true);
    const charterPayload: any = { __charter: true, ...data };
    const updatePayload: any = {
      charter_data: charterPayload,
      objective: form.objective || null,
      problem_statement: form.problem_statement || null,
      scope: form.scope || null,
      out_of_scope: form.out_of_scope || null,
      restrictions: form.restrictions || null,
      expected_benefits: form.expected_benefits || null,
    };
    // Limpa qualquer JSON do TAP que ainda esteja em description (legado)
    if (project.description?.startsWith("{")) {
      updatePayload.description = null;
    }
    const { error } = await supabase.from("projects").update(updatePayload).eq("id", projectId);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar TAP", description: error.message, variant: "destructive" }); return; }
    setEditing(false);
    toast({ title: "TAP salvo com sucesso!" });
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try {
      const [y, m, day] = d.split("T")[0].split("-").map(Number);
      return format(new Date(y, m - 1, day), "dd/MM/yyyy", { locale: ptBR });
    } catch { return "—"; }
  };

  const probLabel = (p: string) => ({ low: "Baixa", medium: "Média", high: "Alta" }[p] || p);
  const impactLabel = (i: string) => ({ low: "Baixo", medium: "Médio", high: "Alto" }[i] || i);
  const riskBadge = (imp: string, prob: string) => {
    const score = ({ low: 1, medium: 2, high: 3 }[imp] || 2) * ({ low: 1, medium: 2, high: 3 }[prob] || 2);
    if (score >= 6) return "bg-destructive/15 text-destructive border-destructive/40";
    if (score >= 3) return "bg-warning/15 text-warning border-warning/40";
    return "bg-success/15 text-success border-success/40";
  };

  // --- Approvals editor helpers ---
  const addApproval = () => setData({ ...data, approvals: [...(data.approvals || []), { role: "", name: "", date: "" }] });
  const updateApproval = (idx: number, field: "role" | "name" | "date", val: string) => {
    const list = [...(data.approvals || [])]; list[idx] = { ...list[idx], [field]: val };
    setData({ ...data, approvals: list });
  };
  const removeApproval = (idx: number) => {
    const list = [...(data.approvals || [])]; list.splice(idx, 1); setData({ ...data, approvals: list });
  };

  // --- Benefits table editor helpers ---
  const addBenefit = () => setData({ ...data, benefits_table: [...(data.benefits_table || []), { benefit: "", indicator: "", goal: "", deadline: "" }] });
  const updateBenefit = (idx: number, field: "benefit" | "indicator" | "goal" | "deadline", val: string) => {
    const list = [...(data.benefits_table || [])]; list[idx] = { ...list[idx], [field]: val };
    setData({ ...data, benefits_table: list });
  };
  const removeBenefit = (idx: number) => {
    const list = [...(data.benefits_table || [])]; list.splice(idx, 1); setData({ ...data, benefits_table: list });
  };

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4 print:space-y-2">
      {/* Toolbar (oculta na impressão) */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Button size="sm" variant={previewMode ? "outline" : "default"} onClick={() => setPreviewMode(false)} className="gap-1">
            <Pencil className="w-4 h-4" /> Editar
          </Button>
          <Button size="sm" variant={previewMode ? "default" : "outline"} onClick={() => setPreviewMode(true)} className="gap-1">
            <Eye className="w-4 h-4" /> Apresentação
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
        </div>
        {!previewMode && isAdmin && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                  <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar TAP"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              </>
            ) : (
              <Button size="sm" variant="default" onClick={() => setEditing(true)} className="gap-1">
                <ClipboardList className="w-4 h-4" /> Editar campos
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Cabeçalho geral azul-marinho */}
      <Card className="overflow-hidden border-primary/30 print:break-inside-avoid">
        <div className="bg-primary text-primary-foreground p-5 flex items-center gap-4 print:bg-primary">
          <div className="w-12 h-12 rounded-lg bg-primary-foreground/15 flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest opacity-80">Termo de Abertura do Projeto · TAP</p>
            <h1 className="text-xl md:text-2xl font-bold truncate">{project.title}</h1>
          </div>
        </div>
      </Card>

      {/* 1. IDENTIFICAÇÃO */}
      <SectionBlock n={1} title="Identificação do Projeto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Título do Projeto"><p className="text-sm font-semibold">{project.title}</p></Field>
          <Field label="Código">
            <TextField editing={editing} value={data.code || ""} onChange={(v) => setData({ ...data, code: v })} placeholder="Ex: PRJ-2025-001" multiline={false} />
          </Field>
          <Field label="Prioridade">
            {project.priority ? (
              <PriorityBadge priority={project.priority} size="md" />
            ) : (
              <span className="text-sm text-muted-foreground italic">—</span>
            )}
          </Field>
          <Field label="Patrocinador (Sponsor)">
            <TextField editing={editing} value={data.sponsor} onChange={(v) => setData({ ...data, sponsor: v })} placeholder="Nome do patrocinador" multiline={false} />
          </Field>
          <Field label="Líder do Projeto">
            <p className="text-sm">{project.owner || <span className="italic text-muted-foreground">Não definido</span>}</p>
          </Field>
          <Field label="Orçamento Planejado">
            <p className="text-sm">{project.budget_planned ? `R$ ${Number(project.budget_planned).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</p>
          </Field>
          <Field label="Data de Início">
            {editing ? (
              <Input type="date" value={data.start_date} onChange={(e) => setData({ ...data, start_date: e.target.value })} className="text-sm h-8" />
            ) : (
              <p className="text-sm">{formatDate(data.start_date || project.start_date)}</p>
            )}
          </Field>
          <Field label="Data de Término Prevista">
            <p className="text-sm">{formatDate(project.due_date)}</p>
          </Field>
          <Field label="Status Atual">
            <Badge variant="outline" className="text-xs">{project.status}</Badge>
          </Field>
        </div>
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Cronograma — Previsto x Real</p>
          <BaselineBlock project={project as any} canManage={!!isAdmin} />
        </div>
      </SectionBlock>

      {/* 2. PROBLEMA / JUSTIFICATIVA */}
      <SectionBlock n={2} title="Problema / Justificativa">
        <Field label="Situação atual / Problema">
          <TextField editing={editing} value={form.problem_statement} onChange={(v) => setForm({ ...form, problem_statement: v })} placeholder="Descreva a situação atual e o problema a ser resolvido..." rows={3} aiContext="tap_problem" />
        </Field>
        <Field label="Justificativa estratégica">
          <TextField editing={editing} value={data.justification} onChange={(v) => setData({ ...data, justification: v })} placeholder="Por que este projeto é necessário agora?" rows={3} aiContext="tap_problem" />
        </Field>
      </SectionBlock>

      {/* 3. OBJETIVO SMART */}
      <SectionBlock n={3} title="Objetivo SMART">
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border border-border rounded-md overflow-hidden">
            <tbody>
              {[
                { k: "smart_specific", letter: "S", label: "Específico", color: "bg-primary/10" },
                { k: "smart_measurable", letter: "M", label: "Mensurável", color: "bg-primary/5" },
                { k: "smart_achievable", letter: "A", label: "Atingível", color: "bg-primary/10" },
                { k: "smart_relevant", letter: "R", label: "Relevante", color: "bg-primary/5" },
                { k: "smart_temporal", letter: "T", label: "Temporal", color: "bg-primary/10" },
              ].map((row) => (
                <tr key={row.k} className="border-b border-border last:border-0">
                  <td className={`${row.color} px-3 py-2 font-bold text-primary w-12 text-center align-top`}>{row.letter}</td>
                  <td className="px-3 py-2 font-medium w-32 align-top text-muted-foreground">{row.label}</td>
                  <td className="px-3 py-2 align-top">
                    <TextField editing={editing} value={(data as any)[row.k] || ""} onChange={(v) => setData({ ...data, [row.k]: v } as CharterData)} placeholder={`Defina ${row.label.toLowerCase()}...`} rows={2} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionBlock>

      {/* 4. ESCOPO */}
      <SectionBlock n={4} title="Escopo do Projeto">
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border border-border rounded-md overflow-hidden">
            <thead>
              <tr>
                <th className="bg-success/15 text-success px-3 py-2 text-left font-semibold border-b-2 border-success/40 w-1/2">
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Incluído no Escopo</span>
                </th>
                <th className="bg-destructive/15 text-destructive px-3 py-2 text-left font-semibold border-b-2 border-destructive/40 w-1/2">
                  <span className="inline-flex items-center gap-1.5"><Ban className="w-4 h-4" /> Excluído do Escopo</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="bg-success/5 px-3 py-3 align-top">
                  <TextField editing={editing} value={form.scope} onChange={(v) => setForm({ ...form, scope: v })} placeholder="O que será entregue (uma entrega por linha)..." rows={5} aiContext="tap_scope" />
                </td>
                <td className="bg-destructive/5 px-3 py-3 align-top">
                  <TextField editing={editing} value={form.out_of_scope} onChange={(v) => setForm({ ...form, out_of_scope: v })} placeholder="O que NÃO faz parte (uma exclusão por linha)..." rows={5} aiContext="tap_out_of_scope" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {phases.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fases / Entregáveis cadastrados:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {phases.map((p, i) => (
                <div key={p.id} className="text-sm flex items-start gap-2 p-2 rounded border border-border bg-muted/30">
                  <span className="text-primary font-mono font-semibold">1.{i + 1}</span>
                  <span>{p.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionBlock>

      {/* 5. PREMISSAS, RESTRIÇÕES E DEPENDÊNCIAS */}
      <SectionBlock n={5} title="Premissas, Restrições e Dependências">
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border border-border rounded-md overflow-hidden">
            <thead>
              <tr className="bg-muted">
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-border w-32">Tipo</th>
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-border">Descrição</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-3 py-2 align-top bg-warning/10">
                  <Badge className="bg-warning/20 text-warning border-warning/40 hover:bg-warning/20">Premissa</Badge>
                </td>
                <td className="px-3 py-2 align-top">
                  <TextField editing={editing} value={data.assumptions} onChange={(v) => setData({ ...data, assumptions: v })} placeholder="Premissas adotadas (uma por linha)..." rows={3} aiContext="assumption_description" />
                  {assumptionsList.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground border-t border-border pt-2">
                      {assumptionsList.map((a) => (
                        <li key={a.id} className="flex items-start gap-1.5">
                          <span className="text-warning">•</span><span>{a.description}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2 align-top bg-destructive/5">
                  <Badge className="bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive/15">Restrição</Badge>
                </td>
                <td className="px-3 py-2 align-top">
                  <TextField editing={editing} value={form.restrictions} onChange={(v) => setForm({ ...form, restrictions: v })} placeholder="Limitações de tempo, custo, recursos, regulatórias..." rows={3} aiContext="tap_restrictions" />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 align-top bg-primary/10">
                  <Badge className="bg-primary/20 text-primary border-primary/40 hover:bg-primary/20">Dependência</Badge>
                </td>
                <td className="px-3 py-2 align-top">
                  <TextField editing={editing} value={data.deliverables} onChange={(v) => setData({ ...data, deliverables: v })} placeholder="Dependências externas, projetos relacionados, recursos críticos..." rows={3} aiContext="tap_benefits" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionBlock>

      {/* 6. BENEFÍCIOS E CRITÉRIOS DE SUCESSO */}
      <SectionBlock n={6} title="Benefícios Esperados e Critérios de Sucesso">
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border border-border rounded-md overflow-hidden">
            <thead>
              <tr className="bg-primary/10">
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30">Benefício</th>
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30">Indicador de Sucesso</th>
                <th className="px-3 py-2 text-center font-semibold border-b-2 border-primary/30 whitespace-nowrap">Meta</th>
                <th className="px-3 py-2 text-center font-semibold border-b-2 border-primary/30 whitespace-nowrap">Prazo para Verificar</th>
                {editing && <th className="w-8 border-b-2 border-primary/30"></th>}
              </tr>
            </thead>
            <tbody>
              {(data.benefits_table || []).length === 0 && !editing && (
                <tr><td colSpan={4} className="px-3 py-3 text-center text-muted-foreground italic">Nenhum benefício registrado</td></tr>
              )}
              {(data.benefits_table || []).map((b, idx) => (
                <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 align-top">
                    {editing ? (
                      <AutoTextarea
                        value={b.benefit}
                        onChange={(v) => updateBenefit(idx, "benefit", v)}
                        placeholder="Ex: Visibilidade do portfólio para liderança"
                      />
                    ) : (
                      <span className="whitespace-pre-line">{b.benefit || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {editing ? (
                      <AutoTextarea
                        value={b.indicator}
                        onChange={(v) => updateBenefit(idx, "indicator", v)}
                        placeholder="Ex: % projetos com painel atualizado"
                      />
                    ) : (
                      <span className="whitespace-pre-line">{b.indicator || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-center bg-success/5 whitespace-nowrap">
                    {editing ? (
                      <Input value={b.goal} onChange={(e) => updateBenefit(idx, "goal", e.target.value)} placeholder="≥ 80%" className="h-8 text-sm text-center font-semibold min-w-[5rem]" />
                    ) : (
                      <span className="font-semibold text-success">{b.goal || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-center whitespace-nowrap">
                    {editing ? (
                      <Input value={b.deadline} onChange={(e) => updateBenefit(idx, "deadline", e.target.value)} placeholder="Mês 4" className="h-8 text-sm text-center min-w-[5rem]" />
                    ) : (
                      <span>{b.deadline || "—"}</span>
                    )}
                  </td>
                  {editing && (
                    <td className="px-2 py-2 align-top">
                      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeBenefit(idx)}>×</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing && (
          <Button type="button" size="sm" variant="outline" onClick={addBenefit} className="gap-1">
            + Adicionar benefício
          </Button>
        )}

        {/* Equipe do Projeto */}
        <div className="pt-2 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Equipe do Projeto
          </p>
          {memberRows.length > 0 ? (
            <div className="space-y-1.5">
              {memberRows.map((m) => {
                const ib = inviteBadge(m.invitation_status);
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 p-2 rounded-md border border-border bg-muted/30">
                    <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {m.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.full_name}</p>
                      {m.sector && <p className="text-xs text-muted-foreground truncate">{m.sector}</p>}
                      {m.invitation_status === "declined" && m.decline_reason && (
                        <p className="text-[11px] text-destructive truncate">Motivo: {m.decline_reason}</p>
                      )}
                    </div>
                    <Badge className={`text-[10px] ${ib.cls}`}>{ib.label}</Badge>
                    {editing && isAdmin && m.invitation_status !== "accepted" && (
                      <>
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => handleResendInvite(m)}>
                          Reenviar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-success" onClick={() => handleManualAccept(m)}>
                          Aceitar manual
                        </Button>
                      </>
                    )}
                    {editing && isAdmin && (
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => handleRemoveStakeholder(m.id)}>×</Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nenhum membro cadastrado</p>
          )}
          {editing && isAdmin && (
            <div className="pt-2 mt-2 flex flex-col sm:flex-row gap-2">
              <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                <SelectTrigger className="text-sm flex-1 h-9">
                  <SelectValue placeholder="Convidar membro..." />
                </SelectTrigger>
                <SelectContent>
                  {allProfiles.filter((p) => !memberRows.some((m) => m.user_id === p.id)).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}{p.sector ? ` — ${p.sector}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" onClick={handleAddStakeholder} disabled={!selectedProfileId || addingMember}>
                {addingMember ? "Enviando..." : "Convidar"}
              </Button>
            </div>
          )}
        </div>

        {/* Riscos iniciais */}
        {risks.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Riscos Iniciais</p>
            <div className="space-y-1.5">
              {risks.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-sm p-2 rounded border border-border bg-muted/20">
                  <Badge className={`${riskBadge(r.impact, r.probability)} text-xs flex-shrink-0`}>
                    {impactLabel(r.impact)}/{probLabel(r.probability)}
                  </Badge>
                  <span className="flex-1">{r.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionBlock>

      {/* 7. APROVAÇÕES */}
      <SectionBlock n={7} title="Aprovações Formais">
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border border-border rounded-md overflow-hidden">
            <thead>
              <tr className="bg-primary/10">
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30 w-1/4">Função</th>
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30">Nome</th>
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30 w-40">Data / Assinatura</th>
                {editing && <th className="w-10 border-b-2 border-primary/30"></th>}
              </tr>
            </thead>
            <tbody>
              {(data.approvals || []).length === 0 && !editing && (
                <tr><td colSpan={3} className="px-3 py-3 text-center text-muted-foreground italic">Nenhuma aprovação registrada</td></tr>
              )}
              {(data.approvals || []).map((ap, idx) => (
                <tr key={idx} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 align-top">
                    {editing ? <Input value={ap.role} onChange={(e) => updateApproval(idx, "role", e.target.value)} placeholder="Ex: Sponsor" className="h-8 text-sm" /> : <span>{ap.role || "—"}</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {editing ? <Input value={ap.name} onChange={(e) => updateApproval(idx, "name", e.target.value)} placeholder="Nome completo" className="h-8 text-sm" /> : <span>{ap.name || "—"}</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {editing ? <Input type="date" value={ap.date} onChange={(e) => updateApproval(idx, "date", e.target.value)} className="h-8 text-sm" /> : <span>{formatDate(ap.date)}</span>}
                  </td>
                  {editing && (
                    <td className="px-2 py-2 align-top">
                      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeApproval(idx)}>×</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing && (
          <Button type="button" size="sm" variant="outline" onClick={addApproval} className="gap-1">
            + Adicionar aprovador
          </Button>
        )}
      </SectionBlock>

      {/* CSS de impressão */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
};

/* -------- Field helper -------- */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
    {children}
  </div>
);