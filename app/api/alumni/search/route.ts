import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";

  let query = supabase
    .from("alumni")
    .select("id, full_name, graduation_year, current_company, current_role, auth_id")
    .is("auth_id", null)
    .order("full_name");

  if (q.trim()) {
    query = query.ilike("full_name", `%${q}%`).limit(100);
  } else {
    query = query.limit(500);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Strip auth_id from response — only return public info
  const results = (data || []).map(({ auth_id: _, ...rest }) => rest);

  return NextResponse.json({ data: results });
}
