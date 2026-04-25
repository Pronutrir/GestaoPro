import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText, Plus, Trash2, Save, CheckSquare, Loader2, Sparkles,
  Bold, Italic, List, ListOrdered, Heading1, Heading2, Quote,
  Type, ListChecks, ArrowRight,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  title: string;
}

interface PageDoc {
  id: string;
  project_id: string;
  title: string;
  content: any;
  updated_at: string;
}

interface Stage {
  id: string;
  title: string;
  display_order: number;
}

/* ---------- Slash Menu Items ---------- */
const SLASH_ITEMS = [
  { key: "h1", label: "Título 1", icon: Heading1, hint: "Cabeçalho grande" },
  { key: "h2", label: "Título 2", icon: Heading2, hint: "Subtítulo" },
  { key: "p", label: "Texto", icon: Type, hint: "Parágrafo padrão" },
  { key: "ul", label: "Lista com marcadores", icon: List, hint: "Lista simples" },
  { key: "ol", label: "Lista numerada", icon: ListOrdered, hint: "1, 2, 3..." },
  { key: "task", label: "Lista de tarefas", icon: ListChecks, hint: "Checkboxes" },
  { key: "quote", label: "Citação", icon: Quote, hint: "Bloco destacado" },
  { key: "tarefa", label: "Criar tarefa", icon: CheckSquare, hint: "Converte a linha em atividade do Kanban", highlight: true },
] as const;
type SlashKey = typeof SLASH_ITEMS[number]["key"];

export default function DocumentoTest() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [pages, setPages] = useState<PageDoc[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Slash menu state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);

  const editorWrapperRef = useRef<HTMLDivElement>(null);

  /* ---------- Load projects ---------- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, title")
        .eq("is_trashed", false)
        .order("title");
      setProjects(data || []);
      if (data && data.length && !projectId) setProjectId(data[0].id);
    })();
  }, []);

  /* ---------- Load pages + stages when project changes ---------- */
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      const [pagesRes, stagesRes] = await Promise.all([
        supabase
          .from("project_pages" as any)
          .select("id, project_id, title, content, updated_at")
          .eq("project_id", projectId)
          .eq("is_trashed", false)
          .order("updated_at", { ascending: false }),
        supabase
          .from("workflow_stages")
          .select("id, title, display_order")
          .eq("project_id", projectId)
          .order("display_order"),
      ]);
      const list = (pagesRes.data as any[] as PageDoc[]) || [];
      setPages(list);
      setStages(stagesRes.data || []);
      setActivePageId(list[0]?.id ?? null);
      setLoading(false);
    })();
  }, [projectId]);

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) || null,
    [pages, activePageId]
  );

  useEffect(() => {
    setTitleDraft(activePage?.title ?? "");
  }, [activePageId]);

  /* ---------- Editor ---------- */
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: 'Comece a escrever, ou pressione "/" para comandos…',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: activePage?.content ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base max-w-none min-h-[60vh] focus:outline-none px-1 py-4 text-foreground",
      },
    },
  }, [activePageId]);

  /* ---------- Slash detection ---------- */
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const { state } = editor;
      const { from } = state.selection;
      const $from = state.doc.resolve(from);
      const blockStart = $from.start();
      const textBefore = state.doc.textBetween(blockStart, from, "\n", "\0");
      const match = textBefore.match(/(?:^|\s)\/([\w]*)$/);
      if (match) {
        const coords = editor.view.coordsAtPos(from);
        const wrapperRect = editorWrapperRef.current?.getBoundingClientRect();
        if (wrapperRect) {
          setSlashPos({
            top: coords.bottom - wrapperRect.top + 6,
            left: coords.left - wrapperRect.left,
          });
        }
        setSlashQuery(match[1].toLowerCase());
        setSlashIndex(0);
        setSlashOpen(true);
      } else {
        setSlashOpen(false);
      }
    };
    editor.on("update", handler);
    editor.on("selectionUpdate", handler);
    return () => {
      editor.off("update", handler);
      editor.off("selectionUpdate", handler);
    };
  }, [editor]);

  const filteredSlash = useMemo(() => {
    if (!slashQuery) return SLASH_ITEMS as readonly typeof SLASH_ITEMS[number][];
    return SLASH_ITEMS.filter(
      (it) =>
        it.key.includes(slashQuery) ||
        it.label.toLowerCase().includes(slashQuery)
    );
  }, [slashQuery]);

  /* ---------- Apply slash command ---------- */
  const applySlash = useCallback(
    async (key: SlashKey) => {
      if (!editor) return;
      // Remove the typed "/query"
      const { state } = editor;
      const { from } = state.selection;
      const $from = state.doc.resolve(from);
      const blockStart = $from.start();
      const textBefore = state.doc.textBetween(blockStart, from, "\n", "\0");
      const match = textBefore.match(/\/([\w]*)$/);
      const deleteFrom = match ? from - match[0].length : from;
      editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();

      const chain = editor.chain().focus();
      switch (key) {
        case "h1":
          chain.setNode("heading", { level: 1 }).run();
          break;
        case "h2":
          chain.setNode("heading", { level: 2 }).run();
          break;
        case "p":
          chain.setNode("paragraph").run();
          break;
        case "ul":
          chain.toggleBulletList().run();
          break;
        case "ol":
          chain.toggleOrderedList().run();
          break;
        case "task":
          chain.toggleTaskList().run();
          break;
        case "quote":
          chain.toggleBlockquote().run();
          break;
        case "tarefa":
          await convertCurrentLineToTask();
          break;
      }
      setSlashOpen(false);
    },
    [editor, projectId, stages]
  );

  /* ---------- Convert current line into a task ---------- */
  const convertCurrentLineToTask = useCallback(async () => {
    if (!editor || !projectId) return;
    const { state } = editor;
    const { from } = state.selection;
    const $from = state.doc.resolve(from);
    const blockStart = $from.start();
    const blockEnd = $from.end();
    let title = state.doc.textBetween(blockStart, blockEnd, "\n", " ").trim();
    if (!title) title = "Nova atividade";

    const firstStage = stages[0];
    const { data, error } = await supabase
      .from("activities")
      .insert({
        project_id: projectId,
        title,
        status: "pending",
        priority: "medium",
        workflow_stage_id: firstStage?.id ?? null,
      })
      .select("id, title")
      .single();

    if (error) {
      toast.error("Erro ao criar atividade");
      return;
    }

    // Replace the line with a styled task reference
    editor
      .chain()
      .focus()
      .deleteRange({ from: blockStart, to: blockEnd })
      .insertContent({
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "bold" }],
            text: `✅ ${data.title}`,
          },
          { type: "text", text: "  (criada no Kanban)" },
        ],
      })
      .run();

    toast.success("Atividade criada no Kanban", {
      description: data.title,
      action: {
        label: "Abrir projeto",
        onClick: () => window.open(`/project/${projectId}`, "_blank"),
      },
    });
  }, [editor, projectId, stages]);

  /* ---------- Slash menu keyboard ---------- */
  useEffect(() => {
    if (!slashOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, filteredSlash.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filteredSlash[slashIndex];
        if (item) applySlash(item.key as SlashKey);
      } else if (e.key === "Escape") {
        setSlashOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [slashOpen, filteredSlash, slashIndex, applySlash]);

  /* ---------- Save ---------- */
  const savePage = useCallback(async () => {
    if (!editor || !activePage) return;
    setSaving(true);
    const json = editor.getJSON();
    const { error } = await supabase
      .from("project_pages" as any)
      .update({
        title: titleDraft || "Documento sem título",
        content: json as any,
      })
      .eq("id", activePage.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar");
      return;
    }
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? { ...p, title: titleDraft || "Documento sem título", content: json, updated_at: new Date().toISOString() }
          : p
      )
    );
    toast.success("Documento salvo");
  }, [editor, activePage, titleDraft]);

  /* ---------- Auto-save ---------- */
  useEffect(() => {
    if (!editor || !activePage) return;
    const t = setInterval(() => {
      // light auto-save every 20s if dirty
      const json = editor.getJSON();
      if (JSON.stringify(json) !== JSON.stringify(activePage.content) || titleDraft !== activePage.title) {
        savePage();
      }
    }, 20000);
    return () => clearInterval(t);
  }, [editor, activePage, savePage, titleDraft]);

  /* ---------- Create page ---------- */
  const createPage = async () => {
    if (!projectId) {
      toast.error("Selecione um projeto primeiro");
      return;
    }
    const { data, error } = await supabase
      .from("project_pages" as any)
      .insert({
        project_id: projectId,
        title: "Novo documento",
        content: { type: "doc", content: [{ type: "paragraph" }] },
        created_by: user?.id ?? null,
        created_by_email: user?.email ?? null,
      } as any)
      .select("id, project_id, title, content, updated_at")
      .single();
    if (error || !data) {
      toast.error("Erro ao criar documento");
      return;
    }
    const newPage = data as any as PageDoc;
    setPages((prev) => [newPage, ...prev]);
    setActivePageId(newPage.id);
  };

  /* ---------- Delete page ---------- */
  const deletePage = async (id: string) => {
    if (!confirm("Excluir este documento?")) return;
    await supabase
      .from("project_pages" as any)
      .update({ is_trashed: true, trashed_at: new Date().toISOString() } as any)
      .eq("id", id);
    setPages((prev) => prev.filter((p) => p.id !== id));
    if (activePageId === id) setActivePageId(pages[0]?.id ?? null);
    toast.success("Documento removido");
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b bg-card">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Documentos</h2>
              <Badge variant="outline" className="text-[10px]">TESTE</Badge>
            </div>
            <div className="h-6 w-px bg-border" />
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-9 w-[260px]">
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> salvando…
              </span>
            )}
            <Button size="sm" variant="outline" onClick={savePage} disabled={!activePage}>
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-[260px_1fr] overflow-hidden">
          {/* Sidebar */}
          <aside className="border-r bg-muted/20 flex flex-col">
            <div className="p-3 border-b">
              <Button onClick={createPage} className="w-full" size="sm">
                <Plus className="h-4 w-4 mr-1" /> Novo documento
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {loading ? (
                  <div className="text-xs text-muted-foreground p-3">Carregando…</div>
                ) : pages.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-3 text-center">
                    Nenhum documento.
                    <br />Crie o primeiro!
                  </div>
                ) : (
                  pages.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActivePageId(p.id)}
                      className={cn(
                        "group w-full text-left px-2 py-2 rounded-md flex items-start gap-2 transition-colors",
                        activePageId === p.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.title}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(p.updated_at).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <Trash2
                        className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive shrink-0"
                        onClick={(e) => { e.stopPropagation(); deletePage(p.id); }}
                      />
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t bg-card">
              <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Dica
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Digite <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">/</kbd> em qualquer linha para abrir o menu de comandos. Use <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">/tarefa</kbd> para criar uma atividade no Kanban.
              </p>
            </div>
          </aside>

          {/* Editor */}
          <main className="overflow-auto">
            {!activePage ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Selecione ou crie um documento para começar.</p>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto px-8 py-8 relative" ref={editorWrapperRef}>
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder="Título do documento"
                  className="!text-3xl font-bold border-0 px-0 shadow-none focus-visible:ring-0 h-auto py-2 mb-4 placeholder:text-muted-foreground/40"
                />

                {editor && (
                  <div className="sticky top-0 z-10 -mx-2 mb-3 flex items-center gap-0.5 p-1 rounded-md border bg-card/95 backdrop-blur shadow-sm w-fit">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => editor.chain().focus().toggleBold().run()}>
                      <Bold className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => editor.chain().focus().toggleItalic().run()}>
                      <Italic className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                      <Heading1 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                      <Heading2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => editor.chain().focus().toggleBulletList().run()}>
                      <List className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                      <ListOrdered className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => editor.chain().focus().toggleTaskList().run()}>
                      <ListChecks className="h-3.5 w-3.5" />
                    </Button>
                    <div className="h-4 w-px bg-border mx-0.5" />
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-primary"
                      onClick={convertCurrentLineToTask}>
                      <CheckSquare className="h-3.5 w-3.5" /> Criar tarefa
                    </Button>
                  </div>
                )}

                <EditorContent editor={editor} />

                {/* Slash menu */}
                {slashOpen && slashPos && filteredSlash.length > 0 && (
                  <Card
                    className="absolute z-50 w-[280px] p-1 shadow-xl border"
                    style={{ top: slashPos.top, left: slashPos.left }}
                  >
                    <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Comandos
                    </div>
                    {filteredSlash.map((it, idx) => {
                      const Icon = it.icon;
                      const isHighlight = (it as any).highlight;
                      return (
                        <button
                          key={it.key}
                          onMouseEnter={() => setSlashIndex(idx)}
                          onClick={() => applySlash(it.key as SlashKey)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left transition-colors",
                            slashIndex === idx ? "bg-accent" : "hover:bg-accent/50",
                            isHighlight && "border-l-2 border-primary"
                          )}
                        >
                          <div className={cn(
                            "h-7 w-7 rounded flex items-center justify-center shrink-0",
                            isHighlight ? "bg-primary/15 text-primary" : "bg-muted text-foreground"
                          )}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={cn("text-sm font-medium leading-tight", isHighlight && "text-primary")}>
                              {it.label}
                            </div>
                            <div className="text-[10px] text-muted-foreground leading-tight">{it.hint}</div>
                          </div>
                          {isHighlight && <ArrowRight className="h-3 w-3 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </Card>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Tiptap minimal styling */}
      <style>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: hsl(var(--muted-foreground));
          opacity: 0.5;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror h1 { font-size: 1.875rem; font-weight: 700; margin: 1rem 0 0.5rem; line-height: 1.2; }
        .ProseMirror h2 { font-size: 1.5rem; font-weight: 600; margin: 0.875rem 0 0.5rem; line-height: 1.3; }
        .ProseMirror h3 { font-size: 1.25rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
        .ProseMirror p { margin: 0.35rem 0; line-height: 1.65; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 1.5rem; margin: 0.35rem 0; }
        .ProseMirror ul { list-style: disc; }
        .ProseMirror ol { list-style: decimal; }
        .ProseMirror blockquote {
          border-left: 3px solid hsl(var(--primary));
          padding-left: 0.875rem;
          color: hsl(var(--muted-foreground));
          margin: 0.5rem 0;
          font-style: italic;
        }
        .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0.25rem; }
        .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; margin: 0.15rem 0; }
        .ProseMirror ul[data-type="taskList"] li > label { margin-top: 0.4rem; }
        .ProseMirror ul[data-type="taskList"] li > div { flex: 1; }
      `}</style>
    </AppLayout>
  );
}