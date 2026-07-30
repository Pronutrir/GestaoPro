'use client';
// "Meu trabalho" (Item 4 da rodada final): tudo que é meu, de todos os
// projetos que posso ver, numa lista só — responsável ou participante.
// O RLS já recorta os projetos; aqui só se agrupa e ordena.
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Flag, FolderKanban, ListChecks, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeGut, GUT_META } from "@/lib/gutPriority";
import { cn } from "@/lib/utils";

interface MyActivity {
  id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  participants: string[] | null;
  project_id: string;
  end_date: string | null;
  priority: string | null;
  is_blocked: boolean | null;
  wbs_code: string | null;
  projects: { title: string } | null;
  workflow_stages: { title: string; color: string } | null;
}

type QuickFilter = "todas" | "atrasadas" | "semana";

const SELECT = "id, title, status, assigned_to, participants, project_id, end_date, priority, is_blocked, wbs_code, projects(title), workflow_stages(title, color)";

const localYmd = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

const fmtBr = (ymd: string) => {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
};

export default function MeuTrabalhoPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const myName = (profile?.full_name || "").trim();
  const myId = user?.id || null;
  const [items, setItems] = useState<MyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [quick, setQuick] = useState<QuickFilter>("todas");

  const fetchMine = useCallback(async () => {
    if (!myId && !myName) return;
    setLoading(true);
    // Duas buscas (responsável / participante) em vez de um `.or` frágil:
    // nomes com vírgula quebrariam a sintaxe do PostgREST.
    const keys = [myId, myName].filter(Boolean) as string[];
    const [assigned, participating] = await Promise.all([
      supabase.from("activities").select(SELECT)
        .eq("is_trashed", false).neq("status", "completed")
        .in("assigned_to", keys),
      myName
        ? supabase.from("activities").select(SELECT)
            .eq("is_trashed", false).neq("status", "completed")
            .contains("participants", [myName])
        : Promise.resolve({ data: [] as unknown[] }),
    ]);
    const seen = new Set<string>();
    const merged: MyActivity[] = [];
    [...((assigned.data as unknown as MyActivity[]) || []), ...((participating.data as unknown as MyActivity[]) || [])]
      .forEach((a) => {
        if (!seen.has(a.id)) { seen.add(a.id); merged.push(a); }
      });
    setItems(merged);
    setLoading(false);
  }, [myId, myName]);

  useEffect(() => { fetchMine(); }, [fetchMine]);

  const today = localYmd(new Date());
  const weekEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return localYmd(d);
  }, []);

  const overdue = useMemo(() => items.filter((a) => a.end_date && a.end_date < today), [items, today]);
  const thisWeek = useMemo(
    () => items.filter((a) => a.end_date && a.end_date >= today && a.end_date <= weekEnd),
    [items, today, weekEnd],
  );

  const visible = quick === "atrasadas" ? overdue : quick === "semana" ? thisWeek : items;

  // Agrupado por projeto; dentro do grupo, prazo mais apertado primeiro
  // (sem prazo por último), depois prioridade GUT.
  const groups = useMemo(() => {
    const gutRank: Record<string, number> = { urgente: 0, critica: 1, alta: 2, media: 3, baixa: 4, pendente: 5 };
    const byProject = new Map<string, { title: string; list: MyActivity[] }>();
    visible.forEach((a) => {
      const g = byProject.get(a.project_id) ?? { title: a.projects?.title ?? "Projeto", list: [] };
      g.list.push(a);
      byProject.set(a.project_id, g);
    });
    byProject.forEach((g) => {
      g.list.sort((x, y) => {
        const dx = x.end_date ?? "9999-99-99";
        const dy = y.end_date ?? "9999-99-99";
        if (dx !== dy) return dx.localeCompare(dy);
        return (gutRank[normalizeGut(x.priority)] ?? 5) - (gutRank[normalizeGut(y.priority)] ?? 5);
      });
    });
    return Array.from(byProject.entries()).sort((a, b) => a[1].title.localeCompare(b[1].title));
  }, [visible]);

  const openActivity = (a: MyActivity) => {
    router.push(`/project/${a.project_id}?activity=${a.id}`);
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListChecks className="w-6 h-6 text-primary" /> Meu trabalho
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suas atividades abertas em todos os projetos — como responsável ou participante. Clique para abrir no quadro.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {([
          { id: "todas", label: `Todas (${items.length})` },
          { id: "atrasadas", label: `Atrasadas (${overdue.length})` },
          { id: "semana", label: `Esta semana (${thisWeek.length})` },
        ] as { id: QuickFilter; label: string }[]).map((f) => (
          <Button
            key={f.id}
            variant={quick === f.id ? "default" : "outline"}
            size="sm"
            className={cn("h-7 text-xs", f.id === "atrasadas" && overdue.length > 0 && quick !== "atrasadas" && "border-destructive/50 text-destructive")}
            onClick={() => setQuick(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Carregando suas atividades...</Card>
      ) : groups.length === 0 ? (
        <Card className="p-10 text-center">
          <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
          <p className="text-sm font-medium">
            {quick === "todas" ? "Nada aberto no seu nome." : "Nada aqui com este filtro."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {quick === "todas"
              ? "Quando algo for atribuído a você, aparece nesta lista."
              : "Troque o filtro acima para ver o restante."}
          </p>
        </Card>
      ) : (
        groups.map(([projectId, g]) => (
          <Card key={projectId} className="overflow-hidden">
            <button
              type="button"
              onClick={() => router.push(`/project/${projectId}`)}
              className="w-full flex items-center gap-2 px-4 py-2.5 border-b bg-muted/40 hover:bg-muted/60 transition-colors text-left"
              title="Abrir o projeto"
            >
              <FolderKanban className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-semibold truncate">{g.title}</span>
              <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 tabular-nums">{g.list.length}</Badge>
            </button>
            <div>
              {g.list.map((a) => {
                const gut = normalizeGut(a.priority);
                const meta = GUT_META[gut];
                const isOverdue = !!a.end_date && a.end_date < today;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => openActivity(a)}
                    className="w-full flex items-center gap-2.5 px-4 py-2 border-b last:border-b-0 hover:bg-muted/40 transition-colors text-left"
                  >
                    <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {a.wbs_code && (
                      <span className="hidden sm:inline-flex items-center h-[17px] px-1.5 rounded border bg-muted font-mono text-[10px] text-muted-foreground shrink-0">
                        {a.wbs_code}
                      </span>
                    )}
                    <span className="text-[13px] truncate flex-1 min-w-0">{a.title}</span>
                    {a.is_blocked && (
                      <Flag className="w-3.5 h-3.5 text-amber-500 fill-current shrink-0" aria-label="Bloqueada" />
                    )}
                    {gut !== "pendente" && (
                      <span className={cn("w-2 h-2 rounded-full shrink-0", meta.dotClass)} title={`Prioridade ${meta.label}`} />
                    )}
                    {a.workflow_stages && (
                      <Badge variant="outline" className="hidden md:inline-flex text-[10px] gap-1.5 shrink-0 max-w-[140px]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.workflow_stages.color }} />
                        <span className="truncate">{a.workflow_stages.title}</span>
                      </Badge>
                    )}
                    {a.end_date && (
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[11px] tabular-nums shrink-0",
                        isOverdue ? "text-destructive font-semibold" : "text-muted-foreground",
                      )}>
                        <CalendarClock className="w-3 h-3" />
                        {fmtBr(a.end_date)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
