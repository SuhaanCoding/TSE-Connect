import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        try {
          const serviceClient = await createServiceClient();

          // Check if user already has a linked alumni record
          const { data: existing, error: queryError } = await serviceClient
            .from("alumni")
            .select("id, opt_status")
            .eq("auth_id", user.id)
            .maybeSingle();

          if (queryError) {
            console.error("Auth callback query error:", queryError.message);
            // On any DB error, send to onboarding as safe fallback
            return NextResponse.redirect(`${origin}/onboarding`);
          }

          if (existing) {
            // Returning user — check if onboarding is complete
            if (existing.opt_status && existing.opt_status !== "not_confirmed") {
              return NextResponse.redirect(`${origin}/directory`);
            }
            // Onboarding incomplete — send them back
            return NextResponse.redirect(`${origin}/onboarding`);
          }

          // No linked record — send to onboarding for identity matching
          return NextResponse.redirect(`${origin}/onboarding`);
        } catch (err) {
          console.error("Auth callback error:", err);
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
