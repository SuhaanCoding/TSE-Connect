const STOP_WORDS = new Set(
  "a am an and are as at be been being but by can do for from had has have he her hers him his how i if in into is it its me my of on or our ours she so some than that the their them there these they this those to too us was we were what when where which who will with would you your years year experience experienced passionate interested working work currently looking love about help".split(
    " ",
  ),
);
const GENERIC = new Set(
  "build built develop developed development engineer engineering software system systems learning machine language model research researcher science data design product project projects application technology tool tools student university college san diego ucsd triton team teams use using led lead role email gmail com linkedin skills knowledge strong support company companies".split(
    " ",
  ),
);
const VERBS = new Set(
  "build built develop developed use using led lead working work help".split(
    " ",
  ),
);
const TERMS: Record<string, string> = {
  systems: "system",
  databases: "database",
  models: "model",
  engineers: "engineer",
  researchers: "researcher",
  applications: "application",
  projects: "project",
  tools: "tool",
  algorithms: "algorithm",
  networks: "network",
  mentoring: "mentorship",
  mentors: "mentorship",
  visualizations: "visualization",
};
const ALIASES: [RegExp, string][] = [
  [/\b(?:llms?|large[- ]language[- ]models?)\b/g, "large language models"],
  [
    /\b(?:nlp|natural[- ]language[- ]processing)\b/g,
    "natural language processing",
  ],
  [/\b(?:rl|reinforcement[- ]learning)\b/g, "reinforcement learning"],
  [/\b(?:ml|machine[- ]learning)\b/g, "machine learning"],
  [/\b(?:ai|artificial[- ]intelligence)\b/g, "artificial intelligence"],
  [/\b(?:ux|user[- ]experience)\b/g, "user experience"],
  [/\b(?:ui|user[- ]interface)\b/g, "user interface"],
  [/\b(?:frontend|front[- ]end)\b/g, "front end"],
  [/\b(?:backend|back[- ]end)\b/g, "back end"],
  [/\b(?:fullstack|full[- ]stack)\b/g, "full stack"],
];
const PHRASES = new Set(
  "machine learning|reinforcement learning|deep learning|computer vision|natural language|language processing|large language|language model|artificial intelligence|distributed system|system design|design system|data science|computer science|data engineering|data analysis|data visualization|software engineering|product design|user experience|user interface|climate tech|climate research|quantitative finance|open source|front end|back end|full stack".split(
    "|",
  ),
);
const LABELS: Record<string, string> = {
  "distributed system": "distributed systems",
  "design system": "design systems",
  "language model": "language models",
};

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
type Field = { text: string; weight: number };
type Features = Map<string, number>;
function features(text: string): Features {
  let clean = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/g, " ")
    .replace(/\b(?:email|e-mail)\s*:[^\n]*/g, " ");
  for (const [pattern, replacement] of ALIASES)
    clean = clean.replace(pattern, replacement);
  const result: Features = new Map();
  const add = (key: string, weight = 1) =>
    result.set(key, (result.get(key) || 0) + weight);
  for (const sentence of clean.split(/[\n.!?;]+/)) {
    const words = profileTokens(sentence)
      .filter((word) => /\p{L}/u.test(word))
      .map((word) => TERMS[word] || word);
    for (const word of words) add(`w:${word}`);
    for (let i = 0; i < words.length - 1; i++) {
      const pair = `${words[i]} ${words[i + 1]}`;
      if (
        PHRASES.has(pair) ||
        (!VERBS.has(words[i]) &&
          !VERBS.has(words[i + 1]) &&
          !(GENERIC.has(words[i]) && GENERIC.has(words[i + 1])))
      )
        add(`p:${pair}`);
    }
  }
  // Specific ML disciplines share a restrained parent concept without making
  // the word "learning" alone sufficient evidence of a shared interest.
  if (
    !result.has("p:machine learning") &&
    [
      "reinforcement learning",
      "deep learning",
      "computer vision",
      "large language",
      "natural language",
    ].some((term) => result.has(`p:${term}`))
  )
    add("p:machine learning", 0.35);
  return result;
}
function interestFields(
  profile: MatchableProfile,
  includeBackground: boolean,
): Field[] {
  return [
    ...(profile.keywords || []).map((text) => ({ text, weight: 3 })),
    { text: profile.bio || "", weight: 2 },
    ...(includeBackground
      ? [
          { text: profile.linkedin_about || "", weight: 0.9 },
          { text: profile.linkedin_background || "", weight: 0.65 },
          { text: profile.current_role || "", weight: 0.45 },
        ]
      : []),
  ].filter((field) => field.text.trim());
}
function normalize(values: Features): Features {
  const length = Math.hypot(...values.values());
  return new Map(
    [...values].map(([term, weight]) => [term, length ? weight / length : 0]),
  );
}
function rank<T extends MatchableProfile>(
  queryFields: Field[],
  profiles: T[],
  fields: (profile: T) => Field[],
  personal: boolean,
) {
  const documents = profiles.map((profile) =>
    fields(profile).map((field) => ({
      ...field,
      features: features(field.text),
    })),
  );
  const frequencies = new Map<string, number>();
  for (const document of documents)
    for (const term of new Set(
      document.flatMap((field) => [...field.features.keys()]),
    ))
      frequencies.set(term, (frequencies.get(term) || 0) + 1);
  const vector = (document: { weight: number; features: Features }[]) => {
    const combined: Features = new Map();
    for (const field of document) {
      const weighted = new Map(
        [...field.features].map(([term, count]) => [
          term,
          (count < 1 ? count : 1 + Math.log(Math.min(count, 3))) *
            (1 +
              Math.log(
                (documents.length + 1) / ((frequencies.get(term) || 0) + 1),
              )) *
            (term.startsWith("p:")
              ? 2.2
              : GENERIC.has(term.slice(2))
                ? 0.15
                : 1),
        ]),
      );
      // Normalize each field before mixing: a long work history cannot drown
      // out a short, deliberate keyword or bio, nor win by keyword repetition.
      for (const [term, value] of normalize(weighted))
        combined.set(term, (combined.get(term) || 0) + value * field.weight);
    }
    return normalize(combined);
  };
  const query = vector(
    queryFields.map((field) => ({ ...field, features: features(field.text) })),
  );
  return profiles.map((profile, index) => {
    const candidate = vector(documents[index]);
    const shared = [...query]
      .filter(([term]) => candidate.has(term))
      .map(([term, weight]) => ({
        term,
        weight: weight * candidate.get(term)!,
      }))
      .sort((a, b) => b.weight - a.weight);
    const meaningful = shared.filter(
      ({ term }) => term.startsWith("p:") || !GENERIC.has(term.slice(2)),
    );
    const reasons: string[] = [];
    const covered = new Set<string>();
    for (const { term } of [
      ...meaningful.filter((item) => item.term.startsWith("p:")),
      ...meaningful.filter((item) => !item.term.startsWith("p:")),
    ]) {
      const label = term.slice(2);
      if (!term.startsWith("p:") && covered.has(label)) continue;
      reasons.push(LABELS[label] || label);
      if (term.startsWith("p:"))
        for (const word of label.split(" ")) covered.add(word);
      if (reasons.length === 4) break;
    }
    const score = Math.min(
      1,
      shared.reduce((sum, item) => sum + item.weight, 0),
    );
    return {
      ...profile,
      match_score: personal && (!meaningful.length || score < 0.03) ? 0 : score,
      shared_terms: reasons,
    };
  });
}
function ordered<T extends MatchableProfile & { match_score: number }>(
  profiles: T[],
) {
  return profiles
    .filter((profile) => profile.match_score > 0)
    .sort(
      (a, b) =>
        b.match_score - a.match_score ||
        (a.full_name || "").localeCompare(b.full_name || ""),
    );
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
  return ordered(
    rank(
      [{ text: query, weight: 1 }],
      profiles,
      (profile) => [
        ...interestFields(profile, true),
        {
          text: [
            profile.full_name,
            profile.current_company,
            ...(profile.past_companies || []),
          ]
            .filter(Boolean)
            .join("\n"),
          weight: 1.1,
        },
      ],
      false,
    ).map((profile) => {
      const name = profile.full_name?.toLowerCase() || "",
        company = profile.current_company?.toLowerCase() || "",
        role = profile.current_role?.toLowerCase() || "";
      const boost =
        name === needle
          ? 3
          : name.includes(needle)
            ? 2
            : company.includes(needle)
              ? 1
              : role.includes(needle) ||
                  (profile.past_companies || []).some((value) =>
                    value.toLowerCase().includes(needle),
                  )
                ? 0.5
                : 0;
      return { ...profile, match_score: profile.match_score + boost };
    }),
  );
}
export function matchingProfiles<T extends MatchableProfile>(
  viewer: T,
  profiles: T[],
  limit = 3,
) {
  const query = interestFields(viewer, false);
  if (
    !query.some((field) => profileTokens(field.text).length) ||
    viewer.opt_status !== "opted_in"
  )
    return [];
  return ordered(
    rank(
      query,
      profiles.filter(
        (profile) =>
          profile.id !== viewer.id && profile.opt_status === "opted_in",
      ),
      (profile) => interestFields(profile, true),
      true,
    ),
  ).slice(0, Math.max(0, Math.floor(limit)));
}

/** Rank the entire visible pool, retaining zero-signal profiles for discovery. */
export function rankAllProfiles<T extends MatchableProfile>(
  viewer: T,
  profiles: T[],
  query = "",
) {
  const authored = interestFields(viewer, false);
  const fields = query.trim()
    ? [
        { text: query.trim(), weight: 3 },
        ...authored.map((field) => ({ ...field, weight: field.weight * 0.25 })),
      ]
    : authored.length
      ? authored
      : interestFields(viewer, true);
  const candidates = profiles.filter((profile) => profile.id !== viewer.id);
  const needle = query.trim().toLowerCase();
  return rank(
    fields,
    candidates,
    (profile) => [
      ...interestFields(profile, true),
      ...(needle
        ? [
            {
              text: [
                profile.full_name,
                profile.current_company,
                ...(profile.past_companies || []),
              ]
                .filter(Boolean)
                .join(" "),
              weight: 1,
            },
          ]
        : []),
    ],
    true,
  )
    .map((profile) => ({
      ...profile,
      match_score:
        profile.match_score +
        (needle
          ? profile.full_name?.toLowerCase() === needle
            ? 3
            : profile.full_name?.toLowerCase().includes(needle)
              ? 2
              : profile.current_company?.toLowerCase().includes(needle)
                ? 1
                : 0
          : 0),
    }))
    .sort(
      (a, b) =>
        b.match_score - a.match_score ||
        (a.full_name || "").localeCompare(b.full_name || ""),
    );
}
