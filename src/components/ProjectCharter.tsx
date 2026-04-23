import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileText, Target, ShieldCheck, AlertTriangle, Save,
  ClipboardList, Ban, HelpCircle, Lightbulb, Rocket,
  Plus, Trash2, Link2, Scale, Users,
} from "lucide-react";

interface Phase { id: string; title: string }
interface Risk { id: string; description: string; probability: string; impact: string; status: string }
interface Assumption { id: string; description: string; status: string; impact: string | null }
interface Dependency {
  id: string;
  description: string;
  depends_on: string | null;
  linked_project_id: string | null;
  responsible: string | null;
  status: string;
  due_date: string | null;
}

interface ProjectCharterProps {
  projectId: string;
  project: {
    title: string;
    description: string | null;
    owner: string | null;
    due_date: string | null;
    status: string;
    project_type?: string | null;
    objective?: string | null;
    problem_statement?: string | null;
    root_cause?: string | null;
    expected_benefits?: string | null;
    solved_problem?: string | null;
    scope?: string | null;
    out_of_scope?: string | null;
    restrictions?: string | null;
    regulatory_requirements?: string | null;
  };
  phases: Phase[];
  members: { full_name: string; sector: string | null }[];
}

const PROJECT_TYPES: Record<string, string> = {
  estrategico: "Estratégico",
  operacional: "Operacional",
  novos_negocios: "Novos Negócios",
  parceria: "Parceria",
  melhoria_processo: "Melhoria de Processo",
  inovacao: "Inovação",
};

const DEP_STATUS: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-warning/10 text-warning border-warning/30" },
  em_andamento: { label: "Em andamento", cls: "bg-primary/10 text-primary border-primary/30" },
  resolvida: { label: "Resolvida", cls: "bg-success/10 text-success border-success/30" },
  bloqueada: { label: "Bloqueada", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

export const ProjectCharter = ({ projectId, project, phases, members }: ProjectCharterProps) => {
  const { toast } = useToast();
  const { canManage: isAdmin } = useAuth();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [otherProjects, setOtherProjects] = useState<{ id: string; title: string }[]>([]);

  const [form, setForm] = useState({
    project_type: project.project_type || "",
    objective: project.objective || "",
    problem_statement: project.problem_statement || "",
    root_cause: project.root_cause || "",
    scope: project.scope || "",
    out_of_scope: project.out_of_scope || "",
    restrictions: project.restrictions || "",
    regulatory_requirements: project.regulatory_requirements || "",
    expected_benefits: project.expected_benefits || "",
    solved_problem: project.solved_problem || "",
  });

  // Inline add states
  const [newRisk, setNewRisk] = useState("");
  const [newAssumption, setNewAssumption] = useState("");
  const [newDep, setNewDep] = useState({
    description: "", depends_on: "", linked_project_id: "", responsible: "", status: "pendente",
  });

  useEffect(() => {
    setForm({
      project_type: project.project_type || "",
      objective: project.objective || "",
      problem_statement: project.problem_statement || "",
      root_cause: project.root_cause || "",
      scope: project.scope || "",
      out_of_scope: project.out_of_scope || "",
      restrictions: project.restrictions || "",
      regulatory_requirements: project.regulatory_requirements || "",
      expected_benefits: project.expected_benefits || "",
      solved_problem: project.solved_problem || "",
    });
  }, [project]);

  useEffect(() => {
    fetchAll();
  }, [projectId]);

  const fetchAll = async () => {
    const [r, a, d, p] = await Promise.all([
      supabase.from("risks").select("id, description, probability, impact, status").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("assumptions").select("id, description, status, impact").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("project_dependencies").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("projects").select("id, title").neq("id", projectId).order("title"),
    ]);
    if (r.data) setRisks(r.data);
    if (a.data) setAssumptions(a.data);
    if (d.data) setDependencies(d.data);
    if (p.data) setOtherProjects(p.data);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({
        project_type: form.project_type || null,
        objective: form.objective || null,
        problem_statement: form.problem_statement || null,
        root_cause: form.root_cause || null,
        scope: form.scope || null,
        out_of_scope: form.out_of_scope || null,
        restrictions: form.restrictions || null,
        regulatory_requirements: form.regulatory_requirements || null,
        expected_benefits: form.expected_benefits || null,
        solved_problem: form.solved_problem || null,
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

  const addRisk = async () => {
    if (!newRisk.trim()) return;
    const { error } = await supabase.from("risks").insert({
      project_id: projectId, description: newRisk.trim(),
      probability: "medium", impact: "medium", status: "identified",
    });
    if (!error) { setNewRisk(""); fetchAll(); toast({ title: "Risco adicionado" }); }
  };

  const removeRisk = async (id: string) => {
    await supabase.from("risks").delete().eq("id", id);
    fetchAll();
  };

  const addAssumption = async () => {
    if (!newAssumption.trim()) return;
    const { error } = await supabase.from("assumptions").insert({
      project_id: projectId, description: newAssumption.trim(), status: "active",
    });
    if (!error) { setNewAssumption(""); fetchAll(); toast({ title: "Premissa adicionada" }); }
  };

  const removeAssumption = async (id: string) => {
    await supabase.from("assumptions").delete().eq("id", id);
    fetchAll();
  };

  const addDependency = async () => {
    if (!newDep.description.trim()) return;
    const { error } = await supabase.from("project_dependencies").insert({
      project_id: projectId,
      description: newDep.description.trim(),
      depends_on: newDep.depends_on || null,
      linked_project_id: newDep.linked_project_id || null,
      responsible: newDep.responsible || null,
      status: newDep.status,
    });
    if (!error) {
      setNewDep({ description: "", depends_on: "", linked_project_id: "", responsible: "", status: "pendente" });
      fetchAll();
      toast({ title: "Dependência adicionada" });
    }
  };

  const removeDependency = async (id: string) => {
    await supabase.from("project_dependencies").delete().eq("id", id);
    fetchAll();
  };

  const updateDepStatus = async (id: string, status: string) => {
    await supabase.from("project_dependencies").update({ status }).eq("id", id);
    fetchAll();
  };

  const Pillar = ({
    icon: Icon, title, subtitle, color, children,
  }: { icon: React.ElementType; title: string; subtitle: string; color: string; children: React.ReactNode }) => (
    <Card className={`p-5 border-l-4 border-l-${color}`}>
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
        <div className={`w-10 h-10 rounded-lg bg-${color}/10 flex items-center justify-center`}>
          <Icon className={`w-5 h-5 text-${color}`} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );

  const Field = ({ label, value, onChange, placeholder, multiline = true }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean;
  }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      {editing ? (
        multiline ? (
          <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-[70px] text-sm resize-none" />
        ) : (
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="text-sm" />
        )
      ) : value ? (
        <p className="text-sm text-foreground whitespace-pre-line">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">Não preenchido</p>
      )}
    </div>
  );

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
              <h2 className="text-lg font-semibold text-foreground">Ficha de Abertura do Projeto</h2>
              <p className="text-xs text-muted-foreground">TAP — Estruturada em POR QUÊ • O QUÊ • PARA QUÊ</p>
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

      {/* PILAR 1: POR QUÊ */}
      <Pillar icon={HelpCircle} title="POR QUÊ?" subtitle="Justificativa da iniciativa" color="warning">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo do Projeto</label>
            {editing ? (
              <Select value={form.project_type || "_none"} onValueChange={(v) => setForm({ ...form, project_type: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Não definido</SelectItem>
                  {Object.entries(PROJECT_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : form.project_type ? (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">{PROJECT_TYPES[form.project_type] || form.project_type}</Badge>
            ) : (
              <p className="text-sm text-muted-foreground italic">Não definido</p>
            )}
          </div>
          <Field label="Objetivo (O que será feito?)" value={form.objective} onChange={(v) => setForm({ ...form, objective: v })} placeholder="Descreva o objetivo principal..." multiline={false} />
        </div>
        <Field label="Problema / Necessidade de Melhoria (passado)" value={form.problem_statement} onChange={(v) => setForm({ ...form, problem_statement: v })} placeholder="Qual problema motivou este projeto?" />
        <Field label="Causa Raiz" value={form.root_cause} onChange={(v) => setForm({ ...form, root_cause: v })} placeholder="Qual a origem do problema?" />
      </Pillar>

      {/* PILAR 2: O QUÊ */}
      <Pillar icon={Lightbulb} title="O QUÊ?" subtitle="Definição e fronteiras" color="primary">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Escopo (em escopo)" value={form.scope} onChange={(v) => setForm({ ...form, scope: v })} placeholder="O que será entregue..." />
          <Field label="Fora do Escopo" value={form.out_of_scope} onChange={(v) => setForm({ ...form, out_of_scope: v })} placeholder="O que NÃO faz parte..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Restrições" value={form.restrictions} onChange={(v) => setForm({ ...form, restrictions: v })} placeholder="Limitações de tempo, custo, recursos..." />
          <Field label="Requisitos Regulamentares" value={form.regulatory_requirements} onChange={(v) => setForm({ ...form, regulatory_requirements: v })} placeholder="Normas e regulamentações aplicáveis..." />
        </div>

        {/* Premissas — sincronizado com módulo */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-success" /> Premissas
              <Badge variant="outline" className="text-[10px] ml-1">{assumptions.length}</Badge>
            </label>
          </div>
          {assumptions.length > 0 ? (
            <div className="space-y-1.5">
              {assumptions.map((a) => (
                <div key={a.id} className="flex items-start gap-2 p-2 rounded border border-border bg-card text-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-success mt-0.5 flex-shrink-0" />
                  <span className="flex-1 text-foreground">{a.description}</span>
                  {isAdmin && (
                    <button onClick={() => removeAssumption(a.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Nenhuma premissa cadastrada</p>
          )}
          {isAdmin && (
            <div className="flex gap-2">
              <Input placeholder="Nova premissa..." value={newAssumption} onChange={(e) => setNewAssumption(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAssumption()} className="text-sm h-8" />
              <Button size="sm" onClick={addAssumption} className="h-8 gap-1"><Plus className="w-3.5 h-3.5" /> Adicionar</Button>
            </div>
          )}
        </div>

        {/* Riscos — sincronizado com módulo */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-warning" /> Riscos
              <Badge variant="outline" className="text-[10px] ml-1">{risks.length}</Badge>
            </label>
          </div>
          {risks.length > 0 ? (
            <div className="space-y-1.5">
              {risks.map((r) => (
                <div key={r.id} className="flex items-start gap-2 p-2 rounded border border-border bg-card text-sm">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 flex-shrink-0" />
                  <span className="flex-1 text-foreground">{r.description}</span>
                  {isAdmin && (
                    <button onClick={() => removeRisk(r.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Nenhum risco cadastrado</p>
          )}
          {isAdmin && (
            <div className="flex gap-2">
              <Input placeholder="Novo risco..." value={newRisk} onChange={(e) => setNewRisk(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRisk()} className="text-sm h-8" />
              <Button size="sm" onClick={addRisk} className="h-8 gap-1"><Plus className="w-3.5 h-3.5" /> Adicionar</Button>
            </div>
          )}
        </div>

        {/* Dependências */}
        <div className="space-y-2 pt-2 border-t border-border">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-primary" /> Dependências
            <Badge variant="outline" className="text-[10px] ml-1">{dependencies.length}</Badge>
          </label>
          {dependencies.length > 0 ? (
            <div className="space-y-1.5">
              {dependencies.map((d) => {
                const linked = otherProjects.find((p) => p.id === d.linked_project_id);
                const stConf = DEP_STATUS[d.status] || DEP_STATUS.pendente;
                return (
                  <div key={d.id} className="p-2.5 rounded border border-border bg-card text-sm space-y-1">
                    <div className="flex items-start gap-2">
                      <Link2 className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{d.description}</p>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                          {d.depends_on && <span>De: <strong className="text-foreground">{d.depends_on}</strong></span>}
                          {linked && <span className="flex items-center gap-1">→ <Badge variant="outline" className="text-[10px]">{linked.title}</Badge></span>}
                          {d.responsible && <span>Resp.: {d.responsible}</span>}
                        </div>
                      </div>
                      {isAdmin && (
                        <Select value={d.status} onValueChange={(v) => updateDepStatus(d.id, v)}>
                          <SelectTrigger className="h-7 w-auto px-2 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(DEP_STATUS).map(([k, v]) => (
                              <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {!isAdmin && <Badge variant="outline" className={`text-[10px] ${stConf.cls}`}>{stConf.label}</Badge>}
                      {isAdmin && (
                        <button onClick={() => removeDependency(d.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Nenhuma dependência registrada</p>
          )}
          {isAdmin && (
            <div className="p-2.5 rounded border border-dashed border-border space-y-2">
              <Input placeholder="Qual é a dependência?" value={newDep.description} onChange={(e) => setNewDep({ ...newDep, description: e.target.value })} className="text-sm h-8" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input placeholder="De quem dependemos? (área, pessoa, fornecedor)" value={newDep.depends_on} onChange={(e) => setNewDep({ ...newDep, depends_on: e.target.value })} className="text-sm h-8" />
                <Input placeholder="Responsável (opcional)" value={newDep.responsible} onChange={(e) => setNewDep({ ...newDep, responsible: e.target.value })} className="text-sm h-8" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Select value={newDep.linked_project_id || "_none"} onValueChange={(v) => setNewDep({ ...newDep, linked_project_id: v === "_none" ? "" : v })}>
                  <SelectTrigger className="text-sm h-8"><SelectValue placeholder="Vincular a outro projeto (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhum</SelectItem>
                    {otherProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={newDep.status} onValueChange={(v) => setNewDep({ ...newDep, status: v })}>
                  <SelectTrigger className="text-sm h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEP_STATUS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={addDependency} className="w-full gap-1 h-8"><Plus className="w-3.5 h-3.5" /> Adicionar dependência</Button>
            </div>
          )}
        </div>
      </Pillar>

      {/* PILAR 3: PARA QUÊ */}
      <Pillar icon={Rocket} title="PARA QUÊ?" subtitle="Benefícios esperados (futuro)" color="success">
        <Field label="Benefícios Esperados" value={form.expected_benefits} onChange={(v) => setForm({ ...form, expected_benefits: v })} placeholder="Quais ganhos o projeto trará?" />
        <Field label="Qual benefício / problema irá solucionar?" value={form.solved_problem} onChange={(v) => setForm({ ...form, solved_problem: v })} placeholder="Como medirá o sucesso?" />
      </Pillar>

      {/* Contexto adicional: Equipe + Fases */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Equipe ({members.length})</h3>
          </div>
          {members.length > 0 ? (
            <div className="space-y-1.5">
              {members.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {m.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <span className="font-medium text-foreground">{m.full_name}</span>
                  {m.sector && <Badge variant="outline" className="text-xs">{m.sector}</Badge>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nenhum membro</p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Fases ({phases.length})</h3>
          </div>
          {phases.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {phases.map((p) => (
                <Badge key={p.id} variant="outline" className="bg-primary/10 text-primary border-primary/30">{p.title}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nenhuma fase definida</p>
          )}
        </Card>
      </div>
    </div>
  );
};
