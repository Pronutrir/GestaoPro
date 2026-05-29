'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Archive,
  Beaker,
  CheckCircle,
  Lightbulb,
  Rocket,
  Search,
} from 'lucide-react';
import { ProjectColumn } from '@/components/ProjectColumn';
import { ProjectDrawer } from '@/components/ProjectDrawer';
import { AddProjectDialog } from '@/components/AddProjectDialog';
import { EditProjectDialog } from '@/components/EditProjectDialog';
import { ProjectCardPreview } from '@/components/SortableProjectCard';
import { PipelineSkeleton } from '@/components/SkeletonScreens';
import { useProjectAccess } from '@/hooks/useProjectAccess';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  DragOverlay, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { buildAvatarLookupMap } from '@/lib/avatarLookup';

interface Project {
  id: string; title: string; description: string | null; status: string; priority: string;
  due_date: string | null; assignees: string[]; budget_planned: number; budget_used: number;
  owner: string | null; blockers: string | null; display_order: number;
  category?: string; program?: string | null;
}

const looksLikeUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

const STATUS_CARD_STYLES = {
  ideacao: {
    active: 'border-amber-500 ring-2 ring-amber-300/40',
    hover: 'hover:border-amber-400',
    iconWrap: 'bg-gradient-to-br from-amber-100 to-amber-50 ring-1 ring-amber-200/70',
    icon: 'text-amber-600',
  },
  poc: {
    active: 'border-sky-500 ring-2 ring-sky-300/40',
    hover: 'hover:border-sky-400',
    iconWrap: 'bg-gradient-to-br from-sky-100 to-cyan-50 ring-1 ring-sky-200/70',
    icon: 'text-sky-600',
  },
  mvp: {
    active: 'border-indigo-500 ring-2 ring-indigo-300/40',
    hover: 'hover:border-indigo-400',
    iconWrap: 'bg-gradient-to-br from-indigo-100 to-blue-50 ring-1 ring-indigo-200/70',
    icon: 'text-indigo-600',
  },
  blocked: {
    active: 'border-rose-500 ring-2 ring-rose-300/40',
    hover: 'hover:border-rose-400',
    iconWrap: 'bg-gradient-to-br from-rose-100 to-red-50 ring-1 ring-rose-200/70',
    icon: 'text-rose-600',
  },
  drawer: {
    active: 'border-slate-500 ring-2 ring-slate-300/40',
    hover: 'hover:border-slate-400',
    iconWrap: 'bg-gradient-to-br from-slate-100 to-zinc-50 ring-1 ring-slate-200/70',
    icon: 'text-slate-700',
  },
  'em-execucao': {
    active: 'border-emerald-500 ring-2 ring-emerald-300/40',
    hover: 'hover:border-emerald-400',
    iconWrap: 'bg-gradient-to-br from-emerald-100 to-teal-50 ring-1 ring-emerald-200/70',
    icon: 'text-emerald-600',
  },
  concluido: {
    active: 'border-green-500 ring-2 ring-green-300/40',
    hover: 'hover:border-green-400',
    iconWrap: 'bg-gradient-to-br from-green-100 to-lime-50 ring-1 ring-green-200/70',
    icon: 'text-green-600',
  },
} as const;

function ProjectsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { filterProjects, loading: authLoading } = useProjectAccess();
  const { isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [drawerProject, setDrawerProject] = useState<Project | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assigneeAvatarMap, setAssigneeAvatarMap] = useState<Record<string, string>>({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const statusFilter = searchParams.get('status');

  const handleStatusFilter = (status: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status) params.set('status', status); else params.delete('status');
    router.replace(`/projects?${params.toString()}`);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .or('category.neq.qualidade,category.is.null')
        .eq('is_trashed', false)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const filtered = await filterProjects(data || []);
      setProjects(filtered);

      const assigneeValues = filtered
        .flatMap((project) => Array.isArray(project.assignees) ? project.assignees : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      if (assigneeValues.length === 0) {
        setAssigneeAvatarMap({});
      } else {
        const ids = Array.from(new Set(assigneeValues.filter(looksLikeUuid)));
        const emails = Array.from(new Set(assigneeValues.filter((value) => !looksLikeUuid(value) && value.includes('@'))));
        const names = Array.from(new Set(assigneeValues.filter((value) => !looksLikeUuid(value) && !value.includes('@'))));

        const mergedById = new Map<string, { id: string | null; full_name: string | null; email: string | null; avatar_url: string | null }>();

        if (ids.length > 0) {
          const { data: byIds } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .in('id', ids);
          (byIds || []).forEach((profile) => mergedById.set(profile.id, profile));
        }

        if (emails.length > 0) {
          const { data: byEmails } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .in('email', emails);
          (byEmails || []).forEach((profile, index) => {
            const key = profile.id || profile.email || profile.full_name || `email-${index}`;
            mergedById.set(key, profile);
          });
        }

        if (names.length > 0) {
          const { data: byNames } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .in('full_name', names);
          (byNames || []).forEach((profile, index) => {
            const key = profile.id || profile.email || profile.full_name || `name-${index}`;
            mergedById.set(key, profile);
          });
        }

        setAssigneeAvatarMap(buildAvatarLookupMap(Array.from(mergedById.values())));
      }
    } catch {
      toast.error('Erro ao carregar projetos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveProjectId(null);
    if (!over || active.id === over.id) return;

    const activeProject = projects.find((p) => p.id === active.id);
    if (!activeProject) return;

    const overProject = projects.find((p) => p.id === over.id);

    const targetStatus = String(over.id).startsWith('column-')
      ? String(over.id).replace('column-', '')
      : overProject?.status;

    if (!targetStatus) return;

    const sourceProjects = projects
      .filter((p) => p.status === activeProject.status)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const oldIndex = sourceProjects.findIndex((p) => p.id === activeProject.id);
    if (oldIndex === -1) return;

    const nextProjects = [...projects];

    if (activeProject.status === targetStatus) {
      const newIndex = sourceProjects.findIndex((p) => p.id === over.id);
      if (newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(sourceProjects, oldIndex, newIndex);
      setProjects((prev) =>
        prev.map((p) => {
          if (p.status !== activeProject.status) return p;
          const newOrder = reordered.findIndex((rp) => rp.id === p.id);
          return { ...p, display_order: newOrder };
        }),
      );

      try {
        for (let i = 0; i < reordered.length; i++) {
          await supabase.from('projects').update({ display_order: i }).eq('id', reordered[i].id);
        }
      } catch {
        toast.error('Erro ao reordenar');
        fetchProjects();
      }
      return;
    }

    const targetProjects = projects
      .filter((p) => p.status === targetStatus && p.id !== activeProject.id)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

    const movedProject = { ...activeProject, status: targetStatus };
    const insertIndex = overProject && overProject.status === targetStatus
      ? targetProjects.findIndex((p) => p.id === overProject.id)
      : targetProjects.length;
    const safeInsertIndex = insertIndex >= 0 ? insertIndex : targetProjects.length;
    const reorderedTarget = [...targetProjects];
    reorderedTarget.splice(safeInsertIndex, 0, movedProject);
    const reorderedSource = sourceProjects.filter((p) => p.id !== activeProject.id);

    setProjects(
      nextProjects.map((project) => {
        if (project.id === activeProject.id) {
          return { ...project, status: targetStatus, display_order: safeInsertIndex };
        }
        if (project.status === activeProject.status) {
          const idx = reorderedSource.findIndex((p) => p.id === project.id);
          return idx >= 0 ? { ...project, display_order: idx } : project;
        }
        if (project.status === targetStatus) {
          const idx = reorderedTarget.findIndex((p) => p.id === project.id);
          return idx >= 0 ? { ...project, display_order: idx } : project;
        }
        return project;
      }),
    );

    try {
      await supabase
        .from('projects')
        .update({ status: targetStatus, display_order: safeInsertIndex })
        .eq('id', activeProject.id);

      for (let i = 0; i < reorderedSource.length; i++) {
        await supabase.from('projects').update({ display_order: i }).eq('id', reorderedSource[i].id);
      }

      for (let i = 0; i < reorderedTarget.length; i++) {
        await supabase
          .from('projects')
          .update({ display_order: i, status: targetStatus })
          .eq('id', reorderedTarget[i].id);
      }
    } catch {
      toast.error('Erro ao mover projeto');
      fetchProjects();
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveProjectId(String(event.active.id));
  };

  const activeProject = activeProjectId
    ? projects.find((project) => project.id === activeProjectId) || null
    : null;

  const handleDelete = async (projectId: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ is_trashed: true, trashed_at: new Date().toISOString() })
        .eq('id', projectId);
      if (error) throw error;
      toast.success('Projeto movido para a lixeira');
      fetchProjects();
    } catch {
      toast.error('Erro ao mover para a lixeira');
    }
  };

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('projects').update({ status: newStatus }).eq('id', projectId);
      if (error) throw error;
      toast.success('Status atualizado!');
      fetchProjects();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  useEffect(() => {
    if (!authLoading) fetchProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  const filteredProjects = projects.filter(
    (p) =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const sortByOrder = (arr: Project[]) =>
    [...arr].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const statusCards = [
    { key: 'ideacao', label: 'Ideação', icon: Lightbulb, projects: sortByOrder(filteredProjects.filter((p) => p.status === 'ideacao')) },
    { key: 'poc', label: 'POC', icon: Beaker, projects: sortByOrder(filteredProjects.filter((p) => p.status === 'poc')) },
    { key: 'mvp', label: 'MVP', icon: Rocket, projects: sortByOrder(filteredProjects.filter((p) => p.status === 'mvp')) },
    { key: 'blocked', label: 'Bloqueio', icon: AlertTriangle, projects: sortByOrder(filteredProjects.filter((p) => p.status === 'blocked')) },
    { key: 'drawer', label: 'Gaveta', icon: Archive, projects: sortByOrder(filteredProjects.filter((p) => p.status === 'drawer')) },
    { key: 'em-execucao', label: 'Em Execução', icon: ActivityIcon, projects: sortByOrder(filteredProjects.filter((p) => p.status === 'em-execucao')) },
    { key: 'concluido', label: 'Concluídos', icon: CheckCircle, projects: sortByOrder(filteredProjects.filter((p) => p.status === 'concluido')) },
  ];

  return (
    <div className="px-4 py-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar projetos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <AddProjectDialog onProjectAdded={fetchProjects} />
        </div>
      </div>

      {/* Status Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
        {statusCards.map((s) => (
          <div
            key={s.key}
            className={`bg-card border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
              statusFilter === s.key ? STATUS_CARD_STYLES[s.key].active : `border-border ${STATUS_CARD_STYLES[s.key].hover}`
            }`}
            onClick={() => handleStatusFilter(statusFilter === s.key ? null : s.key)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${STATUS_CARD_STYLES[s.key].iconWrap}`}>
                <s.icon className={`w-5 h-5 ${STATUS_CARD_STYLES[s.key].icon}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold text-foreground">{s.projects.length}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {statusFilter && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtrando por:</span>
          <Button variant="outline" size="sm" onClick={() => handleStatusFilter(null)} className="gap-2">
            {statusCards.find((s) => s.key === statusFilter)?.label}{' '}
            <span className="text-xs">×</span>
          </Button>
        </div>
      )}

      {/* Pipeline Board */}
      {isLoading ? (
        <PipelineSkeleton />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveProjectId(null)}
        >
          <div
            className={`grid gap-6 ${statusFilter ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-7'}`}
          >
            {statusCards
              .filter((s) => !statusFilter || statusFilter === s.key)
              .map((s) => (
                <ProjectColumn
                  key={s.key}
                  title={s.label}
                  status={s.key}
                  projects={s.projects}
                  assigneeAvatarMap={assigneeAvatarMap}
                  onEdit={(p: Project) => { setEditingProject(p); setEditDialogOpen(true); }}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  isAdmin={isAdmin}
                  onCardClick={(p: Project) => router.push(`/project/${p.id}`)}
                />
              ))}
          </div>
          <DragOverlay>
            {activeProject ? (
              <div className="rotate-2 opacity-90 w-[280px]">
                <ProjectCardPreview project={activeProject} assigneeAvatarMap={assigneeAvatarMap} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <EditProjectDialog
        project={editingProject}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onProjectUpdated={fetchProjects}
      />
      <ProjectDrawer project={drawerProject} assigneeAvatarMap={assigneeAvatarMap} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<PipelineSkeleton />}>
      <ProjectsContent />
    </Suspense>
  );
}
