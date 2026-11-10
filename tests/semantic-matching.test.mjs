import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanMatchText,
  profileDocuments,
  queryDocuments,
  fitTokenBudget,
} from "../lib/matching/documents.ts";
import { rankHybrid } from "../lib/matching/hybrid.ts";
import { packVector, unpackVector } from "../lib/matching/vectors.ts";
import { localMatchResult } from "../lib/matching/result.ts";
import { parseNetworkFilters } from "../lib/network.ts";
import { validateResumeFile, readResume } from "../lib/matching/resume.ts";
import { ENCODER } from "../lib/matching/config.ts";
import { evaluate } from "../scripts/matching/metrics.mjs";
const person = (id, extra = {}) => ({
  id,
  full_name: id,
  current_company: null,
  past_companies: [],
  current_role: null,
  bio: null,
  keywords: [],
  linkedin_about: null,
  linkedin_background: null,
  graduation_year: "2025",
  opt_status: "opted_in",
  ...extra,
});
const passage = (profileId, text, vector, source = "experience") => ({
  id: profileId + text,
  profileId,
  text,
  vector,
  source,
  label: "Documented project",
});
test("cleaning removes contacts without dropping technical experience", () => {
  const text = cleanMatchText(
    "Email: private@example.com\nPhone: +1 (858) 555-0101\nhttps://example.com\nBuilt C++ and C# services with HTTP/2 and 99.99% uptime.",
  );
  assert.doesNotMatch(text, /private|858|example.com/);
  assert.match(text, /C\+\+ and C#.*99.99%/);
});
test("passages retain work provenance and projects near the end of long histories", () => {
  const background =
    "LinkedIn projects\n\n" +
    Array.from(
      { length: 40 },
      (_, i) =>
        `Project ${i}\n\nBuilt project ${i} using robotics and controls.`,
    ).join("\n\n");
  const docs = profileDocuments(
    person("p", {
      bio: "Deliberate personal interests",
      linkedin_background: background,
    }),
  );
  assert.ok(docs.length <= 28);
  assert.equal(docs[0].source, "bio");
  assert.ok(docs.some((d) => d.text.includes("project 38")));
  assert.ok(docs.every((d) => d.profileId === "p"));
});
test("token budget splits rather than silently truncating technical tokens", () => {
  const raw = [passage("p", "abcdefghijklmnopqrstuvwx", [])];
  const fitted = fitTokenBudget(raw, (text) => text.length, 6);
  assert.ok(fitted.every((d) => d.text.length <= 6));
  assert.equal(fitted.map((d) => d.text).join(""), raw[0].text);
  const query = queryDocuments(
    Array.from({ length: 5000 }, (_, i) => `term${i}`).join(" "),
    "Find robotics collaborators",
  );
  assert.equal(query[0].source, "goal");
  assert.ok(query.some((d) => d.text.includes("term4999")));
  assert.equal(query.length, 33);
});
test("meaning can retrieve paraphrases; exact names still take priority", () => {
  const profiles = [person("related"), person("literal"), person("empty")];
  const documents = [
    passage("related", "Detect objects from camera images", [1, 0]),
    passage("literal", "Computer vision office event", [0, 1]),
  ];
  const query = [passage("query", "Computer vision", [1, 0], "goal")];
  const hits = rankHybrid(profiles, documents, query);
  assert.equal(hits[0].id, "related");
  assert.equal(hits.length, 3);
  assert.equal(hits[0].evidence.text, documents[0].text);
  assert.equal(hits.find((h) => h.id === "empty").evidence, null);
  assert.equal(
    rankHybrid(profiles, documents, query, {}, undefined, "literal")[0].id,
    "literal",
  );
});
test("explicit goals outweigh resume context and repeated projects do not inflate a person", () => {
  const profiles = [person("goal"), person("context")],
    documents = [
      passage("goal", "Robotics", [1, 0]),
      passage("context", "Databases", [0, 1]),
    ];
  const query = [
    passage("query", "Robotics", [1, 0], "goal"),
    passage("query", "Databases", [0, 1], "resume"),
  ];
  const hits = rankHybrid(profiles, documents, query, { method: "semantic" });
  assert.equal(hits[0].id, "goal");
  const repeated = rankHybrid(
    profiles,
    [...documents, ...Array(20).fill(documents[1])],
    query,
    { method: "semantic" },
  );
  assert.equal(repeated[0].id, "goal");
  assert.equal(hits[0].score, repeated[0].score);
});
test("private word fallback ranks missing-vector profiles and handles empty context", () => {
  const profiles = [person("a"), person("b")],
    docs = [passage("b", "Distributed databases and storage", [])];
  assert.equal(
    rankHybrid(profiles, docs, [passage("q", "Distributed database", [])], {
      method: "bm25",
    })[0].id,
    "b",
  );
  const empty = rankHybrid(profiles, docs, [], { method: "bm25" });
  assert.equal(empty.length, 2);
  assert.ok(empty.every((h) => h.score === 0));
});
test("packed vectors reject malformed data and preserve normalized values", () => {
  const values = Array.from(
      { length: ENCODER.dimensions },
      (_, i) => Math.sin(i) / 20,
    ),
    packed = packVector(values),
    decoded = unpackVector(packed);
  assert.equal(packed.length, 2048);
  assert.ok(decoded.every((v, i) => Math.abs(v - values[i]) < 1e-7));
  assert.deepEqual(unpackVector("invalid"), []);
  assert.throws(() => packVector([NaN]));
});
test("local results preserve company normalization, zero facets and scoped filters", () => {
  const data = [
    person("one", {
      current_company: "Stripe, Inc.",
      past_companies: ["Google"],
    }),
    person("two", { current_company: "Google", opt_status: "opted_out" }),
  ];
  const index = {
    data,
    poolCount: 2,
    viewer: { id: "me", graduation_year: "2025" },
    semanticReady: 1,
  };
  const hits = data.map((p) => ({
    id: p.id,
    score: 0,
    semanticScore: 0,
    lexicalScore: 0,
    evidence: null,
  }));
  const filters = parseNetworkFilters(
    new URLSearchParams("company=Stripe&scope=current"),
  );
  const result = localMatchResult(
    index,
    hits,
    filters,
    99,
    "ranked",
    [],
    "lexical",
  );
  assert.equal(result.data[0].id, "one");
  assert.equal(result.page, 1);
  assert.equal(result.facets.length, 19);
  assert.ok(result.facets.some((f) => f.count === 0));
  const opted = localMatchResult(
    index,
    hits,
    { ...filters, companies: [], optedOnly: true },
    1,
    "ranked",
    [],
    "lexical",
  );
  assert.equal(opted.total, 1);
  assert.ok(opted.data[0].reasons[0].includes("Limited text"));
});
test("resume limits reject invalid files and extract plain text locally", async () => {
  assert.match(
    validateResumeFile({ name: "resume.docx", size: 100 }),
    /PDF or .txt/,
  );
  assert.match(
    validateResumeFile({ name: "resume.pdf", size: 6 * 1024 * 1024 }),
    /5 MB/,
  );
  await assert.rejects(
    readResume(new File(["not a PDF"], "resume.pdf")),
    /isn’t a readable PDF/,
  );
  await assert.rejects(readResume(new File([""], "resume.txt")), /empty/);
  await assert.rejects(
    readResume(new File(["x".repeat(30001)], "resume.txt")),
    /30,000/,
  );
  const text = await readResume(
    new File(
      [
        "Built distributed data systems and reliable payment services. Contact: private@example.com",
      ],
      "resume.txt",
    ),
  );
  assert.match(text, /distributed/);
  assert.doesNotMatch(text, /private/);
});
test("benchmark grades reward ordering and distinguish adjacent from relevant", () => {
  const grades = { best: 3, good: 2, adjacent: 1, unsupported: 0 };
  const ideal = evaluate(["best", "good", "adjacent"], grades);
  assert.equal(ideal.ndcg, 1);
  assert.equal(ideal.recall, 1);
  assert.equal(ideal.mrr, 1);
  const poor = evaluate(["unsupported", "adjacent", "good", "best"], grades);
  assert.ok(poor.ndcg < ideal.ndcg);
  assert.equal(poor.mrr, 1 / 3);
});
