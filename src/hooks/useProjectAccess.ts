import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns filtered project IDs for the current user.
 * Only Admins see all projects. Gestors and regular users see only projects
 * they're explicitly assigned to as members.
 */
export const useProjectAccess = () => {
  const { user, isAdmin, isGestor, canManage, loading } = useAuth();
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

    const { data: memberships } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    setMemberProjectIds(new Set((memberships || []).map((m: any) => m.project_id)));
    setMembershipsLoading(false);
  }, [isAdmin, loading, user?.id]);

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
