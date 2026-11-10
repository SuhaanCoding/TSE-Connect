import test from "node:test";
import assert from "node:assert/strict";
import {
  graduationEvidence,
  agreedGraduationEvidence,
  isSchoolLabel,
  preserveGraduationYear,
} from "../lib/education.ts";
import { planProfileImport } from "../lib/linkedin-profile.ts";
const at = "2026-11-10T12:00:00Z";
const school = (endDate, extra = {}) => ({
  education: [
    { schoolName: "UC San Diego", startDate: "2022-09", endDate, ...extra },
  ],
});
test("school labels change only for explicit past UCSD education dates", () => {
  assert.equal(graduationEvidence(school("2026-06"), at).year, "2026");
  assert.equal(graduationEvidence(school("2025"), at).year, "2025");
  assert.equal(graduationEvidence(school("2026"), at), null);
  assert.equal(graduationEvidence(school("2026-12"), at), null);
  assert.equal(graduationEvidence(school("2027-06"), at), null);
  assert.equal(graduationEvidence(school(null), at), null);
  assert.equal(graduationEvidence(school("2025-00"), at), null);
  assert.equal(graduationEvidence(school("2025-99"), at), null);
  assert.equal(isSchoolLabel("Currently in school"), true);
  assert.equal(isSchoolLabel("2025"), false);
});
test("certificates, other schools, conflicting or ongoing programs do not overwrite status", () => {
  assert.equal(
    graduationEvidence(school("2025-06", { degreeName: "Certificate" }), at),
    null,
  );
  assert.equal(
    graduationEvidence(
      school("2025-06", { schoolName: "San Diego State University" }),
      at,
    ),
    null,
  );
  assert.equal(
    graduationEvidence(
      {
        education: [
          ...school("2025-06").education,
          ...school(null, { degreeName: "MS" }).education,
        ],
      },
      at,
    ),
    null,
  );
  assert.equal(
    agreedGraduationEvidence([school("2025-06"), school("2024-06")], at),
    null,
  );
  assert.equal(
    agreedGraduationEvidence([school("2025-06"), school("2027-06")], at),
    null,
  );
});
test("education-only updates are conditional and preserve explicit member years", () => {
  const url = "https://www.linkedin.com/in/example-alum/";
  const rows = [
    {
      id: "1",
      full_name: "Example",
      linkedin_url: url,
      graduation_year: "Currently in school",
    },
    {
      id: "2",
      full_name: "Duplicate",
      linkedin_url: url,
      graduation_year: "2024",
    },
  ];
  const plan = planProfileImport(
    [{ ...school("2026-06"), url }],
    rows,
    [url],
    "primary",
    at,
  );
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].data.graduation_year, "2026");
  assert.equal(plan.updates[0].expectedGraduationYear, "Currently in school");
  assert.deepEqual(plan.outcomes[0].alumniIds, ["1"]);
  assert.deepEqual(plan.outcomes[0].fields, ["graduation_year"]);
  assert.equal(preserveGraduationYear("2026", "Currently in school"), "2026");
  assert.equal(preserveGraduationYear("2026", null), "2026");
  assert.equal(preserveGraduationYear("2026", "2027"), "2027");
});
test("secondary-provider and structured dates remain supported", () => {
  const profile = {
    education: [
      {
        school: "University of California San Diego",
        degree: "BS",
        startDate: { year: 2021, month: 9 },
        endDate: { year: 2025, month: 6 },
      },
    ],
  };
  assert.equal(graduationEvidence(profile, at).year, "2025");
  assert.equal(graduationEvidence({ ...profile, error: "Hidden" }, at), null);
});
