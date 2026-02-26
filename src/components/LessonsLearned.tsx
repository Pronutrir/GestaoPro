import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Plus, Pencil, Trash2, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Lesson {
  id: string;
  project_id: string;
  phase_id: string | null;
  category: string;
  problem: string;
  solution: string | null;
  suggestion: string | null;
  impact: string | null;
  reported_by: string | null;
  created_at: string;
}

interface Phase {
  id: string;
  title: string;
}

interface LessonsLearnedProps {
  projectId: string;
  phases: Phase[];
}

const CATEGORIES = [
  { value: "general", label: "Geral" },
  { value: "technical", label: "Técnico" },
  { value: "process", label: "Processo" },
  { value: "communication", label: "Comunicação" },
  { value: "risk", label: "Risco" },
  { value: "quality", label: "Qualidade" },
];

export const LessonsLearned = ({ projectId, phases }: LessonsLearnedProps) => {
  const { toast } = useToast();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    category: "general",
    problem: "",
    solution: "",
    suggestion: "",
    impact: "",
    reported_by: "",
    phase_id: "",
  });

  useEffect(() => {
    fetchLessons();
  }, [projectId]);

  const fetchLessons = async () => {
    const { data, error } = await supabase
      .from("lessons_learned")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (!error && data) setLessons(data);
  };

  const resetForm = () => {
    setForm({ category: "general", problem: "", solution: "", suggestion: "", impact: "", reported_by: "", phase_id: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.problem.trim()) {
      toast({ title: "Descreva o problema", variant: "destructive" });
      return;
    }

    const payload = {
      project_id: projectId,
      category: form.category,
      problem: form.problem,
      solution: form.solution || null,
      suggestion: form.suggestion || null,
      impact: form.impact || null,
      reported_by: form.reported_by || null,
      phase_id: form.phase_id || null,
    };

    if (editingId) {
      const { error } = await supabase.from("lessons_learned").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); return; }
      toast({ title: "Lição atualizada!" });
    } else {
      const { error } = await supabase.from("lessons_learned").insert(payload);
      if (error) { toast({ title: "Erro ao registrar", variant: "destructive" }); return; }
      toast({ title: "Lição registrada!" });
    }

    resetForm();
    fetchLessons();
  };

  const handleEdit = (lesson: Lesson) => {
    setForm({
      category: lesson.category,
      problem: lesson.problem,
      solution: lesson.solution || "",
      suggestion: lesson.suggestion || "",
      impact: lesson.impact || "",
      reported_by: lesson.reported_by || "",
      phase_id: lesson.phase_id || "",
    });
    setEditingId(lesson.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta lição?")) return;
    await supabase.from("lessons_learned").delete().eq("id", id);
    fetchLessons();
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          Lições Aprendidas
        </h3>
        <Button size="sm" variant={showForm ? "secondary" : "default"} onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }} className="gap-1">
          <Plus className="w-4 h-4" />
          {showForm ? "Cancelar" : "Nova Lição"}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 p-4 bg-accent/30 rounded-lg border border-border">
          <div className="grid grid-cols-2 gap-3">
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {phases.length > 0 && (
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.phase_id}
                onChange={(e) => setForm({ ...form, phase_id: e.target.value })}
              >
                <option value="">Fase (opcional)</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            )}
          </div>
          <Textarea
            placeholder="Problema encontrado *"
            value={form.problem}
            onChange={(e) => setForm({ ...form, problem: e.target.value })}
            rows={2}
          />
          <Textarea
            placeholder="Solução aplicada"
            value={form.solution}
            onChange={(e) => setForm({ ...form, solution: e.target.value })}
            rows={2}
          />
          <Textarea
            placeholder="Sugestão para o futuro"
            value={form.suggestion}
            onChange={(e) => setForm({ ...form, suggestion: e.target.value })}
            rows={2}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Impacto (ex: Alto, Médio, Baixo)"
              value={form.impact}
              onChange={(e) => setForm({ ...form, impact: e.target.value })}
            />
            <Input
              placeholder="Reportado por"
              value={form.reported_by}
              onChange={(e) => setForm({ ...form, reported_by: e.target.value })}
            />
          </div>
          <Button onClick={handleSubmit}>{editingId ? "Atualizar" : "Registrar"}</Button>
        </div>
      )}

      {lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhuma lição registrada ainda
        </p>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {lessons.map((lesson) => (
            <div key={lesson.id} className="p-4 border border-border rounded-lg bg-card group hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {CATEGORIES.find((c) => c.value === lesson.category)?.label || lesson.category}
                    </Badge>
                    {lesson.phase_id && (
                      <Badge className="bg-primary/20 text-primary text-xs">
                        {phases.find((p) => p.id === lesson.phase_id)?.title}
                      </Badge>
                    )}
                    {lesson.impact && (
                      <Badge variant="secondary" className="text-xs">{lesson.impact}</Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div>
                      <span className="text-xs font-semibold text-destructive">Problema:</span>
                      <p className="text-sm text-foreground">{lesson.problem}</p>
                    </div>
                    {lesson.solution && (
                      <div>
                        <span className="text-xs font-semibold text-success">Solução:</span>
                        <p className="text-sm text-foreground">{lesson.solution}</p>
                      </div>
                    )}
                    {lesson.suggestion && (
                      <div>
                        <span className="text-xs font-semibold text-primary flex items-center gap-1">
                          <Lightbulb className="w-3 h-3" /> Sugestão:
                        </span>
                        <p className="text-sm text-foreground">{lesson.suggestion}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                    {lesson.reported_by && <span>👤 {lesson.reported_by}</span>}
                    <span>{new Date(lesson.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(lesson)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(lesson.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
