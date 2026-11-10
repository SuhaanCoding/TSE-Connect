import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  profileDocuments,
  queryDocuments,
} from "../../lib/matching/documents.ts";
import { rankHybrid } from "../../lib/matching/hybrid.ts";
import { ENCODER } from "../../lib/matching/config.ts";
import { uniqueNetworkProfiles } from "../../lib/network.ts";
import { rankAllProfiles } from "./baseline-v1.ts";
import { encodeDocuments } from "./encoder.mjs";
import { evaluate, summarize } from "./metrics.mjs";
const root = ".local-backups/matching/";
const read = async (name) => JSON.parse(await fs.readFile(root + name, "utf8"));
const corpus = await read("corpus.json"),
  judgments = await read("judgments.json");
const viewer = {
  id: "benchmark-viewer",
  full_name: "Benchmark",
  bio: "",
  keywords: [],
  past_companies: [],
  linkedin_url: null,
  opt_status: "opted_in",
};
const profiles = uniqueNetworkProfiles(viewer, corpus);
const source = profiles.flatMap(profileDocuments);
const hash = createHash("sha256")
  .update(JSON.stringify({ model: ENCODER.version, source }))
  .digest("hex");
let documents;
try {
  const cached = await read("vectors.json");
  if (cached.hash === hash) documents = cached.documents;
} catch {}
const encodingStart = performance.now();
if (!documents) {
  documents = await encodeDocuments(source);
  await fs.writeFile(
    root + "vectors.json",
    JSON.stringify({ model: ENCODER.version, hash, documents }),
  );
}
console.log({
  profiles: profiles.length,
  documents: documents.length,
  encodeMs: performance.now() - encodingStart,
});
const methods = [
  { id: "current", method: "current" },
  { id: "bm25", method: "bm25" },
  { id: "semantic-passages", method: "semantic" },
  ...[0.35, 0.5, 0.65, 0.8].flatMap((semanticWeight) =>
    ["rrf", "linear"].map((fusion) => ({
      id: `${fusion}-${semanticWeight}`,
      method: "hybrid",
      fusion,
      semanticWeight,
    })),
  ),
];
const evaluations = [];
for (const c of judgments.cases) {
  const query = await encodeDocuments(queryDocuments(c.resume || "", c.query));
  const grades = { ...c.grades };
  // Canonicalize documented duplicate roster IDs for fair comparison of people, not rows.
  for (const [id, grade] of Object.entries(c.grades)) {
    const original = corpus.find((p) => p.id === id);
    const canonical =
      profiles.find((p) => p.id === id) ||
      profiles.find(
        (p) => p.linkedin_url && p.linkedin_url === original?.linkedin_url,
      );
    if (canonical)
      grades[canonical.id] = Math.max(grades[canonical.id] || 0, grade);
  }
  for (const options of methods) {
    const start = performance.now();
    const hits =
      options.method === "current"
        ? rankAllProfiles(
            viewer,
            profiles,
            [c.query, c.resume || ""].join("\n"),
          ).map((p) => ({ id: p.id, score: p.match_score, evidence: null }))
        : rankHybrid(
            profiles,
            documents,
            query,
            options,
            undefined,
            c.kind === "lookup" ? c.query : "",
          );
    evaluations.push({
      caseId: c.id,
      split: c.split,
      kind: c.kind,
      method: options.id,
      ...evaluate(
        hits.map((hit) => hit.id),
        grades,
      ),
      rankMs: performance.now() - start,
      top: hits.slice(0, 10).map((hit) => ({
        id: hit.id,
        name: profiles.find((p) => p.id === hit.id)?.full_name,
        score: hit.score,
        grade: grades[hit.id] ?? null,
        evidence: hit.evidence,
      })),
    });
  }
}
const aggregate = (split) =>
  methods.map((options) => ({
    method: options.id,
    ...summarize(
      evaluations.filter(
        (row) => row.method === options.id && row.split === split,
      ),
    ),
    meanRankMs:
      evaluations
        .filter((row) => row.method === options.id && row.split === split)
        .reduce((a, b) => a + b.rankMs, 0) /
      judgments.cases.filter((c) => c.split === split).length,
  }));
const development = aggregate("development").sort((a, b) => b.ndcg - a.ndcg);
const selected = development.find((row) => row.method !== "current");
const report = {
  model: ENCODER.version,
  corpusSha: hash,
  judgmentsSha: createHash("sha256")
    .update(JSON.stringify(judgments))
    .digest("hex"),
  profiles: profiles.length,
  documents: documents.length,
  cases: judgments.cases.length,
  labels: judgments.cases.reduce(
    (sum, c) => sum + Object.keys(c.grades).length,
    0,
  ),
  selectedByDevelopmentOnly: selected?.method,
  development,
  holdout: aggregate("holdout"),
  evaluations,
  limitation:
    "Evidence-grounded agent judgments, not independent human validation. Unjudged results can be relevant. Metrics evaluate documented target retrieval, not real-world networking outcomes.",
};
await fs.writeFile(
  root + "benchmark-report.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      selected: report.selectedByDevelopmentOnly,
      development,
      holdout: report.holdout,
    },
    null,
    2,
  ),
);
