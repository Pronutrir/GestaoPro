'use client';
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AIAssistButton } from "@/components/AIAssistButton";
import { BookOpen, Plus, Pencil, Trash2, Lightbulb, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { useAssigneeAvatarLookup } from "@/hooks/useAssigneeAvatarLookup";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { useAuth } from "@/contexts/AuthContext";
import { LessonPromptCard } from "@/components/licoes/LessonPromptCard";
import { LessonLifecycle } from "@/components/licoes/LessonLifecycle";
import { LessonInsights } from "@/components/licoes/LessonInsights";
import {
  TRIGGER_META, relevantLessons,
  type LessonPrompt, type Lesson as LessonType,
} from "@/lib/lessons";

// Tabela e colunas novas ainda fora dos tipos gerados (migration pendente).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

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
  const appConfirm = useAppConfirm();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [globalLessons, setGlobalLessons] = useState<(Lesson & { project_title?: string })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showGlobal, setShowGlobal] = useState(false);
  const reportedByAvatarMap = useAssigneeAvatarLookup([
    ...lessons.map((lesson) => lesson.reported_by),
    ...globalLessons.map((lesson) => lesson.reported_by),
  ]);
  const [form, setForm] = useState({
    category: "general",
    problem: "",
    solution: "",
    suggestion: "",
    impact: "",
    reported_by: "",
    phase_id: "",
  });

  // ===== Captura por evento e entrega no momento certo =====
  const { user, profile } = useAuth();
  const [prompts, setPrompts] = useState<LessonPrompt[]>([]);
  const [blockers, setBlockers] = useState<{ reason: string | null; days: number | null; title: string }[]>([]);
  const [people, setPeople] = useState<{ id: string; full_name: string; sector: string | null; role_title?: string | null; avatar_url?: string | null }[]>([]);
  const [promptsUnavailable, setPromptsUnavailable] = useState(false);

  useEffect(() => {
    fetchLessons();
    fetchPrompts();
  }, [projectId]);

  const fetchPrompts = async () => {
    // Gera os convites a partir dos eventos do projeto — mesmo padrão do
    // generate_overdue_notifications: chamado ao abrir, idempotente, sem cron.
    await sb.rpc("generate_lesson_prompts", { p_project_id: projectId }).then(() => {}, () => {});

    const [promptRes, blockRes, peopleRes] = await Promise.all([
      sb.from("lesson_prompts").select("*").eq("project_id", projectId)
        .eq("status", "pendente").order("impact_days", { ascending: false }),
      sb.from("activities").select("title, blocked_reason, blocked_days_total")
        .eq("project_id", projectId).eq("is_trashed", false).gt("blocked_days_total", 0),
      supabase.from("profiles").select("id, full_name, sector, role_title, avatar_url")
        .not("full_name", "is", null).order("full_name"),
    ]);

    if (promptRes.error && /lesson_prompts|does not exist|schema cache/i.test(promptRes.error.message || "")) {
      setPromptsUnavailable(true);
      return;
    }
    setPromptsUnavailable(false);
    setPrompts((promptRes.data as LessonPrompt[]) || []);
    if (!blockRes.error) {
      setBlockers(((blockRes.data as { title: string; blocked_reason: string | null; blocked_days_total: number | null }[]) || [])
        .map((b) => ({ title: b.title, reason: b.blocked_reason, days: b.blocked_days_total })));
    }
    setPeople((peopleRes.data as { id: string; full_name: string; sector: string | null }[]) || []);
  };

  /** Registra a lição a partir do convite, com o contexto já vinculado. */
  const registerFromPrompt = async (p: LessonPrompt, data: { problem: string; suggestion: string }) => {
    const meta = TRIGGER_META[p.trigger_type] ?? TRIGGER_META.bloqueio;
    const { data: created, error } = await sb.from("lessons_learned").insert({
      project_id: projectId,
      phase_id: p.phase_id,
      category: meta.category,
      problem: data.problem,
      suggestion: data.suggestion || null,
      impact: p.impact_days ? `${p.impact_days} dia(s)` : null,
      reported_by: profile?.full_name ?? null,
      reported_by_id: user?.id ?? null,
      source_activity_id: p.activity_id,
      source_trigger: p.trigger_type,
      impact_days: p.impact_days,
      lifecycle: "identificada",
    }).select("id").single();

    if (error) {
      toast({ title: "Erro ao registrar a lição", description: error.message, variant: "destructive" });
      return;
    }
    await sb.from("lesson_prompts")
      .update({ status: "respondido", lesson_id: created.id, responded_at: new Date().toISOString() })
      .eq("id", p.id);
    toast({ title: "Lição registrada", description: "Atribua uma ação para que ela vire mudança de verdade." });
    fetchLessons();
    fetchPrompts();
  };

  const dismissPrompt = async (p: LessonPrompt) => {
    await sb.from("lesson_prompts")
      .update({ status: "dispensado", responded_at: new Date().toISOString() })
      .eq("id", p.id);
    fetchPrompts();
  };

  /** Atribui dono e ação — a lição sai de "identificada". */
  const assignAction = async (lessonId: string, ownerId: string, ownerName: string, action: string) => {
    const { error } = await sb.from("lessons_learned").update({
      lifecycle: "acao_atribuida",
      owner_id: ownerId,
      owner_name: ownerName,
      action_text: action,
    }).eq("id", lessonId);
    if (error) {
      toast({ title: "Erro ao atribuir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ação atribuída", description: `${ownerName} ficou responsável pela mudança.` });
    fetchLessons();
  };

  /** Marca como aplicada — com quem verificou e quando. */
  const applyLesson = async (lessonId: string) => {
    const ok = await appConfirm({
      title: "Marcar como aplicada",
      description: "Confirma que a mudança foi feita? O registro guarda seu nome e a data como verificação.",
      confirmText: "Confirmar",
    });
    if (!ok) return;
    const { error } = await sb.from("lessons_learned").update({
      lifecycle: "aplicada",
      applied_at: new Date().toISOString(),
      applied_by_name: profile?.full_name ?? null,
    }).eq("id", lessonId);
    if (error) {
      toast({ title: "Erro ao aplicar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lição aplicada", description: "Agora ela é aprendizado, não só registro." });
    fetchLessons();
  };

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
    const ok = await appConfirm({
      title: "Excluir lição",
      description: "Excluir esta lição?",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
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
            {lesson.reported_by && (
              <span className="inline-flex items-center gap-1">
                <Avatar className="h-4 w-4 shrink-0">
                  {(() => {
                    const avatar = resolveAvatarFromLookup(lesson.reported_by, lesson.reported_by, reportedByAvatarMap);
                    return avatar ? <AvatarImage src={avatar} alt={lesson.reported_by} /> : null;
                  })()}
                  <AvatarFallback className="text-[8px]">{getAvatarInitials(lesson.reported_by)}</AvatarFallback>
                </Avatar>
                <span>{lesson.reported_by}</span>
              </span>
            )}
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

      {/* Ciclo: identificada → ação atribuída → aplicada. Sem ação, é só
          registro — e fica visível como pendência em vez de sumir na lista. */}
      {!showProject && !promptsUnavailable && (
        <LessonLifecycle
          lesson={lesson as LessonType}
          people={people}
          canManage
          onAssign={(ownerId, ownerName, action) => assignAction(lesson.id, ownerId, ownerName, action)}
          onApply={() => applyLesson(lesson.id)}
        />
      )}
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

          {/* A ENTREGA — a parte que a evidência aponta como mais importante.
              Ao escolher fase e categoria, o que já se aprendeu ali aparece
              sozinho: ninguém precisa saber que a lição existe para encontrá-la.
              Sem IA e sem busca. */}
          {(() => {
            const related = relevantLessons(lessons as LessonType[], {
              phaseId: form.phase_id || null,
              category: form.category,
              excludeId: editingId ?? undefined,
            });
            if (related.length === 0) return null;
            return (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <p className="text-[12px] font-semibold text-primary mb-2 flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5" />
                  Já aprendemos isto por aqui
                </p>
                <div className="space-y-1.5">
                  {related.map((l) => (
                    <div key={l.id} className="text-[12px]">
                      <p className="text-foreground truncate" title={l.problem}>{l.problem}</p>
                      {l.suggestion && (
                        <p className="text-muted-foreground truncate" title={l.suggestion}>
                          → {l.suggestion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[10.5px] text-muted-foreground mt-2">
                  Lições da mesma fase ou categoria, priorizando as que viraram mudança.
                </p>
              </div>
            );
          })()}
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
          {/* O sistema perguntando: convites gerados pelos eventos do projeto.
              Vêm ordenados pelo impacto em dias — o que mais custou primeiro. */}
          {prompts.length > 0 && (
            <div className="space-y-2">
              {prompts.slice(0, 3).map((p) => (
                <LessonPromptCard
                  key={p.id}
                  prompt={p}
                  onRegister={(data) => registerFromPrompt(p, data)}
                  onDismiss={() => dismissPrompt(p)}
                />
              ))}
              {prompts.length > 3 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  e mais {prompts.length - 3} evento(s) aguardando registro
                </p>
              )}
            </div>
          )}

          {/* Padrões e métricas de aplicação */}
          <LessonInsights lessons={lessons as LessonType[]} blockers={blockers} />

          {lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {promptsUnavailable
                ? "Nenhuma lição registrada ainda"
                : prompts.length > 0
                  ? "Nenhuma lição registrada ainda — comece pelos eventos detectados acima."
                  : "Nenhuma lição registrada ainda"}
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
