import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIAssistButton } from "@/components/AIAssistButton";
import { BookOpen, Plus, Pencil, Trash2, Lightbulb, Search } from "lucide-react";
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
  const [globalLessons, setGlobalLessons] = useState<(Lesson & { project_title?: string })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showGlobal, setShowGlobal] = useState(false);
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
      .eq("is_trashed", false)
      .order("created_at", { ascending: false });

    if (!error && data) setLessons(data);
  };

  const handleGlobalSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setGlobalLessons([]);
      return;
    }
    const { data } = await supabase
      .from("lessons_learned")
      .select("*")
      .eq("is_trashed", false)
      .or(`problem.ilike.%${term}%,solution.ilike.%${term}%,suggestion.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (data) {
      // Fetch project titles for results
      const projectIds = [...new Set(data.map(l => l.project_id))];
      const { data: projects } = await supabase
        .from("projects")
        .select("id, title")
        .in("id", projectIds);
      
      const projectMap = new Map(projects?.map(p => [p.id, p.title]) || []);
      setGlobalLessons(data.map(l => ({ ...l, project_title: projectMap.get(l.project_id) || "Projeto" })));
    }
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
    await supabase.from("lessons_learned").update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq("id", id);
    fetchLessons();
  };

  const renderLesson = (lesson: Lesson & { project_title?: string }, showProject = false) => (
    <div key={lesson.id} className="p-4 border border-border rounded-lg bg-card group hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-xs">
              {CATEGORIES.find((c) => c.value === lesson.category)?.label || lesson.category}
            </Badge>
            {showProject && lesson.project_title && (
              <Badge className="bg-primary/20 text-primary text-xs">{lesson.project_title}</Badge>
            )}
            {!showProject && lesson.phase_id && (
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
        {!showProject && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(lesson)}>
              <Pencil className="w-3 h-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(lesson.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          Lições Aprendidas
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant={showGlobal ? "secondary" : "outline"} onClick={() => setShowGlobal(!showGlobal)} className="gap-1">
            <Search className="w-3 h-3" />
            {showGlobal ? "Este Projeto" : "Busca Global"}
          </Button>
          <Button size="sm" variant={showForm ? "secondary" : "default"} onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }} className="gap-1">
            <Plus className="w-4 h-4" />
            {showForm ? "Cancelar" : "Nova Lição"}
          </Button>
        </div>
      </div>

      {/* Global Search */}
      {showGlobal && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar em todas as lições de todos os projetos..."
              value={searchTerm}
              onChange={(e) => handleGlobalSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          {globalLessons.length > 0 && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {globalLessons.map(lesson => renderLesson(lesson, true))}
            </div>
          )}
          {searchTerm.length >= 2 && globalLessons.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma lição encontrada para "{searchTerm}"</p>
          )}
        </div>
      )}

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
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Problema *</span>
              <AIAssistButton value={form.problem} onChange={(v) => setForm({ ...form, problem: v })} context="lesson_problem" />
            </div>
            <Textarea placeholder="Problema encontrado *" value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} rows={2} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Solução</span>
              <AIAssistButton value={form.solution} onChange={(v) => setForm({ ...form, solution: v })} context="lesson_solution" />
            </div>
            <Textarea placeholder="Solução aplicada" value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} rows={2} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Sugestão</span>
              <AIAssistButton value={form.suggestion} onChange={(v) => setForm({ ...form, suggestion: v })} context="lesson_suggestion" />
            </div>
            <Textarea placeholder="Sugestão para o futuro" value={form.suggestion} onChange={(e) => setForm({ ...form, suggestion: e.target.value })} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Impacto (ex: Alto, Médio, Baixo)" value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} />
            <Input placeholder="Reportado por" value={form.reported_by} onChange={(e) => setForm({ ...form, reported_by: e.target.value })} />
          </div>
          <Button onClick={handleSubmit}>{editingId ? "Atualizar" : "Registrar"}</Button>
        </div>
      )}

      {!showGlobal && (
        <>
          {lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma lição registrada ainda
            </p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {lessons.map((lesson) => renderLesson(lesson))}
            </div>
          )}
        </>
      )}
    </Card>
  );
};
