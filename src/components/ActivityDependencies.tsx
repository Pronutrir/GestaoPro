import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link2, Plus, X, ArrowRight, ArrowLeft, Search, CheckCircle2, Info } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ActivityDependenciesProps {
  activityId: string;
  projectId: string;
}

interface DepRow {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
}

interface ActivityOpt {
  id: string;
  title: string;
}

const TYPE_LABEL: Record<string, string> = {
  finish_to_start: "FS (começa após a predecessora terminar)",
  start_to_start: "SS (começam juntas)",
  finish_to_finish: "FF (terminam juntas)",
  start_to_finish: "SF (termina após a predecessora começar)",
};

export const ActivityDependencies = ({ activityId, projectId }: ActivityDependenciesProps) => {
  const { toast } = useToast();
  const [deps, setDeps] = useState<DepRow[]>([]);
  const [activities, setActivities] = useState<ActivityOpt[]>([]);
  const [adding, setAdding] = useState<"pred" | "succ" | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [type, setType] = useState("finish_to_start");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  const fetchAll = async () => {
    const [{ data: depData }, { data: actData }] = await Promise.all([
      supabase
        .from("task_dependencies")
        .select("id, predecessor_id, successor_id, dependency_type")
        .or(`predecessor_id.eq.${activityId},successor_id.eq.${activityId}`),
      supabase
        .from("activities")
        .select("id, title")
        .eq("project_id", projectId)
        .eq("is_trashed", false)
        .neq("id", activityId)
        .order("title"),
    ]);
    setDeps((depData || []) as DepRow[]);
    setActivities((actData || []) as ActivityOpt[]);
  };

  useEffect(() => {
    if (activityId && projectId) fetchAll();
  }, [activityId, projectId]);

  const handleAdd = async () => {
    if (!selectedId || saving) return;
    setSaving(true);
    const payload =
      adding === "pred"
        ? { predecessor_id: selectedId, successor_id: activityId, dependency_type: type }
        : { predecessor_id: activityId, successor_id: selectedId, dependency_type: type };
    const { data, error } = await supabase
      .from("task_dependencies")
      .insert(payload)
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast({
        title: "Erro ao vincular",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    const otherTitle = activities.find((a) => a.id === selectedId)?.title || "Atividade";
    toast({
      title: "✅ Vínculo criado",
      description:
        adding === "pred"
          ? `Esta atividade agora depende de "${otherTitle}".`
          : `"${otherTitle}" agora depende desta atividade.`,
    });
    if (data?.id) {
      setJustSavedId(data.id);
      setTimeout(() => setJustSavedId(null), 2500);
    }
    setAdding(null);
    setSelectedId("");
    setSearch("");
    setType("finish_to_start");
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("task_dependencies").delete().eq("id", id);
    fetchAll();
  };

  const titleOf = (id: string) => activities.find((a) => a.id === id)?.title || "—";

  const predecessors = deps.filter((d) => d.successor_id === activityId);
  const successors = deps.filter((d) => d.predecessor_id === activityId);

  const renderRow = (d: DepRow, otherId: string, isPred: boolean) => (
    <div
      key={d.id}
      className={`flex items-center gap-2 p-2 rounded-md border group transition-colors ${
        justSavedId === d.id
          ? "bg-emerald-500/10 border-emerald-500/40 animate-in fade-in"
          : "bg-muted/30 border-border/50"
      }`}
    >
      {isPred ? (
        <ArrowLeft className="w-3.5 h-3.5 text-primary shrink-0" />
      ) : (
        <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
      )}
      <span className="text-xs font-medium flex-1 truncate">{titleOf(otherId)}</span>
      <span className="text-[10px] text-muted-foreground">
        {TYPE_LABEL[d.dependency_type] || d.dependency_type}
      </span>
      {justSavedId === d.id && (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100"
        onClick={() => handleDelete(d.id)}
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  const total = deps.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" /> Tarefas vinculadas
          {total > 0 && (
            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {total} vínculo{total > 1 ? "s" : ""}
            </span>
          )}
        </h3>
      </div>
      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 bg-muted/30 rounded-md p-2 border border-border/50">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>
          <strong>Predecessora</strong> = atividade que precisa terminar antes desta começar.
          <strong className="ml-1">Sucessora</strong> = atividade que só começa após esta terminar.
          Após escolher, clique em <strong>Vincular</strong> para salvar.
        </span>
      </p>

      {/* Predecessoras */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Predecessoras (esta depende de)</Label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={() => {
              setAdding(adding === "pred" ? null : "pred");
              setSelectedId("");
              setSearch("");
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Predecessora
          </Button>
        </div>
        {predecessors.length === 0 && adding !== "pred" && (
          <p className="text-[11px] text-muted-foreground italic">Nenhuma</p>
        )}
        {predecessors.map((d) => renderRow(d, d.predecessor_id, true))}
      </div>

      {/* Sucessoras */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Sucessoras (dependem desta)</Label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={() => {
              setAdding(adding === "succ" ? null : "succ");
              setSelectedId("");
              setSearch("");
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Sucessora
          </Button>
        </div>
        {successors.length === 0 && adding !== "succ" && (
          <p className="text-[11px] text-muted-foreground italic">Nenhuma</p>
        )}
        {successors.map((d) => renderRow(d, d.successor_id, false))}
      </div>

      {/* Form de adicionar */}
      {adding && (
        <div className="p-3 bg-primary/5 rounded-md border-2 border-primary/40 space-y-2 animate-in fade-in">
          <p className="text-[11px] font-semibold text-primary">
            {adding === "pred"
              ? "1️⃣ Escolha a atividade que esta DEPENDE  →  2️⃣ Escolha o tipo  →  3️⃣ Clique Vincular"
              : "1️⃣ Escolha a atividade que DEPENDE desta  →  2️⃣ Escolha o tipo  →  3️⃣ Clique Vincular"}
          </p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título ou ID..."
              className="h-9 pl-7 text-xs"
            />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background">
            {(() => {
              const q = search.trim().toLowerCase();
              const list = q
                ? activities.filter(
                    (a) =>
                      a.title.toLowerCase().includes(q) ||
                      a.id.toLowerCase().includes(q)
                  )
                : activities;
              if (list.length === 0) {
                return (
                  <p className="text-[11px] text-muted-foreground italic p-2">
                    Nenhuma atividade encontrada.
                  </p>
                );
              }
              return list.slice(0, 50).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted/60 border-b border-border/50 last:border-0 flex items-center gap-2 ${
                    selectedId === a.id ? "bg-primary/10 text-primary font-medium" : ""
                  }`}
                >
                  <span className="flex-1 truncate">{a.title}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {a.id.slice(0, 8)}
                  </span>
                </button>
              ));
            })()}
          </div>
          <div className="flex gap-2">
            <select
              className="flex h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1"
              onClick={handleAdd}
              disabled={!selectedId || saving}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {saving ? "Salvando..." : "Vincular"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9"
              onClick={() => { setAdding(null); setSearch(""); setSelectedId(""); }}
            >
              Cancelar
            </Button>
          </div>
          {!selectedId && (
            <p className="text-[10px] text-amber-600 font-medium">
              ⚠ Selecione uma atividade da lista acima para habilitar o botão Vincular.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-xs font-semibold text-muted-foreground">{children}</span>
);