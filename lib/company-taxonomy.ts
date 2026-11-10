import categoryData from "../data/company-categories.json" with { type: "json" };
import type { Alumni } from "./types";

export interface CompanyCategoryDefinition {
  id: string;
  label: string;
  aliases: string[];
  namePatterns?: string[];
  sources?: string[];
}
/** Editable taxonomy data, separate from ranking and matching behavior. */
export const COMPANY_CATEGORIES: CompanyCategoryDefinition[] = categoryData;
export type CompanyScope = "all" | "current" | "past";
export interface CompanyLabel {
  category: string;
  label: string;
  method: "reviewed name" | "name pattern" | "near name";
  matchedName: string;
}
export interface CompanySignal extends CompanyLabel {
  company: string;
  tenure: "current" | "past";
}
export function normalizeCompany(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(
      /\s+(?:(?:incorporated|inc|llc|limited|ltd|corporation|corp|plc|pvt|co)\s*)+$/,
      " ",
    )
    .trim();
}
const ambiguous = new Set([
  "square",
  "block",
  "ramp",
  "wise",
  "arm",
  "epic",
  "sig",
  "hrt",
  "x",
  "hp",
  "sap",
  "qualcomm",
  "runway",
  "neon",
]);
const nonEmployer =
  /\b(?:certification|certificate|career break|virtual experience|coursework)\b/;
const placeholders = new Set([
  "none",
  "n a",
  "na",
  "self employed",
  "freelance",
  "freelance self employed",
  "individual employer",
  "stealth startup",
  "various startups",
]);
const compiled = COMPANY_CATEGORIES.map((category) => ({
  ...category,
  keys: category.aliases.map((name) => ({ name, key: normalizeCompany(name) })),
  patterns: (category.namePatterns || []).map(
    (pattern) => new RegExp(pattern, "u"),
  ),
}));
const cache = new Map<string, CompanyLabel[]>();
/** Bounded edit distance, including adjacent transpositions. Never rewrites source data. */
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  return rows[a.length][b.length];
}
export function companyLabels(name: string): CompanyLabel[] {
  const key = normalizeCompany(name);
  const saved = cache.get(key);
  if (saved) return saved;
  if (!key || placeholders.has(key) || nonEmployer.test(key)) return [];
  const labels: CompanyLabel[] = [];
  for (const category of compiled) {
    const alias = category.keys
      .filter(
        (alias) =>
          key === alias.key ||
          (!ambiguous.has(alias.key) && key.startsWith(alias.key + " ")),
      )
      .sort((a, b) => b.key.length - a.key.length)[0];
    const pattern = category.patterns.find((pattern) => pattern.test(key));
    if (alias || pattern)
      labels.push({
        category: category.id,
        label: category.label,
        method: alias ? "reviewed name" : "name pattern",
        matchedName: alias?.name || pattern!.source,
      });
  }
  // Fuzzy tags are conservative: no short brands, no unrelated trailing words,
  // no ambiguous equal-distance identities, and only when no reviewed name matched.
  if (
    !labels.some((label) => label.method === "reviewed name") &&
    key.length <= 80
  ) {
    const possible = compiled.flatMap((category) =>
      category.keys
        .filter(
          (alias) =>
            !ambiguous.has(alias.key) &&
            Math.min(key.length, alias.key.length) >= 6 &&
            Math.max(key.length, alias.key.length) >= 7 &&
            Math.abs(key.length - alias.key.length) <= 2 &&
            key.slice(0, 3) === alias.key.slice(0, 3) &&
            key.split(" ").length === alias.key.split(" ").length,
        )
        .flatMap((alias) => {
          const edits = distance(key, alias.key),
            max = Math.max(key.length, alias.key.length),
            allowed = max >= 12 ? 2 : 1;
          return edits <= allowed && edits / max <= 0.15
            ? [{ category, alias, edits }]
            : [];
        }),
    );
    possible.sort((a, b) => a.edits - b.edits);
    const closest = possible.filter(
      (item) => item.edits === possible[0]?.edits,
    );
    if (new Set(closest.map((item) => item.alias.key)).size === 1)
      for (const item of closest) {
        if (!labels.some((label) => label.category === item.category.id))
          labels.push({
            category: item.category.id,
            label: item.category.label,
            method: "near name",
            matchedName: item.alias.name,
          });
      }
  }
  if (cache.size >= 5000) cache.clear();
  cache.set(key, labels);
  return labels;
}
export function companySignals(
  profile: Pick<Alumni, "current_company" | "past_companies">,
  scope: CompanyScope = "all",
): CompanySignal[] {
  const entries = [
    ...(scope !== "past" && profile.current_company
      ? [{ company: profile.current_company, tenure: "current" as const }]
      : []),
    ...(scope !== "current"
      ? (profile.past_companies || []).map((company) => ({
          company,
          tenure: "past" as const,
        }))
      : []),
  ];
  return entries.flatMap((entry) =>
    companyLabels(entry.company).map((label) => ({ ...label, ...entry })),
  );
}
