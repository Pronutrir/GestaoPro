import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { Trash2, RotateCcw, Search, Inbox } from "lucide-react";

interface TrashedProject {
  id: string;
  title: string;
  description: string | null;
  status: string;
  trashed_at: string | null;
  owner: string | null;
  category: string | null;
}

const ProjectsTrash = () => {
  const { toast } = useToast();
  const { canManage, loading: authLoading } = useProjectAccess();
  const [items, setItems] = useState<TrashedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetch = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("id,title,description,status,trashed_at,owner,category")
      .eq("is_trashed", true)
      .order("trashed_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar lixeira", variant: "destructive" });
    } else {
      setItems((data as TrashedProject[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { if (!authLoading) fetch(); }, [authLoading]);

  const restore = async (id: string) => {
    const { error } = await supabase
      .from("projects")
      .update({ is_trashed: false, trashed_at: null })
      .eq("id", id);
    if (error) return toast({ title: "Erro ao restaurar", variant: "destructive" });
    toast({ title: "Projeto restaurado" });
    fetch();
  };

  const purge = async (id: string) => {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast({ title: "Erro ao excluir definitivamente", variant: "destructive" });
    toast({ title: "Projeto excluído definitivamente" });
    fetch();
  };

  const emptyAll = async () => {
    const { error } = await supabase.from("projects").delete().eq("is_trashed", true);
    if (error) return toast({ title: "Erro ao esvaziar lixeira", variant: "destructive" });
    toast({ title: "Lixeira esvaziada" });
    fetch();
  };

  const filtered = items.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    (p.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  return (
    <AppLayout title="Lixeira de Projetos">
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar na lixeira..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          {canManage && items.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  <Trash2 className="w-4 h-4" /> Esvaziar lixeira
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Esvaziar lixeira?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os {items.length} projeto(s) na lixeira serão excluídos definitivamente.
                    Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={emptyAll}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Excluir tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-2">
              <Inbox className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">A lixeira está vazia.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map(p => (
              <Card key={p.id}>
                <CardContent className="py-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{p.title}</h3>
                      <Badge variant="secondary" className="text-xs">{p.status}</Badge>
                      {p.category && p.category !== "general" && (
                        <Badge variant="outline" className="text-xs">{p.category}</Badge>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{p.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Excluído em {p.trashed_at ? new Date(p.trashed_at).toLocaleString("pt-BR") : "—"}
                      {p.owner && ` • Líder: ${p.owner}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => restore(p.id)} className="gap-2">
                      <RotateCcw className="w-4 h-4" /> Restaurar
                    </Button>
                    {canManage && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" className="gap-2">
                            <Trash2 className="w-4 h-4" /> Excluir definitivamente
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir definitivamente?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{p.title}" será removido permanentemente. Atividades, riscos, reuniões
                              e documentos relacionados ficarão sem projeto vinculado. Esta ação não
                              pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => purge(p.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default ProjectsTrash;