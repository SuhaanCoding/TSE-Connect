type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function text(value: unknown): string {
  if (typeof value !== "string" || /^(none|null|n\/a)$/i.test(value.trim()))
    return "";
  const clean = value.replace(/\*{3,}/g, "").trim();
  return /[\p{L}\p{N}]/u.test(clean) ? clean : "";
}

function companyText(value: unknown): string {
  return typeof value === "string" && /\*{3,}/.test(value) ? "" : text(value);
}

function unavailable(row: JsonObject): boolean {
  return (
    !!row.error ||
    row.type === "error" ||
    !!(row.status && row.status !== "success")
  );
}

function profileDescription(value: unknown): string {
  // Logged-out LinkedIn pages can append their sign-in form to About text.
  // Match the form's consecutive labels, not ordinary prose about signing in.
  return text(value)
    .split(
      /(?:^|\n)\s*Welcome back\s*\n\s*Email or phone\s*\n\s*Password\b/i,
    )[0]
    .replace(/(?:^|\n)\s*see (?:more|less)\s*$/i, "")
    .trim();
}

export function backgroundFromProfile(value: unknown): {
  about: string;
  background: string;
} {
  const row = object(value);
  if (unavailable(row)) return { about: "", background: "" };
  const profile = row.profile ? object(row.profile) : row;
  const about = (
    profileDescription(profile.about) || profileDescription(profile.summary)
  ).slice(0, 6000);
  const sections: string[] = [];
  const experience = Array.isArray(profile.experience)
    ? profile.experience.map(object)
    : [];
  for (const role of experience) {
    const description = profileDescription(role.description);
    if (!description) continue;
    const heading = [
      text(role.title) || text(role.position),
      text(role.companyName) || text(role.company),
    ]
      .filter(Boolean)
      .join(" at ");
    sections.push([heading, description].filter(Boolean).join("\n"));
  }
  if (Array.isArray(profile.position_groups))
    for (const groupValue of profile.position_groups) {
      const group = object(groupValue);
      if (!Array.isArray(group.profile_positions)) continue;
      for (const value of group.profile_positions) {
        const role = object(value);
        const description = profileDescription(role.description);
        if (description)
          sections.push(
            [
              text(role.title),
              text(role.company) || text(object(group.company).name),
              description,
            ]
              .filter(Boolean)
              .join("\n"),
          );
      }
    }
  if (Array.isArray(profile.projects))
    for (const value of profile.projects) {
      const project = object(value);
      const description = profileDescription(project.description);
      if (description)
        sections.push(
          [text(project.title) || text(project.name), description]
            .filter(Boolean)
            .join("\n"),
        );
    }
  return {
    about,
    background: [...new Set(sections)].join("\n\n").slice(0, 18000),
  };
}

export function normalizeLinkedInUrl(url: string): string {
  try {
    const parsed = new URL(
      /^https?:\/\//i.test(url) ? url.trim() : `https://${url.trim()}`,
    );
    const profile = parsed.pathname.match(/^\/in\/([^/]+)/i);
    return /(^|\.)linkedin\.com$/i.test(parsed.hostname) && profile
      ? `linkedin.com/in/${profile[1].toLowerCase()}`
      : "";
  } catch {
    return "";
  }
}

export function extractProfileUrl(value: unknown): string | null {
  const row = object(value);
  return (
    [row.url, row.profileUrl, row.linkedInUrl, row.linkedinUrl]
      .map(text)
      .find((url) => normalizeLinkedInUrl(url)) || null
  );
}

/** Both the requested URL and the returned URL identify redirected profiles. */
export function extractProfileUrls(value: unknown): string[] {
  const row = object(value);
  return [
    ...new Set(
      [row.inputUrl, row.url, row.profileUrl, row.linkedInUrl, row.linkedinUrl]
        .map(text)
        .map(normalizeLinkedInUrl)
        .filter(Boolean),
    ),
  ];
}

function memberId(value: unknown): string {
  const row = object(value);
  for (const value of [row.memberId, row.id, row.profileUrn]) {
    const id = String(value || "").replace(/^urn:li:member:/, "");
    if (/^\d+$/.test(id)) return id;
  }
  return "";
}

/** Link provider aliases only with a stable LinkedIn member ID, never a name. */
export function enrichRecoveryProfiles(
  primary: unknown[],
  recovery: unknown[],
): unknown[] {
  const originals = new Map(
    primary.filter((row) => memberId(row)).map((row) => [memberId(row), row]),
  );
  const aliases = recovery.flatMap((value) => {
    const row = object(value),
      original = originals.get(memberId(value));
    if (!original || unavailable(row)) return [];
    const inputUrl = text(row.inputUrl) || text(row.linkedinUrl);
    return inputUrl ? [{ ...object(original), inputUrl }] : [];
  });
  return [...recovery, ...aliases];
}

export function careerFromProfile(value: unknown): {
  currentRole: string;
  currentCompany: string;
  pastCompanies: string[];
  completeHistory: boolean;
} | null {
  const row = object(value);
  if (unavailable(row)) return null;
  const profile = object(row.profile);
  let currentRole = "";
  let currentCompany = "";
  let pastCompanies: string[] = [];
  let completeHistory = false;
  if (Array.isArray(row.currentPositions)) {
    // The recovery provider supplies explicit current positions; never infer
    // that the first ended job is current when a public page hides dates.
    const experience = Array.isArray(row.experience)
      ? row.experience.map(object)
      : [];
    currentCompany = companyText(row.company);
    const current = row.currentPositions
      .map(object)
      .find(
        (entry) =>
          companyText(entry.company).toLowerCase() ===
          currentCompany.toLowerCase(),
      );
    currentRole = currentCompany ? text(row.title) || text(current?.title) : "";
    completeHistory =
      experience.length > 0 &&
      experience.every(
        (entry) =>
          companyText(entry.company) &&
          text(entry.title) &&
          text(entry.startDate),
      );
    if (completeHistory)
      pastCompanies = experience
        .filter((entry) => entry.current !== true && text(entry.endDate))
        .map((entry) => companyText(entry.company));
  } else if (row.profile) {
    const groups = Array.isArray(profile.position_groups)
      ? profile.position_groups.map(object)
      : [];
    const current = groups.find((group) => {
      const date = object(group.date);
      return date.start && !date.end;
    });
    currentCompany =
      companyText(object(profile.company).name) ||
      companyText(object(current?.company).name);
    const positions = Array.isArray(current?.profile_positions)
      ? current.profile_positions.map(object)
      : [];
    currentRole = currentCompany
      ? text(profile.title) || text(positions[0]?.title)
      : "";
    pastCompanies = groups
      .filter((group) => object(group.date).end)
      .map((group) => companyText(object(group.company).name))
      .filter(Boolean);
    completeHistory =
      Array.isArray(profile.position_groups) && groups.length > 0;
  } else if ("currentPosition" in row) {
    const position = object(row.currentPosition);
    currentCompany = companyText(position.companyName);
    currentRole = currentCompany ? text(position.title) : "";
    const experience = Array.isArray(row.experience)
      ? row.experience.map(object)
      : [];
    // Public pages often redact employers and dates. Never replace a complete
    // saved history with a partial or masked list from a logged-out page.
    completeHistory =
      experience.length > 0 &&
      experience.every(
        (entry) =>
          companyText(entry.companyName) &&
          text(entry.title) &&
          text(entry.startDate),
      );
    if (completeHistory) {
      pastCompanies = experience
        .filter((entry) => text(entry.endDate))
        .map((entry) => companyText(entry.companyName));
    }
  } else if (Array.isArray(row.experience)) {
    // Keep processing older HarvestAPI datasets during the provider transition.
    const experience = row.experience.map(object);
    currentRole = text(experience[0]?.position);
    currentCompany = companyText(experience[0]?.companyName);
    pastCompanies = experience
      .slice(1)
      .map((entry) => companyText(entry.companyName))
      .filter(Boolean);
    completeHistory = experience.length > 0;
  }
  if (!currentRole && !currentCompany && !pastCompanies.length) return null;
  const seen = new Set(currentCompany ? [currentCompany.toLowerCase()] : []);
  pastCompanies = pastCompanies
    .filter((company) => {
      const key = company.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
  return { currentRole, currentCompany, pastCompanies, completeHistory };
}

export interface ScrapeOutcome {
  inputUrl: string;
  name: string;
  alumniIds: string[];
  status: "updated" | "unavailable" | "unmatched" | "write_failed";
  source: "primary" | "recovery" | "browser";
  fields: string[];
  reason: string | null;
}

export interface ScrapeAlumnus {
  id: string;
  full_name: string;
  linkedin_url: string | null;
}

/** Pure import planning: never match on a person's name or write authored fields. */
export function planProfileImport(
  profiles: unknown[],
  alumni: ScrapeAlumnus[],
  inputUrls: string[],
  source: "primary" | "recovery" | "browser",
  refreshedAt: string,
) {
  const byUrl = new Map<string, ScrapeAlumnus[]>();
  for (const person of alumni) {
    const url = normalizeLinkedInUrl(person.linkedin_url || "");
    if (url) byUrl.set(url, [...(byUrl.get(url) || []), person]);
  }
  const outcomes: ScrapeOutcome[] = [];
  const updates: {
    id: string;
    inputUrl: string;
    data: Record<string, unknown>;
  }[] = [];
  for (const inputUrl of [
    ...new Set(inputUrls.map(normalizeLinkedInUrl).filter(Boolean)),
  ]) {
    const candidates = profiles.filter((profile) =>
      extractProfileUrls(profile).includes(inputUrl),
    );
    // Prefer a useful result over an error or placeholder for the same URL.
    const usable = candidates
      .map((profile) => {
        const career = careerFromProfile(profile),
          background = backgroundFromProfile(profile);
        const data: Record<string, unknown> = {};
        if (career?.currentCompany)
          data.current_company = career.currentCompany;
        if (career?.currentRole) data.current_role = career.currentRole;
        if (career && (career.completeHistory || career.pastCompanies.length))
          data.past_companies = career.pastCompanies;
        if (background.about) data.linkedin_about = background.about;
        if (background.background)
          data.linkedin_background = background.background;
        return { profile, data };
      })
      .filter((item) => Object.keys(item.data).length)
      .sort((a, b) => Object.keys(b.data).length - Object.keys(a.data).length);
    const best = usable[0];
    if (best)
      for (const alternative of usable.slice(1)) {
        for (const field of [
          "linkedin_about",
          "linkedin_background",
          "past_companies",
        ])
          if (!(field in best.data) && field in alternative.data)
            best.data[field] = alternative.data[field];
        if (
          !best.data.current_role &&
          alternative.data.current_role &&
          String(best.data.current_company || "").toLowerCase() ===
            String(alternative.data.current_company || "").toLowerCase()
        )
          best.data.current_role = alternative.data.current_role;
      }
    const aliases = best ? extractProfileUrls(best.profile) : [inputUrl];
    const people = [
      ...new Map(
        aliases
          .flatMap((url) => byUrl.get(url) || [])
          .map((person) => [person.id, person]),
      ).values(),
    ];
    const failure = candidates.map(object).find((row) => unavailable(row));
    const failureReason =
      typeof failure?.error === "string"
        ? failure.error.slice(0, 400)
        : "LinkedIn returned identity information only; no visible career or background fields were available.";
    const outcome: ScrapeOutcome = {
      inputUrl,
      name: people[0]?.full_name || "Unknown profile",
      alumniIds: people.map((person) => person.id),
      source,
      fields: best ? Object.keys(best.data) : [],
      status: !people.length ? "unmatched" : best ? "updated" : "unavailable",
      reason: !people.length
        ? "The requested and returned URLs do not match a roster profile."
        : !best
          ? candidates.length
            ? failureReason
            : "The provider returned no result for this URL."
          : null,
    };
    outcomes.push(outcome);
    if (!best || !people.length) continue;
    // Only persist a redirected address when the provider ties it to inputUrl.
    const redirect = usable.find(
      (item) =>
        normalizeLinkedInUrl(text(object(item.profile).inputUrl)) ===
          inputUrl &&
        normalizeLinkedInUrl(extractProfileUrl(item.profile) || "") !==
          inputUrl,
    );
    const returnedUrl = redirect
      ? normalizeLinkedInUrl(extractProfileUrl(redirect.profile) || "")
      : "";
    const data = { ...best.data, last_scraped_at: refreshedAt };
    if (returnedUrl && returnedUrl !== inputUrl) {
      Object.assign(data, { linkedin_url: `https://www.${returnedUrl}/` });
      outcome.fields.push("linkedin_url");
    }
    for (const person of people)
      updates.push({ id: person.id, inputUrl, data });
  }
  return { outcomes, updates };
}

export function mergeScrapeOutcomes(
  primary: ScrapeOutcome[],
  recovery: ScrapeOutcome[],
): ScrapeOutcome[] {
  const merged = new Map(primary.map((result) => [result.inputUrl, result]));
  for (const result of recovery)
    if (merged.get(result.inputUrl)?.status !== "updated")
      merged.set(result.inputUrl, result);
  return [...merged.values()];
}
