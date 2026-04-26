import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText, Plus, Trash2, Save, CheckSquare, Loader2, Sparkles,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Heading1, Heading2, Heading3, Quote,
  Type, ListChecks, ArrowRight, Table as TableIcon, Minus,
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon,
  Highlighter, Code, Undo2, Redo2, Trash, Plus as PlusIcon,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TaskReferenceNode } from "./TaskReferenceCard";
import { AIAssistButton, type AIAction } from "@/components/AIAssistButton";

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

interface ProjectDocumentsProps {
  projectId: string;
  onActivityCreated?: () => void;
}

const SLASH_ITEMS = [
  { key: "tarefa", label: "Criar tarefa no Kanban", icon: CheckSquare, hint: "Converte a linha em atividade", highlight: true },
  { key: "h1", label: "Título 1", icon: Heading1, hint: "Cabeçalho grande" },
  { key: "h2", label: "Título 2", icon: Heading2, hint: "Subtítulo" },
  { key: "h3", label: "Título 3", icon: Heading3, hint: "Sub-subtítulo" },
  { key: "p", label: "Texto", icon: Type, hint: "Parágrafo padrão" },
  { key: "ul", label: "Lista com marcadores", icon: List, hint: "Lista simples" },
  { key: "ol", label: "Lista numerada", icon: ListOrdered, hint: "1, 2, 3..." },
  { key: "task", label: "Lista de tarefas", icon: ListChecks, hint: "Checkboxes" },
  { key: "quote", label: "Citação", icon: Quote, hint: "Bloco destacado" },
  { key: "table", label: "Tabela", icon: TableIcon, hint: "Tabela 3x3 com cabeçalho" },
  { key: "hr", label: "Divisor", icon: Minus, hint: "Linha horizontal" },
] as const;
type SlashKey = typeof SLASH_ITEMS[number]["key"];

/* ---------- Local draft helpers (rascunho automático) ---------- */
const draftKey = (pageId: string) => `pp_draft:${pageId}`;
function readDraft(pageId: string): { title: string; content: any; ts: number } | null {
  try {
    const raw = localStorage.getItem(draftKey(pageId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeDraft(pageId: string, title: string, content: any) {
  try {
    localStorage.setItem(draftKey(pageId), JSON.stringify({ title, content, ts: Date.now() }));
  } catch { /* quota / private mode — ignore */ }
}
function clearDraft(pageId: string) {
  try { localStorage.removeItem(draftKey(pageId)); } catch { /* noop */ }
}

export function ProjectDocuments({ projectId, onActivityCreated }: ProjectDocumentsProps) {
  const { user } = useAuth();
  const [pages, setPages] = useState<PageDoc[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);

  const editorWrapperRef = useRef<HTMLDivElement>(null);
  /** Mantém referência sempre atual para flush no unmount sem stale-closure */
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const dirtyRef = useRef(false);

  /* ---------- Load pages + stages ---------- */
  const loadAll = useCallback(async () => {
    if (!projectId) return;
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
    setActivePageId((prev) => prev && list.some(p => p.id === prev) ? prev : (list[0]?.id ?? null));
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadAll(); }, [loadAll]);

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
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "text-primary underline underline-offset-2" } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({
        placeholder: 'Comece a escrever, ou pressione "/" para abrir os comandos…',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "doc-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      TaskReferenceNode,
    ],
    content: (() => {
      // Se houver rascunho local mais novo que o servidor, usa o rascunho.
      if (activePage) {
        const draft = readDraft(activePage.id);
        const serverTs = new Date(activePage.updated_at).getTime();
        if (draft && draft.ts > serverTs) {
          // Restaura também o título local
          setTimeout(() => setTitleDraft(draft.title), 0);
          return draft.content;
        }
      }
      return activePage?.content ?? { type: "doc", content: [{ type: "paragraph" }] };
    })(),
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose-base max-w-none min-h-[60vh] focus:outline-none px-1 py-4 text-foreground",
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
      (it) => it.key.includes(slashQuery) || it.label.toLowerCase().includes(slashQuery)
    );
  }, [slashQuery]);

  /* ---------- Convert current line into a task w/ reference card ---------- */
  const convertCurrentLineToTask = useCallback(async () => {
    if (!editor || !projectId) return;
    const { state } = editor;
    const { from } = state.selection;
    const $from = state.doc.resolve(from);
    const blockStart = $from.start();
    const blockEnd = $from.end();
    let title = state.doc.textBetween(blockStart, blockEnd, "\n", " ").trim();
    title = title.replace(/^\/(?:tarefa)?\s*/, "").trim();
    if (!title) {
      toast.error("Escreva o título da tarefa antes de criar.");
      return;
    }

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

    if (error || !data) {
      toast.error("Erro ao criar atividade");
      return;
    }

    // Replace the line with a live reference node
    editor
      .chain()
      .focus()
      .deleteRange({ from: blockStart - 1, to: blockEnd })
      .insertContent({
        type: "taskReference",
        attrs: {
          activityId: data.id,
          projectId,
          title: data.title,
        },
      })
      .insertContent({ type: "paragraph" })
      .run();

    toast.success("✅ Tarefa criada no Kanban", {
      description: `"${data.title}" foi adicionada à coluna "${firstStage?.title ?? "inicial"}".`,
    });
    onActivityCreated?.();
  }, [editor, projectId, stages, onActivityCreated]);

  /* ---------- AI assist on selection (or current line) ---------- */
  const getAITargetRange = useCallback(() => {
    if (!editor) return null;
    const { state } = editor;
    const { from, to, empty } = state.selection;
    if (!empty) {
      const text = state.doc.textBetween(from, to, "\n", " ").trim();
      return text ? { from, to, text, mode: "selection" as const } : null;
    }
    const $from = state.doc.resolve(from);
    const blockStart = $from.start();
    const blockEnd = $from.end();
    const text = state.doc.textBetween(blockStart, blockEnd, "\n", " ").trim();
    return text ? { from: blockStart, to: blockEnd, text, mode: "line" as const } : null;
  }, [editor]);

  const [aiTargetText, setAiTargetText] = useState("");
  const aiRangeRef = useRef<{ from: number; to: number } | null>(null);

  const refreshAITarget = useCallback(() => {
    const target = getAITargetRange();
    if (target) {
      setAiTargetText(target.text);
      aiRangeRef.current = { from: target.from, to: target.to };
    } else {
      setAiTargetText("");
      aiRangeRef.current = null;
    }
  }, [getAITargetRange]);

  useEffect(() => {
    if (!editor) return;
    refreshAITarget();
    editor.on("selectionUpdate", refreshAITarget);
    editor.on("update", refreshAITarget);
    return () => {
      editor.off("selectionUpdate", refreshAITarget);
      editor.off("update", refreshAITarget);
    };
  }, [editor, refreshAITarget]);

  const applyAIResult = useCallback(
    (next: string) => {
      if (!editor || !aiRangeRef.current) return;
      const { from, to } = aiRangeRef.current;
      editor
        .chain()
        .focus()
        .insertContentAt({ from, to }, next)
        .run();
    },
    [editor]
  );

  /* ---------- Apply slash command ---------- */
  const applySlash = useCallback(
    async (key: SlashKey) => {
      if (!editor) return;
      const { state } = editor;
      const { from } = state.selection;
      const $from = state.doc.resolve(from);
      const blockStart = $from.start();
      const textBefore = state.doc.textBetween(blockStart, from, "\n", "\0");
      const match = textBefore.match(/\/([\w]*)$/);
      const deleteFrom = match ? from - match[0].length : from;

      if (key === "tarefa") {
        // For 'tarefa' we want to keep the surrounding text (line text) as the title
        // First remove the typed "/tarefa" from the line, then convert.
        editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
        await convertCurrentLineToTask();
        setSlashOpen(false);
        return;
      }

      editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
      const chain = editor.chain().focus();
      switch (key) {
        case "h1": chain.setNode("heading", { level: 1 }).run(); break;
        case "h2": chain.setNode("heading", { level: 2 }).run(); break;
        case "h3": chain.setNode("heading", { level: 3 }).run(); break;
        case "p": chain.setNode("paragraph").run(); break;
        case "ul": chain.toggleBulletList().run(); break;
        case "ol": chain.toggleOrderedList().run(); break;
        case "task": chain.toggleTaskList().run(); break;
        case "quote": chain.toggleBlockquote().run(); break;
        case "table": chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
        case "hr": chain.setHorizontalRule().run(); break;
      }
      setSlashOpen(false);
    },
    [editor, convertCurrentLineToTask]
  );

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
    if (error) { toast.error("Erro ao salvar"); return; }
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id
          ? { ...p, title: titleDraft || "Documento sem título", content: json, updated_at: new Date().toISOString() }
          : p
      )
    );
    // Sucesso → limpa rascunho local
    clearDraft(activePage.id);
    dirtyRef.current = false;
  }, [editor, activePage, titleDraft]);

  /* ---------- Mantém flushRef sempre atualizado ---------- */
  useEffect(() => {
    flushRef.current = async () => {
      if (!editor || !activePage || !dirtyRef.current) return;
      await savePage();
    };
  }, [editor, activePage, savePage]);

  /* ---------- Auto-save: rascunho local imediato + debounce no servidor ---------- */
  useEffect(() => {
    if (!editor || !activePage) return;
    const pageId = activePage.id;
    let timer: number | null = null;

    const onChange = () => {
      const json = editor.getJSON();
      const titleNow = titleDraft || "Documento sem título";
      // 1) Rascunho local instantâneo (rede de segurança contra desmontagem)
      writeDraft(pageId, titleNow, json);
      dirtyRef.current = true;
      // 2) Debounce 2.5s para gravar no banco
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        savePage();
      }, 2500);
    };

    editor.on("update", onChange);
    return () => {
      editor.off("update", onChange);
      if (timer) window.clearTimeout(timer);
    };
  }, [editor, activePage, titleDraft, savePage]);

  /* ---------- Salva também quando o título muda ---------- */
  useEffect(() => {
    if (!editor || !activePage) return;
    if (titleDraft === activePage.title) return;
    writeDraft(activePage.id, titleDraft || "Documento sem título", editor.getJSON());
    dirtyRef.current = true;
    const t = window.setTimeout(() => savePage(), 2500);
    return () => window.clearTimeout(t);
  }, [titleDraft, editor, activePage, savePage]);

  /* ---------- Flush ao trocar de página, desmontar, perder foco ou fechar aba ---------- */
  useEffect(() => {
    const flush = () => { void flushRef.current(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("blur", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      // troca de página ativa → grava antes
      flush();
      window.removeEventListener("blur", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activePageId]);

  /* ---------- Flush no unmount completo do componente (troca de aba do projeto) ---------- */
  useEffect(() => {
    return () => { void flushRef.current(); };
  }, []);

  /* ---------- Create / Delete page ---------- */
  const createPage = async () => {
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
    if (error || !data) { toast.error("Erro ao criar documento"); return; }
    const newPage = data as any as PageDoc;
    setPages((prev) => [newPage, ...prev]);
    setActivePageId(newPage.id);
  };

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

  const inTable = editor?.isActive("table") ?? false;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-[calc(100vh-12rem)] min-h-[600px] bg-background border rounded-lg overflow-hidden">
        {/* Body */}
        <div className="flex-1 grid grid-cols-[240px_1fr] overflow-hidden">
          {/* Sidebar */}
          <aside className="border-r bg-muted/20 flex flex-col">
            <div className="p-3 border-b flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold flex-1">Documentos</span>
              <Button onClick={createPage} size="icon" variant="ghost" className="h-7 w-7" title="Novo documento">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {loading ? (
                  <div className="text-xs text-muted-foreground p-3">Carregando…</div>
                ) : pages.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-4 text-center">
                    Nenhum documento.
                    <br />
                    <Button onClick={createPage} size="sm" variant="link" className="h-auto p-0 mt-1">
                      Criar o primeiro
                    </Button>
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
                Digite <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">/</kbd> para abrir o menu. Use <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">/tarefa</kbd> para criar uma atividade visível no Kanban com cartão de status.
              </p>
            </div>
          </aside>

          {/* Editor */}
          <main className="overflow-auto bg-background">
            {!activePage ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm mb-3">Crie um documento para começar.</p>
                  <Button onClick={createPage} size="sm">
                    <Plus className="h-4 w-4 mr-1" /> Novo documento
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto px-8 py-6 relative" ref={editorWrapperRef}>
                <div className="flex items-center gap-2 mb-2">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    placeholder="Título do documento"
                    className="!text-3xl font-bold border-0 px-0 shadow-none focus-visible:ring-0 h-auto py-2 placeholder:text-muted-foreground/40"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    {saving && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> salvando…
                      </span>
                    )}
                    <Button size="sm" variant="outline" onClick={savePage}>
                      <Save className="h-4 w-4 mr-1" /> Salvar
                    </Button>
                  </div>
                </div>

                {editor && (
                  <div className="sticky top-0 z-10 mb-3 flex items-center gap-0.5 p-1 rounded-lg border bg-card/95 backdrop-blur shadow-sm flex-wrap">
                    <ToolbarBtn icon={Undo2} label="Desfazer" onClick={() => editor.chain().focus().undo().run()} />
                    <ToolbarBtn icon={Redo2} label="Refazer" onClick={() => editor.chain().focus().redo().run()} />
                    <Sep />
                    <ToolbarBtn icon={Bold} label="Negrito" active={editor.isActive("bold")}
                      onClick={() => editor.chain().focus().toggleBold().run()} />
                    <ToolbarBtn icon={Italic} label="Itálico" active={editor.isActive("italic")}
                      onClick={() => editor.chain().focus().toggleItalic().run()} />
                    <ToolbarBtn icon={UnderlineIcon} label="Sublinhado" active={editor.isActive("underline")}
                      onClick={() => editor.chain().focus().toggleUnderline().run()} />
                    <ToolbarBtn icon={Strikethrough} label="Tachado" active={editor.isActive("strike")}
                      onClick={() => editor.chain().focus().toggleStrike().run()} />
                    <ToolbarBtn icon={Highlighter} label="Destacar" active={editor.isActive("highlight")}
                      onClick={() => editor.chain().focus().toggleHighlight().run()} />
                    <ToolbarBtn icon={Code} label="Código" active={editor.isActive("code")}
                      onClick={() => editor.chain().focus().toggleCode().run()} />
                    <Sep />
                    <ToolbarBtn icon={Heading1} label="Título 1" active={editor.isActive("heading", { level: 1 })}
                      onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
                    <ToolbarBtn icon={Heading2} label="Título 2" active={editor.isActive("heading", { level: 2 })}
                      onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
                    <ToolbarBtn icon={Heading3} label="Título 3" active={editor.isActive("heading", { level: 3 })}
                      onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
                    <Sep />
                    <ToolbarBtn icon={List} label="Lista" active={editor.isActive("bulletList")}
                      onClick={() => editor.chain().focus().toggleBulletList().run()} />
                    <ToolbarBtn icon={ListOrdered} label="Lista numerada" active={editor.isActive("orderedList")}
                      onClick={() => editor.chain().focus().toggleOrderedList().run()} />
                    <ToolbarBtn icon={ListChecks} label="Tarefas" active={editor.isActive("taskList")}
                      onClick={() => editor.chain().focus().toggleTaskList().run()} />
                    <ToolbarBtn icon={Quote} label="Citação" active={editor.isActive("blockquote")}
                      onClick={() => editor.chain().focus().toggleBlockquote().run()} />
                    <Sep />
                    <ToolbarBtn icon={AlignLeft} label="Alinhar à esquerda"
                      active={editor.isActive({ textAlign: "left" })}
                      onClick={() => editor.chain().focus().setTextAlign("left").run()} />
                    <ToolbarBtn icon={AlignCenter} label="Centralizar"
                      active={editor.isActive({ textAlign: "center" })}
                      onClick={() => editor.chain().focus().setTextAlign("center").run()} />
                    <ToolbarBtn icon={AlignRight} label="Alinhar à direita"
                      active={editor.isActive({ textAlign: "right" })}
                      onClick={() => editor.chain().focus().setTextAlign("right").run()} />
                    <Sep />
                    <ToolbarBtn icon={LinkIcon} label="Inserir link"
                      onClick={() => {
                        const url = window.prompt("URL do link:");
                        if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
                      }} />
                    <ToolbarBtn icon={TableIcon} label="Inserir tabela 3x3"
                      onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
                    <ToolbarBtn icon={Minus} label="Divisor"
                      onClick={() => editor.chain().focus().setHorizontalRule().run()} />
                    <Sep />
                    <Button
                      size="sm"
                      className="h-7 px-2.5 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={convertCurrentLineToTask}
                    >
                      <CheckSquare className="h-3.5 w-3.5" /> Criar tarefa no Kanban
                    </Button>
                    <AIAssistButton
                      value={aiTargetText}
                      onChange={applyAIResult}
                      context="generic"
                      label={aiTargetText ? "IA" : "IA (selecione texto)"}
                      className="h-7"
                    />
                  </div>
                )}

                {/* Table contextual toolbar */}
                {editor && inTable && (
                  <div className="mb-3 flex items-center gap-1 p-1 rounded-md border border-dashed bg-muted/40 text-xs">
                    <span className="px-2 text-muted-foreground font-medium">Tabela:</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => editor.chain().focus().addColumnBefore().run()}>
                      <PlusIcon className="h-3 w-3 mr-0.5" /> Coluna ←
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => editor.chain().focus().addColumnAfter().run()}>
                      Coluna → <PlusIcon className="h-3 w-3 ml-0.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => editor.chain().focus().addRowBefore().run()}>
                      <PlusIcon className="h-3 w-3 mr-0.5" /> Linha ↑
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => editor.chain().focus().addRowAfter().run()}>
                      Linha ↓ <PlusIcon className="h-3 w-3 ml-0.5" />
                    </Button>
                    <div className="w-px h-4 bg-border mx-1" />
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => editor.chain().focus().deleteColumn().run()}>
                      <Trash className="h-3 w-3 mr-0.5" /> Coluna
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => editor.chain().focus().deleteRow().run()}>
                      <Trash className="h-3 w-3 mr-0.5" /> Linha
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => editor.chain().focus().deleteTable().run()}>
                      <Trash className="h-3 w-3 mr-0.5" /> Tabela
                    </Button>
                  </div>
                )}

                <EditorContent editor={editor} />

                {/* Slash menu */}
                {slashOpen && slashPos && filteredSlash.length > 0 && (
                  <Card
                    className="absolute z-50 w-[300px] p-1 shadow-xl border"
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
          .ProseMirror hr { border: 0; border-top: 1px solid hsl(var(--border)); margin: 1rem 0; }
          .ProseMirror code { background: hsl(var(--muted)); padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
          .ProseMirror mark { background: hsl(48 100% 80%); padding: 0 0.15rem; border-radius: 2px; }
          .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0.25rem; }
          .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; margin: 0.15rem 0; }
          .ProseMirror ul[data-type="taskList"] li > label { margin-top: 0.4rem; }
          .ProseMirror ul[data-type="taskList"] li > div { flex: 1; }

          /* Tables */
          .ProseMirror table {
            border-collapse: collapse;
            margin: 0.75rem 0;
            overflow: hidden;
            table-layout: fixed;
            width: 100%;
          }
          .ProseMirror th, .ProseMirror td {
            border: 1px solid hsl(var(--border));
            padding: 0.5rem 0.625rem;
            vertical-align: top;
            position: relative;
            min-width: 80px;
          }
          .ProseMirror th {
            background: hsl(var(--muted) / 0.6);
            font-weight: 600;
            text-align: left;
          }
          .ProseMirror .selectedCell:after {
            content: "";
            position: absolute;
            inset: 0;
            background: hsl(var(--primary) / 0.12);
            pointer-events: none;
          }
          .ProseMirror .column-resize-handle {
            position: absolute;
            right: -2px;
            top: 0;
            bottom: -2px;
            width: 4px;
            background: hsl(var(--primary));
            pointer-events: none;
          }
          .ProseMirror.resize-cursor { cursor: col-resize; }
        `}</style>
      </div>
    </TooltipProvider>
  );
}

/* ---------- Toolbar bits ---------- */
function ToolbarBtn({
  icon: Icon, label, onClick, active,
}: { icon: any; label: string; onClick: () => void; active?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClick}
          className={cn(
            "h-7 w-7 p-0",
            active && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">{label}</TooltipContent>
    </Tooltip>
  );
}

function Sep() {
  return <div className="h-4 w-px bg-border mx-0.5" />;
}