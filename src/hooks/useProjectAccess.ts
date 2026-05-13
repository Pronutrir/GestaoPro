import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { anyMatchesIdentity, buildUserCandidates, matchesIdentity } from "@/lib/identityMatch";

/**
 * Retorna os projetos visíveis para o usuário atual conforme o modelo v2.
 * Somente admins veem tudo. Usuários comuns veem apenas projetos onde são
 * membros explícitos ou líderes do projeto (owner por nome).
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

    const membersPromise = supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    const projectsPromise = candidates.length > 0
      ? supabase
          .from("projects")
          .select("id, owner")
          .eq("is_trashed", false)
      : Promise.resolve({ data: [] as any[], error: null });

    const activitiesPromise = candidates.length > 0
      ? supabase
          .from("activities")
          .select("project_id, assigned_to, participants")
          .eq("is_trashed", false)
      : Promise.resolve({ data: [] as any[], error: null });

    const [membersRes, projectsRes, activitiesRes] = await Promise.all([
      membersPromise,
      projectsPromise,
      activitiesPromise,
    ]);

    const ids = new Set<string>();
    (membersRes.data || []).forEach((m: any) => ids.add(m.project_id));

    if (candidates.length > 0) {
      (projectsRes.data || []).forEach((p: any) => {
        const ownerMatch = matchesIdentity(p.owner, candidates);
        if (ownerMatch) ids.add(p.id);
      });

      (activitiesRes.data || []).forEach((a: any) => {
        const isAssignedActor = matchesIdentity(a.assigned_to, candidates);
        const isParticipantActor = Array.isArray(a.participants) && anyMatchesIdentity(a.participants, candidates);

        if (isAssignedActor || isParticipantActor) {
          ids.add(a.project_id);
        }
      });
    }

    setMemberProjectIds(ids);
    setMembershipsLoading(false);
  }, [isAdmin, loading, user?.id, profile?.email, profile?.full_name]);

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
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
