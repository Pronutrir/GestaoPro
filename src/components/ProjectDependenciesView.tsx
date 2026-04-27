import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, ArrowRight, Search, X, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  projectId: string;
  onEditActivity?: (activityId: string) => void;
}

interface DepRow {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
}
interface ActivityOpt { id: string; title: string; }

const TYPE_LABEL: Record<string, string> = {
  finish_to_start: "FS",
  start_to_start: "SS",
  finish_to_finish: "FF",
  start_to_finish: "SF",
};

export const ProjectDependenciesView = ({ projectId, onEditActivity }: Props) => {
  const { toast } = useToast();
  const [deps, setDeps] = useState<DepRow[]>([]);
  const [activities, setActivities] = useState<ActivityOpt[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const { data: actData } = await supabase
      .from("activities")
      .select("id, title")
      .eq("project_id", projectId)
      .eq("is_trashed", false);
    const list = (actData || []) as ActivityOpt[];
    setActivities(list);
    if (list.length === 0) {
      setDeps([]);
      setLoading(false);
      return;
    }
    const ids = list.map((a) => a.id);
    const { data: depData } = await supabase
      .from("task_dependencies")
      .select("id, predecessor_id, successor_id, dependency_type")
      .or(`predecessor_id.in.(${ids.join(",")}),successor_id.in.(${ids.join(",")})`);
    setDeps((depData || []) as DepRow[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel(`project-deps-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_dependencies" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const titleOf = (id: string) => activities.find((a) => a.id === id)?.title || "—";

  const handleDelete = async (id: string) => {
    await supabase.from("task_dependencies").delete().eq("id", id);
    toast({ title: "Vínculo removido" });
    fetchAll();
  };

  const filtered = deps.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      titleOf(d.predecessor_id).toLowerCase().includes(q) ||
      titleOf(d.successor_id).toLowerCase().includes(q)
    );
  });

  // Map por atividade para o "índice"
  const byActivity = new Map<string, { pred: DepRow[]; succ: DepRow[] }>();
  deps.forEach((d) => {
    const s = byActivity.get(d.successor_id) || { pred: [], succ: [] };
    s.pred.push(d); byActivity.set(d.successor_id, s);
    const p = byActivity.get(d.predecessor_id) || { pred: [], succ: [] };
    p.succ.push(d); byActivity.set(d.predecessor_id, p);
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Dependências entre tarefas
            <Badge variant="outline" className="text-xs">{deps.length} vínculo{deps.length !== 1 ? "s" : ""}</Badge>
          </h2>
          <div className="relative w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tarefa..."
              className="pl-8 h-9"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Para criar um vínculo, abra a tarefa e use a seção <strong>Tarefas vinculadas</strong>.
          Aqui você vê todos os vínculos do projeto e pode removê-los.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground italic">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground italic border-2 border-dashed border-border rounded-lg">
            {deps.length === 0
              ? "Nenhuma dependência criada ainda. Abra uma tarefa e adicione predecessoras/sucessoras."
              : "Nenhum vínculo corresponde à busca."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => (
              <div key={d.id} className="flex items-center gap-2 p-3 bg-muted/30 rounded-md border border-border group hover:bg-muted/50 transition-colors">
                <button
                  onClick={() => onEditActivity?.(d.predecessor_id)}
                  className="text-sm font-medium text-foreground hover:text-primary truncate max-w-[36%] text-left"
                  title="Abrir predecessora"
                >
                  {titleOf(d.predecessor_id)}
                </button>
                <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                <Badge variant="outline" className="text-[10px] shrink-0">{TYPE_LABEL[d.dependency_type]}</Badge>
                <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                <button
                  onClick={() => onEditActivity?.(d.successor_id)}
                  className="text-sm font-medium text-foreground hover:text-primary truncate flex-1 text-left"
                  title="Abrir sucessora"
                >
                  {titleOf(d.successor_id)}
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                  onClick={() => onEditActivity?.(d.successor_id)}
                  title="Editar sucessora"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100"
                  onClick={() => handleDelete(d.id)}
                  title="Remover vínculo"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-bold mb-2">Como funciona</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li><strong>FS (Finish-to-Start)</strong>: a sucessora começa após a predecessora terminar (mais comum).</li>
          <li><strong>SS</strong>: ambas iniciam juntas.</li>
          <li><strong>FF</strong>: ambas terminam juntas.</li>
          <li><strong>SF</strong>: a sucessora termina após a predecessora começar.</li>
          <li>Ao mover o prazo de uma predecessora, as sucessoras são deslocadas automaticamente respeitando feriados e finais de semana.</li>
        </ul>
      </Card>
    </div>
  );
};
