import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;
  const admin = await isAdmin(user.email);
  if (!admin) return null;
  return user;
}

// Assign auth_id to an alumni profile
export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { alumni_id, login_email } = await request.json();

  if (!alumni_id) {
    return NextResponse.json({ error: "alumni_id is required" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  // If login_email provided, find the auth user
  if (login_email) {
    // Look up the auth user by email from the alumni table
    const { data: authAlumni } = await serviceClient
      .from("alumni")
      .select("auth_id, login_email")
      .eq("login_email", login_email)
      .maybeSingle();

    if (authAlumni?.auth_id) {
      // Unclaim from old profile
      await serviceClient
        .from("alumni")
        .update({ auth_id: null, login_email: null })
        .eq("login_email", login_email);

      // Assign to new profile
      const { error } = await serviceClient
        .from("alumni")
        .update({ auth_id: authAlumni.auth_id, login_email })
        .eq("id", alumni_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true });
}

// Unassign auth_id from an alumni profile
export async function DELETE(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { alumni_id } = await request.json();

  if (!alumni_id) {
    return NextResponse.json({ error: "alumni_id is required" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();
  const { error } = await serviceClient
    .from("alumni")
    .update({
      auth_id: null,
      login_email: null,
      avatar_url: null,
      opt_status: "not_confirmed",
    })
    .eq("id", alumni_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
