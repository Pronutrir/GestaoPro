import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Trash2, RotateCcw, Search, Inbox, FolderKanban, ListChecks, AlertTriangle, Layers,
  ShieldCheck, Calendar, FileText, Lightbulb, BookOpen, Package, MessageSquare,
} from "lucide-react";

type Module = {
  key: string;
  label: string;
  table:
    | "projects" | "activities" | "risks" | "assumptions" | "meetings"
    | "project_documents" | "lessons_learned" | "user_stories"
    | "delivery_packages" | "activity_comments" | "phases";
  titleField: string;
  subtitleField?: string;
  icon: any;
};

const MODULES: Module[] = [
  { key: "projects", label: "Projetos", table: "projects", titleField: "title", subtitleField: "description", icon: FolderKanban },
  { key: "phases", label: "Fases", table: "phases", titleField: "title", subtitleField: "description", icon: Layers },
  { key: "activities", label: "Atividades", table: "activities", titleField: "title", subtitleField: "description", icon: ListChecks },
  { key: "risks", label: "Riscos", table: "risks", titleField: "description", subtitleField: "mitigation", icon: AlertTriangle },
  { key: "assumptions", label: "Premissas", table: "assumptions", titleField: "description", icon: ShieldCheck },
  { key: "meetings", label: "Reuniões", table: "meetings", titleField: "title", subtitleField: "agenda", icon: Calendar },
  { key: "project_documents", label: "Documentos", table: "project_documents", titleField: "file_name", subtitleField: "description", icon: FileText },
  { key: "lessons_learned", label: "Lições", table: "lessons_learned", titleField: "problem", subtitleField: "solution", icon: Lightbulb },
  { key: "user_stories", label: "Histórias", table: "user_stories", titleField: "title", subtitleField: "narrative", icon: BookOpen },
  { key: "delivery_packages", label: "Pacotes", table: "delivery_packages", titleField: "title", subtitleField: "description", icon: Package },
  { key: "activity_comments", label: "Comentários", table: "activity_comments", titleField: "content", icon: MessageSquare },
];

interface TrashRow {
  id: string;
  trashed_at: string | null;
  [k: string]: any;
}

const Trash = () => {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<string>("projects");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [items, setItems] = useState<TrashRow[]>([]);
  const [loading, setLoading] = useState(true);

  const currentModule = useMemo(() => MODULES.find(m => m.key === tab)!, [tab]);

  const fetchCounts = async () => {
    const results = await Promise.all(
      MODULES.map(m =>
        supabase.from(m.table as any).select("id", { count: "exact", head: true }).eq("is_trashed", true)
      )
    );
    const next: Record<string, number> = {};
    MODULES.forEach((m, i) => { next[m.key] = results[i].count || 0; });
    setCounts(next);
  };

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(currentModule.table as any)
      .select("*")
      .eq("is_trashed", true)
      .order("trashed_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar arquivo", variant: "destructive" });
      setItems([]);
    } else {
      setItems(((data as unknown) as TrashRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCounts(); }, []);
  useEffect(() => { fetchItems(); }, [tab]);

  const restore = async (id: string) => {
    const { error } = await supabase
      .from(currentModule.table as any)
      .update({ is_trashed: false, trashed_at: null })
      .eq("id", id);
    if (error) return toast({ title: "Erro ao restaurar", variant: "destructive" });
    toast({ title: "Item restaurado" });
    fetchItems(); fetchCounts();
  };

  const purge = async (id: string) => {
    const { error } = await supabase.from(currentModule.table as any).delete().eq("id", id);
    if (error) return toast({ title: "Erro ao excluir definitivamente", variant: "destructive" });
    toast({ title: "Excluído definitivamente" });
    fetchItems(); fetchCounts();
  };

  const emptyAll = async () => {
    const { error } = await supabase.from(currentModule.table as any).delete().eq("is_trashed", true);
    if (error) return toast({ title: "Erro ao esvaziar arquivo", variant: "destructive" });
    toast({ title: `Arquivo de ${currentModule.label} esvaziado` });
    fetchItems(); fetchCounts();
  };

  const filtered = items.filter(it => {
    const q = search.toLowerCase();
    if (!q) return true;
    const t = String(it[currentModule.titleField] ?? "").toLowerCase();
    const s = currentModule.subtitleField
      ? String(it[currentModule.subtitleField] ?? "").toLowerCase()
      : "";
    return t.includes(q) || s.includes(q);
  });

  return (
    <AppLayout title="Arquivo">
      <div className="px-4 py-4 space-y-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {MODULES.map(m => {
              const Icon = m.icon;
              return (
                <TabsTrigger key={m.key} value={m.key} className="gap-2">
                  <Icon className="w-4 h-4" />
                  {m.label}
                  {counts[m.key] > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      {counts[m.key]}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {MODULES.map(m => (
            <TabsContent key={m.key} value={m.key} className="space-y-4 mt-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={`Buscar em ${m.label.toLowerCase()}...`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {canManage && items.length > 0 && tab === m.key && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="gap-2">
                        <Trash2 className="w-4 h-4" /> Esvaziar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Esvaziar lixeira de {m.label}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Os {items.length} item(ns) serão excluídos definitivamente.
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

              {loading && tab === m.key ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : tab === m.key && filtered.length === 0 ? (
                <Card>
                  <CardContent className="py-12 flex flex-col items-center text-center gap-2">
                    <Inbox className="w-10 h-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Nenhum item de {m.label.toLowerCase()} na lixeira.
                    </p>
                  </CardContent>
                </Card>
              ) : tab === m.key ? (
                <div className="grid gap-3">
                  {filtered.map(it => {
                    const title = String(it[m.titleField] ?? "(sem título)");
                    const subtitle = m.subtitleField ? String(it[m.subtitleField] ?? "") : "";
                    return (
                      <Card key={it.id}>
                        <CardContent className="py-4 flex items-center gap-4 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground truncate">{title}</h3>
                            {subtitle && (
                              <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                                {subtitle}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Excluído em {it.trashed_at ? new Date(it.trashed_at).toLocaleString("pt-BR") : "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => restore(it.id)} className="gap-2">
                              <RotateCcw className="w-4 h-4" /> Restaurar
                            </Button>
                            {canManage && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="destructive" className="gap-2">
                                    <Trash2 className="w-4 h-4" /> Excluir
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir definitivamente?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      "{title}" será removido permanentemente.
                                      {m.key === "projects" && " Atividades, riscos, reuniões e documentos do projeto também serão removidos."}
                                      {" "}Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => purge(it.id)}
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
                    );
                  })}
                </div>
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Trash;