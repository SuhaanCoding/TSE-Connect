const STOP_WORDS = new Set(
  "a an and are as at be been being but by can do for from had has have he her hers him his how i if in into is it its me my of on or our ours she so some than that the their them there these they this those to too us was we were what when where which who will with would you your years year experience experienced passionate interested working work currently looking love about help".split(
    " ",
  ),
);

export interface MatchableProfile {
  id: string;
  full_name?: string;
  bio?: string | null;
  linkedin_about?: string | null;
  linkedin_background?: string | null;
  keywords?: string[];
  current_role?: string | null;
  current_company?: string | null;
  past_companies?: string[];
  opt_status?: string;
}

export function profileTokens(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+(?:[+#]+)?/gu) || []
  ).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function interests(profile: MatchableProfile): string {
  return [profile.bio || "", ...(profile.keywords || [])].join(" ");
}

function searchText(profile: MatchableProfile): string {
  return [
    profile.full_name,
    profile.current_role,
    profile.current_company,
    ...(profile.past_companies || []),
    interests(profile),
    profile.linkedin_about,
    profile.linkedin_background,
  ]
    .filter(Boolean)
    .join(" ");
}

function rank<T extends MatchableProfile>(
  query: string,
  profiles: T[],
  text: (profile: T) => string,
) {
  const documents = profiles.map((profile) => profileTokens(text(profile)));
  const frequencies = new Map<string, number>();
  for (const document of documents)
    for (const word of new Set(document)) {
      frequencies.set(word, (frequencies.get(word) || 0) + 1);
    }
  const vector = (tokens: string[]) => {
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
    const values = new Map(
      [...counts].map(([word, count]) => [
        word,
        (1 + Math.log(count)) *
          (1 +
            Math.log(
              (documents.length + 1) / ((frequencies.get(word) || 0) + 1),
            )),
      ]),
    );
    const length = Math.hypot(...values.values());
    return new Map(
      [...values].map(([word, weight]) => [word, length ? weight / length : 0]),
    );
  };
  const queryVector = vector(profileTokens(query));
  return profiles.map((profile, index) => {
    const documentVector = vector(documents[index]);
    const shared = [...queryVector]
      .filter(([word]) => documentVector.has(word))
      .map(([word, weight]) => ({
        word,
        weight: weight * documentVector.get(word)!,
      }))
      .sort((a, b) => b.weight - a.weight);
    return {
      ...profile,
      match_score: Math.min(
        1,
        shared.reduce((sum, item) => sum + item.weight, 0),
      ),
      shared_terms: shared.slice(0, 4).map((item) => item.word),
    };
  });
}

export function searchProfiles<T extends MatchableProfile>(
  query: string,
  profiles: T[],
) {
  const needle = query.trim().toLowerCase();
  if (!needle)
    return profiles.map((profile) => ({
      ...profile,
      match_score: 0,
      shared_terms: [] as string[],
    }));
  return rank(query, profiles, searchText)
    .map((profile) => {
      // Preserve direct name/company lookup while ranking free-text interests.
      const name = profile.full_name?.toLowerCase() || "";
      const company = profile.current_company?.toLowerCase() || "";
      const role = profile.current_role?.toLowerCase() || "";
      const past = profile.past_companies || [];
      const boost =
        name === needle
          ? 3
          : name.includes(needle)
            ? 2
            : company.includes(needle)
              ? 1
              : role.includes(needle) ||
                  past.some((value) => value.toLowerCase().includes(needle))
                ? 0.5
                : 0;
      return { ...profile, match_score: profile.match_score + boost };
    })
    .filter((profile) => profile.match_score > 0)
    .sort(
      (a, b) =>
        b.match_score - a.match_score ||
        (a.full_name || "").localeCompare(b.full_name || ""),
    );
}

export function matchingProfiles<T extends MatchableProfile>(
  viewer: T,
  profiles: T[],
  limit = 3,
) {
  const query = interests(viewer);
  if (!profileTokens(query).length || viewer.opt_status !== "opted_in")
    return [];
  return rank(
    query,
    profiles.filter(
      (profile) =>
        profile.id !== viewer.id && profile.opt_status === "opted_in",
    ),
    (profile) =>
      [interests(profile), profile.linkedin_about, profile.linkedin_background]
        .filter(Boolean)
        .join(" "),
  )
    .filter((profile) => profile.match_score > 0)
    .sort(
      (a, b) =>
        b.match_score - a.match_score ||
        (a.full_name || "").localeCompare(b.full_name || ""),
    )
    .slice(0, limit);
}
