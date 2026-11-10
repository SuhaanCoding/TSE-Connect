import test from "node:test";
import assert from "node:assert/strict";
import {
  networkRanking,
  parseNetworkFilters,
  companySignals,
  chooseDiscovery,
  outreachDraft,
} from "../lib/network.ts";
import { publicDirectoryProfile } from "../lib/directory.ts";
const defaults = () => parseNetworkFilters(new URLSearchParams());
const person = (id, extra = {}) => ({
  id,
  full_name: `Person ${id}`,
  linkedin_url: `https://linkedin.com/in/person-${id}/`,
  bio: null,
  keywords: [],
  linkedin_about: null,
  linkedin_background: null,
  current_company: null,
  current_role: null,
  past_companies: [],
  graduation_year: "2026",
  opt_status: "not_confirmed",
  auth_id: null,
  ...extra,
});
const me = person("me", {
  bio: "Distributed systems and database research",
  keywords: ["MLSys"],
  opt_status: "opted_in",
});
test("whole-network rankings retain every distinct visible person and finite zero-signal entries", () => {
  const related = person("related", { bio: me.bio, opt_status: "opted_in" }),
    unknown = person("unknown"),
    out = person("out", { opt_status: "opted_out" });
  const rows = networkRanking(
    me,
    [
      me,
      related,
      unknown,
      out,
      person("duplicate", { linkedin_url: related.linkedin_url }),
    ],
    defaults(),
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, "related");
  assert.deepEqual(
    rows.map((row) => row.rank),
    [1, 2, 3],
  );
  assert.ok(rows.some((row) => row.id === "out"));
  assert.ok(rows.every((row) => Number.isFinite(row.match_score)));
  assert.equal(
    rows.find((row) => row.id === "unknown").signal_level,
    "exploratory",
  );
  assert.equal(
    rows.find((row) => row.id === "unknown").evidence,
    "limited text",
  );
  const hidden = publicDirectoryProfile(
    {
      ...rows[0],
      contact_email: "private@example.com",
      login_email: "login@example.com",
      auth_id: "secret",
    },
    false,
  );
  assert.equal(hidden.contact_email, null);
  assert.equal(hidden.login_email, null);
  assert.equal(hidden.auth_id, null);
  assert.equal(hidden.linkedin_url, null);
});
test("employer categories respect current/past scope, OR category filters and exact company filters", () => {
  const row = person("mixed", {
    current_company: "Stripe",
    past_companies: ["Google", "Jane Street"],
  });
  assert.deepEqual(
    companySignals(row, "current").map((signal) => signal.category),
    ["fintech"],
  );
  assert.ok(
    companySignals(row, "past").some((signal) => signal.category === "quant"),
  );
  assert.equal(
    companySignals(
      person("false", {
        current_company: "Pineapple",
        past_companies: ["Metadata"],
      }),
    ).length,
    0,
  );
  assert.equal(
    networkRanking(me, [row], {
      ...defaults(),
      categories: ["faang"],
      scope: "current",
    }).length,
    0,
  );
  assert.equal(
    networkRanking(me, [row], {
      ...defaults(),
      categories: ["faang", "quant"],
      scope: "past",
    }).length,
    1,
  );
  assert.equal(
    networkRanking(me, [row], {
      ...defaults(),
      companies: ["Google"],
      scope: "current",
    }).length,
    0,
  );
  assert.equal(
    networkRanking(me, [row], {
      ...defaults(),
      companies: ["Google"],
      scope: "past",
    }).length,
    1,
  );
});
test("goal choices change ranking for explicit reasons without inventing response odds", () => {
  const peer = person("peer", { bio: me.bio }),
    mentor = person("mentor", {
      current_role: "Staff engineer",
      opt_status: "opted_in",
      graduation_year: "2015",
    });
  const advice = networkRanking(me, [peer, mentor], {
    ...defaults(),
    goal: "advice",
  });
  assert.ok(
    advice
      .find((row) => row.id === "mentor")
      .reasons.some((reason) => reason.includes("Role title")),
  );
  const peers = networkRanking(me, [peer, mentor], {
    ...defaults(),
    goal: "peers",
  });
  assert.equal(peers[0].id, "peer");
  assert.ok(peers[0].reasons.includes("Similar graduation cohort"));
  const named = networkRanking(me, [peer, mentor], {
    ...defaults(),
    query: mentor.full_name,
  });
  assert.equal(named[0].id, mentor.id);
  assert.equal(
    networkRanking(me, [peer, mentor], { ...defaults(), optedOnly: true })
      .length,
    1,
  );
});
test("discovery draws without replacement, handles small/exhausted pools, and preserves ranks", () => {
  const rows = Array.from({ length: 35 }, (_, index) => ({
    id: String(index),
    rank: index + 1,
  }));
  const first = chooseDiscovery(rows, 3, [], "smart", () => 0);
  const next = chooseDiscovery(
    rows,
    3,
    first.map((row) => row.id),
    "smart",
    () => 0,
  );
  assert.deepEqual(
    first.map((row) => row.rank),
    [1, 2, 3],
  );
  assert.deepEqual(
    next.map((row) => row.rank),
    [4, 5, 6],
  );
  assert.equal(new Set(next.map((row) => row.id)).size, 3);
  assert.equal(chooseDiscovery(rows.slice(0, 2), 3, [], "wildcard").length, 2);
  assert.equal(
    chooseDiscovery(rows.slice(0, 2), 3, ["0", "1"], "smart").length,
    2,
  );
  assert.equal(chooseDiscovery([], 3, [], "smart").length, 0);
  assert.ok(chooseDiscovery(rows, 3, [], "wildcard", () => 0)[0].rank > 10);
});
test("URL filters are bounded and outreach uses only available context", () => {
  const parsed = parseNetworkFilters(
    new URLSearchParams(
      "goal=invalid&scope=invalid&categories=quant,secret&company=Google&company=Stripe&opted=1",
    ),
  );
  assert.equal(parsed.goal, "interests");
  assert.equal(parsed.scope, "all");
  assert.deepEqual(parsed.categories, ["quant"]);
  assert.deepEqual(parsed.companies, ["Google", "Stripe"]);
  assert.equal(parsed.optedOnly, true);
  const draft = outreachDraft(
    "Jordan Lee",
    person("example", {
      full_name: "Alex Kim",
      shared_terms: [],
      current_company: "Stripe",
    }),
    "advice",
  );
  assert.match(draft, /experience at Stripe/);
  assert.ok(!/referral|guarantee|probability|%/.test(draft));
});

test("ambiguous brand names do not classify unrelated companies", () => {
  for (const name of [
    "Square Enix",
    "Epic Games",
    "Ramp Design",
    "Wise Systems",
    "Block Party",
  ]) {
    assert.equal(
      companySignals(person(name, { current_company: name })).length,
      0,
    );
  }
  assert.equal(
    companySignals(person("real", { current_company: "Square, Inc." }))[0]
      .category,
    "fintech",
  );
});

test("sheet placeholders require a unique full career identity; names alone never merge people", () => {
  const linked = person("linked", {
    full_name: "Uma Naik",
    current_company: "Example Inc.",
    current_role: "Product Manager",
    past_companies: ["Employer A", "Employer B", "Employer C"],
    graduation_year: "2024",
  });
  const placeholder = person("sheet", {
    ...linked,
    id: "sheet",
    full_name: "Uma  Naik",
    linkedin_url: null,
    graduation_year: null,
  });
  assert.equal(networkRanking(me, [linked, placeholder], defaults()).length, 1);
  for (const extra of [
    { auth_id: "claimed" },
    { bio: "My own interests" },
    { keywords: ["Design"] },
    { graduation_year: "2023" },
    { current_role: "Other role" },
    { past_companies: ["Different", "History", "Here"] },
  ])
    assert.equal(
      networkRanking(me, [linked, { ...placeholder, ...extra }], defaults())
        .length,
      2,
    );
  assert.equal(
    networkRanking(
      me,
      [
        linked,
        placeholder,
        {
          ...linked,
          id: "second",
          linkedin_url: "https://linkedin.com/in/different-person",
        },
      ],
      defaults(),
    ).length,
    3,
  );
  assert.equal(
    networkRanking(
      { ...linked, id: "viewer" },
      [linked, placeholder],
      defaults(),
    ).length,
    0,
  );
});

test("small meaningful overlaps keep their ranking instead of being flattened into zero ties", () => {
  const alphabetic = (index) => {
    let value = index,
      result = "";
    do {
      result = String.fromCharCode(97 + (value % 26)) + result;
      value = Math.floor(value / 26);
    } while (value);
    return `topic${result}`;
  };
  const text = [
    "Databases",
    ...Array.from({ length: 3000 }, (_, index) => alphabetic(index)),
  ].join(" ");
  const viewer = person("viewer", { bio: "Databases", opt_status: "opted_in" });
  const rows = networkRanking(
    viewer,
    [person("weak", { bio: text }), person("zero")],
    defaults(),
  );
  assert.equal(rows[0].id, "weak");
  assert.ok(rows[0].match_score > 0 && rows[0].match_score < 0.03);
  assert.equal(rows[1].match_score, 0);
});
