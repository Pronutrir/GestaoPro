import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import {
  Lightbulb, Beaker, Rocket, AlertTriangle, Archive, CheckCircle,
  Target, Settings2, Briefcase, Handshake, TrendingUp, Sparkles, FlaskConical,
} from "lucide-react";

/**
 * PÁGINA DE TESTE — Matriz Tipo × Estágio
 * Rota: /pipeline-tipos-test
 * Não altera nenhum componente ou rota existente.
 */

interface Project {
  id: string;
  title: string;
  status: string;
  project_type: string | null;
  priority: string;
  owner: string | null;
  budget_planned: number | null;
  budget_used: number | null;
  completion_percentage: number | null;
  is_trashed: boolean;
  category?: string | null;
}

const STAGES = [
  { key: "ideacao",     label: "Ideação",      icon: Lightbulb,    color: "text-amber-500" },
  { key: "poc",         label: "POC",          icon: Beaker,       color: "text-purple-500" },
  { key: "mvp",         label: "MVP",          icon: Rocket,       color: "text-blue-500" },
  { key: "bloqueio",    label: "Bloqueio",     icon: AlertTriangle,color: "text-red-500" },
  { key: "gaveta",      label: "Gaveta",       icon: Archive,      color: "text-slate-500" },
  { key: "em_execucao", label: "Em Execução",  icon: CheckCircle,  color: "text-emerald-500" },
] as const;

const TYPES = [
  { key: "estrategico",   label: "Estratégico",          icon: Target,        accent: "from-blue-500/20 to-blue-500/5",     border: "border-blue-500/40" },
  { key: "operacional",   label: "Operacional",          icon: Settings2,     accent: "from-slate-500/20 to-slate-500/5",   border: "border-slate-500/40" },
  { key: "novos_negocios",label: "Novos Negócios",       icon: Briefcase,     accent: "from-emerald-500/20 to-emerald-500/5", border: "border-emerald-500/40" },
  { key: "parceria",      label: "Parceria",             icon: Handshake,     accent: "from-amber-500/20 to-amber-500/5",   border: "border-amber-500/40" },
  { key: "melhoria",      label: "Melhoria de Processo", icon: TrendingUp,    accent: "from-cyan-500/20 to-cyan-500/5",     border: "border-cyan-500/40" },
  { key: "inovacao",      label: "Inovação",             icon: Sparkles,      accent: "from-fuchsia-500/20 to-fuchsia-500/5", border: "border-fuchsia-500/40" },
] as const;

const normalize = (v: string | null | undefined) =>
  (v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

const matchType = (raw: string | null) => {
  const n = normalize(raw);
  if (!n) return null;
  if (n.includes("estrateg")) return "estrategico";
  if (n.includes("operacion")) return "operacional";
  if (n.includes("novo") || n.includes("negoc")) return "novos_negocios";
  if (n.includes("parc")) return "parceria";
  if (n.includes("melhor") || n.includes("process")) return "melhoria";
  if (n.includes("inov")) return "inovacao";
  return null;
};

const PipelineTiposTest = () => {
  const navigate = useNavigate();
  const { filterProjects, loading: authLoading } = useProjectAccess();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,title,status,project_type,priority,owner,budget_planned,budget_used,completion_percentage,is_trashed,category")
        .neq("category", "qualidade")
        .eq("is_trashed", false);
      if (!error && data) {
        const filtered = await filterProjects(data as Project[]);
        setProjects(filtered as Project[]);
      }
      setLoading(false);
    })();
  }, [authLoading]);

  const matrix = useMemo(() => {
    const map: Record<string, Record<string, Project[]>> = {};
    TYPES.forEach((t) => {
      map[t.key] = {};
      STAGES.forEach((s) => (map[t.key][s.key] = []));
    });
    const semTipo: Record<string, Project[]> = {};
    STAGES.forEach((s) => (semTipo[s.key] = []));

    projects.forEach((p) => {
      const tKey = matchType(p.project_type);
      const sKey = STAGES.find((s) => s.key === p.status)?.key;
      if (!sKey) return;
      if (tKey) map[tKey][sKey].push(p);
      else semTipo[sKey].push(p);
    });
    return { map, semTipo };
  }, [projects]);

  const visibleTypes = typeFilter === "all" ? TYPES : TYPES.filter((t) => t.key === typeFilter);

  const totals = useMemo(() => {
    const byType: Record<string, number> = {};
    const byStage: Record<string, number> = {};
    TYPES.forEach((t) => (byType[t.key] = 0));
    STAGES.forEach((s) => (byStage[s.key] = 0));
    projects.forEach((p) => {
      const tKey = matchType(p.project_type);
      if (tKey) byType[tKey]++;
      if (STAGES.find((s) => s.key === p.status)) byStage[p.status]++;
    });
    return { byType, byStage };
  }, [projects]);

  return (
    <AppLayout title="🧪 Teste — Pipeline por Tipo × Estágio">
      <div className="p-6 space-y-6">
        {/* Header */}
        <Card className="p-5 bg-gradient-to-br from-primary/10 via-background to-background border-primary/20">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <FlaskConical className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Matriz Tipo × Estágio</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                  Página de teste isolada. Cruza os 6 <strong>tipos de projeto</strong> (Estratégico, Operacional, Novos Negócios, Parceria, Melhoria, Inovação) com os 6 <strong>estágios</strong> do pipeline. Nada do sistema atual foi alterado.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {TYPES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Resumos */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-5">
            {STAGES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.key} className="rounded-md border border-border bg-card/50 p-2.5 flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${s.color}`} />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground truncate">{s.label}</p>
                    <p className="text-sm font-bold text-foreground">{totals.byStage[s.key]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Matriz */}
        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">Carregando...</Card>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1100px] space-y-3">
              {/* Cabeçalho de estágios */}
              <div className="grid grid-cols-[180px_repeat(6,1fr)] gap-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 flex items-end pb-2">
                  Tipo \ Estágio
                </div>
                {STAGES.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.key} className="flex items-center gap-1.5 px-2 pb-2 border-b-2 border-border">
                      <Icon className={`h-3.5 w-3.5 ${s.color}`} />
                      <span className="text-xs font-semibold text-foreground">{s.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Linhas por tipo */}
              {visibleTypes.map((t) => {
                const TypeIcon = t.icon;
                return (
                  <div key={t.key} className="grid grid-cols-[180px_repeat(6,1fr)] gap-2">
                    {/* Coluna do tipo */}
                    <div className={`rounded-lg border ${t.border} bg-gradient-to-br ${t.accent} p-3 flex flex-col justify-between`}>
                      <div className="flex items-center gap-2">
                        <TypeIcon className="h-4 w-4 text-foreground" />
                        <span className="text-sm font-bold text-foreground">{t.label}</span>
                      </div>
                      <Badge variant="secondary" className="self-start mt-2 text-[10px]">
                        Total: {totals.byType[t.key]}
                      </Badge>
                    </div>

                    {/* Células */}
                    {STAGES.map((s) => {
                      const items = matrix.map[t.key][s.key];
                      return (
                        <Card
                          key={s.key}
                          className={`p-2 min-h-[120px] flex flex-col gap-1.5 ${
                            items.length === 0 ? "bg-muted/20 border-dashed" : "bg-card"
                          }`}
                        >
                          {items.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground/60 m-auto">—</span>
                          ) : (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold text-muted-foreground">
                                  {items.length} projeto{items.length > 1 ? "s" : ""}
                                </span>
                              </div>
                              {items.slice(0, 3).map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => navigate(`/project/${p.id}`)}
                                  className="text-left text-xs px-1.5 py-1 rounded bg-muted/40 hover:bg-primary/20 hover:text-primary transition-colors truncate"
                                  title={p.title}
                                >
                                  {p.title}
                                </button>
                              ))}
                              {items.length > 3 && (
                                <span className="text-[10px] text-muted-foreground px-1.5">
                                  +{items.length - 3} mais
                                </span>
                              )}
                            </>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                );
              })}

              {/* Linha "sem tipo" */}
              {typeFilter === "all" && projects.some((p) => !matchType(p.project_type)) && (
                <div className="grid grid-cols-[180px_repeat(6,1fr)] gap-2 pt-2">
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 flex flex-col justify-between">
                    <span className="text-sm font-semibold text-muted-foreground">Sem tipo definido</span>
                    <Badge variant="outline" className="self-start mt-2 text-[10px]">
                      Total: {projects.filter((p) => !matchType(p.project_type)).length}
                    </Badge>
                  </div>
                  {STAGES.map((s) => {
                    const items = matrix.semTipo[s.key];
                    return (
                      <Card key={s.key} className={`p-2 min-h-[80px] ${items.length === 0 ? "bg-muted/10 border-dashed" : "bg-card"}`}>
                        {items.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground/60 flex items-center justify-center h-full">—</span>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold text-muted-foreground">{items.length}</span>
                            {items.slice(0, 2).map((p) => (
                              <button
                                key={p.id}
                                onClick={() => navigate(`/project/${p.id}`)}
                                className="block text-left text-xs px-1.5 py-1 rounded bg-muted/40 hover:bg-primary/20 hover:text-primary w-full truncate"
                              >
                                {p.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rodapé de teste */}
        <Card className="p-4 bg-amber-500/5 border-amber-500/30">
          <p className="text-xs text-muted-foreground">
            ⚠️ <strong>Esta é uma página de teste isolada.</strong> Acessível em <code className="px-1 py-0.5 bg-muted rounded">/pipeline-tipos-test</code>. Se aprovar o conceito, posso integrar como aba/visualização no Dashboard atual ou como uma nova página oficial no menu.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => navigate("/projects")}>Voltar ao Pipeline atual</Button>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
};

export default PipelineTiposTest;