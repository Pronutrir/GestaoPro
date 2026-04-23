import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns filtered project IDs for the current user.
 * Only Admins see all projects. Gestors and regular users see projects where
 * they are: (a) explicitly added as members, (b) the project Líder (owner),
 * or (c) listed as participants (assignees) by full name.
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

    const fullName = profile?.full_name || null;

    const [membersRes, ownedRes, assigneeRes] = await Promise.all([
      supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id),
      fullName
        ? supabase.from("projects").select("id").eq("owner", fullName)
        : Promise.resolve({ data: [] as { id: string }[] } as any),
      fullName
        ? supabase.from("projects").select("id").contains("assignees", [fullName])
        : Promise.resolve({ data: [] as { id: string }[] } as any),
    ]);

    const ids = new Set<string>();
    (membersRes.data || []).forEach((m: any) => ids.add(m.project_id));
    (ownedRes.data || []).forEach((p: any) => ids.add(p.id));
    (assigneeRes.data || []).forEach((p: any) => ids.add(p.id));
    setMemberProjectIds(ids);
    setMembershipsLoading(false);
  }, [isAdmin, loading, user?.id, profile?.full_name]);

  useEffect(() => {
    loadMemberships();
  }, [loadMemberships]);

  useEffect(() => {
    if (loading || isAdmin || !user?.id) return;

    const refresh = () => {
      loadMemberships();
    };

    const handleFocus = () => refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    const intervalId = window.setInterval(refresh, 10000);

    const channel = supabase
      .channel(`project-memberships-${user.id}`)
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
  }, [isAdmin, loadMemberships, loading, user?.id]);

  const filterProjects = async <T extends { id: string }>(projects: T[]): Promise<T[]> => {
    if (isAdmin || !user) return projects;

    return projects.filter((p) => memberProjectIds.has(p.id));
  };

  return { filterProjects, isAdmin, isGestor, canManage, user, loading: loading || membershipsLoading };
};
