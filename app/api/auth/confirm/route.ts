import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isUcsdEmail } from "@/lib/utils";

export async function POST(request: Request) {
  const { access_token, refresh_token } = await request.json();

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: "Missing tokens" }, { status: 400 });
  }

  const supabase = await createClient();

  // Set the session from the magic link tokens
  const {
    data: { user },
    error,
  } = await supabase.auth.setSession({ access_token, refresh_token });

  if (error || !user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // Block UCSD emails
  if (isUcsdEmail(user.email ?? "")) {
    await supabase.auth.signOut();
    return NextResponse.json({ redirectTo: "/?error=ucsd_email" });
  }

  // Check if user has a linked alumni record (same logic as OAuth callback)
  try {
    const serviceClient = await createServiceClient();
    const { data: existing, error: queryError } = await serviceClient
      .from("alumni")
      .select("id, opt_status")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (queryError) {
      return NextResponse.json({ redirectTo: "/onboarding" });
    }

    if (existing?.opt_status && existing.opt_status !== "not_confirmed") {
      return NextResponse.json({ redirectTo: "/directory" });
    }

    return NextResponse.json({ redirectTo: "/onboarding" });
  } catch {
    return NextResponse.json({ redirectTo: "/onboarding" });
  }
}
