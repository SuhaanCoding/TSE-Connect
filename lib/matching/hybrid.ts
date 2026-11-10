import { profileTokens } from "../profile-matching";
import type { MatchDocument } from "./documents";
export interface VectorDocument extends MatchDocument {
  vector: number[];
}
export interface MatchIdentity {
  id: string;
  full_name: string;
  current_company: string | null;
  past_companies: string[];
}
export interface MatchEvidence {
  documentId: string;
  label: string;
  source: string;
  text: string;
  querySource: string;
}
export interface HybridHit {
  id: string;
  score: number;
  semanticScore: number;
  lexicalScore: number;
  evidence: MatchEvidence | null;
}
export type RankingMethod = "bm25" | "semantic" | "hybrid";
export interface HybridOptions {
  method: RankingMethod;
  semanticWeight: number;
  fusion: "rrf" | "linear";
  goalWeight: number;
}
export const DEFAULT_HYBRID: HybridOptions = {
  method: "hybrid",
  semanticWeight: 0.8,
  fusion: "linear",
  goalWeight: 0.7,
};
const terms = (text: string) =>
  profileTokens(text)
    .map((word) => word.replace(/s$/, ""))
    .filter((word) => word.length > 1);
const nameKey = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim();
function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb))) : 0;
}
export interface PreparedLexical {
  counts: Map<string, number>[];
  lengths: number[];
  idf: Map<string, number>;
  average: number;
}
export function prepareLexical(
  documents: Pick<MatchDocument, "text">[],
): PreparedLexical {
  const counts = documents.map((doc) => {
    const map = new Map<string, number>();
    for (const word of terms(doc.text)) map.set(word, (map.get(word) || 0) + 1);
    return map;
  });
  const lengths = counts.map((map) =>
    [...map.values()].reduce((a, b) => a + b, 0),
  );
  const frequencies = new Map<string, number>();
  for (const map of counts)
    for (const term of map.keys())
      frequencies.set(term, (frequencies.get(term) || 0) + 1);
  return {
    counts,
    lengths,
    average: lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1) || 1,
    idf: new Map(
      [...frequencies].map(([term, count]) => [
        term,
        Math.log(1 + (counts.length - count + 0.5) / (count + 0.5)),
      ]),
    ),
  };
}
export function rankHybrid(
  profiles: MatchIdentity[],
  documents: VectorDocument[],
  query: VectorDocument[],
  options: Partial<HybridOptions> = {},
  prepared = prepareLexical(documents),
  lookup = "",
): HybridHit[] {
  const settings = { ...DEFAULT_HYBRID, ...options };
  const queryTerms = query.map((doc) => [...new Set(terms(doc.text))]);
  const byPerson = new Map<
    string,
    {
      semantic: number[];
      lexical: number[];
      best: number;
      doc: number;
      query: number;
    }
  >();
  for (const profile of profiles)
    byPerson.set(profile.id, {
      semantic: query.map(() => 0),
      lexical: query.map(() => 0),
      best: 0,
      doc: -1,
      query: -1,
    });
  for (let d = 0; d < documents.length; d++) {
    const doc = documents[d],
      person = byPerson.get(doc.profileId);
    if (!person) continue;
    for (let q = 0; q < query.length; q++) {
      let lexical = 0;
      for (const word of queryTerms[q]) {
        const count = prepared.counts[d].get(word) || 0;
        if (count)
          lexical +=
            ((prepared.idf.get(word) || 0) * count * 2.2) /
            (count +
              1.2 * (0.25 + (0.75 * prepared.lengths[d]) / prepared.average));
      }
      const similarity = Math.max(0, cosine(query[q].vector, doc.vector));
      person.semantic[q] = Math.max(person.semantic[q], similarity);
      person.lexical[q] = Math.max(person.lexical[q], lexical);
      const evidenceScore =
        (settings.method === "bm25"
          ? lexical / (1 + lexical)
          : similarity || (0.2 * lexical) / (1 + lexical)) *
        (query[q].source === "goal" ? 1.2 : 1);
      if (evidenceScore > person.best) {
        person.best = evidenceScore;
        person.doc = d;
        person.query = q;
      }
    }
  }
  const aggregate = (scores: number[]) => {
    const goal = scores.filter((_, i) => query[i].source === "goal"),
      context = scores.filter((_, i) => query[i].source !== "goal");
    const mean = (values: number[]) =>
      values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return goal.length && context.length
      ? settings.goalWeight * mean(goal) +
          (1 - settings.goalWeight) * mean(context)
      : mean(scores);
  };
  const hits = profiles.map((profile) => {
    const person = byPerson.get(profile.id)!;
    const doc = documents[person.doc];
    return {
      id: profile.id,
      score: 0,
      semanticScore: aggregate(person.semantic),
      lexicalScore: aggregate(person.lexical),
      evidence: doc
        ? {
            documentId: doc.id,
            label: doc.label,
            source: doc.source,
            text: doc.text,
            querySource: query[person.query]?.label || "Your interests",
          }
        : null,
    };
  });
  const order = (field: "semanticScore" | "lexicalScore") =>
    new Map(
      [...hits]
        .sort((a, b) => b[field] - a[field] || a.id.localeCompare(b.id))
        .filter((hit) => hit[field] > 0)
        .map((hit, index) => [hit.id, index + 1]),
    );
  const semanticRank = order("semanticScore"),
    lexicalRank = order("lexicalScore");
  const maxLexical = Math.max(1, ...hits.map((hit) => hit.lexicalScore));
  const needle = nameKey(lookup);
  const boost = (id: string) => {
    if (!needle) return 0;
    const profile = profiles.find((profile) => profile.id === id)!;
    return nameKey(profile.full_name) === needle
      ? 3
      : nameKey(profile.current_company || "") === needle
        ? 2
        : profile.past_companies.some((company) => nameKey(company) === needle)
          ? 1
          : 0;
  };
  for (const hit of hits) {
    const sr = semanticRank.get(hit.id),
      lr = lexicalRank.get(hit.id);
    hit.score =
      settings.method === "bm25"
        ? hit.lexicalScore / maxLexical
        : settings.method === "semantic"
          ? hit.semanticScore
          : settings.fusion === "linear"
            ? settings.semanticWeight * hit.semanticScore +
              ((1 - settings.semanticWeight) * hit.lexicalScore) / maxLexical
            : 61 *
              (settings.semanticWeight * (sr ? 1 / (60 + sr) : 0) +
                (1 - settings.semanticWeight) * (lr ? 1 / (60 + lr) : 0));
    hit.score += boost(hit.id);
  }
  const names = new Map(
    profiles.map((profile) => [profile.id, profile.full_name]),
  );
  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      (names.get(a.id) || "").localeCompare(names.get(b.id) || ""),
  );
}
