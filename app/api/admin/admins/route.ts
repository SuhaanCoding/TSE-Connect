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
    .from("admins")
    .select("*")
    .order("created_at");

  if (error) {
    console.error("Admin management error:", error.message);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(trimmedEmail)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();
  const { error } = await serviceClient
    .from("admins")
    .insert({ email: trimmedEmail });

  if (error) {
    console.error("Admin management error:", error.message);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { email } = await request.json();

  if (email === user.email) {
    return NextResponse.json({ error: "Cannot remove yourself as admin" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();
  const { error } = await serviceClient
    .from("admins")
    .delete()
    .eq("email", email);

  if (error) {
    console.error("Admin management error:", error.message);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
