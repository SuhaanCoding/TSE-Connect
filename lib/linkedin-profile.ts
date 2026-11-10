type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" && !/^(none|null|n\/a)$/i.test(value.trim())
    ? value.replace(/\*{3,}/g, "").trim()
    : "";
}

export function backgroundFromProfile(value: unknown): {
  about: string;
  background: string;
} {
  const row = object(value);
  if (row.error || (row.status && row.status !== "success"))
    return { about: "", background: "" };
  const profile = row.profile ? object(row.profile) : row;
  const about = (text(profile.about) || text(profile.summary)).slice(0, 6000);
  const sections: string[] = [];
  const experience = Array.isArray(profile.experience)
    ? profile.experience.map(object)
    : [];
  for (const role of experience) {
    const description = text(role.description);
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
        const description = text(role.description);
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
      const description = text(project.description);
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
  const url =
    text(row.url) ||
    text(row.profileUrl) ||
    text(row.linkedInUrl) ||
    text(row.linkedinUrl);
  return url && normalizeLinkedInUrl(url) ? url : null;
}

export function careerFromProfile(value: unknown): {
  currentRole: string;
  currentCompany: string;
  pastCompanies: string[];
  completeHistory: boolean;
} | null {
  const row = object(value);
  if (row.error || (row.status && row.status !== "success")) return null;
  const profile = object(row.profile);
  let currentRole = "";
  let currentCompany = "";
  let pastCompanies: string[] = [];
  let completeHistory = false;
  if (row.profile) {
    const groups = Array.isArray(profile.position_groups)
      ? profile.position_groups.map(object)
      : [];
    const current = groups.find((group) => {
      const date = object(group.date);
      return date.start && !date.end;
    });
    currentCompany =
      text(object(profile.company).name) || text(object(current?.company).name);
    const positions = Array.isArray(current?.profile_positions)
      ? current.profile_positions.map(object)
      : [];
    currentRole = currentCompany
      ? text(profile.title) || text(positions[0]?.title)
      : "";
    pastCompanies = groups
      .filter((group) => object(group.date).end)
      .map((group) => text(object(group.company).name))
      .filter(Boolean);
    completeHistory =
      Array.isArray(profile.position_groups) && groups.length > 0;
  } else if ("currentPosition" in row) {
    const position = object(row.currentPosition);
    currentCompany = text(position.companyName);
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
          text(entry.companyName) && text(entry.title) && text(entry.startDate),
      );
    if (completeHistory) {
      pastCompanies = experience
        .filter((entry) => text(entry.endDate))
        .map((entry) => text(entry.companyName));
    }
  } else if (Array.isArray(row.experience)) {
    // Keep processing older HarvestAPI datasets during the provider transition.
    const experience = row.experience.map(object);
    currentRole = text(experience[0]?.position);
    currentCompany = text(experience[0]?.companyName);
    pastCompanies = experience
      .slice(1)
      .map((entry) => text(entry.companyName))
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
