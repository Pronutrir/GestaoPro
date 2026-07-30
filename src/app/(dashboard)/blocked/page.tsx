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

// Relatório de bloqueios de ATIVIDADES (Item 5 da rodada final): os dados
// sempre existiram (is_blocked/blocked_reason/blocked_since/blocked_days_total),
// só não havia tela que agregasse. O RLS já limita ao que o usuário pode ver.
interface BlockedActivity {
  id: string; title: string; project_id: string; wbs_code: string | null;
  assigned_to: string | null; blocked_reason: string | null;
  blocked_since: string | null; blocked_days_total: number | null;
  projects: { title: string } | null;
}

const daysSince = (iso: string | null): number => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
};

const BlockedProjects = () => {
  const router = useRouter();
  const { filterProjects } = useProjectAccess();
  const [projects, setProjects] = useState<Project[]>([]);
  const [blockedActs, setBlockedActs] = useState<BlockedActivity[]>([]);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ?project=<id> (atalho vindo do menu ⋯ do quadro) pré-filtra as atividades.
  // Lido de window em vez de useSearchParams para não exigir Suspense no build.
  useEffect(() => {
    setProjectFilter(new URLSearchParams(window.location.search).get("project"));
  }, []);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [projRes, actRes] = await Promise.all([
          supabase.from("projects").select("*")
            .not("blockers", "is", null).neq("blockers", "").neq("status", "done")
            .eq("is_trashed", false)
            .order("created_at", { ascending: false }),
          supabase.from("activities")
            .select("id, title, project_id, wbs_code, assigned_to, blocked_reason, blocked_since, blocked_days_total, projects(title)")
            // .filter em vez de .eq: is_blocked ainda não está nos tipos gerados
            // (migration da flag pendente de regenerar tipos).
            .filter("is_blocked", "eq", true).eq("is_trashed", false)
            .order("blocked_since", { ascending: true }),
        ]);
        if (projRes.error) throw projRes.error;
        const filtered = await filterProjects(projRes.data || []);
        setProjects(filtered);
        setBlockedActs((actRes.data as unknown as BlockedActivity[]) || []);
      } catch { toast.error("Erro ao carregar bloqueios"); }
      finally { setIsLoading(false); }
    };
    fetch();
  }, [filterProjects]);

  const visibleActs = projectFilter ? blockedActs.filter((a) => a.project_id === projectFilter) : blockedActs;
  // Agrupadas por projeto; dentro do grupo, o bloqueio mais antigo primeiro.
  const actGroups = (() => {
    const map = new Map<string, { title: string; list: BlockedActivity[] }>();
    visibleActs.forEach((a) => {
      const g = map.get(a.project_id) ?? { title: a.projects?.title ?? "Projeto", list: [] };
      g.list.push(a);
      map.set(a.project_id, g);
    });
    return Array.from(map.entries()).sort(
      (x, y) => Math.max(...y[1].list.map((a) => daysSince(a.blocked_since))) - Math.max(...x[1].list.map((a) => daysSince(a.blocked_since))),
    );
  })();
  const totalCurrentDays = visibleActs.reduce((s, a) => s + daysSince(a.blocked_since), 0);

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
            {projects.filter(p => !projectFilter || p.id === projectFilter).map(project => (
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

        {/* ===== Atividades bloqueadas (agregado entre projetos) ===== */}
        {!isLoading && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-foreground">Atividades bloqueadas</h2>
              <Badge variant="secondary" className="tabular-nums">{visibleActs.length}</Badge>
              {visibleActs.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {totalCurrentDays} dia{totalCurrentDays === 1 ? "" : "s"} parados somando os bloqueios atuais
                </span>
              )}
              {projectFilter && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setProjectFilter(null)}>
                  Ver todos os projetos
                </Button>
              )}
            </div>

            {visibleActs.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-sm font-medium text-foreground">Nenhuma atividade bloqueada{projectFilter ? " neste projeto" : ""}.</p>
                <p className="text-xs text-muted-foreground mt-1">Bloqueios feitos no quadro (bandeira do card) aparecem aqui com motivo e tempo parado.</p>
              </Card>
            ) : (
              actGroups.map(([projectId, g]) => (
                <Card key={projectId} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => router.push(`/project/${projectId}`)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 border-b bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                    title="Abrir o projeto"
                  >
                    <span className="text-sm font-semibold truncate">{g.title}</span>
                    <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 tabular-nums">{g.list.length}</Badge>
                  </button>
                  <div>
                    {g.list.map((a) => {
                      const dias = daysSince(a.blocked_since);
                      const acumulado = Number(a.blocked_days_total) || 0;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => router.push(`/project/${a.project_id}?activity=${a.id}`)}
                          className="w-full flex items-start gap-2.5 px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/40 transition-colors text-left"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              {a.wbs_code && (
                                <span className="hidden sm:inline-flex items-center h-[17px] px-1.5 rounded border bg-muted font-mono text-[10px] text-muted-foreground shrink-0">
                                  {a.wbs_code}
                                </span>
                              )}
                              <span className="text-[13px] font-medium truncate">{a.title}</span>
                            </span>
                            <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                              {a.blocked_reason ? a.blocked_reason : "Sem motivo registrado"}
                              {a.assigned_to ? ` · ${a.assigned_to}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className={`block text-xs font-semibold tabular-nums ${dias >= 7 ? "text-destructive" : "text-amber-600"}`}>
                              há {dias} dia{dias === 1 ? "" : "s"}
                            </span>
                            {acumulado > 0 && (
                              <span className="block text-[11px] text-muted-foreground tabular-nums">{acumulado}d acumulados</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

  );
};

export default BlockedProjects;
