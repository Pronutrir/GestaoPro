import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { anyMatchesIdentity, buildUserCandidates, matchesIdentity } from "@/lib/identityMatch";

/**
 * Returns filtered project IDs for the current user.
 * Only Admins see all projects. Gestors and regular users see projects where
 * they are: (a) explicitly added as members, (b) the project creator, (c) the
 * project Líder (owner) or Gerente (manager), or (d) listed as a participant
 * (assignees) — using tolerant identity matching (NFD + tokens) so short and
 * long forms of the same name still bind to the right user.
 */
export const useProjectAccess = () => {
  const { user, isAdmin, isGestor, canManage, profile, loading } = useAuth();
  const [memberProjectIds, setMemberProjectIds] = useState<Set<string>>(new Set());
  const [membershipsLoading, setMembershipsLoading] = useState(true);

  const loadMemberships = useCallback(async () => {
    if (loading) return;

    if (isAdmin || !user?.id) {
      setMemberProjectIds(new Set());
      setMembershipsLoading(false);
      return;
    }

    setMembershipsLoading(true);

    const candidates = buildUserCandidates([
      profile?.full_name,
      profile?.email,
      user?.email,
    ]);

    // Fetch project_members + ALL non-trashed projects. Keep backward-compat
    // with databases that still don't have created_by/manager columns.
    const membersPromise = supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    const projectsPromise = candidates.length > 0
      ? (async () => {
          const primary = await supabase
            .from("projects")
            .select("id, created_by, owner, assignees, manager")
            .eq("is_trashed", false);

          if (!primary.error) {
            return primary as { data: any[] | null; error: any };
          }

          const fallback = await supabase
            .from("projects")
            .select("id, owner, assignees")
            .eq("is_trashed", false);

          return fallback as { data: any[] | null; error: any };
        })()
      : Promise.resolve({ data: [] as any[], error: null });

    const [membersRes, projectsRes] = await Promise.all([membersPromise, projectsPromise]);

    const ids = new Set<string>();
    (membersRes.data || []).forEach((m: any) => ids.add(m.project_id));

    if (candidates.length > 0) {
      (projectsRes.data || []).forEach((p: any) => {
        const creatorMatch =
          typeof p.created_by === "string" && p.created_by === user.id;
        const ownerMatch = matchesIdentity(p.owner, candidates);
        const managerMatch = matchesIdentity(p.manager, candidates);
        const assigneeMatch =
          Array.isArray(p.assignees) && anyMatchesIdentity(p.assignees, candidates);
        if (creatorMatch || ownerMatch || managerMatch || assigneeMatch) ids.add(p.id);
      });
    }

    setMemberProjectIds(ids);
    setMembershipsLoading(false);
  }, [isAdmin, loading, user?.email, user?.id, profile?.email, profile?.full_name]);

  useEffect(() => {
    loadMemberships();
  }, [loadMemberships]);

  // Mantemos a referência mais recente de loadMemberships sem refazer o effect
  // de subscribe (que recriaria o canal Realtime e quebraria com
  // "cannot add postgres_changes callbacks after subscribe()").
  const loadMembershipsRef = useRef(loadMemberships);
  useEffect(() => {
    loadMembershipsRef.current = loadMemberships;
  }, [loadMemberships]);

  useEffect(() => {
    if (loading || isAdmin || !user?.id) return;

    const refresh = () => {
      loadMembershipsRef.current();
    };

    const handleFocus = () => refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    const intervalId = window.setInterval(refresh, 10000);

    // Nome único por mount: evita o singleton interno do supabase-js
    // (mesmo nome após remountagem rapida retorna o canal antigo já "joined"
    // e .on() lança "cannot add postgres_changes callbacks after subscribe()").
    const channelName = `project-memberships-${user.id}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_members", filter: `user_id=eq.${user.id}` },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        refresh
      )
      .subscribe();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [isAdmin, loading, user?.id]);

  const filterProjects = async <T extends { id: string }>(projects: T[]): Promise<T[]> => {
    if (isAdmin || !user) return projects;

    return projects.filter((p) => memberProjectIds.has(p.id));
  };

  return { filterProjects, isAdmin, isGestor, canManage, user, loading: loading || membershipsLoading };
};
