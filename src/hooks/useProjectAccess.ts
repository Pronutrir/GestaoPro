import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns filtered project IDs for the current user.
 * Admins see all projects; regular users see only projects they're assigned to.
 */
export const useProjectAccess = () => {
  const { user, isAdmin } = useAuth();

  const filterProjects = async <T extends { id: string }>(projects: T[]): Promise<T[]> => {
    if (isAdmin || !user) return projects;

    const { data: memberships } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    if (!memberships) return [];
    const allowedIds = new Set(memberships.map((m: any) => m.project_id));
    return projects.filter((p) => allowedIds.has(p.id));
  };

  return { filterProjects, isAdmin, user };
};
