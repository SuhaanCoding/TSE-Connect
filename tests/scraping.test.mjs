import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLinkedInUrl,
  careerFromProfile,
  backgroundFromProfile,
} from "../lib/linkedin-profile.ts";
import { verifyScraperPricing, isLimitedScrape } from "../lib/scrape-guards.ts";
import { webhookOptions } from "../lib/apify.ts";

test("automatic callbacks interpolate real run IDs and retry interrupted deliveries", () => {
  const webhook = webhookOptions({
    url: "https://example.com/callback",
    secret: "test-only-secret",
  });
  assert.equal(webhook.shouldInterpolateStrings, true);
  assert.equal(webhook.doNotRetry, false);
  assert.deepEqual(JSON.parse(webhook.payloadTemplate), {
    runId: "{{resource.id}}",
    datasetId: "{{resource.defaultDatasetId}}",
    status: "{{resource.status}}",
    secret: "test-only-secret",
  });
  assert.ok(webhook.eventTypes.includes("ACTOR.RUN.TIMED_OUT"));
});

test("LinkedIn matching handles regional domains and rejects unrelated URLs", () => {
  assert.equal(
    normalizeLinkedInUrl("https://uk.linkedin.com/in/Jane-Doe/?tracking=1"),
    "linkedin.com/in/jane-doe",
  );
  for (const value of [
    "https://evil.com/in/jane",
    "https://linkedin.com.evil.com/in/jane",
    "https://linkedin.com/company/acme",
    "",
  ])
    assert.equal(normalizeLinkedInUrl(value), "");
});

test("public-page results update visible current employers without erasing hidden history", () => {
  const result = careerFromProfile({
    currentPosition: { companyName: "Microsoft", title: null },
    experience: [
      { companyName: "Microsoft", title: null, startDate: null },
      { companyName: "*****", title: null, startDate: null },
    ],
  });
  assert.deepEqual(result, {
    currentRole: "",
    currentCompany: "Microsoft",
    pastCompanies: [],
    completeHistory: false,
  });
  assert.equal(
    careerFromProfile({ currentPosition: { companyName: "*****" } }),
    null,
  );
  assert.equal(
    careerFromProfile({
      error: "Blocked",
      currentPosition: { companyName: "Fake" },
    }),
    null,
  );
  assert.equal(
    careerFromProfile({
      status: "not_found",
      profile: { company: { name: "Fake" } },
    }),
    null,
  );
});

test("a missing current position cannot promote an ended job to current employer", () => {
  const result = careerFromProfile({
    currentPosition: null,
    experience: [
      {
        title: "Engineer",
        companyName: "Former Employer",
        startDate: "2020-01",
        endDate: "2021-01",
      },
    ],
  });
  assert.equal(result.currentCompany, "");
  assert.deepEqual(result.pastCompanies, ["Former Employer"]);
});

test("legacy completed datasets remain compatible and duplicate employers are removed", () => {
  assert.deepEqual(
    careerFromProfile({
      experience: [
        { position: "Engineer", companyName: "Acme" },
        { companyName: "Northstar" },
        { companyName: "ACME" },
        { companyName: "Northstar" },
      ],
    }),
    {
      currentRole: "Engineer",
      currentCompany: "Acme",
      pastCompanies: ["Northstar"],
      completeHistory: true,
    },
  );
});

test("scraping captures About, job descriptions and projects without importing masks", () => {
  const result = backgroundFromProfile({
    about: "  I build developer tools.  ",
    experience: [
      {
        title: "Engineer",
        companyName: "Acme",
        description: "Built a distributed queue.",
      },
      { companyName: "*****", description: null },
    ],
    projects: [
      {
        name: "Climate dashboard",
        description: "Designed visualizations for researchers.",
      },
    ],
  });
  assert.equal(result.about, "I build developer tools.");
  assert.ok(result.background.includes("Engineer at Acme"));
  assert.ok(result.background.includes("Built a distributed queue."));
  assert.ok(result.background.includes("Climate dashboard"));
  assert.ok(!result.background.includes("*****"));
  assert.deepEqual(
    backgroundFromProfile({ error: "Blocked", about: "invalid" }),
    { about: "", background: "" },
  );
});

test("LinkedIn sign-in forms cannot pollute About text or project descriptions", () => {
  const form =
    "\n\nsee more\n\nWelcome back\n\nEmail or phone\n\nPassword\n\nShow\n\nForgot password?\n\nSign in";
  const result = backgroundFromProfile({
    about: `I build developer tools…${form}`,
    projects: [
      {
        title: "Authentication",
        description: `Designed a sign in flow.${form}`,
      },
    ],
  });
  assert.equal(result.about, "I build developer tools…");
  assert.equal(result.background, "Authentication\nDesigned a sign in flow.");
  assert.deepEqual(backgroundFromProfile({ about: form }), {
    about: "",
    background: "",
  });
  assert.equal(
    backgroundFromProfile({
      about: "Welcome back to my project. I built a sign in form.",
    }).about,
    "Welcome back to my project. I built a sign in form.",
  );
});

test("pricing guard rejects subscription, price hikes, surprise events and oversized runs", () => {
  const pricing = {
    pricingModel: "PAY_PER_EVENT",
    pricingPerEvent: {
      actorChargeEvents: {
        main_result: {
          eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.005 } },
        },
        "apify-actor-start": { eventPriceUsd: 0.00005 },
      },
    },
  };
  assert.equal(verifyScraperPricing(pricing, 254), true);
  assert.equal(verifyScraperPricing(pricing, 500), false);
  assert.equal(
    verifyScraperPricing(
      { ...pricing, pricingModel: "FLAT_PRICE_PER_MONTH" },
      10,
    ),
    false,
  );
  assert.equal(
    verifyScraperPricing(
      {
        ...pricing,
        pricingPerEvent: {
          actorChargeEvents: {
            ...pricing.pricingPerEvent.actorChargeEvents,
            surprise: { eventPriceUsd: 1 },
          },
        },
      },
      10,
    ),
    false,
  );
  assert.equal(
    verifyScraperPricing(
      {
        pricingModel: "PAY_PER_EVENT",
        pricingPerEvent: {
          actorChargeEvents: {
            main_result: {
              eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.006 } },
            },
          },
        },
      },
      10,
    ),
    false,
  );
});

test("free-plan caps and budget truncation cannot masquerade as successful refreshes", () => {
  for (const message of [
    "free user item limit exceeded",
    "Free plan: processed first 9; cap is 10/month; 245 URLs skipped",
    "Skipped 245 URLs",
    "Maximum total charge reached",
  ])
    assert.equal(isLimitedScrape(message), true);
  assert.equal(
    isLimitedScrape("9 profiles saved, 3 failed (see the Inputs table)"),
    false,
  );
});
