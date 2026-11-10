import test from "node:test";
import assert from "node:assert/strict";
import {
  searchProfiles,
  matchingProfiles,
  profileTokens,
} from "../lib/profile-matching.ts";
import { publicDirectoryProfile } from "../lib/directory.ts";

const viewer = {
  id: "me",
  full_name: "Jordan Lee",
  bio: "Distributed systems and databases",
  keywords: ["Mentorship"],
  opt_status: "opted_in",
};
const related = {
  id: "related",
  full_name: "Sam Rivera",
  bio: "Distributed systems and databases",
  keywords: ["Mentorship"],
  opt_status: "opted_in",
};
const unrelated = {
  id: "other",
  full_name: "Taylor Kim",
  bio: "Illustration and fashion design",
  keywords: [],
  opt_status: "opted_in",
};

test("bio search ranks shared terms and preserves direct name/company lookup", () => {
  assert.equal(
    searchProfiles("distributed database systems", [unrelated, related])[0].id,
    "related",
  );
  assert.equal(
    searchProfiles("Taylor Kim", [related, unrelated])[0].id,
    "other",
  );
  assert.equal(
    searchProfiles("Microsoft", [
      { ...unrelated, current_company: "Microsoft" },
      related,
    ])[0].id,
    "other",
  );
  assert.equal(searchProfiles("doesnotexist", [related, unrelated]).length, 0);
});

test("personal recommendations are finite, exclude self and opted-out profiles", () => {
  const result = matchingProfiles(viewer, [
    viewer,
    related,
    unrelated,
    { ...related, id: "opted-out", opt_status: "opted_out" },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "related");
  assert.ok(Math.abs(result[0].match_score - 1) < 1e-10);
  assert.ok(result[0].shared_terms.includes("mentorship"));
  assert.deepEqual(
    matchingProfiles({ ...viewer, bio: "", keywords: [] }, [related]),
    [],
  );
  assert.deepEqual(
    matchingProfiles({ ...viewer, opt_status: "opted_out" }, [related]),
    [],
  );
});

test("keyword-only profiles match and common words do not create false matches", () => {
  assert.equal(
    matchingProfiles({ ...viewer, bio: "", keywords: ["Climate tech"] }, [
      { ...related, bio: "", keywords: ["Climate tech"] },
    ]).length,
    1,
  );
  assert.deepEqual(
    matchingProfiles(
      { ...viewer, bio: "I am interested in the", keywords: [] },
      [related],
    ),
    [],
  );
  assert.deepEqual(profileTokens("I build C++ and C# systems"), [
    "build",
    "c++",
    "c#",
    "systems",
  ]);
  const result = matchingProfiles(
    viewer,
    Array.from({ length: 8 }, (_, index) => ({
      ...related,
      id: String(index),
    })),
    3,
  );
  assert.equal(result.length, 3);
});

test("LinkedIn About, job and project descriptions participate in search and suggestions", () => {
  const profile = {
    ...related,
    bio: null,
    keywords: [],
    linkedin_about: "Climate technology",
    linkedin_background: "Built distributed systems for climate research.",
  };
  assert.equal(
    searchProfiles("climate", [profile, unrelated])[0].id,
    "related",
  );
  assert.equal(
    searchProfiles("distributed research", [profile, unrelated])[0].id,
    "related",
  );
  assert.equal(matchingProfiles(viewer, [profile])[0].id, "related");
});

test("directory and matches never expose login metadata or hidden contact details", () => {
  const profile = {
    ...related,
    login_email: "private@example.com",
    auth_id: "private-id",
    last_scraped_at: "private-time",
    contact_email: "contact@example.com",
    linkedin_url: "https://linkedin.com/in/example",
    preferred_contact: "both",
  };
  const hidden = publicDirectoryProfile(profile, false);
  for (const field of [
    "login_email",
    "auth_id",
    "last_scraped_at",
    "contact_email",
    "linkedin_url",
  ])
    assert.equal(hidden[field], null);
  assert.equal(
    publicDirectoryProfile({ ...profile, opt_status: "opted_out" }, true)
      .contact_email,
    null,
  );
  assert.equal(
    publicDirectoryProfile(profile, true).contact_email,
    "contact@example.com",
  );
});

test("recommendations connect acronyms and specific phrases instead of generic fragments", () => {
  const me = {
    ...viewer,
    bio: "Reinforcement learning and ML systems",
    keywords: ["LLMs"],
  };
  const exact = {
    ...related,
    id: "exact",
    bio: "Reinforcement learning for large language models",
    keywords: ["Machine learning"],
  };
  const vague = {
    ...related,
    id: "vague",
    bio: "Learning about systems and software engineering",
    keywords: [],
  };
  const matches = matchingProfiles(me, [vague, exact], 100);
  assert.equal(matches[0].id, "exact");
  assert.ok(matches[0].shared_terms.includes("reinforcement learning"));
  assert.equal(
    matches.some((p) => p.id === "vague"),
    false,
  );
  assert.ok(!matches[0].shared_terms.includes("learning"));
  assert.equal(
    matchingProfiles({ ...viewer, bio: "", keywords: ["ML"] }, [
      { ...related, bio: "Machine learning", keywords: [] },
    ])[0].id,
    "related",
  );
});

test("explicit keywords outrank incidental mentions and repetition cannot manufacture relevance", () => {
  const me = { ...viewer, bio: "", keywords: ["Distributed systems"] };
  const focused = {
    ...related,
    id: "focused",
    bio: "",
    keywords: ["Distributed systems"],
  };
  const incidental = {
    ...related,
    id: "incidental",
    bio: "",
    keywords: [],
    linkedin_background:
      "I built distributed systems. " +
      "Fashion illustration apparel sketching visual identity typography printing retail textiles ".repeat(
        50,
      ),
  };
  const generic = {
    ...related,
    id: "generic",
    bio: "systems learning engineering ".repeat(200),
    keywords: [],
  };
  const matches = matchingProfiles(me, [generic, incidental, focused], 100);
  assert.equal(matches[0].id, "focused");
  assert.equal(
    matches.some((p) => p.id === "generic"),
    false,
  );
  assert.ok(
    matches.every(
      (p) =>
        Number.isFinite(p.match_score) &&
        p.match_score <= 1 &&
        p.match_score > 0,
    ),
  );
});

test("contact addresses and URLs are not shared-interest evidence; expanded lists stay private", () => {
  const me = { ...viewer, bio: "email: same@example.com", keywords: [] };
  assert.deepEqual(
    matchingProfiles(me, [
      { ...related, bio: "email: same@example.com", keywords: [] },
    ]),
    [],
  );
  const many = Array.from({ length: 12 }, (_, i) => ({
    ...related,
    id: `person-${i}`,
  }));
  assert.equal(matchingProfiles(viewer, many, 100).length, 12);
  assert.equal(
    matchingProfiles(
      viewer,
      [...many, { ...related, id: "hidden", opt_status: "not_confirmed" }],
      100,
    ).length,
    12,
  );
});
