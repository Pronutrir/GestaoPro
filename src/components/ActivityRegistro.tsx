'use client';
import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Pencil, Trash2, Send, MessageSquare, Cog, ListFilter, Lightbulb, Check, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { AIAssistButton } from "@/components/AIAssistButton";
import { useAssigneeAvatarLookup } from "@/hooks/useAssigneeAvatarLookup";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";

/**
 * REGISTRO DA ATIVIDADE — diário de bordo unificado.
 *
 * Uma linha do tempo única por atividade, alinhada ao método por atividades/EAP
 * (não ágil). Mescla três fontes já existentes:
 *  - "Nota"    → comentários escritos pelo time (tabela activity_comments)
 *  - "Sistema" → mudanças automáticas (audit_log: prazo/status/responsável…)
 *  - "Lição"   → nota promovida a Lição Aprendida do projeto (lessons_learned)
 *
 * Substitui as antigas abas separadas "Comentários" e "Histórico".
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

type EntryKind = "note" | "system";
interface TimelineEntry {
  key: string;
  kind: EntryKind;
  author: string | null;
  created_at: string;
  // note
  comment?: Comment;
  // system
  audit?: AuditEntry;
}

type Filter = "all" | "note" | "system";

// Rótulos amigáveis para os campos que aparecem nos eventos do sistema.
const FIELD_LABELS: Record<string, string> = {
  title: "Título",
  description: "Descrição",
  status: "Status",
  start_date: "Início",
  end_date: "Prazo",
  workflow_stage_id: "Etapa",
  assigned_to: "Responsável",
  priority: "Prioridade",
  progress: "Progresso",
  planned_hours: "Horas planejadas",
  actual_hours: "Horas realizadas",
  cost: "Custo",
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
  /** Também traz (somente leitura) notas das subatividades. */
  includeSubActivities?: boolean;
  /** Quando o projeto está concluído, bloqueia escrita. */
  locked?: boolean;
}

export const ActivityRegistro = ({
  activityId, projectId, phaseId, includeSubActivities = false, locked = false,
}: Props) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [subMap, setSubMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Comment | null>(null);
  const [editText, setEditText] = useState("");
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const authorName: string = profile?.full_name?.trim() || user?.email || "Usuário";
  const isOwn = (author: string | null) =>
    Boolean(author && author.trim().toLowerCase() === authorName.trim().toLowerCase());

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
      .order("created_at", { ascending: false });
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

  const addNote = async () => {
    if (!newNote.trim() || locked) return;
    setSaving(true);
    const { error } = await supabase.from("activity_comments").insert({
      activity_id: activityId, content: newNote.trim(), author: authorName,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro ao registrar", variant: "destructive" }); return; }
    setNewNote("");
    fetchComments();
    // Notifica responsável + participantes da atividade (best-effort, não bloqueia).
    notifyParticipants(newNote.trim());
  };

  // Avisa quem está na atividade que houve um novo registro. Resolve os NOMES
  // (assigned_to/participants) para profiles.id, pois notifications.target_user_id
  // é um UUID. Best-effort e silencioso em erro — notificação é acessório.
  const notifyParticipants = async (excerpt: string) => {
    try {
      const { data: act } = await supabase
        .from("activities").select("assigned_to, participants, title, project_id")
        .eq("id", activityId).maybeSingle();
      if (!act) return;
      const names = new Set<string>();
      if ((act as any).assigned_to) names.add((act as any).assigned_to);
      const parts = (act as any).participants;
      if (Array.isArray(parts)) parts.forEach((p: any) => p && names.add(p));
      names.delete(authorName); // não notifica quem escreveu
      if (names.size === 0) return;

      // nome → profile.id
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name").in("full_name", Array.from(names));
      const ids = (profs || []).map((p: any) => p.id).filter(Boolean);
      if (ids.length === 0) return;

      const title = `Novo registro em "${(act as any).title ?? "atividade"}"`;
      const message = `${authorName}: ${excerpt.slice(0, 120)}`;
      const rows = ids.map((uid: string) => ({
        target_user_id: uid,
        activity_id: activityId,
        project_id: (act as any).project_id ?? projectId ?? null,
        type: "activity_note",
        title,
        message,
      }));
      await (supabase as any).from("notifications").insert(rows);
    } catch { /* silencioso */ }
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
    if (!isOwn(c.author)) { toast({ title: "Você só pode excluir suas próprias notas", variant: "destructive" }); return; }
    if (!confirm("Excluir esta nota do registro?")) return;
    const { error } = await supabase
      .from("activity_comments")
      .update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq("id", c.id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    fetchComments();
  };

  // Promove uma nota a Lição Aprendida do projeto.
  const promoteToLesson = async (c: Comment) => {
    if (!projectId) { toast({ title: "Sem projeto para vincular a lição", variant: "destructive" }); return; }
    setPromotingId(c.id);
    try {
      const { error } = await (supabase as any).from("lessons_learned").insert({
        project_id: projectId,
        phase_id: phaseId ?? null,
        problem: c.content,
        category: "Registro da atividade",
        reported_by: c.author ?? authorName,
      });
      if (error) throw error;
      toast({ title: "Nota promovida a Lição Aprendida!" });
    } catch {
      toast({ title: "Não foi possível promover a lição", variant: "destructive" });
    } finally {
      setPromotingId(null);
    }
  };

  // Timeline unificada (mais recente primeiro).
  const timeline = useMemo<TimelineEntry[]>(() => {
    const notes: TimelineEntry[] = comments.map((c) => ({
      key: `n-${c.id}`, kind: "note", author: c.author, created_at: c.created_at, comment: c,
    }));
    const sys: TimelineEntry[] = audit
      // Ignora o INSERT inicial ruidoso quando já há título; mantém updates/deletes.
      .filter((a) => a.operation !== "INSERT" || !!a.new_data?.title)
      .map((a) => ({
        key: `a-${a.id}`, kind: "system", author: a.changed_by_email, created_at: a.created_at, audit: a,
      }));
    const merged = [...notes, ...sys].sort(
      (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime(),
    );
    return filter === "all" ? merged : merged.filter((e) => e.kind === filter);
  }, [comments, audit, filter]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
    });

  const FILTERS: { key: Filter; label: string; icon: any }[] = [
    { key: "all", label: "Tudo", icon: ListFilter },
    { key: "note", label: "Notas", icon: MessageSquare },
    { key: "system", label: "Sistema", icon: Cog },
  ];

  return (
    <div className="space-y-3">
      {/* Cabeçalho + filtro */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">Registro</span>
        <div className="flex gap-0.5 bg-muted/60 rounded-md p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors",
                filter === f.key ? "bg-background text-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <f.icon className="w-3 h-3" /> {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Composer de nota */}
      {!locked && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Avatar className="h-5 w-5 shrink-0">
                {(() => {
                  const a = resolveAvatarFromLookup(authorName, authorName, avatarMap);
                  return a ? <AvatarImage src={a} alt={authorName} /> : null;
                })()}
                <AvatarFallback className="text-[9px]">{getAvatarInitials(authorName)}</AvatarFallback>
              </Avatar>
              Registrando como <span className="font-medium text-foreground">{authorName}</span>
            </div>
            {newNote.trim() && <AIAssistButton value={newNote} onChange={setNewNote} context="comment" />}
          </div>
          <div className="flex gap-2">
            <Textarea
              placeholder="Escrever no registro… (andamento, decisão, bloqueio)"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[38px] text-sm resize-none flex-1"
              rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote(); }}
            />
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={addNote} disabled={saving || !newNote.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-[13px] border border-dashed border-border rounded-lg">
          Nenhum registro ainda. Comece anotando o andamento acima.
        </div>
      ) : (
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
          {timeline.map((e) => e.kind === "note" ? (
            <NoteRow
              key={e.key}
              c={e.comment!}
              own={isOwn(e.comment!.author)}
              editing={editing?.id === e.comment!.id}
              editText={editText}
              setEditText={setEditText}
              onStartEdit={() => { setEditing(e.comment!); setEditText(e.comment!.content); }}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditing(null)}
              onRemove={() => removeNote(e.comment!)}
              onPromote={() => promoteToLesson(e.comment!)}
              promoting={promotingId === e.comment!.id}
              canPromote={!!projectId && !locked}
              subLabel={e.comment!.activity_id !== activityId ? subMap[e.comment!.activity_id] : undefined}
              avatarMap={avatarMap}
              fmtDate={fmtDate}
            />
          ) : (
            <SystemRow key={e.key} a={e.audit!} fmtDate={fmtDate} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Linha de NOTA ── */
function NoteRow({
  c, own, editing, editText, setEditText, onStartEdit, onSaveEdit, onCancelEdit,
  onRemove, onPromote, promoting, canPromote, subLabel, avatarMap, fmtDate,
}: {
  c: Comment; own: boolean; editing: boolean; editText: string; setEditText: (v: string) => void;
  onStartEdit: () => void; onSaveEdit: () => void; onCancelEdit: () => void;
  onRemove: () => void; onPromote: () => void; promoting: boolean; canPromote: boolean;
  subLabel?: string; avatarMap: any; fmtDate: (iso: string) => string;
}) {
  if (editing) {
    return (
      <div className="p-2 bg-accent/50 rounded-lg space-y-2">
        <div className="flex justify-end">
          <AIAssistButton value={editText} onChange={setEditText} context="comment" />
        </div>
        <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[60px] text-sm" />
        <div className="flex gap-1">
          <Button size="sm" onClick={onSaveEdit}><Check className="w-3.5 h-3.5 mr-1" /> Salvar</Button>
          <Button size="sm" variant="outline" onClick={onCancelEdit}><X className="w-3.5 h-3.5 mr-1" /> Cancelar</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="p-3 bg-accent/30 rounded-lg group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {c.author && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Avatar className="h-5 w-5 shrink-0">
                  {(() => {
                    const a = resolveAvatarFromLookup(c.author, c.author, avatarMap);
                    return a ? <AvatarImage src={a} alt={c.author} /> : null;
                  })()}
                  <AvatarFallback className="text-[9px]">{getAvatarInitials(c.author)}</AvatarFallback>
                </Avatar>
                <span>{c.author}</span>
              </span>
            )}
            <span className="text-xs text-muted-foreground">{fmtDate(c.created_at)}</span>
            {subLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                ↳ {subLabel}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{c.content}</p>
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {canPromote && (
            <Button size="icon" variant="ghost" className="h-6 w-6 text-amber-600" title="Promover a Lição Aprendida" onClick={onPromote} disabled={promoting}>
              <Lightbulb className="w-3.5 h-3.5" />
            </Button>
          )}
          {own && (
            <>
              <Button size="icon" variant="ghost" className="h-6 w-6" title="Editar" onClick={onStartEdit}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" title="Excluir" onClick={onRemove}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Linha de SISTEMA (audit) ── */
function SystemRow({ a, fmtDate }: { a: AuditEntry; fmtDate: (iso: string) => string }) {
  const changes = (a.changed_fields || []).filter((f) => FIELD_LABELS[f]); // só campos "de negócio"
  const label = a.operation === "INSERT" ? "Atividade criada" : a.operation === "DELETE" ? "Excluída" : "Alteração";
  return (
    <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20">
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Cog className="w-3 h-3" /> {label}
        </span>
        <span className="text-[11px] text-muted-foreground">{fmtDate(a.created_at)}</span>
        {a.changed_by_email && <span className="text-[11px] text-muted-foreground">· {a.changed_by_email}</span>}
      </div>
      {a.operation === "UPDATE" && changes.length > 0 && (
        <div className="space-y-0.5">
          {changes.map((f) => (
            <div key={f} className="text-[11.5px] text-foreground/80">
              <span className="font-medium">{FIELD_LABELS[f]}:</span>{" "}
              <span className="line-through text-muted-foreground">{fmtVal(a.old_data?.[f])}</span>
              {" → "}
              <span className="text-foreground">{fmtVal(a.new_data?.[f])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
