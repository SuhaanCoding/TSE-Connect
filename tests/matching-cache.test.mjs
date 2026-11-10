import test from "node:test";
import assert from "node:assert/strict";
import {
  indexForVisibleProfiles,
  profileSourceHash,
  refreshMatchingProfiles,
} from "../lib/matching/cache.server.ts";
import { profileDocuments } from "../lib/matching/documents.ts";
import { packVector } from "../lib/matching/vectors.ts";
import { ENCODER } from "../lib/matching/config.ts";
const person = (id, bio) => ({
  id,
  bio,
  keywords: [],
  current_company: null,
  current_role: null,
  past_companies: [],
  linkedin_about: null,
  linkedin_background: null,
});
test("private derived cache exposes only current visible identities and current source text", async () => {
  const visible = person("visible", "Build reliable distributed systems"),
    hidden = person("hidden", "Private unrelated profile");
  const record = (p) => ({
    modelVersion: ENCODER.version,
    profileId: p.id,
    sourceHash: profileSourceHash(p),
    documents: profileDocuments(p).map((d) => ({
      ...d,
      vector: packVector(Array(384).fill(0.01)),
    })),
  });
  const records = [record(visible), record(hidden)];
  const downloads = [];
  const db = {
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          downloads.push([bucket, path]);
          return path.endsWith("index.json")
            ? {
                data: new Blob([
                  JSON.stringify({
                    modelVersion: ENCODER.version,
                    records,
                    generatedAt: "2026-11-10",
                  }),
                ]),
              }
            : { data: null, error: { message: "not found" } };
        },
      }),
    },
  };
  const result = await indexForVisibleProfiles([visible], db);
  assert.equal(result.ready, 1);
  assert.ok(result.documents.every((d) => d.profileId === "visible"));
  assert.equal(result.documents.length, 1);
  const changed = { ...visible, bio: "Now researching accessible interfaces" };
  const stale = await indexForVisibleProfiles([changed], db);
  assert.equal(stale.ready, 0);
  assert.equal(stale.documents[0].vector, "");
  assert.match(stale.documents[0].text, /accessible/);
  assert.doesNotMatch(
    JSON.stringify(stale),
    /Private unrelated|reliable distributed/,
  );
  const removed = await indexForVisibleProfiles([], db);
  assert.deepEqual(removed.documents, []);
  assert.ok(downloads.every(([bucket]) => bucket === "matching-vectors"));
});
test("cache fingerprints ignore contact and account fields; public storage is refused", async () => {
  const p = person("p", "Robotics and controls");
  assert.equal(
    profileSourceHash(p),
    profileSourceHash({
      ...p,
      email: "secret@example.com",
      auth_id: "auth-private",
      login_email: "other@example.com",
    }),
  );
  assert.notEqual(
    profileSourceHash(p),
    profileSourceHash({ ...p, bio: "Healthcare and design" }),
  );
  await assert.rejects(
    refreshMatchingProfiles(undefined, {
      storage: { getBucket: async () => ({ data: { public: true } }) },
    }),
    /must be private/,
  );
});
