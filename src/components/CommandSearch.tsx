import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  FolderKanban,
  Map,
  Home,
  Users,
  BarChart3,
  Settings,
  GanttChart,
  AlertTriangle,
  Search,
} from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  type: "project" | "page";
  url: string;
  description?: string;
}

const pages: SearchResult[] = [
  { id: "overview", title: "Visão Geral", type: "page", url: "/", description: "Dashboard principal" },
  { id: "roadmap", title: "Roadmap Estratégico", type: "page", url: "/roadmap", description: "Priorização de ideias" },
  { id: "projects", title: "Pipeline de Projetos", type: "page", url: "/projects", description: "Gestão de projetos" },
  { id: "timeline", title: "Cronograma", type: "page", url: "/timeline", description: "Visão temporal" },
  { id: "team", title: "Equipe", type: "page", url: "/team", description: "Membros da equipe" },
  { id: "reports", title: "Relatórios", type: "page", url: "/reports", description: "Análises e métricas" },
  { id: "blocked", title: "Bloqueios", type: "page", url: "/blocked-projects", description: "Projetos bloqueados" },
  { id: "settings", title: "Configurações", type: "page", url: "/settings", description: "Preferências" },
];

const pageIcons: Record<string, React.ElementType> = {
  overview: Home,
  roadmap: Map,
  projects: FolderKanban,
  timeline: GanttChart,
  team: Users,
  reports: BarChart3,
  blocked: AlertTriangle,
  settings: Settings,
};

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<SearchResult[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (!open) return;
    const fetchProjects = async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, title, status")
        .order("updated_at", { ascending: false })
        .limit(20);
      if (data) {
        setProjects(
          data.map((p) => ({
            id: p.id,
            title: p.title,
            type: "project" as const,
            url: `/project/${p.id}`,
            description: p.status,
          }))
        );
      }
    };
    fetchProjects();
  }, [open]);

  const handleSelect = useCallback(
    (url: string) => {
      setOpen(false);
      navigate(url);
    },
    [navigate]
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 border border-border rounded-md hover:bg-muted transition-colors"
      >
        <span>Buscar...</span>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar projetos, páginas..." />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          <CommandGroup heading="Páginas">
            {pages.map((page) => {
              const Icon = pageIcons[page.id] || Home;
              return (
                <CommandItem
                  key={page.id}
                  value={page.title}
                  onSelect={() => handleSelect(page.url)}
                >
                  <Icon className="mr-2 h-4 w-4 opacity-60" />
                  <div className="flex flex-col">
                    <span>{page.title}</span>
                    <span className="text-xs opacity-70">{page.description}</span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
          {projects.length > 0 && (
            <CommandGroup heading="Projetos">
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.title}
                  onSelect={() => handleSelect(project.url)}
                >
                  <FolderKanban className="mr-2 h-4 w-4 opacity-60" />
                  <div className="flex flex-col">
                    <span>{project.title}</span>
                    <span className="text-xs opacity-70">{project.description}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
