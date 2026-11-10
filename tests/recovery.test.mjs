import test from "node:test";
import assert from "node:assert/strict";
import {
  planProfileImport,
  mergeScrapeOutcomes,
  careerFromProfile,
  enrichRecoveryProfiles,
} from "../lib/linkedin-profile.ts";
import {
  recoveryUrls,
  summarizeScrape,
  isTerminalApifyStatus,
} from "../lib/scrape-state.ts";
import { verifyRecoveryPricing } from "../lib/scrape-guards.ts";

const person = {
  id: "one",
  full_name: "Jordan Lee",
  linkedin_url: "https://linkedin.com/in/old-handle",
};
const at = "2026-11-10T07:00:00Z";
const profile = {
  type: "profile",
  inputUrl: person.linkedin_url,
  linkedinUrl: "https://linkedin.com/in/new-handle",
  about: "Distributed databases",
  company: "Acme",
  title: "Engineer",
  currentPositions: [{ company: "Acme", title: "Engineer", current: true }],
  experience: [
    { company: "Acme", title: "Engineer", startDate: "2026-01", current: true },
    {
      company: "Northstar",
      title: "Engineer",
      startDate: "2024-01",
      endDate: "2025-12",
      current: false,
      description: "Built distributed databases.",
    },
  ],
};

test("recovery joins changed handles through the requested URL and updates duplicate roster entries", () => {
  const plan = planProfileImport(
    [profile],
    [person, { ...person, id: "two" }],
    [person.linkedin_url],
    "recovery",
    at,
  );
  assert.equal(plan.updates.length, 2);
  assert.equal(plan.outcomes[0].status, "updated");
  assert.equal(
    plan.updates[0].data.linkedin_url,
    "https://www.linkedin.com/in/new-handle/",
  );
  assert.deepEqual(plan.updates[0].data.past_companies, ["Northstar"]);
  assert.ok(
    plan.updates[0].data.linkedin_background.includes(
      "Built distributed databases.",
    ),
  );
  for (const forbidden of [
    "bio",
    "keywords",
    "auth_id",
    "contact_email",
    "opt_status",
  ])
    assert.equal(forbidden in plan.updates[0].data, false);
});

test("matching a name alone never attaches a result to the wrong person", () => {
  const plan = planProfileImport(
    [
      {
        ...profile,
        inputUrl: "https://linkedin.com/in/somebody-else",
        fullName: person.full_name,
      },
    ],
    [person],
    [person.linkedin_url],
    "primary",
    at,
  );
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.outcomes[0].status, "unavailable");
});

test("errors, masks, empty output and deleted roster entries leave data untouched", () => {
  for (const result of [
    { type: "error", inputUrl: person.linkedin_url, error: "Hidden" },
    {
      inputUrl: person.linkedin_url,
      about: "*****",
      currentPosition: { companyName: "******** ********* * ** ***" },
    },
  ]) {
    const plan = planProfileImport(
      [result],
      [person],
      [person.linkedin_url],
      "primary",
      at,
    );
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.outcomes[0].status, "unavailable");
  }
  assert.equal(
    planProfileImport(
      [{ inputUrl: person.linkedin_url, about: "**** * ** ****" }],
      [person],
      [person.linkedin_url],
      "primary",
      at,
    ).updates.length,
    0,
  );
  assert.equal(
    planProfileImport([profile], [], [person.linkedin_url], "primary", at)
      .outcomes[0].status,
    "unmatched",
  );
  assert.equal(
    planProfileImport([], [person], [person.linkedin_url], "primary", at)
      .updates.length,
    0,
  );
});

test("partial recovery history cannot erase saved employers or promote an ended job", () => {
  const partial = {
    ...profile,
    company: null,
    title: null,
    currentPositions: [],
    experience: [
      { company: "Old Employer", title: "Engineer", endDate: "2020-01" },
    ],
  };
  const plan = planProfileImport(
    [partial],
    [person],
    [person.linkedin_url],
    "recovery",
    at,
  );
  assert.equal("current_company" in plan.updates[0].data, false);
  assert.equal("past_companies" in plan.updates[0].data, false);
  assert.equal(careerFromProfile(partial), null);
});

test("recovery selects a useful duplicate result over a placeholder and deduplicates inputs", () => {
  const plan = planProfileImport(
    [{ inputUrl: person.linkedin_url, error: "Transient" }, profile],
    [person],
    [person.linkedin_url, person.linkedin_url],
    "recovery",
    at,
  );
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.outcomes.length, 1);
});

test("recovery is bounded to unresolved roster profiles and cannot downgrade a success", () => {
  const good = planProfileImport(
    [profile],
    [person],
    [person.linkedin_url],
    "primary",
    at,
  ).outcomes;
  const failed = planProfileImport(
    [],
    [person],
    [person.linkedin_url],
    "recovery",
    at,
  ).outcomes;
  assert.deepEqual(recoveryUrls(good), []);
  assert.equal(recoveryUrls(failed).length, 1);
  assert.equal(mergeScrapeOutcomes(good, failed)[0].status, "updated");
  assert.equal(mergeScrapeOutcomes(failed, good)[0].status, "updated");
  assert.deepEqual(summarizeScrape(failed), {
    matched: 0,
    updated: 0,
    skipped_empty: 1,
    no_match: 0,
    errors: 0,
    unresolved_count: 1,
  });
  assert.equal(summarizeScrape(good).updated, 1);
  assert.equal(isTerminalApifyStatus("RUNNING"), false);
  assert.equal(isTerminalApifyStatus("TIMED-OUT"), true);
});

test("recovery rejects price hikes, extra events, subscriptions and oversized retries", () => {
  const p = {
    pricingModel: "PAY_PER_EVENT",
    pricingPerEvent: {
      actorChargeEvents: {
        profile: {
          eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.0032 } },
        },
        "profile-with-email": { eventPriceUsd: 0.008 },
      },
    },
  };
  assert.equal(verifyRecoveryPricing(p, 95), true);
  assert.equal(verifyRecoveryPricing(p, 400), false);
  assert.equal(
    verifyRecoveryPricing({ ...p, pricingModel: "FLAT_PRICE_PER_MONTH" }, 1),
    false,
  );
  assert.equal(
    verifyRecoveryPricing(
      {
        ...p,
        pricingPerEvent: {
          actorChargeEvents: {
            ...p.pricingPerEvent.actorChargeEvents,
            surprise: { eventPriceUsd: 1 },
          },
        },
      },
      1,
    ),
    false,
  );
});

test("cross-provider aliases require the same numeric LinkedIn member ID", () => {
  const original = {
    id: "12345",
    profileUrl: "https://linkedin.com/in/new-handle",
    about: "My complete public bio",
    projects: [{ title: "Queues", description: "Built a message broker." }],
  };
  const recovered = { ...profile, memberId: "12345" };
  const combined = enrichRecoveryProfiles([original], [recovered]);
  assert.equal(combined.length, 2);
  const plan = planProfileImport(
    combined,
    [person],
    [person.linkedin_url],
    "recovery",
    at,
  );
  assert.ok(plan.updates[0].data.linkedin_background);
  assert.equal(
    enrichRecoveryProfiles([original], [{ ...recovered, memberId: "54321" }])
      .length,
    1,
  );
  assert.equal(
    enrichRecoveryProfiles(
      [{ ...original, id: undefined }],
      [{ ...recovered, memberId: undefined }],
    ).length,
    1,
  );
});

test("signed-in captures retain their provenance and only update visible source fields", () => {
  const plan = planProfileImport(
    [
      {
        inputUrl: person.linkedin_url,
        url: "https://example.com/unrelated",
        profileUrl: "https://linkedin.com/in/new-handle",
        projects: [
          {
            name: "LinkedIn experience",
            description: "Researcher at Acme\nBuilt message queues.",
          },
        ],
      },
    ],
    [person],
    [person.linkedin_url],
    "browser",
    at,
  );
  assert.equal(plan.outcomes[0].source, "browser");
  assert.equal(
    plan.updates[0].data.linkedin_url,
    "https://www.linkedin.com/in/new-handle/",
  );
  assert.ok(
    plan.updates[0].data.linkedin_background.includes("Built message queues."),
  );
  assert.equal("current_company" in plan.updates[0].data, false);
  assert.equal("bio" in plan.updates[0].data, false);
});
