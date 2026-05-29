export interface AvatarLookupProfile {
  id?: string | null;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

export const normalizeProfileLookupKey = (value?: string | null) => {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
};

export const getAvatarInitials = (value?: string | null) => {
  const name = (value || "").trim();
  if (!name) return "U";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
};

export const buildAvatarLookupMap = (profiles: AvatarLookupProfile[]) => {
  const map: Record<string, string> = {};

  profiles.forEach((profile) => {
    const avatar = typeof profile.avatar_url === "string" ? profile.avatar_url.trim() : "";
    if (!avatar) return;

    const id = typeof profile.id === "string" ? profile.id.trim() : "";
    const fullName = typeof profile.full_name === "string" ? profile.full_name.trim() : "";
    const email = typeof profile.email === "string" ? profile.email.trim() : "";

    if (id) {
      map[id] = avatar;
      map[id.toLowerCase()] = avatar;
    }

    if (fullName) {
      map[fullName] = avatar;
      map[fullName.toLowerCase()] = avatar;
      const normalizedName = normalizeProfileLookupKey(fullName);
      if (normalizedName) map[normalizedName] = avatar;
    }

    if (email) {
      map[email] = avatar;
      map[email.toLowerCase()] = avatar;
      const normalizedEmail = normalizeProfileLookupKey(email);
      if (normalizedEmail) map[normalizedEmail] = avatar;
    }
  });

  return map;
};

export const resolveAvatarFromLookup = (
  rawValue: string | null | undefined,
  resolvedName: string | null | undefined,
  avatarLookup: Record<string, string>,
) => {
  const raw = (rawValue || "").trim();
  const displayName = (resolvedName || "").trim();

  const normalizedRaw = normalizeProfileLookupKey(raw);
  const normalizedDisplay = normalizeProfileLookupKey(displayName);

  return (
    (raw ? avatarLookup[raw] : undefined)
    || (raw ? avatarLookup[raw.toLowerCase()] : undefined)
    || (displayName ? avatarLookup[displayName] : undefined)
    || (displayName ? avatarLookup[displayName.toLowerCase()] : undefined)
    || (normalizedRaw ? avatarLookup[normalizedRaw] : undefined)
    || (normalizedDisplay ? avatarLookup[normalizedDisplay] : undefined)
  );
};
