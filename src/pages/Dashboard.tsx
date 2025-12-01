import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Search,
  Calendar,
  Users,
  Settings,
  LogOut,
  Home,
  AlertTriangle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProjectColumn } from "@/components/ProjectColumn";
import { AddProjectDialog } from "@/components/AddProjectDialog";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { Input } from "@/components/ui/input";
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

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);

  const handleLogout = () => {
    navigate("/");
  };

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProjects(data || []);
      
      // Count blocked projects
      const blocked = data?.filter((p) => p.blockers && p.blockers.trim() !== "").length || 0;
      setBlockedCount(blocked);
    } catch (error) {
      console.error("Erro ao buscar projetos:", error);
      toast({
        title: "Erro ao carregar projetos",
        description: "Não foi possível carregar os projetos. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setEditDialogOpen(true);
  };

  const handleDelete = async (projectId: string) => {
    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId);

      if (error) throw error;

      toast({
        title: "Projeto excluído!",
        description: "O projeto foi removido com sucesso.",
      });
      
      fetchProjects();
    } catch (error) {
      console.error("Erro ao excluir projeto:", error);
      toast({
        title: "Erro ao excluir projeto",
        description: "Não foi possível excluir o projeto. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("projects")
        .update({ status: newStatus })
        .eq("id", projectId);

      if (error) throw error;

      toast({
        title: "Status atualizado!",
        description: "O projeto foi movido para outra coluna.",
      });
      
      fetchProjects();
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast({
        title: "Erro ao atualizar status",
        description: "Não foi possível atualizar o status. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const filteredProjects = projects.filter((project) =>
    project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const todoProjects = filteredProjects.filter((p) => p.status === "todo");
  const inProgressProjects = filteredProjects.filter((p) => p.status === "in-progress");
  const blockedProjects = filteredProjects.filter((p) => p.status === "blocked");
  const drawerProjects = filteredProjects.filter((p) => p.status === "drawer");
  const doneProjects = filteredProjects.filter((p) => p.status === "done");

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

            <div className="flex items-center gap-4">
              {blockedCount > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => navigate("/blocked-projects")}
                  className="gap-2"
                >
                  <AlertTriangle className="w-4 h-4" />
                  {blockedCount} Bloqueios
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Calendar className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Users className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar projetos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <AddProjectDialog onProjectAdded={fetchProjects} />
        </div>

        {/* Pipeline Board */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Carregando projetos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <ProjectColumn
              title="A Fazer"
              status="todo"
              color="muted"
              projects={todoProjects}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />

            <ProjectColumn
              title="Em Progresso"
              status="in-progress"
              color="info"
              projects={inProgressProjects}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />

            <ProjectColumn
              title="Bloqueio"
              status="blocked"
              color="destructive"
              projects={blockedProjects}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />

            <ProjectColumn
              title="Gaveta"
              status="drawer"
              color="secondary"
              projects={drawerProjects}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />

            <ProjectColumn
              title="Concluído"
              status="done"
              color="success"
              projects={doneProjects}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          </div>
        )}

        <EditProjectDialog
          project={editingProject}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onProjectUpdated={fetchProjects}
        />
      </main>
    </div>
  );
};

export default Dashboard;
