import test from "node:test";
import assert from "node:assert/strict";
import {
  matchingOriginAllowed,
  parseMatchInput,
  serverMatch,
} from "../lib/matching/server.ts";
const person = (id, extra = {}) => ({
  id,
  full_name: id,
  current_role: null,
  current_company: null,
  past_companies: [],
  bio: null,
  keywords: [],
  linkedin_about: null,
  linkedin_background: null,
  graduation_year: null,
  opt_status: "opted_in",
  login_email: "private-login@example.com",
  contact_email: "public-contact@example.com",
  auth_id: "private-account",
  last_scraped_at: "yesterday",
  linkedin_url: "https://linkedin.com/in/" + id,
  ...extra,
});
const viewer = person("viewer", {
  bio: "Backend systems and software engineering",
});
const pool = [
  person("backend", { bio: "Building distributed backend systems" }),
  person("design", {
    bio: "Healthcare product designer",
    opt_status: "opted_out",
  }),
];
const wordsOnly = parseMatchInput({
  text: "I build backend systems and enjoy distributed software",
  lexicalOnly: true,
});
const unavailable = async () => {
  throw new Error("unavailable");
};
test("server inputs bound private context and clean contact data", () => {
  for (const input of [
    null,
    [],
    { text: 3 },
    { text: "x".repeat(30001) },
    { goal: "x".repeat(601) },
    { lookup: "x".repeat(201) },
    { lexicalOnly: "true" },
  ])
    assert.throws(() => parseMatchInput(input));
  const input = parseMatchInput({
    text: "Backend engineer\nprivate-canary@example.com\nhttps://linkedin.com/in/private-canary",
    goal: "Distributed systems",
  });
  assert.equal(input.text.includes("private-canary"), false);
  assert.equal(input.goal, "Distributed systems");
});
test("server word matching needs no model or vector download and returns only professional evidence", async () => {
  const result = await serverMatch(viewer, pool, wordsOnly, {
    loadIndex: unavailable,
    encode: unavailable,
  });
  assert.equal(result.engine, "lexical");
  assert.equal(result.hits[0].id, "backend");
  assert.equal(result.hits.length, pool.length);
  const serialized = JSON.stringify(result);
  for (const privateValue of [
    "private-login@example.com",
    "private-account",
    wordsOnly.text,
  ])
    assert.equal(serialized.includes(privateValue), false);
  assert.equal(result.index.viewer.context, "");
  assert.equal(
    result.index.data.find((p) => p.id === "design").contact_email,
    null,
  );
  assert.equal(
    result.index.data.every(
      (p) => p.linkedin_about === null && p.linkedin_background === null,
    ),
    true,
  );
  assert.equal("documents" in result.index, false);
});
test("model/cache failures preserve all people and usable word matching", async () => {
  const result = await serverMatch(
    viewer,
    pool,
    { ...wordsOnly, lexicalOnly: false },
    { loadIndex: unavailable, encode: unavailable },
  );
  assert.equal(result.engine, "lexical");
  assert.equal(result.hits[0].id, "backend");
  assert.equal(result.hits.length, 2);
  assert.match(result.warning, /word matching/);
});
test("server inference uses current visible IDs and never returns query vectors or text", async () => {
  const { packVector } = await import("../lib/matching/vectors.ts");
  const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));
  const doc = {
    id: "backend:bio",
    profileId: "backend",
    source: "bio",
    label: "Member bio",
    text: "Distributed systems " + "evidence ".repeat(60),
    vector: packVector(vector),
  };
  const result = await serverMatch(
    viewer,
    pool,
    parseMatchInput({
      text: "RESUME_PRIVATE_CANARY software engineer systems",
      goal: "GOAL_PRIVATE_CANARY distributed systems",
    }),
    {
      loadIndex: async () => ({
        documents: [
          doc,
          {
            ...doc,
            id: "invisible:bio",
            profileId: "invisible",
            text: "INVISIBLE_PRIVATE_CANARY",
          },
        ],
        ready: 1,
        indexUpdatedAt: null,
      }),
      encode: async (docs) => docs.map((d) => ({ ...d, vector })),
    },
  );
  assert.equal(result.engine, "semantic");
  assert.equal(result.hits.length, 2);
  assert.equal(
    result.hits.some((h) => h.id === "invisible"),
    false,
  );
  assert.ok(result.hits[0].evidence.text.length <= 191);
  for (const value of [
    "RESUME_PRIVATE_CANARY",
    "GOAL_PRIVATE_CANARY",
    "INVISIBLE_PRIVATE_CANARY",
    '"vector":',
  ])
    assert.equal(JSON.stringify(result).includes(value), false);
});

test("matching rejects cross-origin requests but accepts the browser host behind Next normalization", () => {
  const request = (origin, extra = {}) =>
    new Request("http://localhost:3018/api/alumni/matches", {
      headers: { host: "127.0.0.1:3018", origin, ...extra },
    });
  assert.equal(matchingOriginAllowed(request("http://127.0.0.1:3018")), true);
  assert.equal(matchingOriginAllowed(request("https://evil.invalid")), false);
  assert.equal(matchingOriginAllowed(request("null")), false);
  assert.equal(
    matchingOriginAllowed(
      request("http://127.0.0.1:3018", { "sec-fetch-site": "cross-site" }),
    ),
    false,
  );
});
