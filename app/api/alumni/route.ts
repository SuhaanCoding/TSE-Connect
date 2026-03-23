import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeBackToSheets } from "@/lib/sheets";

// Escape ILIKE wildcards in user input
function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, "\\$&");
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch viewer's own opt_status
  const { data: viewer } = await supabase
    .from("alumni")
    .select("opt_status")
    .eq("auth_id", user.id)
    .maybeSingle();

  const viewerOptedIn = viewer?.opt_status === "opted_in";

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const years = searchParams.get("years") || "";
  const companies = searchParams.get("companies") || "";
  const companyMatch = searchParams.get("company_match") || "all"; // "all" | "current" | "past"
  const optStatus = searchParams.get("opt_status") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "24", 10);

  const companyList = companies
    ? companies.split(",").map((c) => c.trim()).filter(Boolean)
    : [];
  const yearList = years
    ? years.split(",").map((y) => y.trim()).filter(Boolean)
    : [];

  let data: Record<string, unknown>[] | null = null;
  let count: number | null = null;
  let error: { message: string } | null = null;

  if (q) {
    // Use RPC function for full-text search (includes past_companies)
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "search_alumni",
      { search_query: q }
    );

    if (rpcError) {
      // Fallback to basic query if RPC doesn't exist yet
      const fallback = await supabase
        .from("alumni")
        .select("*", { count: "exact" })
        .or(
          `full_name.ilike.%${escapeIlike(q)}%,current_company.ilike.%${escapeIlike(q)}%,current_role.ilike.%${escapeIlike(q)}%`
        )
        .order("full_name");

      data = fallback.data;
      count = fallback.count;
      error = fallback.error;
    } else {
      // Apply additional filters in JS since RPC returns all matches
      let filtered = rpcData || [];

      if (yearList.length > 0) {
        filtered = filtered.filter((a: Record<string, unknown>) =>
          yearList.includes(a.graduation_year as string)
        );
      }
      if (companyList.length > 0) {
        filtered = filtered.filter((a: Record<string, unknown>) => {
          if (companyMatch === "current") {
            return companyList.some((c) =>
              (a.current_company as string)?.toLowerCase().includes(c.toLowerCase())
            );
          } else if (companyMatch === "past") {
            return companyList.some((c) =>
              ((a.past_companies as string[]) || []).some((pc) =>
                pc.toLowerCase().includes(c.toLowerCase())
              )
            );
          } else {
            return companyList.some(
              (c) =>
                (a.current_company as string)?.toLowerCase().includes(c.toLowerCase()) ||
                ((a.past_companies as string[]) || []).some((pc) =>
                  pc.toLowerCase().includes(c.toLowerCase())
                )
            );
          }
        });
      } else if (companyMatch === "current") {
        filtered = filtered.filter((a: Record<string, unknown>) => a.current_company);
      } else if (companyMatch === "past") {
        filtered = filtered.filter(
          (a: Record<string, unknown>) =>
            ((a.past_companies as string[]) || []).length > 0
        );
      }

      if (optStatus) {
        filtered = filtered.filter((a: Record<string, unknown>) => a.opt_status === optStatus);
      }

      count = filtered.length;
      const from = (page - 1) * limit;
      data = filtered.slice(from, from + limit);
      error = null;
    }
  } else {
    // No text search — use standard PostgREST query
    let query = supabase
      .from("alumni")
      .select("*", { count: "exact" })
      .order("full_name");

    if (yearList.length === 1) {
      query = query.eq("graduation_year", yearList[0]);
    } else if (yearList.length > 1) {
      query = query.in("graduation_year", yearList);
    }

    if (companyList.length > 0) {
      if (companyMatch === "current") {
        const conditions = companyList.map((c) => `current_company.ilike.%${escapeIlike(c)}%`);
        query = query.or(conditions.join(","));
      } else if (companyMatch === "past") {
        const conditions = companyList.map((c) => `past_companies.cs.{"${c}"}`);
        query = query.or(conditions.join(","));
      } else {
        const conditions = companyList.flatMap((c) => [
          `current_company.ilike.%${escapeIlike(c)}%`,
          `past_companies.cs.{"${c}"}`,
        ]);
        query = query.or(conditions.join(","));
      }
    } else if (companyMatch === "current") {
      query = query.not("current_company", "is", null);
    } else if (companyMatch === "past") {
      query = query.not("past_companies", "eq", "{}");
    }


    if (optStatus) query = query.eq("opt_status", optStatus);

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const result = await query;
    data = result.data;
    count = result.count;
    error = result.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Determine the search terms to annotate match_type against
  // Use company filter if active, otherwise use the text search query
  const matchTerms = companyList.length > 0 ? companyList : q ? [q] : [];

  // Annotate match_type + sanitize contact info
  const processed = (data || []).map((alumni: Record<string, unknown>) => {
    let match_type: "current" | "past" | null = null;
    const currentCompany = alumni.current_company as string | null;
    const pastCompanies = Array.isArray(alumni.past_companies) ? alumni.past_companies as string[] : [];

    if (matchTerms.length > 0) {
      const currentMatch = matchTerms.some(
        (t) => currentCompany?.toLowerCase().includes(t.toLowerCase())
      );
      const pastMatch = matchTerms.some((t) =>
        pastCompanies.some((pc) => pc.toLowerCase().includes(t.toLowerCase()))
      );

      if (currentMatch) match_type = "current";
      else if (pastMatch) match_type = "past";
    }

    const result: Record<string, unknown> = { ...alumni, match_type };

    if (!viewerOptedIn) {
      result.contact_email = null;
      result.preferred_contact = "linkedin";
    }

    return result;
  });

  // Sort: current employees first when company/search filter is active
  if (matchTerms.length > 0) {
    processed.sort((a, b) => {
      if (a.match_type === "current" && b.match_type !== "current") return -1;
      if (a.match_type !== "current" && b.match_type === "current") return 1;
      return String(a.full_name || "").localeCompare(String(b.full_name || ""));
    });
  }

  return NextResponse.json({ data: processed, count, viewerOptedIn, matchTerms });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Validate required fields
  if (!body.full_name || typeof body.full_name !== "string" || !body.full_name.trim()) {
    return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  }

  // Validate enums
  const validOptStatus = ["opted_in", "opted_out", "not_confirmed"];
  const validContact = ["linkedin", "email", "both"];
  if (body.opt_status && !validOptStatus.includes(body.opt_status)) {
    return NextResponse.json({ error: "Invalid opt_status" }, { status: 400 });
  }
  if (body.preferred_contact && !validContact.includes(body.preferred_contact)) {
    return NextResponse.json({ error: "Invalid preferred_contact" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    full_name: body.full_name.trim(),
    graduation_year: body.graduation_year?.trim() || null,
    current_role: body.current_role?.trim() || null,
    current_company: body.current_company?.trim() || null,
    linkedin_url: body.linkedin_url?.trim() || null,
    contact_email: body.contact_email?.trim() || null,
    preferred_contact: body.preferred_contact || "linkedin",
    opt_status: body.opt_status || "not_confirmed",
  };

  const { error } = await supabase
    .from("alumni")
    .update(updateData)
    .eq("auth_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  writeBackToSheets({
    full_name: body.full_name,
    graduation_year: body.graduation_year,
    current_role: body.current_role,
    current_company: body.current_company,
    past_companies: body.past_companies,
  }).catch((err) => console.error("Sheets write-back failed:", err));

  return NextResponse.json({ success: true });
}
