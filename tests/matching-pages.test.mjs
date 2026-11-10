import test from "node:test";
import assert from "node:assert/strict";
import { indexPage, INDEX_PAGE_SIZE } from "../lib/matching/page.server.ts";
const documents = Array.from({ length: 401 }, (_, i) => ({
  id: String(i).padStart(4, "0"),
  profileId: "p",
  source: "bio",
  label: "Bio",
  text: "Professional evidence " + i,
  vector: "packed",
}));
test("index pages are small and stable despite asynchronous cache read ordering", () => {
  const first = indexPage([...documents].reverse(), 0, null);
  assert.equal(first.documents.length, INDEX_PAGE_SIZE);
  const second = indexPage(documents, first.nextOffset, first.revision);
  const third = indexPage(documents, second.nextOffset, first.revision);
  assert.equal(third.nextOffset, null);
  const combined = [
    ...first.documents,
    ...second.documents,
    ...third.documents,
  ];
  assert.deepEqual(combined, documents);
  assert.equal(new Set(combined.map((d) => d.id)).size, 401);
});
test("edits or removal between index pages cannot produce a mixed snapshot", () => {
  const first = indexPage(documents, 0, null);
  assert.equal(
    indexPage(documents.slice(1), first.nextOffset, first.revision).status,
    409,
  );
  assert.equal(
    indexPage(
      documents.map((doc, i) => (i ? doc : { ...doc, text: "Changed bio" })),
      first.nextOffset,
      first.revision,
    ).status,
    409,
  );
});
test("malformed cursors are rejected and empty rosters are valid", () => {
  for (const value of [-1, NaN, Infinity, 1.5, 999])
    assert.equal(indexPage(documents, value, null).status, 400);
  const empty = indexPage([], 0, null);
  assert.deepEqual(empty.documents, []);
  assert.equal(empty.nextOffset, null);
});
