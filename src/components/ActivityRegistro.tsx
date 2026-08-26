'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Pencil, Trash2, Send, MessageSquare, Cog, Lightbulb, Check, X, AtSign,
  Paperclip, Reply,
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

/** Anexo de uma mensagem. `path` guarda o caminho no bucket privado — a URL
 *  de leitura é assinada na hora, porque link fixo não funciona ali. */
export interface CommentAttachment {
  path: string;
  name: string;
  type: string;
  size: number | null;
}

interface Comment {
  id: string;
  activity_id: string;
  content: string;
  author: string | null;
  created_at: string;
  attachments?: CommentAttachment[] | null;
  reply_to_id?: string | null;
  reactions?: Record<string, string[]> | null;
  edited_at?: string | null;
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

/**
 * Reações disponíveis — poucas de propósito.
 *
 * Servem para responder sem gerar mais uma mensagem, que é o ruído que mais
 * atrapalha quando muita gente participa: 👍 concordo, 👀 estou vendo,
 * ✅ feito. Uma paleta grande viraria decoração e diluiria o significado.
 */
const REACOES = ["👍", "👀", "✅"] as const;

export const FIELD_LABELS: Record<string, string> = {
  title: "Título", description: "Descrição", status: "Status",
  start_date: "Início", end_date: "Prazo", workflow_stage_id: "Etapa",
  assigned_to: "Responsável", priority: "Prioridade", progress: "Progresso",
  planned_hours: "Horas planejadas", actual_hours: "Horas realizadas", cost: "Custo",
};
/**
 * O HISTÓRICO PARA DE MOSTRAR UUID E ENUM EM INGLÊS.
 *
 * Mostrava, literalmente, `Etapa: <uuid> → <uuid>` e `Status: pending →
 * completed`. `FIELD_LABELS` traduzia a CHAVE do campo, e o VALOR saía por
 * `String(v)`.
 *
 * A causa está na origem: `audit_log.old_data`/`new_data` são o `row_to_json`
 * cru da linha, então `workflow_stage_id` é gravado como UUID. Resolver na
 * origem exigiria reescrever a trigger de auditoria e **não corrigiria o
 * histórico já gravado** — que é justamente o que as pessoas leem.
 *
 * Então a resolução acontece na leitura, mas num ponto só: este arquivo e o
 * `AuditLogPanel` consomem o mesmo `fmtValor`. Um de-para por componente é
 * como o defeito sobreviveu — o segundo consumidor sempre volta a mostrar UUID.
 */
const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
  blocked: "Bloqueada",
};

const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `nomes` resolve UUID → rótulo (colunas do quadro, perfis). O que não estiver
 * no mapa cai num traço curto em vez do UUID: mostrar o identificador não
 * ajuda ninguém, e vazar id de uma coluna que a pessoa não enxerga é pior.
 */
export const fmtValor = (v: any, campo?: string, nomes?: Record<string, string>): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.map((x) => fmtValor(x, campo, nomes)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);

  const s = String(v);

  if (campo === "status") return STATUS_LABELS[s] ?? s;
  if (EH_UUID.test(s)) return nomes?.[s] ?? "—";
  return s;
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
  /** UUID -> rotulo legivel, para o historico. Ver fmtValor. */
  const [nomesPorId, setNomesPorId] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Comment | null>(null);
  const [editText, setEditText] = useState("");
  const [promotingId, setPromotingId] = useState<string | null>(null);

  // ── anexos e resposta ──
  /** Anexos já enviados ao storage, aguardando o envio da mensagem. */
  const [pendingAnexos, setPendingAnexos] = useState<CommentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** Mensagem sendo respondida (mostra a citação acima do campo). */
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  /** path → URL assinada. O bucket é privado: link fixo não funciona. */
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

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

  /**
   * UUID → nome, para o histórico. Sem isto ele mostra o identificador cru.
   *
   * Só as colunas DESTE projeto: são ~7 por projeto, contra 304 na base. E a
   * RLS já recorta — se a pessoa não enxerga o projeto, o mapa vem vazio e o
   * valor cai no traço, que é o comportamento certo.
   */
  useEffect(() => {
    if (!projectId) return;
    let cancelado = false;
    void supabase
      .from("workflow_stages").select("id, title")
      .eq("project_id", projectId)
      .then(({ data }) => {
        if (cancelado || !data) return;
        const m: Record<string, string> = {};
        (data as { id: string; title: string | null }[]).forEach((s) => {
          if (s.title) m[s.id] = s.title;
        });
        setNomesPorId((atual) => ({ ...atual, ...m }));
      });
    return () => { cancelado = true; };
  }, [projectId]);

  useEffect(() => { fetchComments(); fetchAudit(); }, [fetchComments, fetchAudit]);

  // Pessoas para @menção.
  useEffect(() => {
    supabase.from("profiles").select("id, full_name, avatar_url").eq("is_active", true)
      .then(({ data }) => {
        const lista = ((data as Person[]) || []).filter((p) => p.full_name);
        setPeople(lista);
        // Parte da base guarda UUID em  -- o mapa cobre os dois.
        const m: Record<string, string> = {};
        lista.forEach((p) => { if (p.full_name) m[p.id] = p.full_name; });
        setNomesPorId((atual) => ({ ...atual, ...m }));
      });
  }, []);

  // Rola a conversa para o fim quando chegam mensagens.
  useEffect(() => {
    if (tab === "chat" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments, tab]);

  // URLs assinadas dos anexos. O bucket é privado, então a URL vale por tempo
  // limitado e precisa ser pedida — guardar link fixo no banco não funcionaria.
  useEffect(() => {
    const paths = comments
      .flatMap((c) => c.attachments ?? [])
      .map((a) => a.path)
      .filter((p) => p && !signedUrls[p]);
    if (paths.length === 0) return;

    let alive = true;
    supabase.storage.from("activity-attachments")
      .createSignedUrls(Array.from(new Set(paths)), 3600)
      .then(({ data }) => {
        if (!alive || !data) return;
        const novo: Record<string, string> = {};
        data.forEach((d: any) => { if (d.path && d.signedUrl) novo[d.path] = d.signedUrl; });
        if (Object.keys(novo).length) setSignedUrls((prev) => ({ ...prev, ...novo }));
      });
    return () => { alive = false; };
  }, [comments, signedUrls]);

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

  /**
   * Envia um arquivo para o bucket privado da conversa.
   *
   * Print de tela é o caso mais comum, e por isso o Ctrl+V também chama aqui:
   * obrigar a salvar em disco antes de anexar é atrito onde não precisa haver.
   */
  const uploadAnexo = async (file: File): Promise<CommentAttachment | null> => {
    if (!projectId) {
      toast({ title: "Anexo indisponível", description: "Esta conversa não está vinculada a um projeto.", variant: "destructive" });
      return null;
    }
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const path = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("activity-attachments").upload(path, file);
    if (error) {
      const semBucket = /bucket|not found/i.test(error.message);
      toast({
        title: semBucket ? "Anexos ainda não habilitados" : "Falha ao anexar",
        description: semBucket
          ? "Falta criar o bucket de anexos: rode scripts/apply-leva-tap.sh na VM."
          : error.message,
        variant: "destructive",
      });
      return null;
    }
    return { path, name: file.name, type: file.type || "arquivo", size: file.size };
  };

  const anexarArquivos = async (files: FileList | File[]) => {
    const lista = Array.from(files).slice(0, 5); // teto por mensagem
    if (lista.length === 0) return;
    setUploading(true);
    const enviados: CommentAttachment[] = [];
    for (const f of lista) {
      const a = await uploadAnexo(f);
      if (a) enviados.push(a);
    }
    setUploading(false);
    if (enviados.length > 0) setPendingAnexos((prev) => [...prev, ...enviados]);
  };

  const send = async () => {
    // Anexo sozinho é mensagem válida: um print às vezes diz tudo.
    if ((!text.trim() && pendingAnexos.length === 0) || locked) return;
    setSaving(true);
    const body = text.trim();

    const payload: Record<string, any> = {
      activity_id: activityId, content: body, author: authorName,
    };
    if (pendingAnexos.length > 0) payload.attachments = pendingAnexos;
    if (replyTo) payload.reply_to_id = replyTo.id;

    let { error } = await supabase.from("activity_comments").insert(payload);
    // Colunas novas podem não existir ainda: reenvia só com o texto em vez de
    // impedir a mensagem. O anexo se perde, e o aviso diz isso.
    if (error && /attachments|reply_to_id/i.test(error.message)) {
      ({ error } = await supabase.from("activity_comments").insert({
        activity_id: activityId, content: body, author: authorName,
      }));
      if (!error && (pendingAnexos.length > 0 || replyTo)) {
        toast({
          title: "Mensagem enviada sem os extras",
          description: "Anexo e resposta ainda não estão habilitados neste ambiente.",
        });
      }
    }

    setSaving(false);
    if (error) { toast({ title: "Erro ao enviar", variant: "destructive" }); return; }
    setText("");
    setPendingAnexos([]);
    setReplyTo(null);
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

  /**
   * Liga/desliga a minha reação. Guarda QUEM reagiu, não só quantos — sem a
   * lista não dá para saber se já reagi, nem para desfazer.
   */
  const toggleReacao = async (c: Comment, emoji: string) => {
    if (!user?.id || locked) return;
    const atual = { ...(c.reactions ?? {}) };
    const quem = atual[emoji] ?? [];
    atual[emoji] = quem.includes(user.id)
      ? quem.filter((id) => id !== user.id)
      : [...quem, user.id];
    if (atual[emoji].length === 0) delete atual[emoji];

    // Otimista: reação precisa responder na hora, senão a pessoa clica de novo.
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, reactions: atual } : x)));

    const { error } = await supabase
      .from("activity_comments").update({ reactions: atual } as any).eq("id", c.id);
    if (error) {
      // Coluna ausente (migration pendente) ou falha: desfaz o otimista.
      setComments((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      if (/reactions/i.test(error.message)) {
        toast({ title: "Reações ainda não habilitadas", description: "Rode scripts/apply-leva-tap.sh na VM." });
      }
    }
  };

  const saveEdit = async () => {
    if (!editing || !editText.trim() || !isOwn(editing.author)) { setEditing(null); return; }
    // edited_at sustenta o selo "editada": numa conversa que decide trabalho,
    // mensagem reescrita em silêncio é problema.
    let { error } = await supabase
      .from("activity_comments")
      .update({ content: editText.trim(), edited_at: new Date().toISOString() } as any)
      .eq("id", editing.id);
    if (error && /edited_at/i.test(error.message)) {
      ({ error } = await supabase
        .from("activity_comments").update({ content: editText.trim() }).eq("id", editing.id));
    }
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

    return parts.map((p, idx) => {
      if (typeof p === "string") return <span key={idx}>{p}</span>;

      // Menção A MIM é a única que pede ação — só ela mantém o fundo. As
      // demais usam PESO, não cor: com várias pessoas citadas, um fundo por
      // nome transformava a mensagem numa sequência de etiquetas.
      const paraMim = normName(p.m.slice(1)) === normName(authorName);

      return (
        <span
          key={idx}
          className={cn(
            "font-semibold",
            paraMim
              ? cn(
                  "rounded px-1",
                  onPrimary
                    ? "bg-primary-foreground/25 text-primary-foreground"
                    : "bg-primary/15 text-primary",
                )
              // No balão próprio não há contraste de cor disponível (o texto já
              // é claro sobre azul), então o sublinhado fino é o que distingue.
              : onPrimary
                ? "underline decoration-primary-foreground/50 underline-offset-2"
                : "text-primary",
          )}
        >
          {p.m}
        </span>
      );
    });
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
                      {/* Citação da mensagem respondida: numa conversa com
                          várias pessoas, "concordo" sem referência não diz
                          concordar com quê. */}
                      {c.reply_to_id && (() => {
                        const alvo = comments.find((x) => x.id === c.reply_to_id);
                        return (
                          <div className={cn(
                            "mb-1.5 pl-2 border-l-2 text-[11.5px] leading-snug",
                            mine ? "border-primary-foreground/50 text-primary-foreground/85" : "border-primary/40 text-muted-foreground",
                          )}>
                            <span className="font-medium">{alvo?.author ?? "Mensagem"}</span>
                            {alvo ? ` · ${alvo.content.slice(0, 60)}${alvo.content.length > 60 ? "…" : ""}` : " · removida"}
                          </div>
                        );
                      })()}

                      {renderBody(c.content, mine)}

                      {/* Anexos. Imagem aparece na conversa (é o ponto de colar
                          um print); os demais viram link com o nome do arquivo. */}
                      {(c.attachments ?? []).length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1.5">
                          {(c.attachments ?? []).map((a) => {
                            const url = signedUrls[a.path];
                            const isImg = /^image\//.test(a.type);
                            if (isImg) {
                              return url ? (
                                <a key={a.path} href={url} target="_blank" rel="noopener noreferrer">
                                  <img src={url} alt={a.name}
                                    className="max-h-52 w-auto rounded-lg border border-border/50 object-contain" />
                                </a>
                              ) : (
                                <div key={a.path} className="h-24 rounded-lg bg-background/20 animate-pulse" />
                              );
                            }
                            return (
                              <a key={a.path} href={url || "#"} target="_blank" rel="noopener noreferrer"
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] max-w-full",
                                  mine ? "border-primary-foreground/30 hover:bg-primary-foreground/10" : "border-border hover:bg-background/60",
                                )}>
                                <Paperclip className="w-3 h-3 shrink-0" />
                                <span className="truncate">{a.name}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Reações e "editada" ficam FORA do balão: são metadados
                        da mensagem, não conteúdo dela. */}
                    <div className={cn("flex items-center gap-1.5 mt-0.5", mine && "flex-row-reverse")}>
                      {REACOES.map((emoji) => {
                        const quem = (c.reactions ?? {})[emoji] ?? [];
                        if (quem.length === 0) return null;
                        const euReagi = !!user?.id && quem.includes(user.id);
                        return (
                          <button key={emoji} type="button" onClick={() => toggleReacao(c, emoji)}
                            title={`${quem.length} pessoa(s)`}
                            className={cn(
                              "inline-flex items-center gap-0.5 rounded-full border px-1.5 text-[11px] transition-colors",
                              euReagi ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                            )}>
                            {emoji} <span className="tabular-nums">{quem.length}</span>
                          </button>
                        );
                      })}
                      {c.edited_at && (
                        <span className="text-[10px] text-muted-foreground" title={`Editada em ${fmtTime(c.edited_at)}`}>
                          editada
                        </span>
                      )}
                    </div>
                    {/* ações */}
                    <div className={cn("flex gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity", mine && "flex-row-reverse")}>
                      {!locked && (
                        <>
                          <button type="button" title="Responder"
                            onClick={() => { setReplyTo(c); taRef.current?.focus(); }}
                            className="text-muted-foreground hover:bg-muted rounded p-1">
                            <Reply className="w-3 h-3" />
                          </button>
                          {/* Reagir sem gerar mais uma mensagem. */}
                          {REACOES.map((emoji) => (
                            <button key={emoji} type="button" title={`Reagir ${emoji}`}
                              onClick={() => toggleReacao(c, emoji)}
                              className="text-[11px] leading-none hover:bg-muted rounded p-1">
                              {emoji}
                            </button>
                          ))}
                        </>
                      )}
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
              {/* Respondendo a alguém: a citação fica acima do campo, com saída
                  visível — senão a pessoa escreve sem perceber que está em modo
                  resposta. */}
              {replyTo && (
                <div className="flex items-start gap-2 mb-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[12px]">
                  <Reply className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{replyTo.author ?? "Mensagem"}</span>
                    <span className="text-muted-foreground">
                      {" · "}{replyTo.content.slice(0, 70)}{replyTo.content.length > 70 ? "…" : ""}
                    </span>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)} title="Cancelar resposta"
                    className="text-muted-foreground hover:text-foreground shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Anexos já enviados, aguardando a mensagem. */}
              {(pendingAnexos.length > 0 || uploading) && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {pendingAnexos.map((a) => (
                    <span key={a.path}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-[11.5px]">
                      <Paperclip className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[140px]">{a.name}</span>
                      <button type="button" title="Remover anexo"
                        onClick={() => setPendingAnexos((prev) => prev.filter((x) => x.path !== a.path))}
                        className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {uploading && (
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground px-2 py-1">
                      enviando…
                    </span>
                  )}
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) void anexarArquivos(e.target.files); e.target.value = ""; }}
              />

              <div
                className={cn(
                  "flex items-end gap-2 rounded-xl border bg-background focus-within:ring-1 focus-within:ring-primary/40 p-1.5 transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border",
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files?.length) void anexarArquivos(e.dataTransfer.files);
                }}
              >
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title="Anexar arquivo ou imagem"
                  className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
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
                  // Ctrl+V de print é o caso mais comum: obrigar a salvar em
                  // disco antes de anexar é atrito onde não precisa haver.
                  onPaste={(e) => {
                    const arquivos = Array.from(e.clipboardData?.files ?? []);
                    if (arquivos.length > 0) {
                      e.preventDefault();
                      void anexarArquivos(arquivos);
                    }
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
                {/* Anexo sozinho já é mensagem: um print às vezes diz tudo. */}
                <Button size="icon" className="h-9 w-9 shrink-0 rounded-lg" onClick={send}
                  disabled={saving || uploading || (!text.trim() && pendingAnexos.length === 0)}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1 mt-1 px-1 text-[10.5px] text-muted-foreground">
                <AtSign className="w-3 h-3" /> Enter envia · Shift+Enter quebra linha · @ notifica · cole ou arraste para anexar
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
                        <span className="line-through text-muted-foreground">{fmtValor(a.old_data?.[f], f, nomesPorId)}</span>
                        {" → "}<span className="text-foreground">{fmtValor(a.new_data?.[f], f, nomesPorId)}</span>
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
