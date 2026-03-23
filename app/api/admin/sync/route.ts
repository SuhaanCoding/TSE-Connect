import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdmin(user.email);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Derive origin from the current request URL (works in dev and prod)
  const { origin } = new URL(request.url);

  try {
    const res = await fetch(`${origin}/api/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SYNC_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Admin sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
