import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Search,
  Lightbulb,
  Beaker,
  Rocket,
  CheckCircle,
  Archive,
  AlertTriangle,
  Filter,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ProjectColumn } from "@/components/ProjectColumn";
import { AddProjectDialog } from "@/components/AddProjectDialog";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

interface Project {
  id: string; title: string; description: string | null; status: string; priority: string;
  due_date: string | null; assignees: string[]; budget_planned: number; budget_used: number;
  owner: string | null; blockers: string | null; display_order: number;
  category?: string; program?: string | null;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { filterProjects, isAdmin, loading: authLoading } = useProjectAccess();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const statusFilter = searchParams.get("status");

  const handleStatusFilter = (status: string | null) => {
    status ? setSearchParams({ status }) : setSearchParams({});
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase.from("projects").select("*")
        .order("display_order", { ascending: true }).order("created_at", { ascending: false });
      if (error) throw error;
      const filtered = await filterProjects(data || []);
      setProjects(filtered);
    } catch (error) {
      toast({ title: "Erro ao carregar projetos", variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeProject = projects.find(p => p.id === active.id);
    const overProject = projects.find(p => p.id === over.id);
    if (!activeProject || !overProject || activeProject.status !== overProject.status) return;
    const statusProjects = projects.filter(p => p.status === activeProject.status).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const oldIndex = statusProjects.findIndex(p => p.id === active.id);
    const newIndex = statusProjects.findIndex(p => p.id === over.id);
    if (oldIndex === newIndex) return;
    const reordered = arrayMove(statusProjects, oldIndex, newIndex);
    setProjects(prev => prev.map(p => {
      if (p.status !== activeProject.status) return p;
      const newOrder = reordered.findIndex(rp => rp.id === p.id);
      return { ...p, display_order: newOrder };
    }));
    try {
      for (let i = 0; i < reordered.length; i++) {
        await supabase.from("projects").update({ display_order: i }).eq("id", reordered[i].id);
      }
    } catch { toast({ title: "Erro ao reordenar", variant: "destructive" }); fetchProjects(); }
  };

  useEffect(() => { if (!authLoading) fetchProjects(); }, [authLoading, isAdmin]);

  const handleEdit = (project: Project) => { setEditingProject(project); setEditDialogOpen(true); };
  const handleDelete = async (projectId: string) => {
    try {
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;
      toast({ title: "Projeto excluído!" }); fetchProjects();
    } catch { toast({ title: "Erro ao excluir projeto", variant: "destructive" }); }
  };
  const handleStatusChange = async (projectId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from("projects").update({ status: newStatus }).eq("id", projectId);
      if (error) throw error;
      toast({ title: "Status atualizado!" }); fetchProjects();
    } catch { toast({ title: "Erro ao atualizar status", variant: "destructive" }); }
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || (p.category || "general") === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const sortByOrder = (arr: Project[]) => [...arr].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const ideacaoProjects = sortByOrder(filteredProjects.filter(p => p.status === "ideacao"));
  const pocProjects = sortByOrder(filteredProjects.filter(p => p.status === "poc"));
  const mvpProjects = sortByOrder(filteredProjects.filter(p => p.status === "mvp"));
  const blockedProjects = sortByOrder(filteredProjects.filter(p => p.status === "blocked"));
  const drawerProjects = sortByOrder(filteredProjects.filter(p => p.status === "drawer"));
  const emExecucaoProjects = sortByOrder(filteredProjects.filter(p => p.status === "em-execucao"));

  const statusCards = [
    { key: "ideacao", label: "Ideação", icon: Lightbulb, color: "warning", projects: ideacaoProjects },
    { key: "poc", label: "POC", icon: Beaker, color: "info", projects: pocProjects },
    { key: "mvp", label: "MVP", icon: Rocket, color: "accent", projects: mvpProjects },
    { key: "blocked", label: "Bloqueio", icon: AlertTriangle, color: "destructive", projects: blockedProjects },
    { key: "drawer", label: "Gaveta", icon: Archive, color: "secondary", projects: drawerProjects },
    { key: "em-execucao", label: "Em Execução", icon: CheckCircle, color: "success", projects: emExecucaoProjects },
  ];

  return (
    <AppLayout title="Pipeline de Projetos">
      <div className="p-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar projetos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <div className="flex items-center gap-2">
            <select className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={categoryFilter || ""} onChange={e => setCategoryFilter(e.target.value || null)}>
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

        {/* Status Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {statusCards.map(s => (
            <div
              key={s.key}
              className={`bg-card border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === s.key ? `border-${s.color} ring-2 ring-${s.color}/30` : "border-border"}`}
              onClick={() => handleStatusFilter(statusFilter === s.key ? null : s.key)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 bg-${s.color}/10 rounded-lg flex items-center justify-center`}>
                  <s.icon className={`w-5 h-5 text-${s.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold text-foreground">{s.projects.length}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {statusFilter && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtrando por:</span>
            <Button variant="outline" size="sm" onClick={() => handleStatusFilter(null)} className="gap-2">
              {statusCards.find(s => s.key === statusFilter)?.label} <span className="text-xs">×</span>
            </Button>
          </div>
        )}

        {/* Pipeline Board */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Carregando projetos...</p></div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className={`grid gap-6 ${statusFilter ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-6"}`}>
              {statusCards.filter(s => !statusFilter || statusFilter === s.key).map(s => (
                <ProjectColumn key={s.key} title={s.label} status={s.key} color={s.color} projects={s.projects}
                  onEdit={handleEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} isAdmin={isAdmin} />
              ))}
            </div>
          </DndContext>
        )}

        <EditProjectDialog project={editingProject} open={editDialogOpen} onOpenChange={setEditDialogOpen} onProjectUpdated={fetchProjects} />
      </div>
    </AppLayout>
  );
};

export default Dashboard;
