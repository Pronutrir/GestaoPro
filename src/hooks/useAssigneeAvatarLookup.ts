import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildAvatarLookupMap } from "@/lib/avatarLookup";

const looksLikeUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

export const useAssigneeAvatarLookup = (assignees: Array<string | null | undefined>) => {
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  const stableAssignees = assignees
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort();
  const lookupKey = stableAssignees.join("|");

  useEffect(() => {
    const values = stableAssignees;

    if (values.length === 0) {
      setAvatarMap({});
      return;
    }

    const ids = Array.from(new Set(values.filter(looksLikeUuid)));
    const emails = Array.from(new Set(values.filter((value) => !looksLikeUuid(value) && value.includes("@"))));
    const names = Array.from(new Set(values.filter((value) => !looksLikeUuid(value) && !value.includes("@"))));

    let cancelled = false;

    const load = async () => {
      const mergedById = new Map<string, { id: string | null; full_name: string | null; email: string | null; avatar_url: string | null }>();

      if (ids.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", ids);
        (data || []).forEach((profile) => mergedById.set(profile.id, profile));
      }

      if (emails.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("email", emails);
        (data || []).forEach((profile, index) => {
          const key = profile.id || profile.email || profile.full_name || `email-${index}`;
          mergedById.set(key, profile);
        });
      }

      if (names.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("full_name", names);
        (data || []).forEach((profile, index) => {
          const key = profile.id || profile.email || profile.full_name || `name-${index}`;
          mergedById.set(key, profile);
        });
      }

      if (!cancelled) {
        setAvatarMap(buildAvatarLookupMap(Array.from(mergedById.values())));
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [lookupKey]);

  return avatarMap;
};
