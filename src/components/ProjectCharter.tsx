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
  FileText, Target, ShieldCheck, AlertTriangle, Save, ClipboardList,
  HelpCircle, Lightbulb, Rocket, Calendar, User, Activity, Tag,
  FileSearch, Ban, Scale, BookOpen, Users,
} from "lucide-react";

interface Phase { id: string; title: string }

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

const STATUS_LABELS: Record<string, string> = {
  ideacao: "Ideação", poc: "POC", mvp: "MVP",
  blocked: "Bloqueio", drawer: "Gaveta", "em-execucao": "Em Execução",
};

export const ProjectCharter = ({ projectId, project, phases, members }: ProjectCharterProps) => {
  const { toast } = useToast();
  const { canManage: isAdmin } = useAuth();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const formatDate = (d: string | null) => {
    if (!d) return "Não definido";
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("pt-BR");
  };

  const TapCard = ({
    icon: Icon, label, value, field, color = "primary", multiline = true, isSelect = false,
  }: {
    icon: React.ElementType;
    label: string;
    value: string;
    field?: keyof typeof form;
    color?: string;
    multiline?: boolean;
    isSelect?: boolean;
  }) => (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg bg-${color}/10 flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 text-${color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</h4>
          {editing && field ? (
            isSelect ? (
              <Select value={form[field] || "_none"} onValueChange={(v) => setForm({ ...form, [field]: v === "_none" ? "" : v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Não definido</SelectItem>
                  {Object.entries(PROJECT_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : multiline ? (
              <Textarea
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className="min-h-[70px] text-sm resize-none"
              />
            ) : (
              <Input
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className="text-sm h-9"
              />
            )
          ) : value ? (
            isSelect ? (
              <Badge variant="outline" className={`bg-${color}/10 text-${color} border-${color}/30`}>
                {PROJECT_TYPES[value] || value}
              </Badge>
            ) : (
              <p className="text-sm text-foreground whitespace-pre-line">{value}</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground italic">Não preenchido</p>
          )}
        </div>
      </div>
    </Card>
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
              <p className="text-xs text-muted-foreground">TAP — Termo de Abertura</p>
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

      {/* Identificação (somente leitura — vem do projeto) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <TapCard icon={FileText} label="Título do Projeto" value={project.title} color="primary" />
        <TapCard icon={User} label="Líder do Projeto" value={project.owner || ""} color="primary" />
        <TapCard icon={Calendar} label="Prazo de Entrega" value={formatDate(project.due_date)} color="primary" />
        <TapCard icon={Activity} label="Status Atual" value={STATUS_LABELS[project.status] || project.status} color="primary" />
        <TapCard icon={BookOpen} label="Descrição" value={project.description || ""} color="primary" />
        <TapCard icon={Tag} label="Tipo do Projeto" value={form.project_type} field="project_type" color="warning" isSelect />
      </div>

      {/* TAP Cards — POR QUÊ / O QUÊ / PARA QUÊ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <TapCard icon={Target} label="Objetivo (O que será feito?)" value={form.objective} field="objective" color="warning" multiline={false} />
        <TapCard icon={HelpCircle} label="Problema / Necessidade" value={form.problem_statement} field="problem_statement" color="warning" />
        <TapCard icon={FileSearch} label="Causa Raiz" value={form.root_cause} field="root_cause" color="warning" />
        <TapCard icon={Lightbulb} label="Escopo" value={form.scope} field="scope" color="primary" />
        <TapCard icon={Ban} label="Fora do Escopo" value={form.out_of_scope} field="out_of_scope" color="primary" />
        <TapCard icon={Scale} label="Restrições" value={form.restrictions} field="restrictions" color="primary" />
        <TapCard icon={ShieldCheck} label="Requisitos Regulamentares" value={form.regulatory_requirements} field="regulatory_requirements" color="primary" />
        <TapCard icon={Rocket} label="Benefícios Esperados" value={form.expected_benefits} field="expected_benefits" color="success" />
        <TapCard icon={AlertTriangle} label="Benefício / Problema Solucionado" value={form.solved_problem} field="solved_problem" color="success" />
      </div>

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
