'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Pencil, Trash2, Send, MessageSquare, Cog, Lightbulb, Check, X, AtSign,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAssigneeAvatarLookup } from "@/hooks/useAssigneeAvatarLookup";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { AIAssistButton } from "@/components/AIAssistButton";

/**
 * REGISTRO DA ATIVIDADE — Conversa + Histórico.
 *
 * "Conversa" é um chat da atividade (demanda aberta): mensagens em balões, com
 * @menção de pessoas (destaque + notificação) e campo de escrita amplo.
 * "Histórico" reúne à parte as mudanças automáticas do sistema (audit_log),
 * sem poluir a conversa.
 *
 * Notas ficam em activity_comments; menções notificam via notifications.
 * Uma nota pode ser promovida a Lição Aprendida (lessons_learned).
 */

interface Comment {
  id: string;
  activity_id: string;
  content: string;
  author: string | null;
  created_at: string;
}
interface AuditEntry {
  id: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  old_data: any;
  new_data: any;
  changed_fields: string[] | null;
  changed_by_email: string | null;
  created_at: string;
}
interface Person { id: string; full_name: string; avatar_url: string | null; }

type Tab = "chat" | "history";

const FIELD_LABELS: Record<string, string> = {
  title: "Título", description: "Descrição", status: "Status",
  start_date: "Início", end_date: "Prazo", workflow_stage_id: "Etapa",
  assigned_to: "Responsável", priority: "Prioridade", progress: "Progresso",
  planned_hours: "Horas planejadas", actual_hours: "Horas realizadas", cost: "Custo",
};
const fmtVal = (v: any) => {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

interface Props {
  activityId: string;
  projectId?: string | null;
  phaseId?: string | null;
  includeSubActivities?: boolean;
  locked?: boolean;
}

export const ActivityRegistro = ({
  activityId, projectId, phaseId, includeSubActivities = false, locked = false,
}: Props) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const [tab, setTab] = useState<Tab>("chat");
  const [comments, setComments] = useState<Comment[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [subMap, setSubMap] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Comment | null>(null);
  const [editText, setEditText] = useState("");
  const [promotingId, setPromotingId] = useState<string | null>(null);

  // ── estado do autocomplete de @menção ──
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const authorName: string = profile?.full_name?.trim() || user?.email || "Usuário";
  const isOwn = (a: string | null) =>
    Boolean(a && a.trim().toLowerCase() === authorName.trim().toLowerCase());
  const isMe = (a: string | null) => isOwn(a);

  const avatarMap = useAssigneeAvatarLookup([authorName, ...comments.map((c) => c.author)]);

  const fetchComments = useCallback(async () => {
    let ids: string[] = [activityId];
    let map: Record<string, string> = {};
    if (includeSubActivities) {
      const { data: subs } = await supabase
        .from("activities").select("id,title").eq("parent_id", activityId).eq("is_trashed", false);
      if (subs && subs.length) {
        ids = [activityId, ...subs.map((s: any) => s.id)];
        map = Object.fromEntries(subs.map((s: any) => [s.id, s.title]));
      }
    }
    setSubMap(map);
    const { data } = await supabase
      .from("activity_comments").select("*").in("activity_id", ids).eq("is_trashed", false)
      .order("created_at", { ascending: true });
    setComments((data as Comment[]) || []);
  }, [activityId, includeSubActivities]);

  const fetchAudit = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("audit_log").select("*")
      .eq("table_name", "activities").eq("record_id", activityId)
      .order("created_at", { ascending: false }).limit(50);
    setAudit((data as AuditEntry[]) || []);
  }, [activityId]);

  useEffect(() => { fetchComments(); fetchAudit(); }, [fetchComments, fetchAudit]);

  // Pessoas para @menção.
  useEffect(() => {
    supabase.from("profiles").select("id, full_name, avatar_url").eq("is_active", true)
      .then(({ data }) => setPeople(((data as Person[]) || []).filter((p) => p.full_name)));
  }, []);

  // Rola a conversa para o fim quando chegam mensagens.
  useEffect(() => {
    if (tab === "chat" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments, tab]);

  // Ajusta a altura da textarea ao conteúdo (auto-grow até o máximo do CSS).
  const autoGrow = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "40px";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);

  // Normaliza para casar menções de forma tolerante a acento/caixa/espaços.
  const normName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

  // ── detecção de @ enquanto digita ──
  // Reconhece o @ mesmo em nomes compostos (letras, dígitos e espaços internos),
  // parando na pontuação/quebra de linha — assim "@Ana Paula" continua abrindo o menu.
  const onTextChange = (v: string) => {
    setText(v);
    autoGrow();
    const caret = taRef.current?.selectionStart ?? v.length;
    const upto = v.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([\p{L}\d]+(?: [\p{L}\d]+)*)?$/u);
    if (m) { setMentionOpen(true); setMentionQuery(m[1] ?? ""); setMentionIndex(0); }
    else setMentionOpen(false);
  };

  const mentionMatches = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    return people
      .filter((p) => p.full_name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [people, mentionQuery]);

  const applyMention = (p: Person) => {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? text.length;
    // Remove o fragmento @… já digitado (incl. nomes compostos com espaço) antes do caret.
    const before = text.slice(0, caret).replace(/@([\p{L}\d]+(?: [\p{L}\d]+)*)?$/u, "");
    const after = text.slice(caret);
    // Garante um espaço após o nome sem duplicar caso o texto seguinte já comece com espaço.
    const sep = after.startsWith(" ") ? "" : " ";
    const next = `${before}@${p.full_name}${sep}${after}`;
    setText(next);
    setMentionOpen(false);
    // Reposiciona o cursor logo após o nome inserido.
    const caretAfter = (before + "@" + p.full_name + sep).length;
    setTimeout(() => {
      ta?.focus();
      ta?.setSelectionRange(caretAfter, caretAfter);
      autoGrow();
    }, 0);
  };

  // Extrai @nomes citados que casam com pessoas reais (tolerante a acento/caixa).
  // Compara nome-a-nome sobre o corpo normalizado para não perder menções.
  const extractMentions = (body: string): Person[] => {
    const nb = normName(body);
    const found: Person[] = [];
    for (const p of people) {
      if (nb.includes("@" + normName(p.full_name))) found.push(p);
    }
    return found;
  };

  const send = async () => {
    if (!text.trim() || locked) return;
    setSaving(true);
    const body = text.trim();
    const { error } = await supabase.from("activity_comments").insert({
      activity_id: activityId, content: body, author: authorName,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro ao enviar", variant: "destructive" }); return; }
    setText("");
    setMentionOpen(false);
    if (taRef.current) taRef.current.style.height = "40px"; // reset altura
    fetchComments();
    notify(body, extractMentions(body));
  };

  /**
   * Notifica citados + responsável + participantes.
   *
   * Via API com service role: o insert direto daqui não gravava — nenhuma linha
   * aparecia, mesmo com a policy permitindo INSERT autenticado e o mesmo payload
   * funcionando no servidor. O mesmo padrão da leitura e do mark-read.
   *
   * O servidor também resolve QUEM notificar: aqui a lista de perfis é a que o
   * RLS deixa o usuário ler, então alguém escondido simplesmente não era
   * avisado, sem erro nenhum.
   */
  const notify = async (body: string, mentioned: Person[]) => {
    try {
      const res = await fetch("/api/notifications/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId,
          projectId: projectId ?? null,
          body,
          mentionedNames: mentioned.map((p) => p.full_name),
        }),
      });
      if (!res.ok) {
        // Não bloqueia o envio: a mensagem já está salva e reenviar seria pior.
        // Mas o silêncio anterior escondia o problema — quem citava achava que
        // a pessoa tinha sido avisada, e não tinha.
        const detail = await res.json().then((b) => b?.error).catch(() => null);
        toast({
          title: "Mensagem enviada, mas sem aviso",
          description: detail || "Não foi possível notificar as pessoas citadas.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Mensagem enviada, mas sem aviso",
        description: e?.message || "Falha inesperada ao notificar.",
        variant: "destructive",
      });
    }
  };

  const saveEdit = async () => {
    if (!editing || !editText.trim() || !isOwn(editing.author)) { setEditing(null); return; }
    const { error } = await supabase
      .from("activity_comments").update({ content: editText.trim() }).eq("id", editing.id);
    if (error) { toast({ title: "Erro ao editar", variant: "destructive" }); return; }
    setEditing(null); setEditText("");
    fetchComments();
  };

  const removeNote = async (c: Comment) => {
    if (!isOwn(c.author)) { toast({ title: "Você só pode excluir suas próprias mensagens", variant: "destructive" }); return; }
    if (!confirm("Excluir esta mensagem?")) return;
    const { error } = await supabase
      .from("activity_comments")
      .update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq("id", c.id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    fetchComments();
  };

  const promoteToLesson = async (c: Comment) => {
    if (!projectId) { toast({ title: "Sem projeto para vincular a lição", variant: "destructive" }); return; }
    if (!confirm("Promover esta mensagem a Lição Aprendida do projeto?")) return;
    setPromotingId(c.id);
    try {
      const { error } = await (supabase as any).from("lessons_learned").insert({
        project_id: projectId,
        phase_id: phaseId || null,
        problem: c.content,
        category: "Registro da atividade",
        reported_by: c.author ?? authorName,
      });
      if (error) throw error;
      toast({
        title: "Lição Aprendida criada!",
        description: "Disponível na aba Lições do projeto.",
      });
    } catch (e: any) {
      toast({ title: "Não foi possível promover a lição", description: e?.message, variant: "destructive" });
    } finally { setPromotingId(null); }
  };

  const systemEntries = useMemo(
    () => audit.filter((a) => a.operation !== "INSERT" || !!a.new_data?.title),
    [audit],
  );

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });

  // Renderiza o corpo destacando @menções. O casamento é tolerante a acento/caixa:
  // compara o trecho original (preservado na tela) com o nome, ambos normalizados
  // sem alterar o comprimento, para os índices continuarem alinhados ao texto exibido.
  // `onPrimary` = balão azul (mensagem própria). O destaque padrão é text-primary
  // sobre bg-primary/10, que no balão azul vira azul-sobre-azul: a menção some da
  // tela — foi o que o print mostrava. Ali o realce inverte para o contraste do
  // próprio balão.
  const renderBody = (body: string, onPrimary = false) => {
    // normalização que NÃO muda o comprimento (só minúsculas + remove marcas combinantes)
    const nz = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const names = people
      .map((p) => ({ raw: p.full_name, n: nz(p.full_name) }))
      .filter((x) => x.n.length > 0)
      .sort((a, b) => b.n.length - a.n.length); // mais longo primeiro (evita casar prefixo)
    if (names.length === 0) return body;

    const parts: (string | { m: string })[] = [];
    let i = 0;
    let buf = "";
    while (i < body.length) {
      if (body[i] === "@") {
        const restN = nz(body.slice(i + 1));
        const hit = names.find((x) => restN.startsWith(x.n));
        if (hit) {
          if (buf) { parts.push(buf); buf = ""; }
          const tok = body.slice(i, i + 1 + hit.raw.length); // preserva o texto original
          parts.push({ m: tok });
          i += 1 + hit.raw.length;
          continue;
        }
      }
      buf += body[i];
      i += 1;
    }
    if (buf) parts.push(buf);

    return parts.map((p, idx) =>
      typeof p === "string" ? <span key={idx}>{p}</span>
        : (
          <span
            key={idx}
            className={cn(
              "font-medium rounded px-1",
              onPrimary
                // No balão azul: herda a cor do texto do balão e usa um véu
                // claro por trás, em vez de azul sobre azul.
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary/10 text-primary",
            )}
          >
            {p.m}
          </span>
        ),
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Abas Conversa / Histórico */}
      <div className="flex items-center gap-1 mb-3">
        <button
          type="button" onClick={() => setTab("chat")}
          className={cn(
            "inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg font-medium transition-colors",
            tab === "chat" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <MessageSquare className="w-4 h-4" /> Conversa
          {comments.length > 0 && <span className="text-[11px] tabular-nums opacity-70">{comments.length}</span>}
        </button>
        <button
          type="button" onClick={() => setTab("history")}
          className={cn(
            "inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg font-medium transition-colors",
            tab === "history" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <Cog className="w-4 h-4" /> Histórico
        </button>
      </div>

      {tab === "chat" ? (
        <>
          {/* Mensagens */}
          <div ref={scrollRef} className="flex-1 min-h-[200px] max-h-[46vh] overflow-y-auto space-y-3 pr-1">
            {comments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-10 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-[13px]">Nenhuma mensagem ainda.</p>
                <p className="text-[12px]">Comece a conversa — use <b>@</b> para citar alguém.</p>
              </div>
            ) : comments.map((c) => {
              const mine = isMe(c.author);
              const subLabel = c.activity_id !== activityId ? subMap[c.activity_id] : undefined;
              return editing?.id === c.id ? (
                <div key={c.id} className="rounded-xl bg-accent/50 p-2 space-y-2">
                  <textarea
                    value={editText} onChange={(e) => setEditText(e.target.value)}
                    className="w-full min-h-[64px] text-sm rounded-lg border border-border bg-background p-2 resize-y"
                  />
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={saveEdit}><Check className="w-3.5 h-3.5 mr-1" /> Salvar</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}><X className="w-3.5 h-3.5 mr-1" /> Cancelar</Button>
                    {editText.trim() && (
                      <AIAssistButton value={editText} onChange={setEditText} context="comment" actions={["correct", "improve"]} size="sm" className="ml-auto" />
                    )}
                  </div>
                </div>
              ) : (
                <div key={c.id} className={cn("flex w-full", mine ? "justify-end" : "justify-start")}>
                <div className={cn("flex gap-2.5 group max-w-[85%]", mine && "flex-row-reverse")}>
                  <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                    {(() => {
                      const a = resolveAvatarFromLookup(c.author, c.author, avatarMap);
                      return a ? <AvatarImage src={a} alt={c.author || ""} /> : null;
                    })()}
                    <AvatarFallback className="text-[10px]">{getAvatarInitials(c.author)}</AvatarFallback>
                  </Avatar>
                  <div className={cn("flex flex-col min-w-0", mine && "items-end")}>
                    <div className="flex items-center gap-2 mb-0.5 px-0.5">
                      <span className="text-[12px] font-medium text-foreground">{mine ? "Você" : c.author}</span>
                      <span className="text-[10.5px] text-muted-foreground">{fmtTime(c.created_at)}</span>
                      {subLabel && (
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">↳ {subLabel}</span>
                      )}
                    </div>
                    <div className={cn(
                      "max-w-full rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]",
                      mine ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm text-foreground",
                    )}>
                      {renderBody(c.content, mine)}
                    </div>
                    {/* ações */}
                    <div className={cn("flex gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity", mine && "flex-row-reverse")}>
                      {projectId && !locked && (
                        <button type="button" title="Promover a Lição Aprendida" onClick={() => promoteToLesson(c)} disabled={promotingId === c.id}
                          className="text-amber-600 hover:bg-amber-500/10 rounded p-1"><Lightbulb className="w-3.5 h-3.5" /></button>
                      )}
                      {mine && (
                        <>
                          <button type="button" title="Editar" onClick={() => { setEditing(c); setEditText(c.content); }}
                            className="text-muted-foreground hover:bg-muted rounded p-1"><Pencil className="w-3 h-3" /></button>
                          <button type="button" title="Excluir" onClick={() => removeNote(c)}
                            className="text-destructive hover:bg-destructive/10 rounded p-1"><Trash2 className="w-3 h-3" /></button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                </div>
              );
            })}
          </div>

          {/* Composer */}
          {!locked && (
            <div className="relative mt-3">
              {/* Autocomplete de menção */}
              {mentionOpen && mentionMatches.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden z-20">
                  {mentionMatches.map((p, i) => (
                    <button
                      key={p.id} type="button"
                      onMouseDown={(e) => { e.preventDefault(); applyMention(p); }}
                      className={cn("w-full flex items-center gap-2 px-3 py-2 text-left text-[13px]", i === mentionIndex ? "bg-primary/10" : "hover:bg-muted")}
                    >
                      <Avatar className="h-6 w-6"><AvatarImage src={p.avatar_url || undefined} /><AvatarFallback className="text-[9px]">{getAvatarInitials(p.full_name)}</AvatarFallback></Avatar>
                      <span className="truncate">{p.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-xl border border-border bg-background focus-within:ring-1 focus-within:ring-primary/40 p-1.5">
                <textarea
                  ref={taRef}
                  value={text}
                  onChange={(e) => onTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (mentionOpen && mentionMatches.length > 0) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return; }
                      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
                      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyMention(mentionMatches[mentionIndex]); return; }
                      if (e.key === "Escape") { setMentionOpen(false); return; }
                    }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder="Escreva uma mensagem…"
                  rows={1}
                  className="flex-1 min-w-0 resize-none overflow-y-auto bg-transparent text-[13px] leading-relaxed px-2 py-2 max-h-40 focus:outline-none [scrollbar-width:thin] placeholder:text-muted-foreground/70"
                  style={{ minHeight: 38, height: 38 }}
                />
                {text.trim() && (
                  <AIAssistButton
                    value={text}
                    onChange={(next) => { setText(next); setTimeout(autoGrow, 0); }}
                    context="comment"
                    actions={["correct", "improve"]}
                    size="icon"
                    className="h-9 w-9 shrink-0"
                  />
                )}
                <Button size="icon" className="h-9 w-9 shrink-0 rounded-lg" onClick={send} disabled={saving || !text.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1 mt-1 px-1 text-[10.5px] text-muted-foreground">
                <AtSign className="w-3 h-3" /> Enter envia · Shift+Enter quebra linha · @ notifica
              </div>
            </div>
          )}
        </>
      ) : (
        /* Histórico do sistema */
        <div className="flex-1 min-h-[200px] max-h-[52vh] overflow-y-auto space-y-2 pr-1">
          {systemEntries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-10 text-muted-foreground">
              <Cog className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-[13px]">Sem alterações registradas.</p>
            </div>
          ) : systemEntries.map((a) => {
            const changes = (a.changed_fields || []).filter((f) => FIELD_LABELS[f]);
            const label = a.operation === "INSERT" ? "Atividade criada" : a.operation === "DELETE" ? "Excluída" : "Alteração";
            return (
              <div key={a.id} className="p-2.5 rounded-lg border border-border/60 bg-muted/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Cog className="w-3 h-3" /> {label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{fmtTime(a.created_at)}</span>
                  {a.changed_by_email && <span className="text-[11px] text-muted-foreground">· {a.changed_by_email}</span>}
                </div>
                {a.operation === "UPDATE" && changes.length > 0 && (
                  <div className="space-y-0.5">
                    {changes.map((f) => (
                      <div key={f} className="text-[11.5px] text-foreground/80">
                        <span className="font-medium">{FIELD_LABELS[f]}:</span>{" "}
                        <span className="line-through text-muted-foreground">{fmtVal(a.old_data?.[f])}</span>
                        {" → "}<span className="text-foreground">{fmtVal(a.new_data?.[f])}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
