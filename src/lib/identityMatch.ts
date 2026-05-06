/**
 * Identity matching utilities for permission checks.
 *
 * Background: project records frequently store free-text identifiers
 * (`owner`, `manager`, `assignees[]`) using a short version of a person's
 * name (e.g. "Williame Correia"), while the user profile has the full name
 * ("Williame Correia de Lima") and the auth account has an email
 * ("williame.correia@pronutrir.com.br"). A naive equality comparison after
 * normalizing the strings misses these cases and silently hides the project
 * from the rightful user.
 *
 * The helpers below provide a tolerant comparison that combines:
 *   1. Exact normalized equality
 *   2. Substring containment
 *   3. Token overlap (two or more meaningful tokens shared)
 *   4. Email local-part containment / token overlap
 */

const STOP_TOKENS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "y",
  "del",
  "la",
  "le",
  "the",
]);

export const normalizeIdentity = (value: string | null | undefined): string => {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

const tokenize = (value: string): string[] => {
  if (!value) return [];
  return value
    .split(/[\s._\-+@]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_TOKENS.has(token));
};

export interface IdentityCandidate {
  /** Full normalized string (e.g. "williame correia de lima"). */
  normalized: string;
  /** Significant tokens extracted from the source. */
  tokens: Set<string>;
}

export const buildCandidate = (value: string | null | undefined): IdentityCandidate | null => {
  const normalized = normalizeIdentity(value);
  if (!normalized) return null;
  return { normalized, tokens: new Set(tokenize(normalized)) };
};

/**
 * Builds the bag of identity candidates for a user from every available
 * source: profile name, profile/auth email, email local-part. Each source
 * becomes its own candidate so the per-token comparison stays meaningful.
 */
export const buildUserCandidates = (sources: Array<string | null | undefined>): IdentityCandidate[] => {
  const map = new Map<string, IdentityCandidate>();
  for (const raw of sources) {
    const candidate = buildCandidate(raw);
    if (!candidate) continue;
    if (!map.has(candidate.normalized)) {
      map.set(candidate.normalized, candidate);
    }
    // Email special case: also register the local-part (before "@") as its
    // own candidate so "Williame Correia" can match "williame.correia".
    if (raw && raw.includes("@")) {
      const local = raw.split("@")[0];
      const localCandidate = buildCandidate(local);
      if (localCandidate && !map.has(localCandidate.normalized)) {
        map.set(localCandidate.normalized, localCandidate);
      }
    }
  }
  return Array.from(map.values());
};

const candidatesShareTokens = (a: IdentityCandidate, b: IdentityCandidate, minOverlap = 2): boolean => {
  if (a.tokens.size === 0 || b.tokens.size === 0) return false;
  let shared = 0;
  for (const token of a.tokens) {
    if (b.tokens.has(token)) {
      shared++;
      if (shared >= minOverlap) return true;
    }
  }
  // Single distinctive token is enough when one side only has one token
  // (e.g. owner stored just as "williame" or just an email local-part).
  if (shared >= 1 && (a.tokens.size === 1 || b.tokens.size === 1)) {
    return true;
  }
  return false;
};

/**
 * True when `value` plausibly identifies the same person as one of the
 * `candidates`. Comparison is case/diacritics-insensitive and tolerant to
 * short vs. long forms of the name.
 */
export const matchesIdentity = (
  value: string | null | undefined,
  candidates: IdentityCandidate[],
): boolean => {
  const target = buildCandidate(value);
  if (!target || candidates.length === 0) return false;

  for (const candidate of candidates) {
    if (candidate.normalized === target.normalized) return true;
    if (
      candidate.normalized.length >= 3 &&
      target.normalized.length >= 3 &&
      (candidate.normalized.includes(target.normalized) ||
        target.normalized.includes(candidate.normalized))
    ) {
      return true;
    }
    if (candidatesShareTokens(candidate, target)) return true;
  }
  return false;
};

/** Convenience: any of the strings matches any of the candidates. */
export const anyMatchesIdentity = (
  values: Array<string | null | undefined>,
  candidates: IdentityCandidate[],
): boolean => values.some((value) => matchesIdentity(value, candidates));
