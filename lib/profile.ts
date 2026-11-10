export const MAX_KEYWORDS = 10;
export const MAX_KEYWORD_LENGTH = 40;
export const MAX_BIO_LENGTH = 1000;

export function keywordsFromText(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(",")
    .map((word) => word.trim())
    .filter((word) => {
      const key = word.toLowerCase();
      if (!word || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function validateKeywords(value: unknown): string | null {
  if (!Array.isArray(value) || value.some((word) => typeof word !== "string")) {
    return "Keywords must be a list of text values.";
  }
  if (value.length > MAX_KEYWORDS) return `Add up to ${MAX_KEYWORDS} keywords.`;
  if (
    value.some(
      (word: string) =>
        !word.trim() ||
        word.includes(",") ||
        word.trim().length > MAX_KEYWORD_LENGTH,
    )
  ) {
    return `Each keyword must be 1–${MAX_KEYWORD_LENGTH} characters, without commas.`;
  }
  return null;
}

// Company history is owned by the LinkedIn scraper, never by member requests.
export function memberProfileUpdate(
  body: Record<string, unknown>,
):
  | { data: Record<string, unknown>; error?: never }
  | { error: string; data?: never } {
  if (typeof body.full_name !== "string" || !body.full_name.trim()) {
    return { error: "Full name is required." };
  }
  const data: Record<string, unknown> = { full_name: body.full_name.trim() };
  for (const field of [
    "graduation_year",
    "current_role",
    "linkedin_url",
    "contact_email",
    "bio",
  ]) {
    if (body[field] === undefined) continue;
    if (body[field] !== null && typeof body[field] !== "string") {
      return { error: `${field.replaceAll("_", " ")} must be text.` };
    }
    data[field] =
      typeof body[field] === "string" ? body[field].trim() || null : null;
  }
  if (typeof data.bio === "string" && data.bio.length > MAX_BIO_LENGTH) {
    return { error: `Keep your bio within ${MAX_BIO_LENGTH} characters.` };
  }
  for (const [field, values] of Object.entries({
    opt_status: ["opted_in", "opted_out", "not_confirmed"],
    preferred_contact: ["linkedin", "email", "both"],
  })) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string" || !values.includes(body[field])) {
      return { error: `Invalid ${field.replaceAll("_", " ")}.` };
    }
    data[field] = body[field];
  }
  if (body.keywords !== undefined) {
    const error = validateKeywords(body.keywords);
    if (error) return { error };
    data.keywords = keywordsFromText((body.keywords as string[]).join(","));
  }
  return { data };
}
