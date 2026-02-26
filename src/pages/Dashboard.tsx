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
  Lightbulb,
  Beaker,
  Rocket,
  CheckCircle,
  Archive,
  BarChart3,
  Filter,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ProjectColumn } from "@/components/ProjectColumn";
import { AddProjectDialog } from "@/components/AddProjectDialog";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

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
  display_order: number;
  category?: string;
  program?: string | null;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  
  const statusFilter = searchParams.get("status");

  const handleStatusFilter = (status: string | null) => {
    if (status) {
      setSearchParams({ status });
    } else {
      setSearchParams({});
    }
  };

  const handleLogout = () => {
    navigate("/");
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("display_order", { ascending: true })
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const activeProject = projects.find((p) => p.id === active.id);
    const overProject = projects.find((p) => p.id === over.id);
    
    if (!activeProject || !overProject) return;
    if (activeProject.status !== overProject.status) return;

    const statusProjects = projects
      .filter((p) => p.status === activeProject.status)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    const oldIndex = statusProjects.findIndex((p) => p.id === active.id);
    const newIndex = statusProjects.findIndex((p) => p.id === over.id);

    if (oldIndex === newIndex) return;

    const reorderedProjects = arrayMove(statusProjects, oldIndex, newIndex);

    // Update local state immediately
    setProjects(prev => prev.map((p) => {
      if (p.status !== activeProject.status) return p;
      const newOrder = reorderedProjects.findIndex((rp) => rp.id === p.id);
      return { ...p, display_order: newOrder };
    }));

    // Update database
    try {
      for (let i = 0; i < reorderedProjects.length; i++) {
        const { error } = await supabase
          .from("projects")
          .update({ display_order: i })
          .eq("id", reorderedProjects[i].id);
        if (error) throw error;
      }
    } catch (error) {
      console.error("Erro ao reordenar:", error);
      toast({
        title: "Erro ao reordenar",
        variant: "destructive",
      });
      fetchProjects();
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

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || (project.category || "general") === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const sortByOrder = (arr: Project[]) => [...arr].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  
  const ideacaoProjects = sortByOrder(filteredProjects.filter((p) => p.status === "ideacao"));
  const pocProjects = sortByOrder(filteredProjects.filter((p) => p.status === "poc"));
  const mvpProjects = sortByOrder(filteredProjects.filter((p) => p.status === "mvp"));
  const blockedProjects = sortByOrder(filteredProjects.filter((p) => p.status === "blocked"));
  const drawerProjects = sortByOrder(filteredProjects.filter((p) => p.status === "drawer"));
  const emExecucaoProjects = sortByOrder(filteredProjects.filter((p) => p.status === "em-execucao"));

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
              <Button variant="ghost" size="icon" onClick={() => navigate("/team")}>
                <Users className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate("/reports")}>
                <BarChart3 className="w-5 h-5" />
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
          
          <div className="flex items-center gap-2">
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={categoryFilter || ""}
              onChange={(e) => setCategoryFilter(e.target.value || null)}
            >
              <option value="">Todas Categorias</option>
              <option value="general">Geral</option>
              <option value="produto">Produto</option>
              <option value="infraestrutura">Infraestrutura</option>
              <option value="marketing">Marketing</option>
              <option value="operacoes">Operações</option>
              <option value="tecnologia">Tecnologia</option>
              <option value="rh">RH</option>
            </select>
            <AddProjectDialog onProjectAdded={fetchProjects} />
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div 
            className={`bg-card border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === "ideacao" ? "border-warning ring-2 ring-warning/30" : "border-border"}`}
            onClick={() => handleStatusFilter(statusFilter === "ideacao" ? null : "ideacao")}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ideação</p>
                <p className="text-2xl font-bold text-foreground">{ideacaoProjects.length}</p>
              </div>
            </div>
          </div>

          <div 
            className={`bg-card border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === "poc" ? "border-info ring-2 ring-info/30" : "border-border"}`}
            onClick={() => handleStatusFilter(statusFilter === "poc" ? null : "poc")}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-info/10 rounded-lg flex items-center justify-center">
                <Beaker className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">POC</p>
                <p className="text-2xl font-bold text-foreground">{pocProjects.length}</p>
              </div>
            </div>
          </div>

          <div 
            className={`bg-card border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === "mvp" ? "border-accent ring-2 ring-accent/30" : "border-border"}`}
            onClick={() => handleStatusFilter(statusFilter === "mvp" ? null : "mvp")}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                <Rocket className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">MVP</p>
                <p className="text-2xl font-bold text-foreground">{mvpProjects.length}</p>
              </div>
            </div>
          </div>

          <div 
            className={`bg-card border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === "blocked" ? "border-destructive ring-2 ring-destructive/30" : "border-border"}`}
            onClick={() => handleStatusFilter(statusFilter === "blocked" ? null : "blocked")}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bloqueio</p>
                <p className="text-2xl font-bold text-foreground">{blockedProjects.length}</p>
              </div>
            </div>
          </div>

          <div 
            className={`bg-card border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === "drawer" ? "border-secondary ring-2 ring-secondary/30" : "border-border"}`}
            onClick={() => handleStatusFilter(statusFilter === "drawer" ? null : "drawer")}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-secondary/30 rounded-lg flex items-center justify-center">
                <Archive className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gaveta</p>
                <p className="text-2xl font-bold text-foreground">{drawerProjects.length}</p>
              </div>
            </div>
          </div>

          <div 
            className={`bg-card border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === "em-execucao" ? "border-success ring-2 ring-success/30" : "border-border"}`}
            onClick={() => handleStatusFilter(statusFilter === "em-execucao" ? null : "em-execucao")}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Em Execução</p>
                <p className="text-2xl font-bold text-foreground">{emExecucaoProjects.length}</p>
              </div>
            </div>
          </div>
        </div>

        {statusFilter && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtrando por:</span>
            <Button variant="outline" size="sm" onClick={() => handleStatusFilter(null)} className="gap-2">
              {statusFilter === "ideacao" && "Ideação"}
              {statusFilter === "poc" && "POC"}
              {statusFilter === "mvp" && "MVP"}
              {statusFilter === "blocked" && "Bloqueio"}
              {statusFilter === "drawer" && "Gaveta"}
              {statusFilter === "em-execucao" && "Em Execução"}
              <span className="text-xs">×</span>
            </Button>
          </div>
        )}

        {/* Pipeline Board */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Carregando projetos...</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className={`grid gap-6 ${statusFilter ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-6"}`}>
              {(!statusFilter || statusFilter === "ideacao") && (
                <ProjectColumn
                  title="Ideação"
                  status="ideacao"
                  color="warning"
                  projects={ideacaoProjects}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              )}

              {(!statusFilter || statusFilter === "poc") && (
                <ProjectColumn
                  title="POC"
                  status="poc"
                  color="info"
                  projects={pocProjects}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              )}

              {(!statusFilter || statusFilter === "mvp") && (
                <ProjectColumn
                  title="MVP"
                  status="mvp"
                  color="accent"
                  projects={mvpProjects}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              )}

              {(!statusFilter || statusFilter === "blocked") && (
                <ProjectColumn
                  title="Bloqueio"
                  status="blocked"
                  color="destructive"
                  projects={blockedProjects}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              )}

              {(!statusFilter || statusFilter === "drawer") && (
                <ProjectColumn
                  title="Gaveta"
                  status="drawer"
                  color="secondary"
                  projects={drawerProjects}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              )}

              {(!statusFilter || statusFilter === "em-execucao") && (
                <ProjectColumn
                  title="Em Execução"
                  status="em-execucao"
                  color="success"
                  projects={emExecucaoProjects}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              )}
            </div>
          </DndContext>
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