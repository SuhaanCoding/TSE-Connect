import { createServiceClient } from "@/lib/supabase/server";

export async function isAdmin(email: string): Promise<boolean> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("admins")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  return !!data;
}
