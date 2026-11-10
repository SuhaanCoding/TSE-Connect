import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alumni } from "./types";

export async function directoryCorpus(supabase: SupabaseClient) {
  const rows: Alumni[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await supabase
      .from("alumni")
      .select("*")
      .order("full_name")
      .range(offset, offset + size - 1);
    if (error) return { data: [] as Alumni[], error };
    rows.push(...(data || []));
    if (!data || data.length < size) return { data: rows, error: null };
  }
}

export function publicDirectoryProfile<T extends Alumni>(
  profile: T,
  viewerOptedIn: boolean,
): T {
  return {
    ...profile,
    login_email: null,
    auth_id: null,
    last_scraped_at: null,
    contact_email:
      viewerOptedIn && profile.opt_status === "opted_in"
        ? profile.contact_email
        : null,
    linkedin_url: viewerOptedIn ? profile.linkedin_url : null,
    preferred_contact:
      viewerOptedIn && profile.opt_status === "opted_in"
        ? profile.preferred_contact
        : "linkedin",
  };
}
