type Obj = Record<string, unknown>;
const object = (value: unknown): Obj =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : {};
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
export const isSchoolLabel = (value: unknown) =>
  /^(currently in school|in school|student)$/i.test(text(value));

function date(value: unknown): { year: number; month: number | null } | null {
  if (value && typeof value === "object") {
    const row = object(value);
    const year = Number(row.year),
      month = Number(row.month);
    if (
      row.month !== undefined &&
      row.month !== null &&
      (!Number.isInteger(month) || month < 1 || month > 12)
    )
      return null;
    return year >= 1950 && year <= 2100
      ? { year, month: month >= 1 && month <= 12 ? month : null }
      : null;
  }
  const match = text(value).match(/^(\d{4})(?:-(\d{2})(?:-\d{2})?)?$/);
  return match &&
    Number(match[1]) >= 1950 &&
    Number(match[1]) <= 2100 &&
    (!match[2] || (Number(match[2]) >= 1 && Number(match[2]) <= 12))
    ? { year: Number(match[1]), month: match[2] ? Number(match[2]) : null }
    : null;
}

export interface GraduationEvidence {
  year: string;
  school: string;
  endDate: string;
  precision: "month" | "year";
}
/** Only a past, explicit UCSD education end date can replace a school label. */
export function graduationEvidence(
  value: unknown,
  asOf: string,
): GraduationEvidence | null {
  const row = object(value);
  if (row.error || row.type === "error") return null;
  const profile = row.profile ? object(row.profile) : row;
  const education = Array.isArray(profile.education)
    ? profile.education.map(object)
    : [];
  const today = new Date(asOf);
  if (!Number.isFinite(today.getTime())) return null;
  const ucsd = education.filter((entry) => {
    const name =
      text(entry.schoolName) ||
      text(entry.school) ||
      text(object(entry.school).name);
    const key = name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]/g, "");
    return /^(ucsd|ucsandiego|universityofcaliforniasandiego|haliciogludatascienceinstituteucsandiego)$/.test(
      key,
    );
  });
  if (!ucsd.length) return null;
  const candidates: GraduationEvidence[] = [];
  for (const entry of ucsd) {
    const degree = text(entry.degreeName) || text(entry.degree);
    if (/certificate|bootcamp|summer|extension|non.?degree/i.test(degree))
      continue;
    const end = date(entry.endDate) || date(object(entry.date).end);
    // An ongoing/future/ambiguous UCSD program keeps the status for review.
    if (!end) return null;
    const ended = end.month
      ? Date.UTC(end.year, end.month, 1) <= today.getTime()
      : end.year < today.getUTCFullYear();
    if (!ended) return null;
    const start = date(entry.startDate) || date(object(entry.date).start);
    if (
      !degree &&
      (!start || end.year - start.year < 2 || end.year - start.year > 8)
    )
      continue;
    candidates.push({
      year: String(end.year),
      school: text(entry.schoolName) || text(entry.school) || "UC San Diego",
      endDate: `${end.year}${end.month ? `-${String(end.month).padStart(2, "0")}` : ""}`,
      precision: end.month ? "month" : "year",
    });
  }
  // Multiple different completion years without a clear single cohort need review.
  return new Set(candidates.map((item) => item.year)).size === 1
    ? candidates[0]
    : null;
}

export function agreedGraduationEvidence(
  profiles: unknown[],
  asOf: string,
): GraduationEvidence | null {
  // A second source showing a different, future or ongoing UCSD program vetoes
  // an automatic correction. A source with no education contributes no evidence.
  const relevant = profiles.filter((value) => {
    const row = object(value);
    if (row.error || row.type === "error") return false;
    const profile = row.profile ? object(row.profile) : row;
    return (
      Array.isArray(profile.education) &&
      profile.education.some((value) => {
        const entry = object(value);
        const name =
          text(entry.schoolName) ||
          text(entry.school) ||
          text(object(entry.school).name);
        return /^(ucsd|ucsandiego|universityofcaliforniasandiego|haliciogludatascienceinstituteucsandiego)$/.test(
          name.toLowerCase().replace(/[^a-z0-9]/g, ""),
        );
      })
    );
  });
  if (relevant.some((profile) => !graduationEvidence(profile, asOf)))
    return null;
  const evidence = profiles
    .map((profile) => graduationEvidence(profile, asOf))
    .filter((item): item is GraduationEvidence => !!item);
  return evidence.length &&
    new Set(evidence.map((item) => item.year)).size === 1
    ? evidence[0]
    : null;
}

export function preserveGraduationYear(
  saved: string | null,
  incoming: string | null,
): string | null {
  return saved &&
    /^\d{4}$/.test(saved) &&
    (!incoming || isSchoolLabel(incoming))
    ? saved
    : incoming;
}
