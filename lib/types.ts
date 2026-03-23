export type OptStatus = "opted_in" | "opted_out" | "not_confirmed";

export type ContactPreference = "linkedin" | "email" | "both";

export interface Alumni {
  id: string;
  created_at: string;
  updated_at: string;
  full_name: string;
  contact_email: string | null;
  login_email: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  graduation_year: string | null;
  tse_role: string | null;
  current_role: string | null;
  current_company: string | null;
  past_companies: string[];
  opt_status: OptStatus;
  preferred_contact: ContactPreference;
  auth_id: string | null;
}

export interface AlumniFilters {
  query: string;
  graduation_years: string[];
  companies: string[];
  company_match: "all" | "current" | "past";
  opt_status: string | null;
}

export type OnboardingStep = 1 | 2 | 3 | 4;


export const GRADUATION_YEARS = [
  "Currently in school",
  ...Array.from({ length: 10 }, (_, i) => String(2026 - i)),
] as const;
