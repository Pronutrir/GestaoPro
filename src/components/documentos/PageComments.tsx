'use client';
// COMENTÁRIOS NO DOCUMENTO — conversa presa ao texto, como no Word e no Docs.
//
// Antes, comentar uma ata escrita aqui exigia mandar mensagem por fora, e a
// discussão se perdia do documento. Três coisas fazem esse recurso funcionar:
//
//  1. ÂNCORA POR TEXTO, não por posição. Guardamos o trecho citado; posição
//     envelhece a cada parágrafo inserido acima. Se o trecho for apagado, o
//     comentário aparece como órfão em vez de apontar para o lugar errado.
//  2. RESOLVER, não apagar. O porquê de uma mudança costuma valer mais que o
//     texto final — resolvido sai da vista, mas continua consultável.
//  3. MENÇÃO com @ que NOTIFICA. Citar alguém sem avisar é decoração.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Check, CornerDownRight, Trash2, AtSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getAvatarInitials } from "@/lib/avatarLookup";
import { cn } from "@/lib/utils";

// page_comments ainda fora dos tipos gerados (migration pendente na VM).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface PageComment {
  id: string;
  page_id: string;
  parent_id: string | null;
  author_id: string | null;
  author_name: string | null;
  body: string;
  anchor_text: string | null;
  resolved: boolean;
  mentions: string[];
  created_at: string;
}

interface Person { id: string; full_name: string; avatar_url?: string | null }

interface Props {
  projectId: string;
  pageId: string;
  /** Trecho selecionado no editor, quando houver — vira a âncora. */
  selection: string | null;
  onClearSelection: () => void;
}

export function PageComments({ projectId, pageId, selection, onClearSelection }: Props) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<PageComment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // Menção: aberta enquanto a pessoa digita "@algo" no fim do texto.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from("page_comments").select("*").eq("page_id", pageId)
      .order("created_at", { ascending: true });
    if (error) { setUnavailable(true); return; }
    setUnavailable(false);
    setComments((data ?? []) as PageComment[]);
  }, [pageId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, avatar_url").order("full_name")
      .then(({ data }) => setPeople((data ?? []) as Person[]));
  }, []);

  /**
   * Detecta "@texto" logo antes do cursor para abrir a lista de pessoas.
   *
   * O padrão aceita espaço (nomes têm sobrenome), mas NÃO pode terminar em
   * espaço: senão, logo depois de escolher alguém — que insere "@Nome " — o
   * regex voltaria a casar e a lista reabriria sozinha.
   */
  const onDraftChange = (value: string) => {
    setDraft(value);
    const upToCursor = value.slice(0, textareaRef.current?.selectionStart ?? value.length);
    const m = upToCursor.match(/@([\p{L}][\p{L}\s]{0,28}[\p{L}]|[\p{L}]?)$/u);
    setMentionQuery(m ? m[1].toLowerCase() : null);
  };

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return people
      .filter((p) => p.full_name.toLowerCase().includes(mentionQuery.trim()))
      .slice(0, 5);
  }, [mentionQuery, people]);

  const applyMention = (p: Person) => {
    // Troca o "@parcial" pelo nome completo, mantendo o resto do texto. Mesmo
    // padrão da detecção, senão a substituição pega um trecho diferente.
    setDraft((prev) =>
      prev.replace(/@([\p{L}][\p{L}\s]{0,28}[\p{L}]|[\p{L}]?)$/u, `@${p.full_name} `));
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  /** Quem foi citado: casa cada "@Nome" com uma pessoa real da lista. */
  const extractMentions = (text: string): Person[] =>
    people.filter((p) => text.includes(`@${p.full_name}`));

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;

    const mentioned = extractMentions(body);
    const { data, error } = await sb.from("page_comments").insert({
      page_id: pageId,
      project_id: projectId,
      parent_id: replyTo,
      author_id: user?.id ?? null,
      author_name: profile?.full_name ?? null,
      body,
      // Âncora só no comentário raiz: resposta pertence ao trecho do pai.
      anchor_text: replyTo ? null : selection,
      mentions: mentioned.map((p) => p.id),
    }).select("id").single();

    if (error) {
      toast({ title: "Não foi possível comentar", description: error.message, variant: "destructive" });
      return;
    }

    // Citar sem avisar é decoração: cada pessoa mencionada recebe notificação.
    if (mentioned.length > 0) {
      await supabase.from("notifications").insert(
        mentioned
          .filter((p) => p.id !== user?.id)
          .map((p) => ({
            project_id: projectId,
            target_user_id: p.id,
            type: "mention",
            title: `${profile?.full_name ?? "Alguém"} citou você num documento`,
            message: body.slice(0, 180),
          })),
      );
    }

    void data;
    setDraft("");
    setReplyTo(null);
    onClearSelection();
    void load();
  };

  const toggleResolved = async (c: PageComment) => {
    await sb.from("page_comments").update({
      resolved: !c.resolved,
      resolved_by_id: !c.resolved ? user?.id ?? null : null,
      resolved_at: !c.resolved ? new Date().toISOString() : null,
    }).eq("id", c.id);
    void load();
  };

  const remove = async (id: string) => {
    await sb.from("page_comments").delete().eq("id", id);
    void load();
  };

  if (unavailable) return null;

  const roots = comments.filter((c) => !c.parent_id && (showResolved || !c.resolved));
  const openCount = comments.filter((c) => !c.parent_id && !c.resolved).length;
  const resolvedCount = comments.filter((c) => !c.parent_id && c.resolved).length;

  const avatarOf = (name: string | null) =>
    people.find((p) => p.full_name === name)?.avatar_url ?? undefined;

  return (
    <aside className="border-l bg-muted/20 w-[300px] shrink-0 flex flex-col max-h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-background/60">
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="text-[13px] font-semibold">Comentários</span>
        {openCount > 0 && (
          <Badge variant="secondary" className="text-[10px] h-5">{openCount} aberto(s)</Badge>
        )}
        {resolvedCount > 0 && (
          <button type="button" className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "ocultar resolvidos" : `ver ${resolvedCount} resolvido(s)`}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {roots.length === 0 && (
          <p className="text-[12px] text-muted-foreground">
            Selecione um trecho do texto e comente. A conversa fica no documento,
            junto do que está sendo discutido.
          </p>
        )}

        {roots.map((c) => {
          const replies = comments.filter((r) => r.parent_id === c.id);
          return (
            <div key={c.id} className={cn("rounded-lg border bg-card p-2.5", c.resolved && "opacity-60")}>
              {c.anchor_text && (
                <p className="text-[11px] text-muted-foreground border-l-2 border-primary/40 pl-2 mb-1.5 line-clamp-2"
                   title={c.anchor_text}>
                  “{c.anchor_text}”
                </p>
              )}
              <div className="flex items-start gap-2">
                <Avatar className="h-5 w-5 shrink-0">
                  <AvatarImage src={avatarOf(c.author_name)} />
                  <AvatarFallback className="text-[8px]">{getAvatarInitials(c.author_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-foreground">{c.author_name ?? "—"}</p>
                  <p className="text-[12.5px] text-foreground whitespace-pre-wrap break-words">{c.body}</p>
                </div>
              </div>

              {replies.map((r) => (
                <div key={r.id} className="flex items-start gap-2 mt-2 pl-3 border-l">
                  <Avatar className="h-5 w-5 shrink-0">
                    <AvatarImage src={avatarOf(r.author_name)} />
                    <AvatarFallback className="text-[8px]">{getAvatarInitials(r.author_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-foreground">{r.author_name ?? "—"}</p>
                    <p className="text-[12.5px] text-foreground whitespace-pre-wrap break-words">{r.body}</p>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-1 mt-2">
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] gap-1"
                  onClick={() => { setReplyTo(c.id); textareaRef.current?.focus(); }}>
                  <CornerDownRight className="w-3 h-3" /> Responder
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] gap-1"
                  onClick={() => toggleResolved(c)}>
                  <Check className="w-3 h-3" /> {c.resolved ? "Reabrir" : "Resolver"}
                </Button>
                {c.author_id === user?.id && (
                  <Button size="sm" variant="ghost"
                    className="h-6 px-1.5 text-[11px] ml-auto text-destructive hover:text-destructive"
                    onClick={() => remove(c.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t p-2.5 bg-background/60 relative">
        {selection && !replyTo && (
          <p className="text-[11px] text-muted-foreground border-l-2 border-primary/40 pl-2 mb-1.5 line-clamp-2">
            “{selection}”
          </p>
        )}
        {replyTo && (
          <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
            <CornerDownRight className="w-3 h-3" /> respondendo
            <button type="button" className="underline hover:text-foreground"
              onClick={() => setReplyTo(null)}>cancelar</button>
          </p>
        )}

        {/* Lista de menção: aparece sobre o campo enquanto se digita "@". */}
        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-2.5 right-2.5 mb-1 rounded-lg border bg-popover shadow-lg overflow-hidden z-20">
            {mentionMatches.map((p) => (
              <button key={p.id} type="button"
                className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-accent text-left"
                onClick={() => applyMention(p)}>
                <Avatar className="h-5 w-5">
                  <AvatarImage src={p.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[8px]">{getAvatarInitials(p.full_name)}</AvatarFallback>
                </Avatar>
                <span className="text-[12.5px] truncate">{p.full_name}</span>
              </button>
            ))}
          </div>
        )}

        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
            if (e.key === "Escape") setMentionQuery(null);
          }}
          placeholder="Comentar…  use @ para citar alguém"
          rows={2}
          className="text-[13px] resize-none"
        />
        <div className="flex items-center gap-2 mt-1.5">
          <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={!draft.trim()}>
            Comentar
          </Button>
          <span className="text-[10.5px] text-muted-foreground flex items-center gap-1">
            <AtSign className="w-3 h-3" /> cita e notifica
          </span>
        </div>
      </div>
    </aside>
  );
}
