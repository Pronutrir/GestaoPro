import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Lightbulb, Beaker, Rocket, AlertTriangle, Archive, CheckCircle,
  Target, Settings2, Briefcase, Handshake, TrendingUp, Sparkles,
  Search, ChevronDown, ChevronRight, DollarSign, Activity, Flame, Layers,
} from "lucide-react";

/**
 * Visualização de portfólio em swim lanes por TIPO de projeto.
 * Cada faixa exibe um mini-pipeline (estágios) + métricas + cards.
 * Componente reutilizável — usado dentro da Visão Geral (Overview).
 */

export interface PipelineProject {
  id: string;
  title: string;
  status: string;
  project_type: string | null;
  priority: string;
  owner: string | null;
  budget_planned: number | null;
  budget_used: number | null;
  completion_percentage: number | null;
}

const STAGES = [
  { key: "ideacao",     label: "Ideação",     short: "IDE", icon: Lightbulb,     dot: "bg-amber-500" },
  { key: "poc",         label: "POC",         short: "POC", icon: Beaker,        dot: "bg-purple-500" },
  { key: "mvp",         label: "MVP",         short: "MVP", icon: Rocket,        dot: "bg-blue-500" },
  { key: "blocked",     label: "Bloqueio",    short: "BLQ", icon: AlertTriangle, dot: "bg-red-500" },
  { key: "drawer",      label: "Gaveta",      short: "GAV", icon: Archive,       dot: "bg-slate-500" },
  { key: "em-execucao", label: "Em Execução", short: "EXE", icon: CheckCircle,   dot: "bg-emerald-500" },
] as const;

const TYPES = [
  { key: "estrategico",    label: "Estratégico",          icon: Target,     accent: "bg-blue-500",     iconBg: "bg-blue-500/10",     iconFg: "text-blue-600 dark:text-blue-400" },
  { key: "operacional",    label: "Operacional",          icon: Settings2,  accent: "bg-slate-500",    iconBg: "bg-slate-500/10",    iconFg: "text-slate-600 dark:text-slate-300" },
  { key: "novos_negocios", label: "Novos Negócios",       icon: Briefcase,  accent: "bg-emerald-500",  iconBg: "bg-emerald-500/10",  iconFg: "text-emerald-600 dark:text-emerald-400" },
  { key: "parceria",       label: "Parceria",             icon: Handshake,  accent: "bg-amber-500",    iconBg: "bg-amber-500/10",    iconFg: "text-amber-600 dark:text-amber-400" },
  { key: "melhoria",       label: "Melhoria de Processo", icon: TrendingUp, accent: "bg-cyan-500",     iconBg: "bg-cyan-500/10",     iconFg: "text-cyan-600 dark:text-cyan-400" },
  { key: "inovacao",       label: "Inovação",             icon: Sparkles,   accent: "bg-fuchsia-500",  iconBg: "bg-fuchsia-500/10",  iconFg: "text-fuchsia-600 dark:text-fuchsia-400" },
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

interface Props {
  projects: PipelineProject[];
}

export const PipelineByTypeLanes = ({ projects }: Props) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (s && !p.title.toLowerCase().includes(s)) return false;
      if (stageFilter !== "all" && p.status !== stageFilter) return false;
      return true;
    });
  }, [projects, search, stageFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, PipelineProject[]> = {};
    TYPES.forEach((t) => (map[t.key] = []));
    filtered.forEach((p) => {
      const tKey = matchType(p.project_type);
      if (tKey) map[tKey].push(p);
    });
    return { map };
  }, [filtered]);

  const computeMetrics = (items: PipelineProject[]) => {
    const total = items.length;
    const planned = items.reduce((s, p) => s + (p.budget_planned || 0), 0);
    const used = items.reduce((s, p) => s + (p.budget_used || 0), 0);
    const avgProgress = total
      ? Math.round(items.reduce((s, p) => s + (p.completion_percentage || 0), 0) / total)
      : 0;
    const blocked = items.filter((p) => p.status === "blocked").length;
    const live = items.filter((p) => p.status === "em-execucao").length;
    const stageCount: Record<string, number> = {};
    STAGES.forEach((s) => (stageCount[s.key] = 0));
    items.forEach((p) => {
      if (stageCount[p.status] !== undefined) stageCount[p.status]++;
    });
    return { total, planned, used, avgProgress, blocked, live, stageCount };
  };

  const portfolio = useMemo(() => computeMetrics(filtered), [filtered]);

  // Ordena tipos dinamicamente: mais projetos primeiro; vazios ao final
  const sortedTypes = useMemo(() => {
    return [...TYPES].sort((a, b) => {
      const ca = grouped.map[a.key].length;
      const cb = grouped.map[b.key].length;
      return cb - ca;
    });
  }, [grouped]);

  const toggle = (k: string) => setCollapsed((prev) => ({ ...prev, [k]: !prev[k] }));

  return (
    <div className="space-y-5">
      {/* HERO + KPIs do portfólio */}
      <Card className="p-5 bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Pipeline por Tipo de Projeto</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Visão de portfólio em <strong>swim lanes</strong> por tipo. Cada faixa exibe seu mini-pipeline (estágios), métricas e os projetos da categoria.
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

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPI label="Projetos" value={portfolio.total} icon={Activity} tone="text-foreground" />
          <KPI label="Em Execução" value={portfolio.live} icon={CheckCircle} tone="text-emerald-500" />
          <KPI label="Bloqueados" value={portfolio.blocked} icon={Flame} tone="text-red-500" />
          <KPI label="Orçamento Plan." value={fmtCurrency(portfolio.planned)} icon={DollarSign} tone="text-foreground" small />
          <KPI label="Progresso médio" value={`${portfolio.avgProgress}%`} icon={TrendingUp} tone="text-primary" />
        </div>

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

      {/* SWIM LANES */}
      <div className="space-y-4">
        {sortedTypes.map((t) => {
          const items = grouped.map[t.key];
          const m = computeMetrics(items);
          const isEmpty = m.total === 0;
          // Todas as faixas iniciam colapsadas — usuário expande manualmente
          const isCollapsed = collapsed[t.key] ?? true;
          const TypeIcon = t.icon;

          return (
            <Card
              key={t.key}
              className={`overflow-hidden border bg-card transition-all relative ${
                isEmpty ? "border-border/40 opacity-70 hover:opacity-100" : "border-border/60 hover:border-border"
              }`}
            >
              {/* Faixa de acento lateral */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${t.accent} ${isEmpty ? "opacity-40" : ""}`} />

              {/* HEADER limpo */}
              <div className={`pl-5 pr-4 ${isEmpty ? "py-2.5" : "py-3.5"} ${!isCollapsed ? "border-b border-border/60" : ""}`}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <button
                    onClick={() => toggle(t.key)}
                    className="flex items-center gap-3 group min-w-0"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                    <div className={`${isEmpty ? "h-7 w-7" : "h-9 w-9"} rounded-lg ${t.iconBg} flex items-center justify-center shrink-0`}>
                      <TypeIcon className={`${isEmpty ? "h-3.5 w-3.5" : "h-4 w-4"} ${t.iconFg}`} />
                    </div>
                    <div className="text-left min-w-0">
                      <h3 className={`${isEmpty ? "text-sm" : "text-[15px]"} font-semibold text-foreground tracking-tight`}>
                        {t.label}
                      </h3>
                      {!isEmpty && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-medium text-foreground">{m.total}</span> projeto{m.total !== 1 ? "s" : ""}
                          {m.live > 0 && <> · <span className="text-emerald-600 dark:text-emerald-400 font-medium">{m.live}</span> em execução</>}
                          {m.blocked > 0 && <> · <span className="text-red-600 dark:text-red-400 font-medium">{m.blocked}</span> bloqueado{m.blocked !== 1 ? "s" : ""}</>}
                        </p>
                      )}
                    </div>
                  </button>

                  {/* Mini-pipeline: só renderiza estágios com projetos */}
                  {isEmpty ? (
                    <span className="ml-auto text-[11px] text-muted-foreground/60 italic">
                      Sem projetos
                    </span>
                  ) : (
                    <div className="flex items-center gap-1 ml-auto flex-wrap">
                      {STAGES.filter((s) => m.stageCount[s.key] > 0).map((s) => {
                        const c = m.stageCount[s.key];
                        return (
                          <div
                            key={s.key}
                            title={`${s.label}: ${c}`}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-muted/60 text-foreground"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                            <span className="tracking-tight">{s.label}</span>
                            <span className="tabular-nums">{c}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Métricas compactas em uma linha */}
                {m.total > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mt-3 pl-7">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground w-28 shrink-0">Progresso médio</span>
                      <Progress value={m.avgProgress} className="h-1 flex-1" />
                      <span className="text-[11px] font-semibold text-foreground tabular-nums w-9 text-right">{m.avgProgress}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground w-28 shrink-0">Orçamento usado</span>
                      <Progress
                        value={m.planned ? Math.min(100, (m.used / m.planned) * 100) : 0}
                        className="h-1 flex-1"
                      />
                      <span className="text-[11px] font-medium text-muted-foreground tabular-nums whitespace-nowrap">
                        {fmtCurrency(m.used)} <span className="opacity-50">/</span> {fmtCurrency(m.planned)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {!isCollapsed && (
                <div className="p-3 pl-4">
                  {m.total === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground/70">
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
                            className="text-left p-3 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:shadow-sm hover:-translate-y-0.5 transition-all group"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h4 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors leading-tight">
                                {p.title}
                              </h4>
                              <PriorityDot p={p.priority} />
                            </div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              {stage && (
                                <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 font-normal">
                                  <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
                                  {stage.label}
                                </Badge>
                              )}
                              <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                                {p.completion_percentage || 0}%
                              </span>
                            </div>
                            <Progress value={p.completion_percentage || 0} className="h-1" />
                            {p.owner && (
                              <p className="text-[10px] text-muted-foreground mt-2 truncate">
                                {p.owner}
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
      </div>
    </div>
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