'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { Briefcase, DollarSign, AlertTriangle, CheckCircle2, FolderKanban, Layers3 } from "lucide-react";

interface PortfolioProject {
  id: string;
  title: string;
  status: string;
  priority: string;
  program: string | null;
  project_type: string | null;
  category: string | null;
  owner: string | null;
  budget_planned: number | null;
  budget_used: number | null;
  completion_percentage: number | null;
  due_date: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  estrategico: "Estratégico",
  operacional: "Operacional Crítico",
  novos_negocios: "Novos Negócios",
  parceria: "Parceria",
  inovacao: "Inovação",
};

const STATUS_LABELS: Record<string, string> = {
  ideacao: "Ideação",
  poc: "POC",
  mvp: "MVP",
  blocked: "Bloqueio",
  drawer: "Gaveta",
  "em-execucao": "Em Execução",
};

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const groupKeyLabel = (key: string, value: string | null) => {
  if (!value) return "Sem classificação";
  if (key === "project_type") return TYPE_LABELS[value] || value;
  return value;
};

export default function PortfolioPage() {
  const router = useRouter();
  const { filterProjects, loading: accessLoading } = useProjectAccess();
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<"program" | "project_type" | "category" | "owner">("program");

  useEffect(() => {
    if (accessLoading) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("projects")
        .select("id, title, status, priority, program, project_type, category, owner, budget_planned, budget_used, completion_percentage, due_date")
        .eq("is_trashed", false)
        .order("updated_at", { ascending: false });
      const filtered = await filterProjects((data || []) as PortfolioProject[]);
      if (!active) return;
      setProjects(filtered);
      setLoading(false);
    };
    load();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLoading]);

  const kpis = useMemo(() => {
    const total = projects.length;
    const blocked = projects.filter(p => p.status === "blocked").length;
    const executing = projects.filter(p => p.status === "em-execucao").length;
    const planned = projects.reduce((s, p) => s + (Number(p.budget_planned) || 0), 0);
    const used = projects.reduce((s, p) => s + (Number(p.budget_used) || 0), 0);
    const avgProgress = total > 0
      ? projects.reduce((s, p) => s + (Number(p.completion_percentage) || 0), 0) / total
      : 0;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = projects.filter(p => p.due_date && p.due_date < today && p.status !== "em-execucao").length;
    return { total, blocked, executing, planned, used, avgProgress, overdue };
  }, [projects]);

  const groups = useMemo(() => {
    const map = new Map<string, PortfolioProject[]>();
    projects.forEach(p => {
      const raw = (p as any)[groupBy] as string | null;
      const key = raw && String(raw).trim() ? String(raw) : "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return Array.from(map.entries())
      .map(([key, items]) => {
        const groupPlanned = items.reduce((s, p) => s + (Number(p.budget_planned) || 0), 0);
        const groupUsed = items.reduce((s, p) => s + (Number(p.budget_used) || 0), 0);
        const progress = items.length
          ? items.reduce((s, p) => s + (Number(p.completion_percentage) || 0), 0) / items.length
          : 0;
        const blockedCount = items.filter(p => p.status === "blocked").length;
        return {
          key,
          label: groupKeyLabel(groupBy, key === "__none__" ? null : key),
          items,
          planned: groupPlanned,
          used: groupUsed,
          progress,
          blocked: blockedCount,
        };
      })
      .sort((a, b) => b.items.length - a.items.length);
  }, [projects, groupBy]);

  const budgetUsage = kpis.planned > 0 ? (kpis.used / kpis.planned) * 100 : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          Visão consolidada do portfólio: agrupe projetos por programa, tipo, categoria ou líder e acompanhe os KPIs estratégicos.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={FolderKanban} label="Projetos" value={kpis.total} />
        <KpiCard icon={CheckCircle2} label="Em Execução" value={kpis.executing} accent="text-emerald-600" />
        <KpiCard icon={AlertTriangle} label="Bloqueados" value={kpis.blocked} accent="text-destructive" />
        <KpiCard icon={AlertTriangle} label="Atrasados" value={kpis.overdue} accent="text-amber-600" />
        <KpiCard icon={DollarSign} label="Orçamento Planejado" value={formatBRL(kpis.planned)} small />
        <KpiCard icon={DollarSign} label="Orçamento Utilizado" value={formatBRL(kpis.used)} small />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Saúde Geral do Portfólio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Progresso médio</span>
              <span className="font-medium">{kpis.avgProgress.toFixed(0)}%</span>
            </div>
            <Progress value={kpis.avgProgress} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Consumo orçamentário</span>
              <span className="font-medium">{budgetUsage.toFixed(0)}%</span>
            </div>
            <Progress value={Math.min(budgetUsage, 100)} />
          </div>
        </CardContent>
      </Card>

      {/* Grouping */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Layers3 className="w-4 h-4" /> Agrupamento
        </h2>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "program" | "project_type" | "category" | "owner")}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="program">Por Programa</SelectItem>
            <SelectItem value="project_type">Por Tipo</SelectItem>
            <SelectItem value="category">Por Categoria</SelectItem>
            <SelectItem value="owner">Por Líder</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando portfólio…</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum projeto disponível.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map(g => {
            const usage = g.planned > 0 ? (g.used / g.planned) * 100 : 0;
            return (
              <Card key={g.key} className="overflow-hidden">
                <CardHeader className="pb-3 bg-muted/30">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold">{g.label}</CardTitle>
                    <div className="flex items-center gap-2">
                      {g.blocked > 0 && (
                        <Badge variant="destructive" className="rounded-full">{g.blocked} bloq.</Badge>
                      )}
                      <Badge variant="secondary" className="rounded-full">{g.items.length} projetos</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Planejado</p>
                      <p className="font-medium">{formatBRL(g.planned)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Utilizado</p>
                      <p className="font-medium">{formatBRL(g.used)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Consumo</p>
                      <p className="font-medium">{usage.toFixed(0)}%</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Progresso médio</span>
                      <span className="font-medium">{g.progress.toFixed(0)}%</span>
                    </div>
                    <Progress value={g.progress} className="h-1.5" />
                  </div>
                  <div className="border-t border-border pt-3 space-y-1.5 max-h-64 overflow-auto">
                    {g.items.map(p => (
                      <button
                        key={p.id}
                        onClick={() => router.push(`/project/${p.id}`)}
                        className="w-full flex items-center justify-between gap-2 text-left text-xs px-2 py-1.5 rounded hover:bg-muted/60 transition-colors"
                      >
                        <span className="truncate flex-1">{p.title}</span>
                        <Badge variant="outline" className="rounded-full text-[10px] shrink-0">
                          {STATUS_LABELS[p.status] || p.status}
                        </Badge>
                        <span className="text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                          {Number(p.completion_percentage || 0).toFixed(0)}%
                        </span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const KpiCard = ({
  icon: Icon,
  label,
  value,
  accent,
  small,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent?: string;
  small?: boolean;
}) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className={`w-4 h-4 ${accent || "text-muted-foreground"}`} />
      </div>
      <p className={`font-bold ${small ? "text-base" : "text-2xl"} ${accent || ""}`}>{value}</p>
    </CardContent>
  </Card>
);
