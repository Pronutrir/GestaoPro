import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Lightbulb,
  Beaker,
  Rocket,
  AlertTriangle,
  Archive,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DashboardStats {
  totalProjects: number;
  ideacaoProjects: number;
  pocProjects: number;
  mvpProjects: number;
  blockedProjects: number;
  drawerProjects: number;
  emExecucaoProjects: number;
  totalBudgetPlanned: number;
  totalBudgetUsed: number;
  completionRate: number;
}

const Overview = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    ideacaoProjects: 0,
    pocProjects: 0,
    mvpProjects: 0,
    blockedProjects: 0,
    drawerProjects: 0,
    emExecucaoProjects: 0,
    totalBudgetPlanned: 0,
    totalBudgetUsed: 0,
    completionRate: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data: projects, error } = await supabase
        .from("projects")
        .select("status, budget_planned, budget_used, blockers");

      if (error) throw error;

      const ideacaoCount = projects?.filter((p) => p.status === "ideacao").length || 0;
      const pocCount = projects?.filter((p) => p.status === "poc").length || 0;
      const mvpCount = projects?.filter((p) => p.status === "mvp").length || 0;
      const blockedStatusCount =
        projects?.filter((p) => p.status === "blocked").length || 0;
      const drawerCount =
        projects?.filter((p) => p.status === "drawer").length || 0;
      const emExecucaoCount =
        projects?.filter((p) => p.status === "em-execucao").length || 0;
      const total = projects?.length || 0;

      const totalPlanned =
        projects?.reduce((sum, p) => sum + (Number(p.budget_planned) || 0), 0) ||
        0;
      const totalUsed =
        projects?.reduce((sum, p) => sum + (Number(p.budget_used) || 0), 0) || 0;

      setStats({
        totalProjects: total,
        ideacaoProjects: ideacaoCount,
        pocProjects: pocCount,
        mvpProjects: mvpCount,
        blockedProjects: blockedStatusCount,
        drawerProjects: drawerCount,
        emExecucaoProjects: emExecucaoCount,
        totalBudgetPlanned: totalPlanned,
        totalBudgetUsed: totalUsed,
        completionRate: total > 0 ? (emExecucaoCount / total) * 100 : 0,
      });
    } catch (error) {
      console.error("Erro ao buscar estatísticas:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const budgetProgress =
    stats.totalBudgetPlanned > 0
      ? (stats.totalBudgetUsed / stats.totalBudgetPlanned) * 100
      : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold text-foreground">
                Pipeline de Gestão de Projetos
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={() => navigate("/projects")}>
                Ver Todos os Projetos
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="space-y-8">
          {/* Title */}
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">
              Dashboard Geral
            </h2>
            <p className="text-muted-foreground">
              Visão geral do progresso e investimentos dos projetos
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Carregando dados...</p>
            </div>
          ) : (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <Card 
                  className="p-6 cursor-pointer transition-all hover:shadow-md hover:border-primary"
                  onClick={() => navigate("/projects")}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <LayoutDashboard className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Total de Projetos
                    </p>
                    <p className="text-3xl font-bold text-foreground">
                      {stats.totalProjects}
                    </p>
                  </div>
                </Card>

                <Card 
                  className="p-6 cursor-pointer transition-all hover:shadow-md hover:border-warning"
                  onClick={() => navigate("/projects?status=ideacao")}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                      <Lightbulb className="w-6 h-6 text-warning" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Ideação</p>
                    <p className="text-3xl font-bold text-foreground">
                      {stats.ideacaoProjects}
                    </p>
                  </div>
                </Card>

                <Card 
                  className="p-6 cursor-pointer transition-all hover:shadow-md hover:border-info"
                  onClick={() => navigate("/projects?status=poc")}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-info/10 rounded-lg flex items-center justify-center">
                      <Beaker className="w-6 h-6 text-info" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">POC</p>
                    <p className="text-3xl font-bold text-foreground">
                      {stats.pocProjects}
                    </p>
                  </div>
                </Card>

                <Card 
                  className="p-6 cursor-pointer transition-all hover:shadow-md hover:border-accent"
                  onClick={() => navigate("/projects?status=mvp")}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                      <Rocket className="w-6 h-6 text-accent-foreground" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">MVP</p>
                    <p className="text-3xl font-bold text-foreground">
                      {stats.mvpProjects}
                    </p>
                  </div>
                </Card>

                <Card 
                  className="p-6 cursor-pointer transition-all hover:shadow-md hover:border-destructive"
                  onClick={() => navigate("/projects?status=blocked")}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-destructive" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Bloqueio
                    </p>
                    <p className="text-3xl font-bold text-foreground">
                      {stats.blockedProjects}
                    </p>
                  </div>
                </Card>

                <Card 
                  className="p-6 cursor-pointer transition-all hover:shadow-md hover:border-secondary"
                  onClick={() => navigate("/projects?status=drawer")}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-secondary/30 rounded-lg flex items-center justify-center">
                      <Archive className="w-6 h-6 text-secondary-foreground" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Gaveta
                    </p>
                    <p className="text-3xl font-bold text-foreground">
                      {stats.drawerProjects}
                    </p>
                  </div>
                </Card>

                <Card 
                  className="p-6 cursor-pointer transition-all hover:shadow-md hover:border-success"
                  onClick={() => navigate("/projects?status=em-execucao")}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-success" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Em Execução
                    </p>
                    <p className="text-3xl font-bold text-foreground">
                      {stats.emExecucaoProjects}
                    </p>
                  </div>
                </Card>
              </div>

              {/* Budget and Progress Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Budget Card */}
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Controle de Investimento
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">
                          Orçamento Planejado
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          R$ {stats.totalBudgetPlanned.toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Valor Utilizado
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          R$ {stats.totalBudgetUsed.toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Progresso de Utilização
                        </span>
                        <span className="font-medium text-foreground">
                          {budgetProgress.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Saldo Disponível
                        </span>
                        <span
                          className={`text-lg font-bold ${
                            stats.totalBudgetPlanned - stats.totalBudgetUsed >= 0
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          R${" "}
                          {(
                            stats.totalBudgetPlanned - stats.totalBudgetUsed
                          ).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Completion Rate Card */}
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-success" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Taxa de Execução
                    </h3>
                  </div>

                  <div className="flex items-center justify-center py-8">
                    <div className="relative w-48 h-48">
                      <svg className="w-full h-full -rotate-90">
                        <circle
                          cx="96"
                          cy="96"
                          r="88"
                          stroke="currentColor"
                          strokeWidth="12"
                          fill="none"
                          className="text-muted"
                        />
                        <circle
                          cx="96"
                          cy="96"
                          r="88"
                          stroke="currentColor"
                          strokeWidth="12"
                          fill="none"
                          strokeDasharray={`${
                            (stats.completionRate / 100) * 553
                          } 553`}
                          className="text-success transition-all"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-bold text-foreground">
                          {stats.completionRate.toFixed(0)}%
                        </span>
                        <span className="text-sm text-muted-foreground mt-1">
                          Em Execução
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-6 gap-2 pt-6 border-t border-border">
                    <div className="text-center">
                      <p className="text-xl font-bold text-warning">
                        {stats.ideacaoProjects}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Ideação
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-info">
                        {stats.pocProjects}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        POC
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-accent-foreground">
                        {stats.mvpProjects}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        MVP
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-destructive">
                        {stats.blockedProjects}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Bloqueio
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-secondary-foreground">
                        {stats.drawerProjects}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Gaveta
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-success">
                        {stats.emExecucaoProjects}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Em Execução
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Overview;