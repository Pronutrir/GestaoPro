import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { EditActivityDialog } from "@/components/EditActivityDialog";
import {
  ArrowLeft,
  Plus,
  Calendar,
  DollarSign,
  CheckCircle2,
  Circle,
  Clock,
  Pencil,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assignees: string[];
  budget_planned: number;
  budget_used: number;
  owner: string | null;
  blockers: string | null;
}

interface Activity {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  cost: number;
  hours: number;
}

const ProjectDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newActivity, setNewActivity] = useState("");
  const [newActivityAssigned, setNewActivityAssigned] = useState("");
  const [newActivityStartDate, setNewActivityStartDate] = useState("");
  const [newActivityEndDate, setNewActivityEndDate] = useState("");
  const [newActivityCost, setNewActivityCost] = useState("");
  const [newActivityHours, setNewActivityHours] = useState("");
  const [newInvestment, setNewInvestment] = useState("");
  const [investmentDescription, setInvestmentDescription] = useState("");
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showAddInvestment, setShowAddInvestment] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editActivityDialogOpen, setEditActivityDialogOpen] = useState(false);
  const [activityInvestments, setActivityInvestments] = useState<Record<string, any[]>>({});
  const [showAddActivityInvestment, setShowAddActivityInvestment] = useState<string | null>(null);
  const [newActivityInvestment, setNewActivityInvestment] = useState("");
  const [activityInvestmentDescription, setActivityInvestmentDescription] = useState("");

  useEffect(() => {
    if (id) {
      fetchProjectData();
    }
  }, [id]);

  const fetchProjectData = async () => {
    try {
      // Buscar projeto
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Buscar atividades
      const { data: activitiesData, error: activitiesError } = await supabase
        .from("activities")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false });

      if (activitiesError) throw activitiesError;
      setActivities(activitiesData || []);

      // Buscar investimentos de cada atividade
      if (activitiesData && activitiesData.length > 0) {
        const activityIds = activitiesData.map(a => a.id);
        const { data: investmentsData, error: investmentsError } = await supabase
          .from("activity_investments")
          .select("*")
          .in("activity_id", activityIds)
          .order("recorded_at", { ascending: false });

        if (!investmentsError && investmentsData) {
          const investmentsByActivity: Record<string, any[]> = {};
          investmentsData.forEach((inv) => {
            if (!investmentsByActivity[inv.activity_id]) {
              investmentsByActivity[inv.activity_id] = [];
            }
            investmentsByActivity[inv.activity_id].push(inv);
          });
          setActivityInvestments(investmentsByActivity);
        }
      }
    } catch (error) {
      console.error("Erro ao buscar dados do projeto:", error);
      toast({
        title: "Erro ao carregar projeto",
        description: "Não foi possível carregar os dados do projeto.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddActivity = async () => {
    if (!newActivity.trim() || !id) return;

    try {
      const { error } = await supabase.from("activities").insert({
        project_id: id,
        title: newActivity,
        status: "pending",
        assigned_to: newActivityAssigned || null,
        start_date: newActivityStartDate || null,
        end_date: newActivityEndDate || null,
        cost: parseFloat(newActivityCost) || 0,
        hours: parseFloat(newActivityHours) || 0,
      });

      if (error) throw error;

      toast({
        title: "Atividade adicionada!",
        description: "A atividade foi criada com sucesso.",
      });

      setNewActivity("");
      setNewActivityAssigned("");
      setNewActivityStartDate("");
      setNewActivityEndDate("");
      setNewActivityCost("");
      setNewActivityHours("");
      setShowAddActivity(false);
      fetchProjectData();
    } catch (error) {
      console.error("Erro ao adicionar atividade:", error);
      toast({
        title: "Erro ao adicionar atividade",
        description: "Não foi possível adicionar a atividade.",
        variant: "destructive",
      });
    }
  };

  const handleToggleActivity = async (activityId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "completed" ? "pending" : "completed";
      const completedAt = newStatus === "completed" ? new Date().toISOString() : null;

      const { error } = await supabase
        .from("activities")
        .update({ status: newStatus, completed_at: completedAt })
        .eq("id", activityId);

      if (error) throw error;

      fetchProjectData();
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);
      toast({
        title: "Erro ao atualizar atividade",
        description: "Não foi possível atualizar a atividade.",
        variant: "destructive",
      });
    }
  };

  const handleAddInvestment = async () => {
    const amount = parseFloat(newInvestment);
    if (!amount || amount <= 0 || !id || !project) return;

    try {
      // Adicionar ao histórico
      const { error: historyError } = await supabase
        .from("investment_history")
        .insert({
          project_id: id,
          amount: amount,
          description: investmentDescription,
        });

      if (historyError) throw historyError;

      // Atualizar budget_used do projeto
      const newBudgetUsed = Number(project.budget_used) + amount;
      const { error: updateError } = await supabase
        .from("projects")
        .update({ budget_used: newBudgetUsed })
        .eq("id", id);

      if (updateError) throw updateError;

      toast({
        title: "Investimento registrado!",
        description: `R$ ${amount.toFixed(2)} adicionado ao projeto.`,
      });

      setNewInvestment("");
      setInvestmentDescription("");
      setShowAddInvestment(false);
      fetchProjectData();
    } catch (error) {
      console.error("Erro ao registrar investimento:", error);
      toast({
        title: "Erro ao registrar investimento",
        description: "Não foi possível registrar o investimento.",
        variant: "destructive",
      });
    }
  };

  const handleAddActivityInvestment = async (activityId: string) => {
    const amount = parseFloat(newActivityInvestment);
    if (!amount || amount <= 0) return;

    try {
      const { error } = await supabase
        .from("activity_investments")
        .insert({
          activity_id: activityId,
          amount: amount,
          description: activityInvestmentDescription,
        });

      if (error) throw error;

      toast({
        title: "Investimento adicionado!",
        description: `R$ ${amount.toFixed(2)} registrado na atividade.`,
      });

      setNewActivityInvestment("");
      setActivityInvestmentDescription("");
      setShowAddActivityInvestment(null);
      fetchProjectData();
    } catch (error) {
      console.error("Erro ao adicionar investimento:", error);
      toast({
        title: "Erro ao adicionar investimento",
        description: "Não foi possível registrar o investimento.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta atividade?")) return;

    try {
      const { error } = await supabase
        .from("activities")
        .delete()
        .eq("id", activityId);

      if (error) throw error;

      toast({
        title: "Atividade excluída!",
        description: "A atividade foi removida com sucesso.",
      });

      fetchProjectData();
    } catch (error) {
      console.error("Erro ao excluir atividade:", error);
      toast({
        title: "Erro ao excluir atividade",
        description: "Não foi possível excluir a atividade.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando projeto...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Projeto não encontrado</p>
          <Button onClick={() => navigate("/projects")}>Voltar</Button>
        </div>
      </div>
    );
  }

  const completedActivities = activities.filter((a) => a.status === "completed").length;
  const activityProgress =
    activities.length > 0 ? (completedActivities / activities.length) * 100 : 0;
  const budgetProgress =
    project.budget_planned > 0
      ? (project.budget_used / project.budget_planned) * 100
      : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">{project.title}</h1>
              <p className="text-sm text-muted-foreground">
                {project.description || "Sem descrição"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                className={
                  project.priority === "high"
                    ? "bg-destructive"
                    : project.priority === "medium"
                    ? "bg-warning"
                    : "bg-muted"
                }
              >
                {project.priority === "high" && "Alta"}
                {project.priority === "medium" && "Média"}
                {project.priority === "low" && "Baixa"}
              </Badge>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingProject(project);
                  setEditDialogOpen(true);
                }}
              >
                Editar Projeto
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Activities */}
          <div className="lg:col-span-2 space-y-6">
            {/* Project Info Card */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Informações do Projeto</h2>
              <div className="space-y-3">
                {project.owner && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Responsável:</span>
                    <span className="font-medium text-foreground">{project.owner}</span>
                  </div>
                )}
                {project.blockers && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-xs font-medium text-destructive mb-1">⚠️ Bloqueios</p>
                    <p className="text-sm text-foreground">{project.blockers}</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-foreground">Atividades</h2>
                <Button
                  size="sm"
                  onClick={() => setShowAddActivity(!showAddActivity)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar
                </Button>
              </div>

              {showAddActivity && (
                <div className="mb-6 p-4 border border-border rounded-lg space-y-3">
                  <Input
                    placeholder="Nome da atividade *"
                    value={newActivity}
                    onChange={(e) => setNewActivity(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Responsável"
                      value={newActivityAssigned}
                      onChange={(e) => setNewActivityAssigned(e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder="Horas estimadas"
                      value={newActivityHours}
                      onChange={(e) => setNewActivityHours(e.target.value)}
                      step="0.5"
                      min="0"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Início</Label>
                      <Input
                        type="date"
                        value={newActivityStartDate}
                        onChange={(e) => setNewActivityStartDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Fim</Label>
                      <Input
                        type="date"
                        value={newActivityEndDate}
                        onChange={(e) => setNewActivityEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <Input
                    type="number"
                    placeholder="Custo (R$)"
                    value={newActivityCost}
                    onChange={(e) => setNewActivityCost(e.target.value)}
                    step="0.01"
                    min="0"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleAddActivity}>Salvar</Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowAddActivity(false);
                        setNewActivity("");
                        setNewActivityAssigned("");
                        setNewActivityStartDate("");
                        setNewActivityEndDate("");
                        setNewActivityCost("");
                        setNewActivityHours("");
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhuma atividade cadastrada
                  </p>
                ) : (
                  activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="border border-border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={activity.status === "completed"}
                          onCheckedChange={() =>
                            handleToggleActivity(activity.id, activity.status)
                          }
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p
                            className={`text-sm font-medium ${
                              activity.status === "completed"
                                ? "line-through text-muted-foreground"
                                : "text-foreground"
                            }`}
                          >
                            {activity.title}
                          </p>
                          {activity.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {activity.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {activity.assigned_to && (
                              <span className="text-xs text-muted-foreground">
                                👤 {activity.assigned_to}
                              </span>
                            )}
                            {activity.hours > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ⏱️ {activity.hours}h
                              </span>
                            )}
                            {activity.cost > 0 && (
                              <span className="text-xs text-muted-foreground">
                                💰 R$ {activity.cost.toFixed(2)}
                              </span>
                            )}
                          </div>
                          {(activity.start_date || activity.end_date) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {activity.start_date &&
                                new Date(activity.start_date).toLocaleDateString("pt-BR")}
                              {activity.start_date && activity.end_date && " → "}
                              {activity.end_date &&
                                new Date(activity.end_date).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                          {activity.completed_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              ✓ Concluída em{" "}
                              {new Date(activity.completed_at).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingActivity(activity);
                              setEditActivityDialogOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteActivity(activity.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          {activity.status === "completed" ? (
                            <CheckCircle2 className="w-4 h-4 text-success mt-2" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground mt-2" />
                          )}
                        </div>
                      </div>

                      {/* Activity Investments */}
                      <div className="border-t border-border pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-foreground">
                            Orçamento da Atividade
                          </h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setShowAddActivityInvestment(
                                showAddActivityInvestment === activity.id ? null : activity.id
                              )
                            }
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>

                        {showAddActivityInvestment === activity.id && (
                          <div className="space-y-2 mb-3 p-2 bg-accent/50 rounded">
                            <Input
                              type="number"
                              placeholder="Valor (R$)"
                              value={newActivityInvestment}
                              onChange={(e) => setNewActivityInvestment(e.target.value)}
                              step="0.01"
                              min="0"
                            />
                            <Input
                              placeholder="Descrição"
                              value={activityInvestmentDescription}
                              onChange={(e) => setActivityInvestmentDescription(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleAddActivityInvestment(activity.id)}
                              >
                                Adicionar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setShowAddActivityInvestment(null);
                                  setNewActivityInvestment("");
                                  setActivityInvestmentDescription("");
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          {activityInvestments[activity.id]?.length > 0 ? (
                            activityInvestments[activity.id].map((inv) => (
                              <div
                                key={inv.id}
                                className="text-xs flex justify-between items-center p-2 bg-accent/30 rounded"
                              >
                                <span className="text-muted-foreground">
                                  {inv.description || "Sem descrição"}
                                </span>
                                <span className="font-medium text-foreground">
                                  R$ {Number(inv.amount).toFixed(2)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              Nenhum investimento registrado
                            </p>
                          )}
                        </div>

                        {activityInvestments[activity.id]?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border text-xs font-semibold flex justify-between">
                            <span className="text-muted-foreground">Total:</span>
                            <span className="text-foreground">
                              R${" "}
                              {activityInvestments[activity.id]
                                .reduce((sum, inv) => sum + Number(inv.amount), 0)
                                .toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {activities.length > 0 && (
                <div className="mt-6 pt-6 border-t border-border">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-medium text-foreground">
                      {completedActivities} de {activities.length} concluídas (
                      {activityProgress.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success transition-all"
                      style={{ width: `${activityProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Right Column - Investment */}
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Investimento</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Planejado</span>
                    <span className="text-sm font-medium text-foreground">
                      R$ {project.budget_planned?.toLocaleString("pt-BR") || "0,00"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Utilizado</span>
                    <span className="text-sm font-medium text-foreground">
                      R$ {project.budget_used?.toLocaleString("pt-BR") || "0,00"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Utilização</span>
                    <span className="font-medium text-foreground">
                      {budgetProgress.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        budgetProgress > 100 ? "bg-destructive" : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-muted-foreground">Saldo</span>
                    <span
                      className={`text-lg font-bold ${
                        project.budget_planned - project.budget_used >= 0
                          ? "text-success"
                          : "text-destructive"
                      }`}
                    >
                      R${" "}
                      {(
                        project.budget_planned - project.budget_used
                      ).toLocaleString("pt-BR")}
                    </span>
                  </div>

                  <Button
                    className="w-full gap-2"
                    onClick={() => setShowAddInvestment(!showAddInvestment)}
                  >
                    <Plus className="w-4 h-4" />
                    Registrar Gasto
                  </Button>

                  {showAddInvestment && (
                    <div className="mt-4 p-4 border border-border rounded-lg space-y-3">
                      <Input
                        type="number"
                        placeholder="Valor (R$)"
                        value={newInvestment}
                        onChange={(e) => setNewInvestment(e.target.value)}
                        step="0.01"
                        min="0"
                      />
                      <Textarea
                        placeholder="Descrição (opcional)"
                        value={investmentDescription}
                        onChange={(e) => setInvestmentDescription(e.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button onClick={handleAddInvestment} className="flex-1">
                          Salvar
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowAddInvestment(false);
                            setNewInvestment("");
                            setInvestmentDescription("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {project.due_date && (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-warning" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Prazo de Entrega
                  </h3>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {new Date(project.due_date).toLocaleDateString("pt-BR")}
                </p>
              </Card>
            )}
          </div>
        </div>

        <EditProjectDialog
          project={editingProject}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onProjectUpdated={fetchProjectData}
        />
        <EditActivityDialog
          activity={editingActivity}
          open={editActivityDialogOpen}
          onOpenChange={setEditActivityDialogOpen}
          onActivityUpdated={fetchProjectData}
        />
      </main>
    </div>
  );
};

export default ProjectDetails;
