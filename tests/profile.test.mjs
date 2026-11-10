import test from "node:test";
import assert from "node:assert/strict";
import {
  keywordsFromText,
  validateKeywords,
  memberProfileUpdate,
} from "../lib/profile.ts";

test("keywords normalize whitespace, empty entries and case-insensitive duplicates", () => {
  assert.deepEqual(
    keywordsFromText(" Climate tech, ,Mentorship,climate TECH, "),
    ["Climate tech", "Mentorship"],
  );
  assert.deepEqual(keywordsFromText(""), []);
});

test("keyword validation rejects malformed and oversized values", () => {
  for (const value of [
    "AI",
    [1],
    [null],
    [""],
    ["AI,ML"],
    ["x".repeat(41)],
    Array(11).fill("AI"),
  ]) {
    assert.equal(typeof validateKeywords(value), "string");
  }
  assert.equal(
    validateKeywords(Array.from({ length: 10 }, (_, i) => `${i}`.repeat(40))),
    null,
  );
  assert.equal(validateKeywords([]), null);
});

test("member edits cannot overwrite scraped company history or account ownership", () => {
  const result = memberProfileUpdate({
    full_name: "  Jane Doe  ",
    keywords: [" ML ", "ml", "Mentorship"],
    current_company: "Fake company",
    past_companies: [],
    auth_id: "another-user",
    login_email: "other@example.com",
  });
  assert.deepEqual(result.data, {
    full_name: "Jane Doe",
    keywords: ["ML", "Mentorship"],
  });
  assert.equal(result.error, undefined);
});

test("onboarding and older clients preserve omitted keywords and company history", () => {
  const result = memberProfileUpdate({
    full_name: "Jane Doe",
    current_company: "Old scrape",
    past_companies: ["Old scrape"],
    opt_status: "opted_in",
  });
  assert.deepEqual(result.data, {
    full_name: "Jane Doe",
    opt_status: "opted_in",
  });
  assert.deepEqual(
    memberProfileUpdate({ full_name: "Jane", keywords: [] }).data.keywords,
    [],
  );
});

test("malformed profile fields are rejected before database writes", () => {
  for (const body of [
    {},
    { full_name: " " },
    { full_name: 2 },
    { full_name: "Jane", current_role: {} },
    { full_name: "Jane", opt_status: "public" },
    { full_name: "Jane", keywords: ["x".repeat(41)] },
  ]) {
    assert.equal(typeof memberProfileUpdate(body).error, "string");
  }
});

test("bios are plain text, optional, bounded and preserved when omitted", () => {
  assert.equal(
    memberProfileUpdate({
      full_name: "Jane",
      bio: "  I build climate tools.  ",
    }).data.bio,
    "I build climate tools.",
  );
  assert.equal(
    memberProfileUpdate({ full_name: "Jane", bio: "" }).data.bio,
    null,
  );
  assert.equal("bio" in memberProfileUpdate({ full_name: "Jane" }).data, false);
  assert.equal(
    typeof memberProfileUpdate({ full_name: "Jane", bio: "x".repeat(1001) })
      .error,
    "string",
  );
  assert.equal(
    typeof memberProfileUpdate({ full_name: "Jane", bio: { html: "bad" } })
      .error,
    "string",
  );
  assert.equal(
    memberProfileUpdate({ full_name: "Jane", bio: "<script>alert(1)</script>" })
      .data.bio,
    "<script>alert(1)</script>",
  );
});
