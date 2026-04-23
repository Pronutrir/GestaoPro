import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link2, Ban, Clock3, X, ExternalLink, Search, Plus, ArrowRight } from "lucide-react";

/**
 * Painel "Relacionamentos" no estilo ClickUp.
 * - 3 tipos: related (Vincular tarefa), blocking (Bloqueio), waiting_on (Em espera)
 * - Mostra os chips coloridos resumindo contagens
 * - Botões grandes para adicionar relacionamento
 * - Lista por categoria com remoção inline
 */

type RelationType = "related" | "blocking" | "waiting_on";

interface Props {
  activityId: string;
  projectId: string;
}

interface RelRow {
  id: string;
  source_activity_id: string;
  target_activity_id: string;
  relation_type: RelationType;
  note: string | null;
}

interface ActivityOpt {
  id: string;
  title: string;
  status: string;
}

const TYPE_META: Record<RelationType, {
  label: string; icon: any; chipClass: string; btnClass: string;
  // Texto descritivo para a "direção" (origem -> destino)
  outgoingLabel: string; incomingLabel: string;
}> = {
  related: {
    label: "Tarefa vinculada",
    icon: Link2,
    chipClass: "bg-muted text-foreground border-border",
    btnClass: "border-border hover:border-primary hover:bg-primary/5",
    outgoingLabel: "Vinculada a",
    incomingLabel: "Vinculada por",
  },
  blocking: {
    label: "Bloqueio",
    icon: Ban,
    chipClass: "bg-destructive/10 text-destructive border-destructive/30",
    btnClass: "border-destructive/30 hover:border-destructive hover:bg-destructive/5",
    outgoingLabel: "Está bloqueando",
    incomingLabel: "Bloqueada por",
  },
  waiting_on: {
    label: "Em espera",
    icon: Clock3,
    chipClass: "bg-warning/10 text-warning border-warning/30",
    btnClass: "border-warning/30 hover:border-warning hover:bg-warning/5",
    outgoingLabel: "Aguardando",
    incomingLabel: "Aguardada por",
  },
};

export const TaskRelations = ({ activityId, projectId }: Props) => {
  const { toast } = useToast();
  const [rels, setRels] = useState<RelRow[]>([]);
  const [activities, setActivities] = useState<ActivityOpt[]>([]);
  const [dialogType, setDialogType] = useState<RelationType | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [direction, setDirection] = useState<"outgoing" | "incoming">("outgoing");

  const fetchAll = async () => {
    const { data: actData } = await supabase
      .from("activities")
      .select("id, title, status")
      .eq("project_id", projectId)
      .eq("is_trashed", false)
      .order("title");
    setActivities((actData || []) as ActivityOpt[]);

    const { data: relData } = await supabase
      .from("task_relations" as any)
      .select("id, source_activity_id, target_activity_id, relation_type, note")
      .or(`source_activity_id.eq.${activityId},target_activity_id.eq.${activityId}`);
    setRels(((relData as any[]) || []) as RelRow[]);
  };

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel(`task-relations-${activityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_relations" },
        () => fetchAll(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, projectId]);

  const titleOf = (id: string) => activities.find((a) => a.id === id)?.title || "—";
  const statusOf = (id: string) => activities.find((a) => a.id === id)?.status || "";

  const grouped: Record<RelationType, RelRow[]> = {
    related: rels.filter((r) => r.relation_type === "related"),
    blocking: rels.filter((r) => r.relation_type === "blocking"),
    waiting_on: rels.filter((r) => r.relation_type === "waiting_on"),
  };

  const openDialog = (type: RelationType) => {
    setDialogType(type);
    setSelectedTargetId("");
    setSearch("");
    setDirection("outgoing");
  };

  const handleCreate = async () => {
    if (!dialogType || !selectedTargetId) return;
    const source = direction === "outgoing" ? activityId : selectedTargetId;
    const target = direction === "outgoing" ? selectedTargetId : activityId;
    const { error } = await supabase
      .from("task_relations" as any)
      .insert({ source_activity_id: source, target_activity_id: target, relation_type: dialogType });
    if (error) {
      if ((error as any).code === "23505") {
        toast({ title: "Esse relacionamento já existe", variant: "destructive" });
      } else {
        toast({ title: "Erro ao vincular", description: error.message, variant: "destructive" });
      }
      return;
    }
    toast({ title: "Relacionamento criado!" });
    setDialogType(null);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("task_relations" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", variant: "destructive" });
      return;
    }
    toast({ title: "Relacionamento removido" });
    fetchAll();
  };

  const candidates = activities
    .filter((a) => a.id !== activityId)
    .filter((a) => !search.trim() || a.title.toLowerCase().includes(search.toLowerCase()));

  // Chips de resumo (para topo do diálogo)
  const summaryChips = (Object.keys(grouped) as RelationType[])
    .filter((t) => grouped[t].length > 0)
    .map((t) => {
      const meta = TYPE_META[t];
      const Icon = meta.icon;
      return (
        <Badge key={t} variant="outline" className={`gap-1 ${meta.chipClass}`}>
          <Icon className="w-3 h-3" /> {grouped[t].length} {meta.label}
        </Badge>
      );
    });

  return (
    <div className="space-y-3">
      {/* Cabeçalho com chips resumo */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" /> Relacionamentos
        </h3>
        {summaryChips.length > 0 ? summaryChips : (
          <span className="text-xs text-muted-foreground italic">Nenhum vínculo ainda.</span>
        )}
      </div>

      {/* Botões grandes estilo ClickUp */}
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(TYPE_META) as RelationType[]).map((t) => {
          const meta = TYPE_META[t];
          const Icon = meta.icon;
          return (
            <button
              key={t}
              type="button"
              onClick={() => openDialog(t)}
              className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border-2 border-dashed transition-all ${meta.btnClass}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{meta.label}</span>
              <span className="text-[10px] text-muted-foreground">+ Adicionar</span>
            </button>
          );
        })}
      </div>

      {/* Lista por categoria */}
      <div className="space-y-3">
        {(Object.keys(grouped) as RelationType[]).map((t) => {
          const list = grouped[t];
          if (list.length === 0) return null;
          const meta = TYPE_META[t];
          const Icon = meta.icon;
          return (
            <Card key={t} className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wide">{meta.label}</span>
                <Badge variant="outline" className="text-[10px] ml-auto">{list.length}</Badge>
              </div>
              <div className="space-y-1.5">
                {list.map((r) => {
                  const isOutgoing = r.source_activity_id === activityId;
                  const otherId = isOutgoing ? r.target_activity_id : r.source_activity_id;
                  const dirLabel = isOutgoing ? meta.outgoingLabel : meta.incomingLabel;
                  const otherStatus = statusOf(otherId);
                  const isCompleted = otherStatus === "completed";
                  return (
                    <div key={r.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded border border-border/50 group">
                      <Badge variant="outline" className="text-[9px] shrink-0 uppercase">
                        {dirLabel}
                      </Badge>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className={`text-sm flex-1 truncate ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                        {titleOf(otherId)}
                      </span>
                      {isCompleted && (
                        <Badge variant="outline" className="text-[9px] bg-success/10 text-success border-success/30 shrink-0">
                          Concluída
                        </Badge>
                      )}
                      <Button
                        size="icon" variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                        onClick={() => handleDelete(r.id)}
                        title="Remover vínculo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Diálogo de criação */}
      <Dialog open={!!dialogType} onOpenChange={(o) => { if (!o) setDialogType(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogType && (() => {
                const Icon = TYPE_META[dialogType].icon;
                return <Icon className="w-5 h-5" />;
              })()}
              Adicionar: {dialogType ? TYPE_META[dialogType].label : ""}
            </DialogTitle>
          </DialogHeader>

          {dialogType && (
            <div className="space-y-3">
              {/* Direção (apenas para tipos com sentido) */}
              {dialogType !== "related" && (
                <div>
                  <Label className="text-xs">Sentido</Label>
                  <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dialogType === "blocking" && (
                        <>
                          <SelectItem value="outgoing">Esta tarefa BLOQUEIA outra</SelectItem>
                          <SelectItem value="incoming">Esta tarefa ESTÁ BLOQUEADA por outra</SelectItem>
                        </>
                      )}
                      {dialogType === "waiting_on" && (
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
                <Label className="text-xs">Buscar tarefa</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Digite o título..."
                    className="pl-8 h-9"
                  />
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto border border-border rounded-md divide-y divide-border">
                {candidates.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground italic text-center">Nenhuma tarefa encontrada.</p>
                ) : candidates.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedTargetId(a.id)}
                    className={`w-full text-left p-2 text-sm hover:bg-accent/40 transition-colors flex items-center gap-2 ${
                      selectedTargetId === a.id ? "bg-primary/10 ring-1 ring-primary" : ""
                    }`}
                  >
                    {a.status === "completed" && <Badge variant="outline" className="text-[9px] bg-success/10 text-success border-success/30">✓</Badge>}
                    <span className={a.status === "completed" ? "line-through text-muted-foreground" : ""}>{a.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!selectedTargetId} className="gap-2">
              <Plus className="w-4 h-4" /> Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};