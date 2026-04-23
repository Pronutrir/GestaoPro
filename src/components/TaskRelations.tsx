import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Link2, Ban, Clock3, X, Search, Plus, ArrowRight, ArrowLeft,
  CheckCircle2,
} from "lucide-react";

/**
 * Painel UNIFICADO de Relacionamentos.
 * Tipos suportados (5):
 *  - predecessor  (task_dependencies — esta atividade depende de outra)
 *  - successor    (task_dependencies — outra atividade depende desta)
 *  - related      (task_relations / related)
 *  - blocking     (task_relations / blocking)
 *  - waiting_on   (task_relations / waiting_on)
 *
 * Tudo é exibido numa lista única e o diálogo de criação aceita busca
 * tanto por título quanto por ID da atividade.
 */

type UnifiedKind = "predecessor" | "successor" | "related" | "blocking" | "waiting_on";

interface Props {
  activityId: string;
  projectId: string;
}

interface ActivityOpt {
  id: string;
  title: string;
  status: string;
}

interface UnifiedRow {
  id: string;
  kind: UnifiedKind;
  otherId: string;
  source: "deps" | "rels";
  raw?: any;
}

const META: Record<UnifiedKind, {
  label: string;
  shortLabel: string;
  icon: any;
  chipClass: string;
  btnClass: string;
  description: string;
}> = {
  predecessor: {
    label: "Predecessora",
    shortLabel: "Esta depende de",
    icon: ArrowLeft,
    chipClass: "bg-primary/10 text-primary border-primary/30",
    btnClass: "border-primary/30 hover:border-primary hover:bg-primary/5 text-primary",
    description: "Atividade que precisa terminar ANTES desta começar",
  },
  successor: {
    label: "Sucessora",
    shortLabel: "Depende desta",
    icon: ArrowRight,
    chipClass: "bg-primary/10 text-primary border-primary/30",
    btnClass: "border-primary/30 hover:border-primary hover:bg-primary/5 text-primary",
    description: "Atividade que só pode começar APÓS esta terminar",
  },
  related: {
    label: "Vinculada",
    shortLabel: "Relacionada",
    icon: Link2,
    chipClass: "bg-muted text-foreground border-border",
    btnClass: "border-border hover:border-foreground hover:bg-muted/40 text-foreground",
    description: "Vínculo genérico, sem ordem ou bloqueio",
  },
  blocking: {
    label: "Bloqueio",
    shortLabel: "Bloqueia / Bloqueada por",
    icon: Ban,
    chipClass: "bg-destructive/10 text-destructive border-destructive/30",
    btnClass: "border-destructive/30 hover:border-destructive hover:bg-destructive/5 text-destructive",
    description: "Bloqueio crítico — impede a conclusão",
  },
  waiting_on: {
    label: "Em espera",
    shortLabel: "Aguardando / Aguardada por",
    icon: Clock3,
    chipClass: "bg-warning/10 text-warning border-warning/30",
    btnClass: "border-warning/30 hover:border-warning hover:bg-warning/5 text-warning",
    description: "Pendência leve, sem impedir conclusão",
  },
};

const ORDER: UnifiedKind[] = ["predecessor", "successor", "blocking", "waiting_on", "related"];

export const TaskRelations = ({ activityId, projectId }: Props) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [activities, setActivities] = useState<ActivityOpt[]>([]);
  const [dialogKind, setDialogKind] = useState<UnifiedKind | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [direction, setDirection] = useState<"outgoing" | "incoming">("outgoing");
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    const [{ data: actData }, { data: depData }, { data: relData }] = await Promise.all([
      supabase
        .from("activities")
        .select("id, title, status")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .order("title"),
      supabase
        .from("task_dependencies")
        .select("id, predecessor_id, successor_id, dependency_type")
        .or(`predecessor_id.eq.${activityId},successor_id.eq.${activityId}`),
      supabase
        .from("task_relations" as any)
        .select("id, source_activity_id, target_activity_id, relation_type, note")
        .or(`source_activity_id.eq.${activityId},target_activity_id.eq.${activityId}`),
    ]);

    setActivities((actData || []) as ActivityOpt[]);

    const unified: UnifiedRow[] = [];

    (depData || []).forEach((d: any) => {
      if (d.successor_id === activityId) {
        unified.push({
          id: `dep-${d.id}`,
          kind: "predecessor",
          otherId: d.predecessor_id,
          source: "deps",
          raw: d,
        });
      } else if (d.predecessor_id === activityId) {
        unified.push({
          id: `dep-${d.id}`,
          kind: "successor",
          otherId: d.successor_id,
          source: "deps",
          raw: d,
        });
      }
    });

    ((relData as any[]) || []).forEach((r) => {
      const isOutgoing = r.source_activity_id === activityId;
      const otherId = isOutgoing ? r.target_activity_id : r.source_activity_id;
      unified.push({
        id: `rel-${r.id}`,
        kind: r.relation_type as UnifiedKind,
        otherId,
        source: "rels",
        raw: { ...r, isOutgoing },
      });
    });

    setRows(unified);
  };

  useEffect(() => {
    if (!activityId || !projectId) return;
    fetchAll();
    const channel = supabase
      .channel(`task-rels-unified-${activityId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_relations" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_dependencies" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, projectId]);

  const titleOf = (id: string) => activities.find((a) => a.id === id)?.title || "—";
  const statusOf = (id: string) => activities.find((a) => a.id === id)?.status || "";

  const grouped = useMemo(() => {
    const out: Record<UnifiedKind, UnifiedRow[]> = {
      predecessor: [], successor: [], related: [], blocking: [], waiting_on: [],
    };
    rows.forEach((r) => out[r.kind].push(r));
    return out;
  }, [rows]);

  const totalCount = rows.length;

  const openDialog = (kind: UnifiedKind) => {
    setDialogKind(kind);
    setSelectedTargetId("");
    setSearch("");
    setDirection("outgoing");
  };

  const handleCreate = async () => {
    if (!dialogKind || !selectedTargetId || saving) return;
    setSaving(true);

    let error: any = null;

    if (dialogKind === "predecessor") {
      ({ error } = await supabase.from("task_dependencies").insert({
        predecessor_id: selectedTargetId,
        successor_id: activityId,
        dependency_type: "finish_to_start",
      }));
    } else if (dialogKind === "successor") {
      ({ error } = await supabase.from("task_dependencies").insert({
        predecessor_id: activityId,
        successor_id: selectedTargetId,
        dependency_type: "finish_to_start",
      }));
    } else {
      const source = direction === "outgoing" ? activityId : selectedTargetId;
      const target = direction === "outgoing" ? selectedTargetId : activityId;
      ({ error } = await supabase.from("task_relations" as any).insert({
        source_activity_id: source,
        target_activity_id: target,
        relation_type: dialogKind,
      }));
    }

    setSaving(false);
    if (error) {
      if ((error as any).code === "23505") {
        toast({ title: "Esse vínculo já existe", variant: "destructive" });
      } else {
        toast({ title: "Erro ao vincular", description: error.message, variant: "destructive" });
      }
      return;
    }
    toast({ title: "✅ Vínculo criado!" });
    setDialogKind(null);
    fetchAll();
  };

  const handleDelete = async (row: UnifiedRow) => {
    const realId = row.id.replace(/^(dep|rel)-/, "");
    const table = row.source === "deps" ? "task_dependencies" : ("task_relations" as any);
    const { error } = await supabase.from(table).delete().eq("id", realId);
    if (error) {
      toast({ title: "Erro ao remover", variant: "destructive" });
      return;
    }
    toast({ title: "Vínculo removido" });
    fetchAll();
  };

  // Lista de candidatos do diálogo — busca por título OU id (full ou prefix)
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities
      .filter((a) => a.id !== activityId)
      .filter((a) => {
        if (!q) return true;
        return (
          a.title.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.id.toLowerCase().startsWith(q)
        );
      })
      .slice(0, 80);
  }, [activities, search, activityId]);

  return (
    <div className="space-y-3">
      {/* Cabeçalho compacto: título + contador + botão único "+ Vincular" com menu */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Link2 className="w-3.5 h-3.5 text-primary" />
          Relacionamentos
          {totalCount > 0 && (
            <span className="text-[10px] font-normal px-1.5 py-0 rounded-full bg-primary/10 text-primary">
              {totalCount}
            </span>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Plus className="w-3.5 h-3.5" /> Vincular
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {ORDER.map((kind) => {
              const meta = META[kind];
              const Icon = meta.icon;
              const count = grouped[kind].length;
              return (
                <DropdownMenuItem
                  key={kind}
                  onClick={() => openDialog(kind)}
                  className="text-xs gap-2 cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="flex-1">{meta.label}</span>
                  {count > 0 && (
                    <span className="text-[10px] text-muted-foreground">{count}</span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Lista única harmonizada */}
      {totalCount === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-3">
          Nenhum vínculo ainda. Use os botões acima para começar.
        </p>
      ) : (
        <div className="space-y-2">
          {ORDER.map((kind) => {
            const list = grouped[kind];
            if (list.length === 0) return null;
            const meta = META[kind];
            const Icon = meta.icon;
            return (
              <div key={kind} className="space-y-1">
                <div className="flex items-center gap-1.5 px-1">
                  <Icon className="w-3.5 h-3.5 opacity-70" />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {meta.label} <span className="opacity-60">({list.length})</span>
                  </span>
                </div>
                {list.map((row) => {
                  const otherStatus = statusOf(row.otherId);
                  const isCompleted = otherStatus === "completed";
                  // Para related/blocking/waiting_on indicar sentido (outgoing/incoming)
                  let dirLabel = "";
                  if (row.source === "rels" && row.raw) {
                    if (kind === "blocking") {
                      dirLabel = row.raw.isOutgoing ? "Está bloqueando" : "Bloqueada por";
                    } else if (kind === "waiting_on") {
                      dirLabel = row.raw.isOutgoing ? "Aguardando" : "Aguardada por";
                    } else if (kind === "related") {
                      dirLabel = "Vinculada";
                    }
                  } else if (kind === "predecessor") {
                    dirLabel = "Esta depende de";
                  } else if (kind === "successor") {
                    dirLabel = "Depende desta";
                  }

                  return (
                    <div
                      key={row.id}
                      className={`flex items-center gap-2 p-2 rounded-md border group transition-colors bg-muted/30 border-border/50 hover:bg-muted/50`}
                    >
                      <Badge variant="outline" className={`text-[9px] shrink-0 uppercase ${meta.chipClass}`}>
                        {dirLabel}
                      </Badge>
                      <span className={`text-xs flex-1 truncate ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {titleOf(row.otherId)}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground hidden md:inline">
                        #{row.otherId.slice(0, 6)}
                      </span>
                      {isCompleted && (
                        <Badge variant="outline" className="text-[9px] bg-success/10 text-success border-success/30 shrink-0">
                          <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                          Concluída
                        </Badge>
                      )}
                      <Button
                        size="icon" variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                        onClick={() => handleDelete(row)}
                        title="Remover vínculo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Diálogo de criação — único e unificado */}
      <Dialog open={!!dialogKind} onOpenChange={(o) => { if (!o) setDialogKind(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogKind && (() => {
                const Icon = META[dialogKind].icon;
                return <Icon className="w-5 h-5" />;
              })()}
              Adicionar: {dialogKind ? META[dialogKind].label : ""}
            </DialogTitle>
          </DialogHeader>

          {dialogKind && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded border border-border/50">
                {META[dialogKind].description}
              </p>

              {/* Direção apenas para blocking/waiting_on (related é simétrico; pred/succ são fixos) */}
              {(dialogKind === "blocking" || dialogKind === "waiting_on") && (
                <div>
                  <Label className="text-xs">Sentido</Label>
                  <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dialogKind === "blocking" && (
                        <>
                          <SelectItem value="outgoing">Esta tarefa BLOQUEIA outra</SelectItem>
                          <SelectItem value="incoming">Esta tarefa ESTÁ BLOQUEADA por outra</SelectItem>
                        </>
                      )}
                      {dialogKind === "waiting_on" && (
                        <>
                          <SelectItem value="outgoing">Esta tarefa ESTÁ AGUARDANDO outra</SelectItem>
                          <SelectItem value="incoming">Outra tarefa ESTÁ AGUARDANDO esta</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-xs">Buscar tarefa por título ou ID</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Ex: 'Login API' ou cole o UUID..."
                    className="pl-8 h-9"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Mostrando {candidates.length} resultado{candidates.length !== 1 ? "s" : ""}.
                </p>
              </div>

              <div className="max-h-64 overflow-y-auto border border-border rounded-md divide-y divide-border bg-background">
                {candidates.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground italic text-center">Nenhuma tarefa encontrada.</p>
                ) : candidates.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedTargetId(a.id)}
                    className={`w-full text-left p-2 text-xs hover:bg-accent/40 transition-colors flex items-center gap-2 ${
                      selectedTargetId === a.id ? "bg-primary/10 ring-1 ring-primary" : ""
                    }`}
                  >
                    {a.status === "completed" && (
                      <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                    )}
                    <span className={`flex-1 truncate ${a.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                      {a.title}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                      #{a.id.slice(0, 8)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogKind(null)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!selectedTargetId || saving} className="gap-2">
              <CheckCircle2 className="w-4 h-4" /> {saving ? "Salvando..." : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
