import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileText, Target, ShieldCheck, AlertTriangle, Package,
  Users, CheckCircle2, Save, Calendar, User, Briefcase,
  ClipboardList, Ban,
} from "lucide-react";

interface Phase {
  id: string;
  title: string;
}

interface Risk {
  id: string;
  description: string;
  probability: string;
  impact: string;
  status: string;
}

interface ProjectCharterProps {
  projectId: string;
  project: {
    title: string;
    description: string | null;
    owner: string | null;
    due_date: string | null;
    status: string;
  };
  phases: Phase[];
  members: { full_name: string; sector: string | null }[];
}

interface CharterData {
  project_title: string;
  project_manager: string;
  sponsor: string;
  start_date: string;
  end_date: string;
  justification: string;
  objectives: string;
  in_scope: string;
  out_scope: string;
  deliverables: string;
  premises: string;
  restrictions: string;
  approval_requirements: string;
}

export const ProjectCharter = ({ projectId, project, phases, members }: ProjectCharterProps) => {
  const { toast } = useToast();
  const { canManage: isAdmin } = useAuth();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [editing, setEditing] = useState(false);
  const [charter, setCharter] = useState<CharterData>({
    project_title: project.title || "",
    project_manager: project.owner || "",
    sponsor: "",
    start_date: "",
    end_date: project.due_date || "",
    justification: "",
    objectives: "",
    in_scope: "",
    out_scope: "",
    deliverables: "",
    premises: "",
    restrictions: "",
    approval_requirements: "",
  });

  useEffect(() => {
    fetchRisks();
    fetchCharter();
  }, [projectId]);

  const fetchRisks = async () => {
    const { data } = await supabase
      .from("risks")
      .select("id, description, probability, impact, status")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (data) setRisks(data);
  };

  const fetchCharter = async () => {
    const { data } = await supabase
      .from("project_documents")
      .select("description")
      .eq("project_id", projectId)
      .eq("file_type", "TAP_CHARTER")
      .limit(1);
    if (data && data.length > 0 && data[0].description) {
      try {
        const saved = JSON.parse(data[0].description);
        setCharter((prev) => ({ ...prev, ...saved }));
      } catch { /* ignore parse errors */ }
    }
  };

  const handleSave = async () => {
    const payload = JSON.stringify(charter);
    // Check if already exists
    const { data: existing } = await supabase
      .from("project_documents")
      .select("id")
      .eq("project_id", projectId)
      .eq("file_type", "TAP_CHARTER")
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("project_documents")
        .update({ description: payload, file_name: "Termo de Abertura do Projeto" })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("project_documents").insert({
        project_id: projectId,
        file_name: "Termo de Abertura do Projeto",
        file_url: "#tap",
        file_type: "TAP_CHARTER",
        description: payload,
      });
    }
    setEditing(false);
    toast({ title: "TAP salvo com sucesso!" });
  };

  const update = (field: keyof CharterData, value: string) => {
    setCharter((prev) => ({ ...prev, [field]: value }));
  };

  const probabilityLabel: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta" };
  const impactLabel: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto" };

  const SectionCard = ({
    icon: Icon,
    title,
    number,
    children,
    color = "primary",
  }: {
    icon: React.ElementType;
    title: string;
    number: string;
    children: React.ReactNode;
    color?: string;
  }) => (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${color}/10`}>
          <Icon className={`w-4 h-4 text-${color}`} />
        </div>
        <h3 className="font-semibold text-foreground text-sm">
          <span className="text-muted-foreground mr-1">{number}.</span>
          {title}
        </h3>
      </div>
      <div className="pl-10">{children}</div>
    </Card>
  );

  const renderField = (field: keyof CharterData, placeholder: string, multiline = false) => {
    if (!editing) {
      const value = charter[field];
      return value ? (
        <p className="text-sm text-foreground whitespace-pre-line">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">Não preenchido</p>
      );
    }
    if (multiline) {
      return (
        <Textarea
          placeholder={placeholder}
          value={charter[field]}
          onChange={(e) => update(field, e.target.value)}
          className="min-h-[80px] text-sm"
        />
      );
    }
    return (
      <Input
        placeholder={placeholder}
        value={charter[field]}
        onChange={(e) => update(field, e.target.value)}
        className="text-sm"
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Termo de Abertura do Projeto</h2>
              <p className="text-xs text-muted-foreground">Project Charter — TAP</p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              {editing ? (
                <>
                  <Button size="sm" onClick={handleSave} className="gap-1">
                    <Save className="w-4 h-4" /> Salvar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(false); fetchCharter(); }}>
                    Cancelar
                  </Button>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Título */}
        <SectionCard icon={FileText} title="Título do Projeto" number="1">
          {renderField("project_title", "Nome do projeto")}
        </SectionCard>

        {/* 2. Gerente */}
        <SectionCard icon={User} title="Gerente de Projeto" number="2">
          {renderField("project_manager", "Nome do gerente de projeto")}
        </SectionCard>

        {/* 3. Patrocinador */}
        <SectionCard icon={Briefcase} title="Patrocinador do Projeto" number="3">
          {renderField("sponsor", "Nome do patrocinador")}
        </SectionCard>

        {/* 4. Datas */}
        <SectionCard icon={Calendar} title="Data de Início e Término Previstas" number="4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-muted-foreground font-medium">Início</span>
              {editing ? (
                <Input type="date" value={charter.start_date} onChange={(e) => update("start_date", e.target.value)} className="text-sm" />
              ) : (
                <p className="text-sm text-foreground">
                  {charter.start_date ? new Date(charter.start_date + "T12:00:00").toLocaleDateString("pt-BR") : <span className="italic text-muted-foreground">Não definido</span>}
                </p>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground font-medium">Término</span>
              {editing ? (
                <Input type="date" value={charter.end_date} onChange={(e) => update("end_date", e.target.value)} className="text-sm" />
              ) : (
                <p className="text-sm text-foreground">
                  {charter.end_date ? new Date(charter.end_date + "T12:00:00").toLocaleDateString("pt-BR") : <span className="italic text-muted-foreground">Não definido</span>}
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* 5. Justificativa */}
      <SectionCard icon={Target} title="Justificativa do Projeto" number="5" color="warning">
        {renderField("justification", "Descreva a justificativa e o problema que o projeto resolve...", true)}
      </SectionCard>

      {/* 6. Objetivos */}
      <SectionCard icon={Target} title="Objetivos do Projeto" number="6" color="success">
        {renderField("objectives", "Liste os objetivos SMART do projeto...", true)}
      </SectionCard>

      {/* 7. Escopo */}
      <SectionCard icon={ClipboardList} title="Escopo do Projeto" number="7" color="info">
        <div className="space-y-3">
          <div>
            <Badge variant="outline" className="mb-2 text-xs bg-success/10 text-success border-success/30">Em Escopo</Badge>
            {renderField("in_scope", "O que está incluído no escopo do projeto...", true)}
          </div>
          <div>
            <Badge variant="outline" className="mb-2 text-xs bg-destructive/10 text-destructive border-destructive/30">Fora de Escopo</Badge>
            {renderField("out_scope", "O que NÃO está incluído no escopo...", true)}
          </div>
        </div>
      </SectionCard>

      {/* 8. Entregáveis */}
      <SectionCard icon={Package} title="Entregáveis Principais" number="8" color="primary">
        {renderField("deliverables", "Liste os principais entregáveis do projeto...", true)}
        {phases.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground font-medium">Fases cadastradas:</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {phases.map((p) => (
                <Badge key={p.id} variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                  {p.title}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 9. Premissas */}
        <SectionCard icon={ShieldCheck} title="Premissas" number="9" color="success">
          {renderField("premises", "Liste as premissas do projeto...", true)}
        </SectionCard>

        {/* 10. Restrições */}
        <SectionCard icon={Ban} title="Restrições" number="10" color="destructive">
          {renderField("restrictions", "Liste as restrições do projeto...", true)}
        </SectionCard>
      </div>

      {/* 11. Stakeholders */}
      <SectionCard icon={Users} title="Stakeholders Principais" number="11">
        {members.length > 0 ? (
          <div className="space-y-1.5">
            {members.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {m.full_name?.charAt(0)?.toUpperCase()}
                </div>
                <span className="font-medium text-foreground">{m.full_name}</span>
                {m.sector && (
                  <Badge variant="outline" className="text-xs">{m.sector}</Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Nenhum membro cadastrado no projeto</p>
        )}
      </SectionCard>

      {/* 12. Requisitos de Aprovação */}
      <SectionCard icon={CheckCircle2} title="Requisitos de Aprovação do Projeto" number="12" color="success">
        {renderField("approval_requirements", "Defina os critérios e requisitos de aprovação...", true)}
      </SectionCard>

      {/* 13. Riscos Iniciais */}
      <SectionCard icon={AlertTriangle} title="Riscos Iniciais Identificados" number="13" color="warning">
        {risks.length > 0 ? (
          <div className="space-y-2">
            {risks.map((risk) => (
              <div key={risk.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-card text-sm">
                <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground">{risk.description}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      Prob: {probabilityLabel[risk.probability] || risk.probability}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Impacto: {impactLabel[risk.impact] || risk.impact}
                    </Badge>
                    <Badge variant="outline" className="text-xs capitalize">{risk.status}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Nenhum risco cadastrado. Adicione riscos na aba "Riscos".</p>
        )}
      </SectionCard>
    </div>
  );
};
