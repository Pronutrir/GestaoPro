import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Paperclip, Upload, FileText, ExternalLink, Trash2, Loader2 } from "lucide-react";
import { useAppConfirm } from "@/components/AppConfirmProvider";

interface ActivityAttachmentsProps {
  activityId: string;
  projectId: string;
}

interface DocumentRow {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ActivityAttachments = ({ activityId, projectId }: ActivityAttachmentsProps) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const { profile } = useAuth();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    const { data } = await supabase
      .from("project_documents")
      .select("id, file_name, file_url, file_type, file_size, uploaded_by, created_at")
      .eq("activity_id", activityId)
      .eq("is_trashed", false)
      .order("created_at", { ascending: false });
    setDocs(data || []);
  };

  useEffect(() => {
    if (activityId) fetchDocs();
  }, [activityId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `activities/${activityId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("csc-attachments")
        .upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("csc-attachments").getPublicUrl(path);
      const { error: insErr } = await supabase.from("project_documents").insert({
        project_id: projectId,
        activity_id: activityId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type || ext.toUpperCase(),
        file_size: file.size,
        uploaded_by: profile?.full_name || null,
      });
      if (insErr) throw insErr;
      toast({ title: "Anexo adicionado!" });
      fetchDocs();
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao enviar arquivo", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: "Remover anexo",
      description: "Remover este anexo?",
      confirmText: "Remover",
      destructive: true,
    });
    if (!ok) return;
    await supabase.from("project_documents").update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq("id", id);
    fetchDocs();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-primary" /> Anexos ({docs.length})
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Enviando..." : "Adicionar"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
      </div>
      {docs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
          Nenhum anexo. Clique em "Adicionar" para enviar um arquivo.
        </p>
      ) : (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border border-border/50 group"
            >
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{d.file_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(d.file_size)}
                  {d.uploaded_by ? ` · ${d.uploaded_by}` : ""}
                  {` · ${new Date(d.created_at).toLocaleDateString("pt-BR")}`}
                </p>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                <a href={d.file_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100"
                onClick={() => handleDelete(d.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};