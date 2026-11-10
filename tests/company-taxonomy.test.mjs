import test from "node:test";
import assert from "node:assert/strict";
import {
  companyLabels,
  normalizeCompany,
  COMPANY_CATEGORIES,
} from "../lib/company-taxonomy.ts";
const tags = (name) => companyLabels(name).map((label) => label.category);
test("company labels normalize legal suffixes, accents, punctuation and common name variants", () => {
  assert.equal(normalizeCompany(" Stripe, Inc. "), "stripe");
  assert.equal(
    normalizeCompany("Infiyoda Solutions Pvt Ltd"),
    "infiyoda solutions",
  );
  assert.ok(tags("Amazon Web Services (AWS)").includes("faang"));
  assert.ok(tags("ResMed, LLC").includes("health"));
  assert.ok(
    tags("Halıcıoğlu Data Science Institute, UC San Diego").includes(
      "research",
    ),
  );
  assert.ok(tags("TEDxUCSD").includes("media"));
  assert.ok(tags("ServiceNow Inc.").includes("software"));
});
test("conservative fuzzy labels record their evidence and never rewrite employer names", () => {
  for (const name of ["Gooogle", "Microsof", "Nvidiia"]) {
    const labels = companyLabels(name);
    assert.ok(labels.length, name);
    assert.ok(
      labels.some((label) => label.method === "near name"),
      name,
    );
    assert.ok(labels.every((label) => label.matchedName !== name));
  }
  for (const name of [
    "Epic Games",
    "Square Enix",
    "Qualcomm Institute",
    "Runway Avenue Inc.",
    "Strive",
    "Metadata",
  ]) {
    assert.ok(
      !tags(name).includes(
        name === "Qualcomm Institute"
          ? "chips"
          : name === "Runway Avenue Inc."
            ? "ai"
            : name === "Epic Games"
              ? "health"
              : name === "Metadata"
                ? "faang"
                : "fintech",
      ),
      name,
    );
  }
  assert.ok(
    tags("Qualcomm Institute - UC San Diego Division of Calit2").includes(
      "research",
    ),
  );
});
test("unknown organizations and non-employers stay unclassified", () => {
  for (const name of [
    "An Unknown Startup",
    "None",
    "Self-employed",
    "Career Break",
    "Google UX Design Certification",
  ])
    assert.deepEqual(companyLabels(name), [], name);
});
test("editable taxonomy has unique IDs and valid boundary-aware patterns", () => {
  assert.equal(
    new Set(COMPANY_CATEGORIES.map((category) => category.id)).size,
    COMPANY_CATEGORIES.length,
  );
  for (const category of COMPANY_CATEGORIES) {
    assert.ok(category.label);
    assert.ok(
      category.aliases.every(
        (value) => typeof value === "string" && value.trim(),
      ),
    );
    for (const pattern of category.namePatterns || [])
      assert.doesNotThrow(() => new RegExp(pattern, "u"));
  }
});
