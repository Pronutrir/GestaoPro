'use client';
import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Calendar, DollarSign, User, ArrowRight, LayoutDashboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Project {
  id: string; title: string; description: string | null; status: string; priority: string;
  due_date: string | null; assignees: string[]; budget_planned: number; budget_used: number;
  owner: string | null; blockers: string | null;
}

const BlockedProjects = () => {
  const router = useRouter();
  const { filterProjects } = useProjectAccess();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error } = await supabase.from("projects").select("*")
          .not("blockers", "is", null).neq("blockers", "").neq("status", "done")
          .eq("is_trashed", false)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const filtered = await filterProjects(data || []);
        setProjects(filtered);
      } catch { toast.error("Erro ao carregar projetos bloqueados"); }
      finally { setIsLoading(false); }
    };
    fetch();
  }, [filterProjects]);

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground", medium: "bg-info text-info-foreground", high: "bg-destructive text-destructive-foreground",
  };
  const statusLabels: Record<string, string> = { todo: "A Fazer", "in-progress": "Em Progresso", done: "Concluído" };

  return (
          <div className="px-4 py-6 space-y-6">
        <Card className="p-6 bg-destructive/10 border-destructive/20">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-destructive rounded-lg flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-destructive-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Acompanhamento de Bloqueios</h2>
              <p className="text-sm text-muted-foreground">Revise e resolva os bloqueios para manter os projetos em movimento.</p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-muted-foreground">Total Bloqueados</p><p className="text-2xl font-bold text-foreground">{projects.length}</p></div>
              <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-muted-foreground">Em Progresso</p><p className="text-2xl font-bold text-foreground">{projects.filter(p => p.status === "in-progress").length}</p></div>
              <div className="w-10 h-10 bg-info/10 rounded-lg flex items-center justify-center"><LayoutDashboard className="w-5 h-5 text-info" /></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-muted-foreground">Orçamento Afetado</p><p className="text-2xl font-bold text-foreground">R$ {projects.reduce((s, p) => s + (Number(p.budget_planned) || 0), 0).toLocaleString("pt-BR")}</p></div>
              <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center"><DollarSign className="w-5 h-5 text-warning" /></div>
            </div>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Carregando...</p></div>
        ) : projects.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-8 h-8 text-success" /></div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum Bloqueio Ativo</h3>
            <p className="text-sm text-muted-foreground">Ótimo! Não há projetos com bloqueios no momento.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {projects.map(project => (
              <Card key={project.id} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">{project.title}</h3>
                        {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
                      </div>
                      <Badge className={priorityColors[project.priority]}>{project.priority === "low" ? "Baixa" : project.priority === "medium" ? "Média" : "Alta"}</Badge>
                    </div>
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                        <div><p className="font-medium text-foreground mb-1">Bloqueio:</p><p className="text-sm text-muted-foreground">{project.blockers}</p></div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {project.owner && <div className="flex items-center gap-2"><User className="w-4 h-4" /><span>{project.owner}</span></div>}
                      {project.due_date && <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /><span>{format(new Date(project.due_date), "dd/MM/yyyy", { locale: ptBR })}</span></div>}
                      <div className="flex items-center gap-2"><DollarSign className="w-4 h-4" /><span>R$ {Number(project.budget_planned).toLocaleString("pt-BR")}</span></div>
                    </div>
                  </div>
                  <Button onClick={() => router.push(`/project/${project.id}`)} className="shrink-0">Ver Detalhes <ArrowRight className="w-4 h-4 ml-2" /></Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    
  );
};

export default BlockedProjects;
