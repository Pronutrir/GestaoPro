import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, HelpCircle, Lightbulb, Rocket, AlertTriangle, ShieldCheck, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AddProjectDialogProps {
  onProjectAdded: () => void;
  defaultCategory?: string;
}

interface DraftRisk { description: string; }
interface DraftAssumption { description: string; }
interface DraftDep {
  description: string;
  depends_on: string;
  linked_project_id: string;
  responsible: string;
  status: string;
}

const DEP_STATUS: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  resolvida: "Resolvida",
  bloqueada: "Bloqueada",
};

export const AddProjectDialog = ({ onProjectAdded, defaultCategory }: AddProjectDialogProps) => {
  const [profiles, setProfiles] = useState<{ id: string; full_name: string; sector: string | null }[]>([]);
  const [otherProjects, setOtherProjects] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: profileData }, { data: adminRoles }, { data: projData }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, sector").not("full_name", "is", null).order("full_name"),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
        supabase.from("projects").select("id, title").order("title"),
      ]);
      const adminIds = new Set((adminRoles || []).map(r => r.user_id));
      if (profileData) setProfiles(profileData.filter(p => p.full_name && !adminIds.has(p.id)));
      if (projData) setOtherProjects(projData);
    };
    fetchData();
  }, []);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const initialForm = {
    title: "",
    description: "",
    status: "ideacao",
    priority: "medium",
    due_date: "",
    assignees: "",
    budget_planned: "",
    owner: "",
    blockers: "",
    category: defaultCategory || "",
    program: "",
    // TAP — POR QUÊ
    project_type: "",
    objective: "",
    problem_statement: "",
    root_cause: "",
    // TAP — O QUÊ
    scope: "",
    out_of_scope: "",
    restrictions: "",
    regulatory_requirements: "",
    // TAP — PARA QUÊ
    expected_benefits: "",
    solved_problem: "",
  };

  const [formData, setFormData] = useState(initialForm);
  const [risks, setRisks] = useState<DraftRisk[]>([]);
  const [assumptions, setAssumptions] = useState<DraftAssumption[]>([]);
  const [dependencies, setDependencies] = useState<DraftDep[]>([]);

  const [newRisk, setNewRisk] = useState("");
  const [newAssumption, setNewAssumption] = useState("");
  const [newDep, setNewDep] = useState<DraftDep>({
    description: "", depends_on: "", linked_project_id: "", responsible: "", status: "pendente",
  });

  const resetAll = () => {
    setFormData({ ...initialForm, category: defaultCategory || "general" });
    setRisks([]);
    setAssumptions([]);
    setDependencies([]);
    setNewRisk("");
    setNewAssumption("");
    setNewDep({ description: "", depends_on: "", linked_project_id: "", responsible: "", status: "pendente" });
  };

  const addRisk = () => {
    if (!newRisk.trim()) return;
    setRisks([...risks, { description: newRisk.trim() }]);
    setNewRisk("");
  };
  const addAssumption = () => {
    if (!newAssumption.trim()) return;
    setAssumptions([...assumptions, { description: newAssumption.trim() }]);
    setNewAssumption("");
  };
  const addDep = () => {
    if (!newDep.description.trim()) return;
    setDependencies([...dependencies, { ...newDep, description: newDep.description.trim() }]);
    setNewDep({ description: "", depends_on: "", linked_project_id: "", responsible: "", status: "pendente" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const assigneesArray = formData.assignees
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a);

      const { data: created, error } = await supabase.from("projects").insert({
        title: formData.title,
        description: formData.description,
        status: formData.status,
        priority: formData.priority,
        due_date: formData.due_date || null,
        assignees: assigneesArray,
        budget_planned: parseFloat(formData.budget_planned) || 0,
        budget_used: 0,
        owner: formData.owner || null,
        blockers: formData.blockers,
        category: formData.category || "general",
        program: formData.program || null,
        project_type: formData.project_type || null,
        objective: formData.objective || null,
        problem_statement: formData.problem_statement || null,
        root_cause: formData.root_cause || null,
        scope: formData.scope || null,
        out_of_scope: formData.out_of_scope || null,
        restrictions: formData.restrictions || null,
        regulatory_requirements: formData.regulatory_requirements || null,
        expected_benefits: formData.expected_benefits || null,
        solved_problem: formData.solved_problem || null,
      }).select("id").single();

      if (error) throw error;
      const projectId = created.id;

      // Insert risks/assumptions/dependencies in parallel
      await Promise.all([
        risks.length > 0
          ? supabase.from("risks").insert(
              risks.map(r => ({
                project_id: projectId,
                description: r.description,
                probability: "medium",
                impact: "medium",
                status: "identified",
              }))
            )
          : Promise.resolve(),
        assumptions.length > 0
          ? supabase.from("assumptions").insert(
              assumptions.map(a => ({
                project_id: projectId,
                description: a.description,
                status: "active",
              }))
            )
          : Promise.resolve(),
        dependencies.length > 0
          ? supabase.from("project_dependencies").insert(
              dependencies.map(d => ({
                project_id: projectId,
                description: d.description,
                depends_on: d.depends_on || null,
                linked_project_id: d.linked_project_id || null,
                responsible: d.responsible || null,
                status: d.status,
              }))
            )
          : Promise.resolve(),
      ]);

      toast({
        title: "Projeto criado!",
        description: "O projeto foi adicionado com sucesso.",
      });

      resetAll();
      setOpen(false);
      onProjectAdded();
    } catch (error) {
      console.error("Erro ao criar projeto:", error);
      toast({
        title: "Erro ao criar projeto",
        description: "Não foi possível criar o projeto. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const SectionHeader = ({ icon: Icon, title, subtitle, color }: { icon: React.ElementType; title: string; subtitle: string; color: string }) => (
    <div className="flex items-center gap-3 pt-3 pb-2 border-b border-border">
      <div className={`w-8 h-8 rounded-lg bg-${color}/10 flex items-center justify-center`}>
        <Icon className={`w-4 h-4 text-${color}`} />
      </div>
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Projeto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Criar Novo Projeto</DialogTitle>
            <DialogDescription>
              Preencha os dados do projeto e a Ficha de Abertura (TAP).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Dados básicos */}
            <div className="grid gap-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="budget_planned">Orçamento Planejado (R$)</Label>
                <CurrencyInput
                  id="budget_planned"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={formData.budget_planned}
                  onChange={(e) => setFormData({ ...formData, budget_planned: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="due_date">Data de Entrega</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ideacao">Ideação</SelectItem>
                    <SelectItem value="poc">POC</SelectItem>
                    <SelectItem value="mvp">MVP</SelectItem>
                    <SelectItem value="blocked">Bloqueio</SelectItem>
                    <SelectItem value="drawer">Gaveta</SelectItem>
                    <SelectItem value="em-execucao">Em Execução</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="priority">Prioridade</Label>
                <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Líder do Projeto</Label>
                <Select
                  value={formData.owner || "_none"}
                  onValueChange={(v) => setFormData({ ...formData, owner: v === "_none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o líder" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sem líder</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.full_name!} value={p.full_name!}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Setor</Label>
                <Input
                  value={(() => {
                    const match = profiles.find(p => p.full_name === formData.owner);
                    return match?.sector || "";
                  })()}
                  readOnly disabled placeholder="Selecione um líder" className="bg-muted"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="program">Programa</Label>
              <Input
                id="program"
                placeholder="Nome do programa (opcional)"
                value={formData.program}
                onChange={(e) => setFormData({ ...formData, program: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="blockers">Bloqueios/Impedimentos</Label>
              <Textarea
                id="blockers"
                placeholder="Descreva possíveis bloqueios ou impedimentos..."
                value={formData.blockers}
                onChange={(e) => setFormData({ ...formData, blockers: e.target.value })}
                rows={2}
              />
            </div>

            {/* ========== TAP - POR QUÊ ========== */}
            <SectionHeader icon={HelpCircle} title="POR QUÊ?" subtitle="Justificativa da iniciativa" color="warning" />
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="project_type">Tipo do Projeto</Label>
                <Select
                  value={formData.project_type || "_none"}
                  onValueChange={(v) => setFormData({ ...formData, project_type: v === "_none" ? "" : v })}
                >
                  <SelectTrigger id="project_type"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Não definido</SelectItem>
                    <SelectItem value="estrategico">Estratégico</SelectItem>
                    <SelectItem value="operacional">Operacional</SelectItem>
                    <SelectItem value="novos_negocios">Novos Negócios</SelectItem>
                    <SelectItem value="parceria">Parceria</SelectItem>
                    <SelectItem value="melhoria_processo">Melhoria de Processo</SelectItem>
                    <SelectItem value="inovacao">Inovação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="objective">Objetivo (O que será feito?)</Label>
                <Input
                  id="objective"
                  placeholder="Descreva o objetivo principal"
                  value={formData.objective}
                  onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="problem_statement">Problema / Necessidade de Melhoria</Label>
              <Textarea
                id="problem_statement"
                placeholder="Qual problema motivou este projeto?"
                value={formData.problem_statement}
                onChange={(e) => setFormData({ ...formData, problem_statement: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="root_cause">Causa Raiz</Label>
              <Textarea
                id="root_cause"
                placeholder="Qual a origem do problema?"
                value={formData.root_cause}
                onChange={(e) => setFormData({ ...formData, root_cause: e.target.value })}
                rows={2}
              />
            </div>

            {/* ========== TAP - O QUÊ ========== */}
            <SectionHeader icon={Lightbulb} title="O QUÊ?" subtitle="Definição e fronteiras" color="primary" />
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="scope">Escopo (em escopo)</Label>
                <Textarea id="scope" placeholder="O que será entregue..." value={formData.scope}
                  onChange={(e) => setFormData({ ...formData, scope: e.target.value })} rows={2} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="out_of_scope">Fora do Escopo</Label>
                <Textarea id="out_of_scope" placeholder="O que NÃO faz parte..." value={formData.out_of_scope}
                  onChange={(e) => setFormData({ ...formData, out_of_scope: e.target.value })} rows={2} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="restrictions">Restrições</Label>
                <Textarea id="restrictions" placeholder="Limitações de tempo, custo, recursos..." value={formData.restrictions}
                  onChange={(e) => setFormData({ ...formData, restrictions: e.target.value })} rows={2} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="regulatory_requirements">Requisitos Regulamentares</Label>
                <Textarea id="regulatory_requirements" placeholder="Normas e regulamentações aplicáveis..." value={formData.regulatory_requirements}
                  onChange={(e) => setFormData({ ...formData, regulatory_requirements: e.target.value })} rows={2} />
              </div>
            </div>

            {/* Premissas */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-success" /> Premissas
                <Badge variant="outline" className="text-[10px] ml-1">{assumptions.length}</Badge>
              </Label>
              {assumptions.length > 0 && (
                <div className="space-y-1.5">
                  {assumptions.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded border border-border bg-card text-sm">
                      <ShieldCheck className="w-3.5 h-3.5 text-success flex-shrink-0" />
                      <span className="flex-1">{a.description}</span>
                      <button type="button" onClick={() => setAssumptions(assumptions.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Nova premissa..."
                  value={newAssumption}
                  onChange={(e) => setNewAssumption(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAssumption(); } }}
                  className="text-sm h-8"
                />
                <Button type="button" size="sm" onClick={addAssumption} className="h-8 gap-1">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </Button>
              </div>
            </div>

            {/* Riscos */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" /> Riscos
                <Badge variant="outline" className="text-[10px] ml-1">{risks.length}</Badge>
              </Label>
              {risks.length > 0 && (
                <div className="space-y-1.5">
                  {risks.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded border border-border bg-card text-sm">
                      <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                      <span className="flex-1">{r.description}</span>
                      <button type="button" onClick={() => setRisks(risks.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Novo risco..."
                  value={newRisk}
                  onChange={(e) => setNewRisk(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRisk(); } }}
                  className="text-sm h-8"
                />
                <Button type="button" size="sm" onClick={addRisk} className="h-8 gap-1">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </Button>
              </div>
            </div>

            {/* Dependências */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-primary" /> Dependências
                <Badge variant="outline" className="text-[10px] ml-1">{dependencies.length}</Badge>
              </Label>
              {dependencies.length > 0 && (
                <div className="space-y-1.5">
                  {dependencies.map((d, i) => {
                    const linked = otherProjects.find((p) => p.id === d.linked_project_id);
                    return (
                      <div key={i} className="p-2.5 rounded border border-border bg-card text-sm">
                        <div className="flex items-start gap-2">
                          <Link2 className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{d.description}</p>
                            <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                              {d.depends_on && <span>De: <strong className="text-foreground">{d.depends_on}</strong></span>}
                              {linked && <span>→ <Badge variant="outline" className="text-[10px]">{linked.title}</Badge></span>}
                              {d.responsible && <span>Resp.: {d.responsible}</span>}
                              <Badge variant="outline" className="text-[10px]">{DEP_STATUS[d.status]}</Badge>
                            </div>
                          </div>
                          <button type="button" onClick={() => setDependencies(dependencies.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="p-2.5 rounded border border-dashed border-border space-y-2">
                <Input placeholder="Qual é a dependência?" value={newDep.description}
                  onChange={(e) => setNewDep({ ...newDep, description: e.target.value })} className="text-sm h-8" />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="De quem dependemos?" value={newDep.depends_on}
                    onChange={(e) => setNewDep({ ...newDep, depends_on: e.target.value })} className="text-sm h-8" />
                  <Input placeholder="Responsável (opcional)" value={newDep.responsible}
                    onChange={(e) => setNewDep({ ...newDep, responsible: e.target.value })} className="text-sm h-8" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={newDep.linked_project_id || "_none"}
                    onValueChange={(v) => setNewDep({ ...newDep, linked_project_id: v === "_none" ? "" : v })}>
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
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" size="sm" onClick={addDep} className="w-full gap-1 h-8">
                  <Plus className="w-3.5 h-3.5" /> Adicionar dependência
                </Button>
              </div>
            </div>

            {/* ========== TAP - PARA QUÊ ========== */}
            <SectionHeader icon={Rocket} title="PARA QUÊ?" subtitle="Benefícios esperados (futuro)" color="success" />
            <div className="grid gap-2">
              <Label htmlFor="expected_benefits">Benefícios Esperados</Label>
              <Textarea id="expected_benefits" placeholder="Quais ganhos o projeto trará?" value={formData.expected_benefits}
                onChange={(e) => setFormData({ ...formData, expected_benefits: e.target.value })} rows={2} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="solved_problem">Qual benefício / problema irá solucionar?</Label>
              <Textarea id="solved_problem" placeholder="Como medirá o sucesso?" value={formData.solved_problem}
                onChange={(e) => setFormData({ ...formData, solved_problem: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Criando..." : "Criar Projeto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
