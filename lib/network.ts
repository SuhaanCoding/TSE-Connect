import type { Alumni } from "./types";
import { rankAllProfiles, profileTokens } from "./profile-matching";
import { normalizeLinkedInUrl } from "./linkedin-profile";

export const NETWORK_GOALS = [
  {
    id: "interests",
    label: "Shared interests",
    description: "People whose profile text overlaps with yours.",
  },
  {
    id: "advice",
    label: "Career perspective",
    description: "Relevant experience and people opted in to the network.",
  },
  {
    id: "peers",
    label: "Peer exchange",
    description: "Shared interests and a similar graduation cohort.",
  },
] as const;
export type NetworkGoal = (typeof NETWORK_GOALS)[number]["id"];
export type { CompanyScope } from "./company-taxonomy";
export { COMPANY_CATEGORIES, companySignals } from "./company-taxonomy";
import {
  COMPANY_CATEGORIES,
  companySignals,
  normalizeCompany,
  type CompanySignal,
  type CompanyScope,
} from "./company-taxonomy";
export type { CompanySignal } from "./company-taxonomy";
const normalized = normalizeCompany;
export interface NetworkFilters {
  goal: NetworkGoal;
  categories: string[];
  companies: string[];
  scope: CompanyScope;
  year: string;
  query: string;
  optedOnly: boolean;
}
export interface NetworkProfile extends Alumni {
  rank: number;
  match_score: number;
  shared_terms: string[];
  company_signals: CompanySignal[];
  reasons: string[];
  evidence: "profile text" | "limited text";
  signal_level: "stronger overlap" | "some overlap" | "exploratory";
}
export function parseNetworkFilters(params: URLSearchParams): NetworkFilters {
  const goal = params.get("goal") || "interests",
    scope = params.get("scope") || "all";
  return {
    goal: NETWORK_GOALS.some((item) => item.id === goal)
      ? (goal as NetworkGoal)
      : "interests",
    categories: (params.get("categories") || "")
      .split(",")
      .filter((id) => COMPANY_CATEGORIES.some((item) => item.id === id)),
    companies: params
      .getAll("company")
      .map((value) => value.slice(0, 200))
      .slice(0, 10),
    scope: ["all", "current", "past"].includes(scope)
      ? (scope as CompanyScope)
      : "all",
    year: (params.get("year") || "").slice(0, 60),
    query: (params.get("q") || "").trim().slice(0, 200),
    optedOnly: params.get("opted") === "1",
  };
}
export function uniqueNetworkProfiles(
  viewer: Alumni,
  profiles: Alumni[],
): Alumni[] {
  const ownUrl = normalizeLinkedInUrl(viewer.linkedin_url || "");
  const groups = new Map<string, Alumni>();
  const quality = (profile: Alumni) =>
    (profile.opt_status === "opted_in" ? 100 : 0) +
    (profile.auth_id ? 20 : 0) +
    Math.min((profile.bio || profile.linkedin_background || "").length, 500) /
      500;
  for (const profile of profiles) {
    const url = normalizeLinkedInUrl(profile.linkedin_url || "");
    if (profile.id === viewer.id || (ownUrl && url === ownUrl)) continue;
    const key = url || profile.id;
    const prior = groups.get(key);
    if (!prior || quality(profile) > quality(prior)) groups.set(key, profile);
  }
  return [...groups.values()];
}
export function networkRanking(
  viewer: Alumni,
  profiles: Alumni[],
  filters: NetworkFilters,
): NetworkProfile[] {
  const pool = uniqueNetworkProfiles(viewer, profiles);
  const ranked = rankAllProfiles(viewer, pool, filters.query);
  const viewerYear = Number(viewer.graduation_year);
  const viewerStudent = /school/i.test(viewer.graduation_year || "");
  const scored = ranked
    .map((profile) => {
      const signals = companySignals(profile, filters.scope);
      const categoryHits = signals.filter((signal) =>
        filters.categories.includes(signal.category),
      );
      const current = profile.current_company ? [profile.current_company] : [];
      const scoped =
        filters.scope === "current"
          ? current
          : filters.scope === "past"
            ? profile.past_companies || []
            : [...current, ...(profile.past_companies || [])];
      const companyHit =
        filters.companies.length === 0 ||
        filters.companies.some((company) =>
          scoped.some((name) => normalized(name) === normalized(company)),
        );
      if (
        (filters.categories.length && !categoryHits.length) ||
        !companyHit ||
        (filters.year && profile.graduation_year !== filters.year) ||
        (filters.optedOnly && profile.opt_status !== "opted_in")
      )
        return null;
      const year = Number(profile.graduation_year);
      const cohort =
        viewerStudent && /school/i.test(profile.graduation_year || "")
          ? 1
          : viewerYear >= 1950 && year >= 1950
            ? Math.max(0, 1 - Math.abs(viewerYear - year) / 5)
            : 0;
      const experience =
        /\b(senior|sr|staff|principal|lead|leader|manager|director|founder|chief)\b/i.test(
          profile.current_role || "",
        )
          ? 1
          : profile.current_role?.trim()
            ? 0.35
            : 0;
      const ready = profile.opt_status === "opted_in" ? 1 : 0;
      const overlap = profile.match_score;
      const score =
        filters.goal === "advice"
          ? overlap * 0.65 + experience * 0.2 + ready * 0.15
          : filters.goal === "peers"
            ? overlap * 0.7 + cohort * 0.2 + ready * 0.1
            : overlap;
      const reasons: string[] = [];
      if (profile.shared_terms.length)
        reasons.push(`Shared: ${profile.shared_terms.slice(0, 3).join(", ")}`);
      const signal = categoryHits[0] || signals[0];
      if (signal)
        reasons.push(
          `${signal.tenure === "current" ? "Current" : "Past"} employer: ${signal.company} · ${signal.label} ${signal.method === "near name" ? "near-name proxy" : "proxy"}`,
        );
      if (filters.goal === "advice" && experience === 1)
        reasons.push(`Role title includes seniority: ${profile.current_role}`);
      if (filters.goal === "peers" && cohort >= 0.6)
        reasons.push("Similar graduation cohort");
      if (ready) reasons.push("Opted in to the TSE network");
      const evidence =
        profileTokens(
          [
            profile.bio,
            ...(profile.keywords || []),
            profile.linkedin_about,
            profile.linkedin_background,
          ]
            .filter(Boolean)
            .join(" "),
        ).length >= 8
          ? "profile text"
          : "limited text";
      if (!profile.shared_terms.length)
        reasons.unshift(
          evidence === "limited text"
            ? "Limited profile text; use as a discovery lead"
            : "No strong shared-text signal; explore their background",
        );
      return {
        ...profile,
        match_score: score,
        company_signals: signals,
        reasons,
        evidence,
        signal_level:
          overlap >= 0.18
            ? "stronger overlap"
            : overlap > 0
              ? "some overlap"
              : "exploratory",
        rank: 0,
      } as NetworkProfile;
    })
    .filter((profile): profile is NetworkProfile => !!profile)
    .sort(
      (a, b) =>
        b.match_score - a.match_score || a.full_name.localeCompare(b.full_name),
    );
  return scored.map((profile, index) => ({ ...profile, rank: index + 1 }));
}

export function chooseDiscovery<T extends { id: string }>(
  profiles: T[],
  count: number,
  previous: string[],
  mode: "smart" | "wildcard",
  random = Math.random,
): T[] {
  const excluded = new Set(previous);
  let pool = profiles.filter((profile) => !excluded.has(profile.id));
  if (!pool.length) pool = [...profiles];
  if (mode === "smart") pool = pool.slice(0, Math.max(count, 20));
  else if (pool.length > 20) pool = pool.slice(Math.floor(pool.length / 3));
  const result: T[] = [];
  while (pool.length && result.length < count) {
    const value = Math.max(0, Math.min(0.999999, random()));
    const index = Math.floor(value * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

export function outreachDraft(
  viewerName: string,
  person: Pick<
    NetworkProfile,
    "full_name" | "current_company" | "current_role" | "shared_terms"
  >,
  goal: NetworkGoal,
): string {
  const first = person.full_name.split(/\s+/)[0] || "there";
  const me = viewerName || "a fellow TSE member";
  const topic = person.shared_terms[0];
  const context = person.current_company
    ? `Your experience at ${person.current_company} caught my eye.`
    : person.current_role
      ? `I came across your ${person.current_role} background.`
      : "I came across your profile in TSE Connect.";
  const question =
    goal === "advice"
      ? `What is one skill or project you would prioritize for someone exploring ${topic || "your field"}?`
      : goal === "peers"
        ? `Would you be interested in comparing notes on ${topic || "what we’re working on"}?`
        : `I’m interested in ${topic || "learning about your work"}. What is one problem in that area you have enjoyed working on?`;
  return `Hi ${first} — I’m ${me} from TSE. ${context}\n\n${question}\n\nWould you be open to a brief chat, or a quick reply here? Happy to work around your schedule. Thanks!`;
}
