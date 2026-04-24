import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import {
  Lightbulb, Beaker, Rocket, AlertTriangle, Archive, CheckCircle,
  Target, Settings2, Briefcase, Handshake, TrendingUp, Sparkles,
  Search, ChevronDown, ChevronRight, FlaskConical, DollarSign, Activity, Flame,
} from "lucide-react";

/**
 * PÁGINA DE TESTE V2 — Pipeline por Tipo (swim lanes)
 * Rota: /pipeline-tipos-test
 * Não altera nenhum componente do sistema.
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
  due_date?: string | null;
}

const STAGES = [
  { key: "ideacao",     label: "Ideação",     short: "IDE", icon: Lightbulb,    dot: "bg-amber-500" },
  { key: "poc",         label: "POC",         short: "POC", icon: Beaker,       dot: "bg-purple-500" },
  { key: "mvp",         label: "MVP",         short: "MVP", icon: Rocket,       dot: "bg-blue-500" },
  { key: "bloqueio",    label: "Bloqueio",    short: "BLQ", icon: AlertTriangle,dot: "bg-red-500" },
  { key: "gaveta",      label: "Gaveta",      short: "GAV", icon: Archive,      dot: "bg-slate-500" },
  { key: "em_execucao", label: "Em Execução", short: "EXE", icon: CheckCircle,  dot: "bg-emerald-500" },
] as const;

const TYPES = [
  { key: "estrategico",    label: "Estratégico",          icon: Target,     ring: "ring-blue-500/40",     bar: "bg-blue-500",     soft: "bg-blue-500/10" },
  { key: "operacional",    label: "Operacional",          icon: Settings2,  ring: "ring-slate-500/40",    bar: "bg-slate-500",    soft: "bg-slate-500/10" },
  { key: "novos_negocios", label: "Novos Negócios",       icon: Briefcase,  ring: "ring-emerald-500/40",  bar: "bg-emerald-500",  soft: "bg-emerald-500/10" },
  { key: "parceria",       label: "Parceria",             icon: Handshake,  ring: "ring-amber-500/40",    bar: "bg-amber-500",    soft: "bg-amber-500/10" },
  { key: "melhoria",       label: "Melhoria de Processo", icon: TrendingUp, ring: "ring-cyan-500/40",     bar: "bg-cyan-500",     soft: "bg-cyan-500/10" },
  { key: "inovacao",       label: "Inovação",             icon: Sparkles,   ring: "ring-fuchsia-500/40",  bar: "bg-fuchsia-500",  soft: "bg-fuchsia-500/10" },
] as const;

const normalize = (v: string | null | undefined) =>
  (v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");

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

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

const PriorityDot = ({ p }: { p: string }) => {
  const map: Record<string, string> = {
    alta: "bg-red-500", high: "bg-red-500",
    media: "bg-amber-500", "média": "bg-amber-500", medium: "bg-amber-500",
    baixa: "bg-emerald-500", low: "bg-emerald-500",
  };
  const cls = map[normalize(p)] || "bg-muted-foreground";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />;
};

const PipelineTiposTest = () => {
  const navigate = useNavigate();
  const { filterProjects, loading: authLoading } = useProjectAccess();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,title,status,project_type,priority,owner,budget_planned,budget_used,completion_percentage,is_trashed,category,due_date")
        .neq("category", "qualidade")
        .eq("is_trashed", false);
      if (!error && data) {
        const filtered = await filterProjects(data as Project[]);
        setProjects(filtered as Project[]);
      }
      setLoading(false);
    })();
  }, [authLoading]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (s && !p.title.toLowerCase().includes(s)) return false;
      if (stageFilter !== "all" && p.status !== stageFilter) return false;
      return true;
    });
  }, [projects, search, stageFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, Project[]> = {};
    TYPES.forEach((t) => (map[t.key] = []));
    const semTipo: Project[] = [];
    filtered.forEach((p) => {
      const tKey = matchType(p.project_type);
      if (tKey) map[tKey].push(p);
      else semTipo.push(p);
    });
    return { map, semTipo };
  }, [filtered]);

  const computeMetrics = (items: Project[]) => {
    const total = items.length;
    const planned = items.reduce((s, p) => s + (p.budget_planned || 0), 0);
    const used = items.reduce((s, p) => s + (p.budget_used || 0), 0);
    const avgProgress = total
      ? Math.round(items.reduce((s, p) => s + (p.completion_percentage || 0), 0) / total)
      : 0;
    const blocked = items.filter((p) => p.status === "bloqueio").length;
    const live = items.filter((p) => p.status === "em_execucao").length;
    const stageCount: Record<string, number> = {};
    STAGES.forEach((s) => (stageCount[s.key] = 0));
    items.forEach((p) => {
      if (stageCount[p.status] !== undefined) stageCount[p.status]++;
    });
    return { total, planned, used, avgProgress, blocked, live, stageCount };
  };

  const portfolio = useMemo(() => computeMetrics(filtered), [filtered]);

  const toggle = (k: string) => setCollapsed((prev) => ({ ...prev, [k]: !prev[k] }));

  return (
    <AppLayout title="🧪 Pipeline por Tipo de Projeto">
      <div className="p-6 space-y-5">
        {/* HERO + KPIs do portfólio */}
        <Card className="p-5 bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <FlaskConical className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Pipeline por Tipo de Projeto</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                  Visão de portfólio organizada em <strong>swim lanes</strong> por tipo. Cada faixa exibe seu mini-pipeline (estágios), métricas e os projetos da categoria.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar projeto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 w-[220px]"
                />
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPI label="Projetos" value={portfolio.total} icon={Activity} tone="text-foreground" />
            <KPI label="Em Execução" value={portfolio.live} icon={CheckCircle} tone="text-emerald-500" />
            <KPI label="Bloqueados" value={portfolio.blocked} icon={Flame} tone="text-red-500" />
            <KPI label="Orçamento Plan." value={fmtCurrency(portfolio.planned)} icon={DollarSign} tone="text-foreground" small />
            <KPI label="Progresso médio" value={`${portfolio.avgProgress}%`} icon={TrendingUp} tone="text-primary" />
          </div>

          {/* Filtro de estágio */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Filtrar estágio:</span>
            <ToggleGroup
              type="single"
              value={stageFilter}
              onValueChange={(v) => setStageFilter(v || "all")}
              className="flex-wrap"
            >
              <ToggleGroupItem value="all" className="h-7 text-xs">Todos</ToggleGroupItem>
              {STAGES.map((s) => (
                <ToggleGroupItem key={s.key} value={s.key} className="h-7 text-xs gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  {s.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </Card>

        {/* SWIM LANES por tipo */}
        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">Carregando portfólio...</Card>
        ) : (
          <div className="space-y-4">
            {TYPES.map((t) => {
              const items = grouped.map[t.key];
              const m = computeMetrics(items);
              const isCollapsed = collapsed[t.key];
              const TypeIcon = t.icon;

              return (
                <Card
                  key={t.key}
                  className={`overflow-hidden ring-1 ${t.ring} bg-card transition-all`}
                >
                  {/* Lane header */}
                  <div className={`px-4 py-3 ${t.soft} border-b border-border`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <button
                        onClick={() => toggle(t.key)}
                        className="flex items-center gap-3 group"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                        )}
                        <div className={`h-9 w-9 rounded-lg ${t.soft} ring-1 ${t.ring} flex items-center justify-center`}>
                          <TypeIcon className="h-4.5 w-4.5 text-foreground" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-base font-bold text-foreground">{t.label}</h3>
                          <p className="text-[11px] text-muted-foreground">
                            {m.total} projeto{m.total !== 1 ? "s" : ""} · {m.live} em execução · {m.blocked} bloqueado{m.blocked !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </button>

                      {/* Mini stage bar */}
                      <div className="flex items-center gap-1.5 ml-auto">
                        {STAGES.map((s) => {
                          const c = m.stageCount[s.key];
                          return (
                            <div
                              key={s.key}
                              className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1.5 border ${
                                c > 0
                                  ? "bg-card border-border text-foreground"
                                  : "bg-transparent border-dashed border-border/60 text-muted-foreground/50"
                              }`}
                              title={s.label}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                              {s.short} <span className="ml-0.5">{c}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Progress bar of avg + budget meter */}
                    {m.total > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                            <span>Progresso médio</span>
                            <span className="font-semibold text-foreground">{m.avgProgress}%</span>
                          </div>
                          <Progress value={m.avgProgress} className="h-1.5" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                            <span>Orçamento usado</span>
                            <span className="font-semibold text-foreground">
                              {fmtCurrency(m.used)} / {fmtCurrency(m.planned)}
                            </span>
                          </div>
                          <Progress
                            value={m.planned ? Math.min(100, (m.used / m.planned) * 100) : 0}
                            className="h-1.5"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Lane body */}
                  {!isCollapsed && (
                    <div className="p-3">
                      {m.total === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md">
                          Nenhum projeto deste tipo {stageFilter !== "all" ? "no estágio selecionado" : "ainda"}.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                          {items.map((p) => {
                            const stage = STAGES.find((s) => s.key === p.status);
                            return (
                              <button
                                key={p.id}
                                onClick={() => navigate(`/project/${p.id}`)}
                                className="text-left p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all group"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <h4 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary">
                                    {p.title}
                                  </h4>
                                  <PriorityDot p={p.priority} />
                                </div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  {stage && (
                                    <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
                                      <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
                                      {stage.label}
                                    </Badge>
                                  )}
                                  <span className="text-[10px] font-semibold text-muted-foreground">
                                    {p.completion_percentage || 0}%
                                  </span>
                                </div>
                                <Progress value={p.completion_percentage || 0} className="h-1" />
                                {p.owner && (
                                  <p className="text-[10px] text-muted-foreground mt-2 truncate">
                                    👤 {p.owner}
                                  </p>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}

            {/* Sem tipo */}
            {grouped.semTipo.length > 0 && (
              <Card className="overflow-hidden border-dashed">
                <div className="px-4 py-3 bg-muted/30 border-b border-dashed border-border">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Sem tipo definido · {grouped.semTipo.length}
                  </h3>
                  <p className="text-[11px] text-muted-foreground/80">
                    Defina o tipo destes projetos para que apareçam nas faixas acima.
                  </p>
                </div>
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                  {grouped.semTipo.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/project/${p.id}`)}
                      className="text-left p-3 rounded-lg border border-dashed border-border bg-muted/20 hover:bg-card hover:border-primary/50 transition-all"
                    >
                      <h4 className="text-sm font-semibold text-foreground line-clamp-2">{p.title}</h4>
                      <p className="text-[10px] text-muted-foreground mt-1">Tipo não definido</p>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Rodapé de teste */}
        <Card className="p-4 bg-amber-500/5 border-amber-500/30">
          <p className="text-xs text-muted-foreground">
            ⚠️ <strong>Página de teste isolada.</strong> Rota: <code className="px-1 py-0.5 bg-muted rounded">/pipeline-tipos-test</code>. Se aprovar, integro como visualização oficial (aba no Dashboard ou página dedicada no menu).
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => navigate("/projects")}>
              Voltar ao Pipeline atual
            </Button>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
};

const KPI = ({
  label, value, icon: Icon, tone, small,
}: { label: string; value: string | number; icon: any; tone?: string; small?: boolean }) => (
  <div className="rounded-lg border border-border bg-card/60 p-3">
    <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase tracking-wider mb-1">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className={`${small ? "text-base" : "text-2xl"} font-bold ${tone || "text-foreground"}`}>
      {value}
    </div>
  </div>
);

export default PipelineTiposTest;