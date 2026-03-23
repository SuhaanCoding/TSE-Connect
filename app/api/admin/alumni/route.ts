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

export async function GET() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const serviceClient = await createServiceClient();
  const { data, error } = await serviceClient
    .from("alumni")
    .select("*")
    .order("full_name");

  if (error) {
    console.error("Admin alumni list error:", error.message);
    return NextResponse.json({ error: "Failed to fetch alumni" }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PUT(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Whitelist allowed fields — prevent auth_id/login_email hijacking
  const ALLOWED_FIELDS = [
    "full_name", "graduation_year", "current_role", "current_company",
    "past_companies", "linkedin_url", "contact_email", "preferred_contact",
    "opt_status", "tse_role", "avatar_url",
  ];
  const VALID_OPT_STATUS = ["opted_in", "opted_out", "not_confirmed"];
  const VALID_CONTACT = ["linkedin", "email", "both"];

  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // Validate enum fields
  if (updates.opt_status && !VALID_OPT_STATUS.includes(updates.opt_status as string)) {
    return NextResponse.json({ error: "Invalid opt_status" }, { status: 400 });
  }
  if (updates.preferred_contact && !VALID_CONTACT.includes(updates.preferred_contact as string)) {
    return NextResponse.json({ error: "Invalid preferred_contact" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();
  const { error } = await serviceClient
    .from("alumni")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Admin alumni update error:", error.message);
    return NextResponse.json({ error: "Failed to update alumni" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();
  const { error } = await serviceClient
    .from("alumni")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Admin alumni delete error:", error.message);
    return NextResponse.json({ error: "Failed to delete alumni" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
