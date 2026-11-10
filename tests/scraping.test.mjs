import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLinkedInUrl,
  careerFromProfile,
  backgroundFromProfile,
} from "../lib/linkedin-profile.ts";
import { verifyScraperPricing, isLimitedScrape } from "../lib/scrape-guards.ts";

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
  const result = careerFromProfile({currentPosition: null, experience: [{title:"Engineer",companyName:"Former Employer",startDate:"2020-01",endDate:"2021-01"}]});
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
