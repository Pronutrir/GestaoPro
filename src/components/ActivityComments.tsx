'use client';
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2, MessageSquare, Send, UserCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { AIAssistButton } from "@/components/AIAssistButton";

interface Comment {
  id: string;
  activity_id: string;
  content: string;
  author: string | null;
  created_at: string;
  updated_at: string;
}

interface ActivityCommentsProps {
  activityId: string;
  /** When true, also fetch (read-only) comments from sub-activities (parent_id = activityId). */
  includeSubActivities?: boolean;
}

export const ActivityComments = ({ activityId, includeSubActivities = false }: ActivityCommentsProps) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [subActivityMap, setSubActivityMap] = useState<Record<string, string>>({});
  const [newComment, setNewComment] = useState("");
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const currentAuthorName: string =
    profile?.full_name?.trim() || user?.email || "Usuário";
  const isOwnComment = (author: string | null) =>
    Boolean(author && author.trim().toLowerCase() === currentAuthorName.trim().toLowerCase());

  useEffect(() => {
    fetchComments();
  }, [activityId, includeSubActivities]);

  const fetchComments = async () => {
    let ids: string[] = [activityId];
    let map: Record<string, string> = {};
    if (includeSubActivities) {
      const { data: subs } = await supabase
        .from("activities")
        .select("id,title")
        .eq("parent_id", activityId)
        .eq("is_trashed", false);
      if (subs && subs.length) {
        ids = [activityId, ...subs.map((s: any) => s.id)];
        map = Object.fromEntries(subs.map((s: any) => [s.id, s.title]));
      }
    }
    setSubActivityMap(map);
    const { data, error } = await supabase
      .from("activity_comments")
      .select("*")
      .in("activity_id", ids)
      .eq("is_trashed", false)
      .order("created_at", { ascending: true });
    if (!error && data) setComments(data as Comment[]);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setIsLoading(true);

    try {
      const { error } = await supabase.from("activity_comments").insert({
        activity_id: activityId,
        content: newComment,
        author: currentAuthorName,
      });

      if (error) throw error;

      setNewComment("");
      fetchComments();
    } catch (error) {
      console.error("Erro ao adicionar comentário:", error);
      toast({ title: "Erro ao adicionar comentário", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateComment = async () => {
    if (!editingComment || !editContent.trim()) return;
    if (!isOwnComment(editingComment.author)) {
      toast({ title: "Você só pode editar seus próprios comentários", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from("activity_comments")
        .update({ content: editContent })
        .eq("id", editingComment.id);

      if (error) throw error;

      setEditingComment(null);
      setEditContent("");
      fetchComments();
    } catch (error) {
      toast({ title: "Erro ao editar", variant: "destructive" });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const comment = comments.find((item) => item.id === commentId);
    if (!comment || !isOwnComment(comment.author)) {
      toast({ title: "Você só pode excluir seus próprios comentários", variant: "destructive" });
      return;
    }

    if (!confirm("Excluir este comentário?")) return;

    try {
      const { error } = await supabase
        .from("activity_comments")
        .update({ is_trashed: true, trashed_at: new Date().toISOString() })
        .eq("id", commentId);

      if (error) throw error;
      fetchComments();
    } catch (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageSquare className="w-4 h-4" />
        Comentários ({comments.length})
      </div>

      {/* Comment list */}
      {comments.length > 0 && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {comments.map((comment) =>
            editingComment?.id === comment.id ? (
              <div key={comment.id} className="space-y-2 p-2 bg-accent/50 rounded-lg">
                <div className="flex justify-end">
                  <AIAssistButton value={editContent} onChange={setEditContent} context="comment" />
                </div>
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[60px] text-sm"
                />
                <div className="flex gap-1">
                  <Button size="sm" onClick={handleUpdateComment}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingComment(null)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div key={comment.id} className="p-3 bg-accent/30 rounded-lg group">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {comment.author && (
                        <span className="text-xs font-medium text-foreground">{comment.author}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.created_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {comment.activity_id !== activityId && subActivityMap[comment.activity_id] && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          ↳ {subActivityMap[comment.activity_id]}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{comment.content}</p>
                  </div>
                  {isOwnComment(comment.author) && (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => {
                          setEditingComment(comment);
                          setEditContent(comment.content);
                        }}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        onClick={() => handleDeleteComment(comment.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Add comment */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserCircle className="w-3.5 h-3.5" />
            Comentando como <span className="font-medium text-foreground">{currentAuthorName}</span>
          </div>
          {newComment.trim() && (
            <AIAssistButton value={newComment} onChange={setNewComment} context="comment" />
          )}
        </div>
        <div className="flex gap-2">
          <Textarea
            placeholder="Adicionar comentário..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[36px] text-sm resize-none flex-1"
            rows={1}
          />
          <Button
            size="icon"
            className="h-9 w-9 flex-shrink-0"
            onClick={handleAddComment}
            disabled={isLoading || !newComment.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
