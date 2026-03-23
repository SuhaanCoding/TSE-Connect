import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { alumni_id } = await request.json();

  if (!alumni_id) {
    return NextResponse.json({ error: "alumni_id is required" }, { status: 400 });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(alumni_id)) {
    return NextResponse.json({ error: "Invalid alumni_id format" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  // Check if the target profile is unclaimed
  const { data: target } = await serviceClient
    .from("alumni")
    .select("*")
    .eq("id", alumni_id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (target.auth_id && target.auth_id !== user.id) {
    return NextResponse.json(
      { error: "This profile has already been claimed by someone else" },
      { status: 409 }
    );
  }

  // If user already claimed a DIFFERENT profile, unclaim it first
  const { data: existingClaim } = await serviceClient
    .from("alumni")
    .select("id")
    .eq("auth_id", user.id)
    .neq("id", alumni_id)
    .maybeSingle();

  if (existingClaim) {
    await serviceClient
      .from("alumni")
      .update({
        auth_id: null,
        login_email: null,
        avatar_url: null,
        opt_status: "not_confirmed",
      })
      .eq("id", existingClaim.id);
  }

  // Claim the profile
  const { data: updated, error } = await serviceClient
    .from("alumni")
    .update({
      auth_id: user.id,
      login_email: user.email,
    })
    .eq("id", alumni_id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: updated });
}
