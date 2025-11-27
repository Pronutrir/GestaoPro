import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import {
  ArrowLeft,
  Plus,
  Calendar,
  DollarSign,
  CheckCircle2,
  Circle,
  Clock,
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
}

interface Activity {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
}

const ProjectDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newActivity, setNewActivity] = useState("");
  const [newInvestment, setNewInvestment] = useState("");
  const [investmentDescription, setInvestmentDescription] = useState("");
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showAddInvestment, setShowAddInvestment] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

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
      });

      if (error) throw error;

      toast({
        title: "Atividade adicionada!",
        description: "A atividade foi criada com sucesso.",
      });

      setNewActivity("");
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
                <div className="mb-6 p-4 border border-border rounded-lg">
                  <Input
                    placeholder="Nome da atividade"
                    value={newActivity}
                    onChange={(e) => setNewActivity(e.target.value)}
                    className="mb-3"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleAddActivity}>Salvar</Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowAddActivity(false);
                        setNewActivity("");
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
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    >
                      <Checkbox
                        checked={activity.status === "completed"}
                        onCheckedChange={() =>
                          handleToggleActivity(activity.id, activity.status)
                        }
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p
                          className={`text-sm ${
                            activity.status === "completed"
                              ? "line-through text-muted-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {activity.title}
                        </p>
                        {activity.completed_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Concluída em{" "}
                            {new Date(activity.completed_at).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                      {activity.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground" />
                      )}
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
      </main>
    </div>
  );
};

export default ProjectDetails;
