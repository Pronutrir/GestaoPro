'use client';
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown, ChevronRight, Columns3, Trash2, RotateCcw, Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { useAppConfirm } from "@/components/AppConfirmProvider";

interface Phase { id: string; title: string; display_order?: number | null; }
interface WorkflowStage { id: string; title: string; color?: string | null; display_order?: number; }
interface Activity {
  id: string; title: string; description?: string | null; status: string;
  phase_id?: string | null; workflow_stage_id?: string | null;
  priority?: string | null; end_date?: string | null; start_date?: string | null;
  assigned_to?: string | null; hours?: number | null; cost?: number | null;
  created_at?: string; trashed_at?: string | null; is_trashed?: boolean | null;
}

interface Props {
  projectId: string;
  activities: Activity[];
  phases: Phase[];
  onEditActivity: (a: Activity) => void;
  onToggleActivity: (id: string, currentStatus: string) => void;
  onDataChanged: () => void;
  isAdmin?: boolean;
}

function priorityColor(p?: string | null) {
  switch (p) {
    case "urgente": case "critica": case "high":
      return "bg-red-500/15 text-red-600 border-red-500/30";
    case "alta": return "bg-orange-500/15 text-orange-600 border-orange-500/30";
    case "media": case "medium": return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    case "baixa": case "low": return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

const ALL_COLUMNS = [
  { key: "phase", label: "Fase", default: true },
  { key: "stage", label: "Kanban", default: true },
  { key: "priority", label: "Prioridade", default: true },
  { key: "end_date", label: "Prazo", default: true },
  { key: "assigned_to", label: "Líder", default: false },
  { key: "hours", label: "Horas", default: false },
  { key: "start_date", label: "Início", default: false },
  { key: "status", label: "Status", default: false },
] as const;
type ColKey = typeof ALL_COLUMNS[number]["key"];

const STORAGE_KEY = "project_flat_list_cols_v1";

export function ProjectFlatList({
  projectId, activities, phases, onEditActivity, onToggleActivity, onDataChanged, isAdmin,
}: Props) {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [trashed, setTrashed] = useState<Activity[]>([]);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved)) return new Set(saved as ColKey[]);
    } catch { /* noop */ }
    return new Set(ALL_COLUMNS.filter(c => c.default).map(c => c.key));
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(visibleCols)));
  }, [visibleCols]);

  useEffect(() => {
    supabase.from("workflow_stages").select("id, title, color, display_order")
      .eq("project_id", projectId).order("display_order")
      .then(({ data }) => setStages(data || []));
  }, [projectId]);

  const stageMap = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s])), [stages]);
  const phaseMap = useMemo(() => Object.fromEntries(phases.map(p => [p.id, p])), [phases]);

  // Extrai prefixo EAP (ex: "1.2.3", "1", "FASE 1") como vetor de inteiros para ordenação natural.
  const eapKey = (title?: string | null): number[] => {
    if (!title) return [Number.MAX_SAFE_INTEGER];
    const match = title.match(/(\d+(?:\.\d+)*)/);
    if (!match) return [Number.MAX_SAFE_INTEGER];
    return match[1].split(".").map(n => parseInt(n, 10));
  };
  const cmpEap = (a?: string | null, b?: string | null) => {
    const A = eapKey(a), B = eapKey(b);
    const len = Math.max(A.length, B.length);
    for (let i = 0; i < len; i++) {
      const x = A[i] ?? 0, y = B[i] ?? 0;
      if (x !== y) return x - y;
    }
    return (a || "").localeCompare(b || "", "pt-BR");
  };

  // Ordena tudo numa única lista pela numeração EAP do título.
  const sortedActivities = useMemo(
    () => [...activities]
      .filter(a => !a.is_trashed)
      .sort((x, y) => cmpEap(x.title, y.title)),
    [activities]
  );

  const fetchTrash = async () => {
    const { data } = await (supabase.from("activities").select("*")
      .eq("project_id", projectId) as any).eq("is_trashed", true)
      .order("trashed_at", { ascending: false });
    setTrashed(data || []);
  };

  useEffect(() => { if (showTrash) fetchTrash(); /* eslint-disable-next-line */ }, [showTrash, projectId]);

  const handleRestore = async (id: string) => {
    await (supabase.from("activities").update({ is_trashed: false, trashed_at: null } as any) as any).eq("id", id);
    toast({ title: "Atividade restaurada!" });
    fetchTrash(); onDataChanged();
  };
  const handlePermanentDelete = async (id: string) => {
    const ok = await appConfirm({
      title: "Excluir atividade",
      description: "Excluir permanentemente esta atividade?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await supabase.from("activities").delete().eq("id", id);
    toast({ title: "Atividade excluída!" });
    fetchTrash();
  };
  const handleEmptyTrash = async () => {
    const ok = await appConfirm({
      title: "Esvaziar lixeira",
      description: `Excluir PERMANENTEMENTE ${trashed.length} atividades?`,
      confirmText: "Excluir tudo",
      destructive: true,
    });
    if (!ok) return;
    await (supabase.from("activities").delete().eq("project_id", projectId) as any).eq("is_trashed", true);
    toast({ title: "Lixeira esvaziada!" });
    fetchTrash();
  };
  const handleRestoreAll = async () => {
    const ok = await appConfirm({
      title: "Restaurar atividades",
      description: `Restaurar ${trashed.length} atividades?`,
      confirmText: "Restaurar",
    });
    if (!ok) return;
    await (supabase.from("activities").update({ is_trashed: false, trashed_at: null } as any)
      .eq("project_id", projectId) as any).eq("is_trashed", true);
    toast({ title: "Todas restauradas!" });
    fetchTrash(); onDataChanged();
  };

  const handleArchive = async (id: string) => {
    await (supabase.from("activities").update({ is_trashed: true, trashed_at: new Date().toISOString() } as any) as any).eq("id", id);
    toast({ title: "Atividade arquivada!" });
    onDataChanged();
    if (showTrash) fetchTrash();
  };

  const toggleCol = (key: ColKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isVisible = (k: ColKey) => visibleCols.has(k);

  const renderCell = (a: Activity, key: ColKey) => {
    switch (key) {
      case "phase": {
        const p = a.phase_id ? phaseMap[a.phase_id] : null;
        return <span className="text-muted-foreground truncate">{p?.title || "—"}</span>;
      }
      case "stage": {
        const s = a.workflow_stage_id ? stageMap[a.workflow_stage_id] : null;
        return <span className="text-muted-foreground truncate">{s?.title || "—"}</span>;
      }
      case "priority":
        return a.priority && a.priority !== "pendente" ? (
          <Badge variant="outline" className={cn("text-[10px] capitalize", priorityColor(a.priority))}>
            {a.priority}
          </Badge>
        ) : <span className="text-muted-foreground">—</span>;
      case "end_date":
        return <span className="text-muted-foreground text-xs">
          {a.end_date ? format(parseISO(a.end_date.slice(0, 10) + "T12:00:00"), "dd/MM/yyyy") : "—"}
        </span>;
      case "start_date":
        return <span className="text-muted-foreground text-xs">
          {a.start_date ? format(parseISO(a.start_date.slice(0, 10) + "T12:00:00"), "dd/MM/yyyy") : "—"}
        </span>;
      case "assigned_to":
        return <span className="text-muted-foreground truncate text-xs">{a.assigned_to || "—"}</span>;
      case "hours":
        return <span className="text-muted-foreground text-xs">{a.hours ? `${a.hours}h` : "—"}</span>;
      case "status":
        return <span className="text-muted-foreground capitalize text-xs">{a.status?.replace("_", " ") || "—"}</span>;
    }
  };

  // Larguras flexíveis: cada coluna recebe um peso (fr) e um mínimo,
  // permitindo que a tabela se adapte à quantidade de colunas visíveis.
  const colSpec: Record<ColKey, { min: number; fr: number }> = {
    phase:       { min: 120, fr: 1.4 },
    stage:       { min: 100, fr: 1.0 },
    priority:    { min: 90,  fr: 0.8 },
    end_date:    { min: 90,  fr: 0.8 },
    start_date:  { min: 90,  fr: 0.8 },
    assigned_to: { min: 130, fr: 1.4 },
    hours:       { min: 60,  fr: 0.5 },
    status:      { min: 100, fr: 0.9 },
  };

  const visibleList = ALL_COLUMNS.filter(c => isVisible(c.key));

  return (
    <div className="space-y-4">
      {/* Toolbar do seletor de colunas */}
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Columns3 className="w-3.5 h-3.5" /> Colunas
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_COLUMNS.map(c => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={isVisible(c.key)}
                onCheckedChange={() => toggleCol(c.key)}
                onSelect={(e) => e.preventDefault()}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabela agrupada por Fase */}
      <div className="border border-border rounded-lg overflow-hidden bg-background">
        <div className="grid gap-3 px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground border-b border-border"
             style={{ gridTemplateColumns: `minmax(240px, ${Math.max(2, 4 - visibleList.length)}fr) ${visibleList.map(c => `minmax(${colSpec[c.key].min}px, ${colSpec[c.key].fr}fr)`).join(" ")}` }}>
          <div>Tarefa</div>
          {visibleList.map(c => <div key={c.key}>{c.label}</div>)}
        </div>

        {sortedActivities.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Nenhuma tarefa encontrada.</div>
        ) : (
          sortedActivities.map((a) => (
            <div
              key={a.id}
              className="group grid gap-3 px-4 py-2.5 text-sm border-b border-border hover:bg-muted/30 transition-colors items-center cursor-pointer"
              style={{ gridTemplateColumns: `minmax(240px, ${Math.max(2, 4 - visibleList.length)}fr) ${visibleList.map(c => `minmax(${colSpec[c.key].min}px, ${colSpec[c.key].fr}fr)`).join(" ")}` }}
              onClick={() => onEditActivity(a)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={a.status === "completed"}
                    onCheckedChange={() => onToggleActivity(a.id, a.status)}
                    className="shrink-0"
                  />
                </div>
                <span className={cn("truncate flex-1", a.status === "completed" && "line-through text-muted-foreground")}>
                  {a.title}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); handleArchive(a.id); }}
                  title="Arquivar atividade"
                >
                  <Archive className="w-3.5 h-3.5" />
                </Button>
              </div>
              {visibleList.map(c => (
                <div key={c.key} className="min-w-0 flex items-center">{renderCell(a, c.key)}</div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Lixeira */}
      <div className="border-t pt-4">
        <Button
          variant="ghost" size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => setShowTrash(!showTrash)}
        >
          <Trash2 className="w-4 h-4" />
          Lixeira
          {showTrash ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </Button>

        {showTrash && (
          <div className="mt-3 space-y-2">
            {trashed.length === 0 ? (
              <Card className="p-6 text-center">
                <Trash2 className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">Lixeira vazia</p>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">{trashed.length} atividade(s) na lixeira</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleRestoreAll}>
                      <RotateCcw className="w-3.5 h-3.5" /> Restaurar todas
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive hover:bg-destructive/10" onClick={handleEmptyTrash}>
                        <Trash2 className="w-3.5 h-3.5" /> Esvaziar lixeira
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  {trashed.map(a => (
                    <div key={a.id} className="flex items-center gap-3 bg-muted/50 border border-dashed rounded-lg px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-muted-foreground line-through truncate">{a.title}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleRestore(a.id)}>
                        <RotateCcw className="w-3 h-3" /> Restaurar
                      </Button>
                      {isAdmin && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handlePermanentDelete(a.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
