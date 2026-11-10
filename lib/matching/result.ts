import { normalizeCompany } from "../company-taxonomy";
import {
  COMPANY_CATEGORIES,
  companySignals,
  chooseDiscovery,
  type NetworkFilters,
  type NetworkProfile,
} from "../network";
import type { HybridHit } from "./hybrid";
export interface MatchingViewer {
  id: string;
  name: string;
  optedIn: boolean;
  hasProfileText: boolean;
  graduation_year: string | null;
  context: string;
}
export interface IndexMetadata {
  data: NetworkProfile[];
  poolCount: number;
  viewer: MatchingViewer;
  modelVersion: string;
  semanticReady: number;
  indexUpdatedAt: string | null;
}
export function localMatchResult(
  index: IndexMetadata,
  hits: HybridHit[],
  filters: NetworkFilters,
  page: number,
  mode: "ranked" | "smart" | "wildcard",
  skips: string[],
  engine: "semantic" | "lexical",
) {
  const byId = new Map(index.data.map((profile) => [profile.id, profile]));
  const candidates = hits
    .flatMap((hit) => {
      const profile = byId.get(hit.id);
      if (!profile) return [];
      const signals = companySignals(profile, filters.scope),
        companies = [
          ...(filters.scope !== "past" && profile.current_company
            ? [profile.current_company]
            : []),
          ...(filters.scope !== "current" ? profile.past_companies || [] : []),
        ];
      if (
        (filters.categories.length &&
          !signals.some((signal) =>
            filters.categories.includes(signal.category),
          )) ||
        (filters.companies.length &&
          !filters.companies.some((company) =>
            companies.some(
              (name) => normalizeCompany(name) === normalizeCompany(company),
            ),
          )) ||
        (filters.year && profile.graduation_year !== filters.year) ||
        (filters.optedOnly && profile.opt_status !== "opted_in")
      )
        return [];
      const reasons: string[] = [];
      const e = hit.evidence;
      if (e)
        reasons.push(
          `${engine === "semantic" && hit.semanticScore > 0 ? "Related" : "Matching"} ${e.source === "role" ? "career information" : e.source === "bio" ? "member bio" : e.source === "keywords" ? "member interests" : e.source === "background" ? "LinkedIn work/project text" : `LinkedIn ${e.source}`} · ${e.label}`,
        );
      if (e)
        reasons.push(
          `“${e.text.slice(0, 190)}${e.text.length > 190 ? "…" : ""}”`,
        );
      if (!e)
        reasons.push(
          "Limited text; explore their background before reaching out.",
        );
      const signal =
        signals.find((signal) =>
          filters.categories.includes(signal.category),
        ) || signals[0];
      if (signal)
        reasons.push(
          `${signal.tenure === "current" ? "Current" : "Past"} organization: ${signal.company} · ${signal.label} proxy`,
        );
      else if (profile.opt_status === "opted_in")
        reasons.push("Opted in to the TSE network");
      let score = hit.score;
      if (filters.goal === "advice")
        score +=
          (profile.opt_status === "opted_in" ? 0.025 : 0) +
          (/\b(senior|sr|staff|principal|lead|manager|director|founder|chief)\b/i.test(
            profile.current_role || "",
          )
            ? 0.025
            : 0);
      if (filters.goal === "peers") {
        const a = Number(index.viewer.graduation_year),
          b = Number(profile.graduation_year);
        score +=
          (a >= 1950 && b >= 1950 ? 0.03 / (1 + Math.abs(a - b)) : 0) +
          (profile.opt_status === "opted_in" ? 0.02 : 0);
      }
      return [
        {
          ...profile,
          match_score: score,
          shared_terms: [],
          company_signals: signals,
          reasons,
          rank: 0,
          signal_level:
            hit.semanticScore >= 0.45
              ? "stronger overlap"
              : hit.semanticScore >= 0.25 || hit.lexicalScore > 0
                ? "some overlap"
                : "exploratory",
        } as NetworkProfile,
      ];
    })
    .sort(
      (a, b) =>
        b.match_score - a.match_score || a.full_name.localeCompare(b.full_name),
    )
    .map((profile, index) => ({ ...profile, rank: index + 1 }));
  const total = candidates.length,
    pages = Math.max(1, Math.ceil(total / 12)),
    current = Math.max(1, Math.min(pages, page));
  const selected =
    mode === "ranked"
      ? candidates.slice((current - 1) * 12, current * 12)
      : chooseDiscovery(candidates, 3, skips, mode);
  const names = [
    ...new Set(
      index.data.flatMap((profile) => [
        ...(filters.scope !== "past" && profile.current_company
          ? [profile.current_company]
          : []),
        ...(filters.scope !== "current" ? profile.past_companies || [] : []),
      ]),
    ),
  ];
  const signals = index.data.flatMap((profile) =>
    companySignals(profile, filters.scope),
  );
  return {
    data: selected,
    total,
    page: current,
    pages,
    poolCount: index.poolCount,
    viewer: index.viewer,
    facets: COMPANY_CATEGORIES.map((category) => ({
      id: category.id,
      count: index.data.filter((profile) =>
        companySignals(profile, filters.scope).some(
          (signal) => signal.category === category.id,
        ),
      ).length,
    })),
    companyCoverage: {
      tagged: new Set(signals.map((signal) => signal.company)).size,
      total: names.length,
    },
    engine,
    semanticReady: index.semanticReady,
    indexUpdatedAt: index.indexUpdatedAt,
  };
}
