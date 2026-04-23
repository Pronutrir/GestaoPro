import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Trash2, ExternalLink, Upload, Pencil, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { AIAssistButton } from "@/components/AIAssistButton";

interface ProjectDocument {
  id: string;
  project_id: string;
  activity_id: string | null;
  phase_id: string | null;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  version: number;
  uploaded_by: string | null;
  description: string | null;
  created_at: string;
}

interface Phase {
  id: string;
  title: string;
}

interface Activity {
  id: string;
  title: string;
}

interface DocumentManagerProps {
  projectId: string;
  phases: Phase[];
  activities: Activity[];
}

const emptyForm = {
  file_name: "",
  file_url: "",
  file_type: "",
  description: "",
  uploaded_by: "",
  phase_id: "",
  activity_id: "",
};

export const DocumentManager = ({ projectId, phases, activities }: DocumentManagerProps) => {
  const { toast } = useToast();
  const { canManage: isAdmin } = useAuth();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchDocuments();
  }, [projectId]);

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (!error && data) setDocuments(data);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (doc: ProjectDocument) => {
    setEditingId(doc.id);
    setShowForm(true);
    setForm({
      file_name: doc.file_name,
      file_url: doc.file_url,
      file_type: doc.file_type || "",
      description: doc.description || "",
      uploaded_by: doc.uploaded_by || "",
      phase_id: doc.phase_id || "",
      activity_id: doc.activity_id || "",
    });
  };

  const handleSubmit = async () => {
    if (!form.file_name.trim() || !form.file_url.trim()) {
      toast({ title: "Informe nome e URL do documento", variant: "destructive" });
      return;
    }

    const payload = {
      file_name: form.file_name,
      file_url: form.file_url,
      file_type: form.file_type || null,
      description: form.description || null,
      uploaded_by: form.uploaded_by || null,
      phase_id: form.phase_id || null,
      activity_id: form.activity_id || null,
    };

    if (editingId) {
      const { error } = await supabase.from("project_documents").update(payload).eq("id", editingId);
      if (error) {
        toast({ title: "Erro ao atualizar documento", variant: "destructive" });
        return;
      }
      toast({ title: "Documento atualizado!" });
    } else {
      const { error } = await supabase.from("project_documents").insert({ ...payload, project_id: projectId });
      if (error) {
        toast({ title: "Erro ao adicionar documento", variant: "destructive" });
        return;
      }
      toast({ title: "Documento adicionado!" });
    }

    resetForm();
    fetchDocuments();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este documento?")) return;
    await supabase.from("project_documents").delete().eq("id", id);
    fetchDocuments();
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Documentos ({documents.length})
        </h3>
        {isAdmin && (
          <Button
            size="sm"
            variant={showForm ? "secondary" : "default"}
            onClick={() => { if (showForm) resetForm(); else { resetForm(); setShowForm(true); } }}
            className="gap-1"
          >
            {showForm ? <><X className="w-4 h-4" /> Cancelar</> : <><Plus className="w-4 h-4" /> Novo Documento</>}
          </Button>
        )}
      </div>

      {showForm && (
        <div className="space-y-3 p-4 bg-accent/30 rounded-lg border border-border">
          <Input placeholder="Nome do documento *" value={form.file_name} onChange={(e) => setForm({ ...form, file_name: e.target.value })} />
          <Input placeholder="URL do documento *" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Tipo (PDF, DOCX, etc.)" value={form.file_type} onChange={(e) => setForm({ ...form, file_type: e.target.value })} />
            <Input placeholder="Adicionado por" value={form.uploaded_by} onChange={(e) => setForm({ ...form, uploaded_by: e.target.value })} />
          </div>
          <Input placeholder="Descrição (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {form.description.trim() && (
            <div className="flex justify-end -mt-2">
              <AIAssistButton value={form.description} onChange={(v) => setForm({ ...form, description: v })} context="document_description" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {phases.length > 0 && (
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.phase_id} onChange={(e) => setForm({ ...form, phase_id: e.target.value })}>
                <option value="">Fase (opcional)</option>
                {phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            )}
            {activities.length > 0 && (
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.activity_id} onChange={(e) => setForm({ ...form, activity_id: e.target.value })}>
                <option value="">Atividade (opcional)</option>
                {activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            )}
          </div>
          <Button onClick={handleSubmit} className="gap-1">
            {editingId ? <><Save className="w-4 h-4" /> Salvar</> : <><Upload className="w-4 h-4" /> Adicionar</>}
          </Button>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento associado</p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-card group hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-foreground truncate">{doc.file_name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {doc.file_type && <Badge variant="outline" className="text-xs">{doc.file_type}</Badge>}
                    {doc.phase_id && (
                      <Badge className="bg-primary/20 text-primary text-xs">
                        {phases.find((p) => p.id === doc.phase_id)?.title}
                      </Badge>
                    )}
                    {doc.uploaded_by && <span className="text-xs text-muted-foreground">👤 {doc.uploaded_by}</span>}
                    <span className="text-xs text-muted-foreground">
                      v{doc.version} · {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  {doc.description && <p className="text-xs text-muted-foreground mt-1 truncate">{doc.description}</p>}
                </div>
              </div>
              <div className="flex gap-1 ml-2">
                <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                {isAdmin && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => startEdit(doc)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};