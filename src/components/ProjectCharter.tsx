import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileText, Save, ClipboardList, Users, AlertTriangle, ShieldCheck,
  Ban, CheckCircle2, Calendar, Target, Layers, ListChecks, Award, UserPlus, X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AIAssistButton, AIContext } from "@/components/AIAssistButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Phase { id: string; title: string }
interface Risk { id: string; description: string; probability: string; impact: string; status: string }

interface ProjectCharterProps {
  projectId: string;
  project: {
    title: string;
    description: string | null;
    owner: string | null;
    due_date: string | null;
    status: string;
    objective?: string | null;
    problem_statement?: string | null;
    scope?: string | null;
    out_of_scope?: string | null;
    restrictions?: string | null;
    expected_benefits?: string | null;
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
}

interface TextFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
  aiContext?: AIContext;
  editing: boolean;
}

const TextField = ({
  value, onChange, placeholder, multiline = true, rows = 3, aiContext, editing,
}: TextFieldProps) => {
  if (editing) {
    return multiline ? (
      <div className="space-y-1.5">
        {aiContext && (
          <div className="flex justify-end">
            <AIAssistButton value={value} onChange={onChange} context={aiContext} />
          </div>
        )}
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="text-sm resize-none" />
      </div>
    ) : (
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="text-sm" />
    );
  }
  return value ? (
    <p className="text-sm text-foreground whitespace-pre-line">{value}</p>
  ) : (
    <p className="text-sm text-muted-foreground italic">Não preenchido</p>
  );
};

interface SectionProps {
  n: number;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}

const Section = ({ n, icon: Icon, title, children }: SectionProps) => (
  <Card className="p-5">
    <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        <span className="text-primary mr-1.5">{n}.</span>{title}
      </h3>
    </div>
    <div className="space-y-3">{children}</div>
  </Card>
);

export const ProjectCharter = ({ projectId, project, phases, members, onMembersChanged }: ProjectCharterProps) => {
  const { toast } = useToast();
  const { canManage: isAdmin } = useAuth();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [assumptionsList, setAssumptionsList] = useState<{ id: string; description: string }[]>([]);
  const [allProfiles, setAllProfiles] = useState<{ id: string; full_name: string; sector: string | null }[]>([]);
  const [memberRows, setMemberRows] = useState<{ id: string; user_id: string; full_name: string; sector: string | null }[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [addingMember, setAddingMember] = useState(false);

  // Charter data persisted in projects.description as JSON merged with native fields
  const [data, setData] = useState<CharterData>({
    sponsor: "",
    start_date: "",
    justification: "",
    deliverables: "",
    assumptions: "",
    approval_requirements: "",
  });

  // Native project fields editable in TAP
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
    // Parse charter JSON from description if present
    try {
      if (project.description?.startsWith("{")) {
        const parsed = JSON.parse(project.description);
        if (parsed.__charter) {
          setData({
            sponsor: parsed.sponsor || "",
            start_date: parsed.start_date || "",
            justification: parsed.justification || "",
            deliverables: parsed.deliverables || "",
            assumptions: parsed.assumptions || "",
            approval_requirements: parsed.approval_requirements || "",
          });
        }
      }
    } catch {}
  }, [project]);

  useEffect(() => {
    fetchRelations();
  }, [projectId]);

  const fetchRelations = async () => {
    const [r, a] = await Promise.all([
      supabase.from("risks").select("id, description, probability, impact, status").eq("project_id", projectId).eq("is_trashed", false).order("created_at", { ascending: false }),
      supabase.from("assumptions").select("id, description").eq("project_id", projectId).eq("is_trashed", false).order("created_at", { ascending: false }),
    ]);
    if (r.data) setRisks(r.data);
    if (a.data) setAssumptionsList(a.data);
  };

  const handleSave = async () => {
    setSaving(true);
    const charterJson = JSON.stringify({ __charter: true, ...data });
    const { error } = await supabase
      .from("projects")
      .update({
        description: charterJson,
        objective: form.objective || null,
        problem_statement: form.problem_statement || null,
        scope: form.scope || null,
        out_of_scope: form.out_of_scope || null,
        restrictions: form.restrictions || null,
        expected_benefits: form.expected_benefits || null,
      })
      .eq("id", projectId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar TAP", description: error.message, variant: "destructive" });
      return;
    }
    setEditing(false);
    toast({ title: "TAP salvo com sucesso!" });
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "Não definido";
    try {
      const [y, m, day] = d.split("T")[0].split("-").map(Number);
      return format(new Date(y, m - 1, day), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "Não definido";
    }
  };

  const probLabel = (p: string) => ({ low: "30%", medium: "60%", high: "90%" }[p] || p);
  const impactLabel = (i: string) => ({ low: "30%", medium: "60%", high: "90%" }[i] || i);
  const riskLevel = (imp: string, prob: string): { label: string; cls: string } => {
    const m: Record<string, { label: string; cls: string }> = {
      "low-low":      { label: "Muito Baixa", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40" },
      "low-medium":   { label: "Baixa",       cls: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/40" },
      "low-high":     { label: "Média",       cls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/40" },
      "medium-low":   { label: "Baixa",       cls: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/40" },
      "medium-medium":{ label: "Média",       cls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/40" },
      "medium-high":  { label: "Alta",        cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40" },
      "high-low":     { label: "Média",       cls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/40" },
      "high-medium":  { label: "Alta",        cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40" },
      "high-high":    { label: "Muito Alta",  cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/50" },
    };
    return m[`${imp}-${prob}`] || { label: "Média", cls: "bg-muted" };
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Termo de Abertura do Projeto</h2>
              <p className="text-xs text-muted-foreground">Project Charter — TAP (PMBOK 7)</p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              {editing ? (
                <>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                    <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
                </>
              ) : (
                <Button size="sm" variant="default" onClick={() => setEditing(true)} className="gap-1">
                  <ClipboardList className="w-4 h-4" /> Editar TAP
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      <Section n={1} icon={FileText} title="Título do Projeto">
        <p className="text-base font-semibold text-foreground">{project.title}</p>
      </Section>

      <Section n={2} icon={Users} title="Gerente de Projeto">
        {project.owner ? (
          <p className="text-sm text-foreground">{project.owner}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Não definido</p>
        )}
      </Section>

      <Section n={3} icon={Award} title="Patrocinador do Projeto">
        <TextField editing={editing} value={data.sponsor} onChange={(v) => setData({ ...data, sponsor: v })} placeholder="Nome do patrocinador..." multiline={false} />
      </Section>

      <Section n={4} icon={Calendar} title="Data de Início e Término Previstas">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Início</label>
            {editing ? (
              <Input type="date" value={data.start_date} onChange={(e) => setData({ ...data, start_date: e.target.value })} className="text-sm" />
            ) : (
              <p className="text-sm text-foreground">{formatDate(data.start_date)}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Término</label>
            <p className="text-sm text-foreground">{formatDate(project.due_date)}</p>
            <p className="text-[10px] text-muted-foreground">Editado no cabeçalho do projeto</p>
          </div>
        </div>
      </Section>

      <Section n={5} icon={Target} title="Justificativa do Projeto">
        <TextField editing={editing} value={data.justification} onChange={(v) => setData({ ...data, justification: v })} placeholder="Por que este projeto é necessário?" rows={4} aiContext="tap_problem" />
      </Section>

      <Section n={6} icon={Target} title="Objetivos do Projeto">
        <TextField editing={editing} value={form.objective} onChange={(v) => setForm({ ...form, objective: v })} placeholder="Objetivos SMART do projeto..." rows={4} aiContext="tap_objective" />
      </Section>

      <Section n={7} icon={Layers} title="Escopo do Projeto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-success uppercase tracking-wide flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Em Escopo
            </label>
            <TextField editing={editing} value={form.scope} onChange={(v) => setForm({ ...form, scope: v })} placeholder="O que será entregue..." rows={4} aiContext="tap_scope" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-destructive uppercase tracking-wide flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5" /> Fora de Escopo
            </label>
            <TextField editing={editing} value={form.out_of_scope} onChange={(v) => setForm({ ...form, out_of_scope: v })} placeholder="O que NÃO faz parte..." rows={4} aiContext="tap_out_of_scope" />
          </div>
        </div>
      </Section>

      <Section n={8} icon={ListChecks} title="Entregáveis Principais">
        <TextField editing={editing} value={data.deliverables} onChange={(v) => setData({ ...data, deliverables: v })} placeholder="Liste as principais entregas..." rows={3} aiContext="tap_benefits" />
        {phases.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fases cadastradas:</p>
            <ul className="space-y-1">
              {phases.map((p, i) => (
                <li key={p.id} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-muted-foreground">1.{i + 1}</span>
                  <span>{p.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section n={9} icon={ShieldCheck} title="Premissas">
        <TextField editing={editing} value={data.assumptions} onChange={(v) => setData({ ...data, assumptions: v })} placeholder="Premissas adotadas..." rows={3} aiContext="assumption_description" />
        {assumptionsList.length > 0 && (
          <div className="pt-2 border-t border-border space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Cadastradas no módulo:</p>
            {assumptionsList.map((a) => (
              <div key={a.id} className="text-sm text-foreground flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-success mt-0.5 flex-shrink-0" />
                <span>{a.description}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section n={10} icon={Ban} title="Restrições">
        <TextField editing={editing} value={form.restrictions} onChange={(v) => setForm({ ...form, restrictions: v })} placeholder="Limitações de tempo, custo, recursos..." rows={3} aiContext="tap_restrictions" />
      </Section>

      <Section n={11} icon={Users} title="Stakeholders Principais">
        {members.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {members.map((m, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-md border border-border bg-card">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {m.full_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{m.full_name}</p>
                  {m.sector && <p className="text-xs text-muted-foreground truncate">{m.sector}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Nenhum membro cadastrado</p>
        )}
      </Section>

      <Section n={12} icon={CheckCircle2} title="Requisitos de Aprovação do Projeto">
        <TextField editing={editing} value={data.approval_requirements} onChange={(v) => setData({ ...data, approval_requirements: v })} placeholder="Critérios de sucesso e aprovação..." rows={3} aiContext="tap_regulatory" />
      </Section>

      <Section n={13} icon={AlertTriangle} title="Riscos Iniciais Identificados">
        {risks.length > 0 ? (
          <div className="space-y-2">
            {risks.map((r) => {
              const lvl = riskLevel(r.impact, r.probability);
              return (
                <div key={r.id} className="p-3 rounded-md border border-border bg-card">
                  <p className="text-sm font-medium text-foreground mb-1">{r.description}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge className={lvl.cls}>{lvl.label}</Badge>
                    <Badge variant="outline">Prob: {probLabel(r.probability)}</Badge>
                    <Badge variant="outline">Impacto: {impactLabel(r.impact)}</Badge>
                    <Badge variant="outline" className="bg-muted">{r.status}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Nenhum risco cadastrado no módulo de Riscos</p>
        )}
      </Section>
    </div>
  );
};
