import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  AlertTriangle,
  Home,
  Calendar,
  DollarSign,
  User,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

const BlockedProjects = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchBlockedProjects();
  }, []);

  const fetchBlockedProjects = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .not("blockers", "is", null)
        .neq("blockers", "")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error("Erro ao buscar projetos bloqueados:", error);
      toast({
        title: "Erro ao carregar projetos",
        description: "Não foi possível carregar os projetos bloqueados.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-info text-info-foreground",
    high: "bg-destructive text-destructive-foreground",
  };

  const statusLabels: Record<string, string> = {
    todo: "A Fazer",
    "in-progress": "Em Progresso",
    done: "Concluído",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-destructive rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive-foreground" />
              </div>
              <h1 className="text-xl font-bold text-foreground">
                Projetos com Bloqueios
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="outline" onClick={() => navigate("/projects")}>
                Ver Todos os Projetos
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Info Banner */}
          <Card className="p-6 bg-destructive/10 border-destructive/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-destructive rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  Acompanhamento de Bloqueios
                </h2>
                <p className="text-sm text-muted-foreground">
                  Esta página mostra todos os projetos que possuem bloqueios
                  identificados. Revise e resolva os bloqueios para manter os
                  projetos em movimento.
                </p>
              </div>
            </div>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Bloqueados
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {projects.length}
                  </p>
                </div>
                <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Em Progresso</p>
                  <p className="text-2xl font-bold text-foreground">
                    {
                      projects.filter((p) => p.status === "in-progress")
                        .length
                    }
                  </p>
                </div>
                <div className="w-10 h-10 bg-info/10 rounded-lg flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5 text-info" />
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Orçamento Afetado
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    R${" "}
                    {projects
                      .reduce(
                        (sum, p) => sum + (Number(p.budget_planned) || 0),
                        0
                      )
                      .toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-warning" />
                </div>
              </div>
            </Card>
          </div>

          {/* Projects List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">
                Carregando projetos bloqueados...
              </p>
            </div>
          ) : projects.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-success" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Nenhum Bloqueio Ativo
                </h3>
                <p className="text-sm text-muted-foreground">
                  Ótimo! Não há projetos com bloqueios no momento.
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => (
                <Card key={project.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">
                            {project.title}
                          </h3>
                          {project.description && (
                            <p className="text-sm text-muted-foreground">
                              {project.description}
                            </p>
                          )}
                        </div>
                        <Badge
                          className={priorityColors[project.priority]}
                        >
                          {project.priority === "low"
                            ? "Baixa"
                            : project.priority === "medium"
                            ? "Média"
                            : "Alta"}
                        </Badge>
                      </div>

                      {/* Blocker Alert */}
                      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-foreground mb-1">
                              Bloqueio Identificado:
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {project.blockers}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <LayoutDashboard className="w-4 h-4" />
                          <span>{statusLabels[project.status]}</span>
                        </div>

                        {project.owner && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            <span>{project.owner}</span>
                          </div>
                        )}

                        {project.due_date && (
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {format(
                                new Date(project.due_date),
                                "dd/MM/yyyy",
                                { locale: ptBR }
                              )}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          <span>
                            R$ {Number(project.budget_planned).toLocaleString("pt-BR")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <Button
                      onClick={() => navigate(`/project/${project.id}`)}
                      className="flex-shrink-0"
                    >
                      Ver Detalhes
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default BlockedProjects;
