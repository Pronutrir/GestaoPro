'use client';
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Target, Trash2, Pencil, Link2 } from "lucide-react";
import { toast } from "sonner";
import { ObjectiveDialog } from "@/components/okr/ObjectiveDialog";
import { KeyResultsPanel } from "@/components/okr/KeyResultsPanel";
import { useAppConfirm } from "@/components/AppConfirmProvider";

export interface Objective {
  id: string;
  title: string;
  description: string | null;
  owner: string | null;
  cycle: string;
  year: number;
  status: string;
  progress: number;
}

const statusColor: Record<string, string> = {
  on_track: "bg-success text-success-foreground",
  at_risk: "bg-warning text-warning-foreground",
  off_track: "bg-destructive text-destructive-foreground",
  done: "bg-primary text-primary-foreground",
};

const statusLabel: Record<string, string> = {
  on_track: "No Caminho",
  at_risk: "Em Atenção",
  off_track: "Fora do Caminho",
  done: "Concluído",
};

const OKRs = () => {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Objective | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterCycle, setFilterCycle] = useState<string>("all");
  const appConfirm = useAppConfirm();

  const fetchData = async () => {
    const { data, error } = await supabase
      .from("okr_objectives")
      .select("*")
      .order("year", { ascending: false })
      .order("cycle", { ascending: true });
    if (error) toast.error("Erro ao carregar OKRs");
    setObjectives((data as Objective[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: "Excluir objetivo",
      description: "Excluir este objetivo e todos os seus resultados-chave?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("okr_objectives").delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir");
    toast.success("Objetivo excluído");
    fetchData();
  };

  const cycles = Array.from(new Set(objectives.map(o => `${o.year}-${o.cycle}`))).sort().reverse();
  const filtered = filterCycle === "all"
    ? objectives
    : objectives.filter(o => `${o.year}-${o.cycle}` === filterCycle);

  return (
          <div className="px-6 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Target className="w-6 h-6 text-primary" /> Objetivos & Resultados-Chave
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Defina objetivos estratégicos, mensure progresso e conecte projetos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterCycle}
              onChange={(e) => setFilterCycle(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="all">Todos os ciclos</option>
              {cycles.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Novo Objetivo
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando…</div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <Target className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Nenhum objetivo cadastrado</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Comece criando seu primeiro objetivo estratégico para o ciclo atual.
            </p>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Criar Objetivo
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((obj) => (
              <Card key={obj.id} className="overflow-hidden">
                <div
                  className="p-4 flex items-start gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpanded(expanded === obj.id ? null : obj.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-foreground">{obj.title}</h3>
                      <Badge variant="outline" className="text-[10px]">
                        {obj.year} · {obj.cycle}
                      </Badge>
                      <Badge className={`text-[10px] ${statusColor[obj.status] || ""}`}>
                        {statusLabel[obj.status] || obj.status}
                      </Badge>
                      {obj.owner && <span className="text-xs text-muted-foreground">👤 {obj.owner}</span>}
                    </div>
                    {obj.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{obj.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={Number(obj.progress) || 0} className="h-2 flex-1" />
                      <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                        {Math.round(Number(obj.progress) || 0)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); setEditing(obj); setDialogOpen(true); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(obj.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {expanded === obj.id && (
                  <div className="border-t border-border bg-muted/20 p-4">
                    <KeyResultsPanel objectiveId={obj.id} onProgressUpdated={fetchData} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        <ObjectiveDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          objective={editing}
          onSaved={fetchData}
        />
      </div>
    
  );
};

export default OKRs;