import { cache } from "react";
import { createClient } from "./server";
import { createServiceClient } from "./server";

// Request-level cache — shared across all components in the same render
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

export const getCachedAlumniProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("alumni")
    .select("*")
    .eq("auth_id", userId)
    .maybeSingle();
  return data;
});

export const getCachedIsAdmin = cache(async (email: string) => {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("admins")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return !!data;
});
