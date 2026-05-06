import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { useAppConfirm } from "@/components/AppConfirmProvider";

interface KeyResult {
  id: string;
  title: string;
  metric_type: string;
  start_value: number;
  target_value: number;
  current_value: number;
  unit: string | null;
}

interface ProjectLink {
  id: string;
  key_result_id: string;
  project_id: string;
  project_title?: string;
}

interface Project { id: string; title: string; }

interface Props {
  objectiveId: string;
  onProgressUpdated: () => void;
}

export const KeyResultsPanel = ({ objectiveId, onProgressUpdated }: Props) => {
  const appConfirm = useAppConfirm();
  const [krs, setKrs] = useState<KeyResult[]>([]);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [adding, setAdding] = useState(false);
  const [newKr, setNewKr] = useState({ title: "", start_value: 0, target_value: 100, current_value: 0, unit: "" });
  const [linkingKrId, setLinkingKrId] = useState<string | null>(null);

  const fetchAll = async () => {
    const [krsRes, linksRes, projRes] = await Promise.all([
      supabase.from("okr_key_results").select("*").eq("objective_id", objectiveId).order("created_at"),
      supabase.from("okr_project_links").select("*, key_result:okr_key_results!inner(objective_id)").eq("key_result.objective_id", objectiveId),
      supabase.from("projects").select("id,title").order("title"),
    ]);
    setKrs((krsRes.data as KeyResult[]) || []);
    setProjects((projRes.data as Project[]) || []);
    const projMap = new Map((projRes.data || []).map((p: any) => [p.id, p.title]));
    setLinks(((linksRes.data as any[]) || []).map(l => ({
      id: l.id, key_result_id: l.key_result_id, project_id: l.project_id,
      project_title: projMap.get(l.project_id) || "?",
    })));
  };

  useEffect(() => { fetchAll(); }, [objectiveId]);

  const recalcObjective = async (krsForCalc: KeyResult[]) => {
    if (krsForCalc.length === 0) {
      await supabase.from("okr_objectives").update({ progress: 0 }).eq("id", objectiveId);
      onProgressUpdated();
      return;
    }
    const sum = krsForCalc.reduce((acc, kr) => {
      const range = kr.target_value - kr.start_value;
      if (range === 0) return acc + (kr.current_value >= kr.target_value ? 100 : 0);
      const pct = ((kr.current_value - kr.start_value) / range) * 100;
      return acc + Math.max(0, Math.min(100, pct));
    }, 0);
    const avg = sum / krsForCalc.length;
    await supabase.from("okr_objectives").update({ progress: avg }).eq("id", objectiveId);
    onProgressUpdated();
  };

  const addKr = async () => {
    if (!newKr.title.trim()) return toast.error("Informe o título");
    const { data, error } = await supabase
      .from("okr_key_results")
      .insert({ objective_id: objectiveId, ...newKr, title: newKr.title.trim(), unit: newKr.unit.trim() || null })
      .select()
      .single();
    if (error) return toast.error("Erro ao adicionar");
    const updated = [...krs, data as KeyResult];
    setKrs(updated);
    await recalcObjective(updated);
    setNewKr({ title: "", start_value: 0, target_value: 100, current_value: 0, unit: "" });
    setAdding(false);
    toast.success("Resultado-chave adicionado");
  };

  const updateKrValue = async (kr: KeyResult, current: number) => {
    const updated = krs.map(k => k.id === kr.id ? { ...k, current_value: current } : k);
    setKrs(updated);
    await supabase.from("okr_key_results").update({ current_value: current }).eq("id", kr.id);
    await recalcObjective(updated);
  };

  const deleteKr = async (id: string) => {
    const ok = await appConfirm({
      title: "Excluir resultado-chave",
      description: "Excluir este resultado-chave?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await supabase.from("okr_key_results").delete().eq("id", id);
    const updated = krs.filter(k => k.id !== id);
    setKrs(updated);
    await recalcObjective(updated);
    toast.success("Resultado-chave excluído");
  };

  const linkProject = async (krId: string, projectId: string) => {
    const { error } = await supabase.from("okr_project_links").insert({ key_result_id: krId, project_id: projectId });
    if (error) return toast.error("Já vinculado ou erro ao vincular");
    toast.success("Projeto vinculado");
    setLinkingKrId(null);
    fetchAll();
  };

  const unlinkProject = async (linkId: string) => {
    await supabase.from("okr_project_links").delete().eq("id", linkId);
    fetchAll();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Resultados-Chave</h4>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar KR
          </Button>
        )}
      </div>

      {adding && (
        <div className="border border-border rounded-lg p-3 bg-card space-y-2">
          <Input
            placeholder="Título do resultado-chave"
            value={newKr.title}
            onChange={(e) => setNewKr({ ...newKr, title: e.target.value })}
          />
          <div className="grid grid-cols-4 gap-2">
            <Input type="number" placeholder="Inicial" value={newKr.start_value} onChange={(e) => setNewKr({ ...newKr, start_value: parseFloat(e.target.value) || 0 })} />
            <Input type="number" placeholder="Atual" value={newKr.current_value} onChange={(e) => setNewKr({ ...newKr, current_value: parseFloat(e.target.value) || 0 })} />
            <Input type="number" placeholder="Alvo" value={newKr.target_value} onChange={(e) => setNewKr({ ...newKr, target_value: parseFloat(e.target.value) || 0 })} />
            <Input placeholder="Unidade" value={newKr.unit} onChange={(e) => setNewKr({ ...newKr, unit: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
            <Button size="sm" onClick={addKr}>Salvar KR</Button>
          </div>
        </div>
      )}

      {krs.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhum resultado-chave ainda.</p>
      )}

      {krs.map(kr => {
        const range = kr.target_value - kr.start_value;
        const pct = range === 0
          ? (kr.current_value >= kr.target_value ? 100 : 0)
          : Math.max(0, Math.min(100, ((kr.current_value - kr.start_value) / range) * 100));
        const krLinks = links.filter(l => l.key_result_id === kr.id);

        return (
          <div key={kr.id} className="border border-border rounded-lg p-3 bg-card">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground flex-1">{kr.title}</p>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setLinkingKrId(linkingKrId === kr.id ? null : kr.id)}>
                  <Link2 className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteKr(kr.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground">{kr.start_value}</span>
                <span className="text-muted-foreground">→</span>
                <Input
                  type="number"
                  className="h-7 w-20 text-xs"
                  value={kr.current_value}
                  onChange={(e) => updateKrValue(kr, parseFloat(e.target.value) || 0)}
                />
                <span className="text-muted-foreground">/ {kr.target_value} {kr.unit || ""}</span>
              </div>
              <Progress value={pct} className="h-2 flex-1" />
              <span className="text-xs font-mono w-10 text-right">{Math.round(pct)}%</span>
            </div>

            {krLinks.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {krLinks.map(l => (
                  <Badge key={l.id} variant="secondary" className="text-[10px] gap-1">
                    {l.project_title}
                    <button onClick={() => unlinkProject(l.id)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {linkingKrId === kr.id && (
              <div className="mt-2 flex items-center gap-2">
                <select
                  className="h-8 px-2 rounded-md border border-input bg-background text-xs flex-1"
                  defaultValue=""
                  onChange={(e) => e.target.value && linkProject(kr.id, e.target.value)}
                >
                  <option value="">Vincular projeto…</option>
                  {projects
                    .filter(p => !krLinks.some(l => l.project_id === p.id))
                    .map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};