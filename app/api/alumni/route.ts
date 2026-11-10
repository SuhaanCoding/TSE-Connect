import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUcsdEmail } from "@/lib/utils";
import { directoryCorpus } from "@/lib/directory";
import { searchProfiles } from "@/lib/profile-matching";
import { memberProfileUpdate } from "@/lib/profile";

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
  const q = (searchParams.get("q") || "").trim().slice(0, 200);
  const years = searchParams.get("years") || "";
  const companies = searchParams.get("companies") || "";
  const companyMatch = searchParams.get("company_match") || "all"; // "all" | "current" | "past"
  const optStatuses = searchParams.get("opt_statuses") || "";
  const optStatusList = optStatuses
    ? optStatuses
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "24", 10) || 24, 1),
    100,
  );

  const companyList = companies
    ? companies
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : [];
  const yearList = years
    ? years
        .split(",")
        .map((y) => y.trim())
        .filter(Boolean)
    : [];

  let data: Record<string, unknown>[] | null = null;
  let count: number | null = null;
  let error: { message: string } | null = null;

  if (q) {
    const corpus = await directoryCorpus(supabase);
    const rpcData = searchProfiles(q, corpus.data);
    const rpcError = corpus.error;

    if (rpcError) {
      error = rpcError;
    } else {
      // Apply additional filters in JS since RPC returns all matches
      let filtered = rpcData || [];

      if (yearList.length > 0) {
        filtered = filtered.filter((a) =>
          yearList.includes(a.graduation_year as string),
        );
      }
      if (companyList.length > 0) {
        filtered = filtered.filter((a) => {
          if (companyMatch === "current") {
            return companyList.some((c) =>
              (a.current_company as string)
                ?.toLowerCase()
                .includes(c.toLowerCase()),
            );
          } else if (companyMatch === "past") {
            return companyList.some((c) =>
              ((a.past_companies as string[]) || []).some((pc) =>
                pc.toLowerCase().includes(c.toLowerCase()),
              ),
            );
          } else {
            return companyList.some(
              (c) =>
                (a.current_company as string)
                  ?.toLowerCase()
                  .includes(c.toLowerCase()) ||
                ((a.past_companies as string[]) || []).some((pc) =>
                  pc.toLowerCase().includes(c.toLowerCase()),
                ),
            );
          }
        });
      } else if (companyMatch === "current") {
        filtered = filtered.filter((a) => a.current_company);
      } else if (companyMatch === "past") {
        filtered = filtered.filter(
          (a) => ((a.past_companies as string[]) || []).length > 0,
        );
      }

      if (optStatusList.length > 0) {
        filtered = filtered.filter((a) =>
          optStatusList.includes(a.opt_status as string),
        );
      }

      if (companyList.length > 0) {
        filtered.sort((a, b) => {
          const current = (row: typeof a) =>
            companyList.some((company) =>
              row.current_company
                ?.toLowerCase()
                .includes(company.toLowerCase()),
            );
          return (
            Number(current(b)) - Number(current(a)) ||
            b.match_score - a.match_score
          );
        });
      }
      count = filtered.length;
      const from = (page - 1) * limit;
      data = filtered
        .slice(from, from + limit)
        .map((profile) => ({ ...profile }));
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
        const conditions = companyList.map(
          (c) => `current_company.ilike.%${escapeIlike(c)}%`,
        );
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

    if (optStatusList.length === 1) {
      query = query.eq("opt_status", optStatusList[0]);
    } else if (optStatusList.length > 1) {
      query = query.in("opt_status", optStatusList);
    }

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const result = await query;
    data = result.data;
    count = result.count;
    error = result.error;
  }

  if (error) {
    console.error("Alumni search error:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch alumni" },
      { status: 500 },
    );
  }

  // Determine the search terms to annotate match_type against
  // Use company filter if active, otherwise use the text search query
  const matchTerms = companyList.length > 0 ? companyList : q ? [q] : [];

  // Annotate match_type + sanitize contact info
  const processed = (data || []).map((alumni: Record<string, unknown>) => {
    let match_type: "current" | "past" | null = null;
    const currentCompany = alumni.current_company as string | null;
    const pastCompanies = Array.isArray(alumni.past_companies)
      ? (alumni.past_companies as string[])
      : [];

    if (matchTerms.length > 0) {
      const currentMatch = matchTerms.some((t) =>
        currentCompany?.toLowerCase().includes(t.toLowerCase()),
      );
      const pastMatch = matchTerms.some((t) =>
        pastCompanies.some((pc) => pc.toLowerCase().includes(t.toLowerCase())),
      );

      if (currentMatch) match_type = "current";
      else if (pastMatch) match_type = "past";
    }

    const result: Record<string, unknown> = { ...alumni, match_type };

    // Strip internal metadata from public responses
    delete result.last_scraped_at;
    result.login_email = null;
    result.auth_id = null;
    // Shared terms are explanations for personal recommendations, not search matches.
    delete result.shared_terms;

    if (!viewerOptedIn) {
      // Opted-out viewers: see names + companies only, no contact info at all
      result.contact_email = null;
      result.linkedin_url = null;
      result.preferred_contact = "linkedin";
    } else {
      // Opted-in viewers: see LinkedIn for everyone, but email only for other opted-in alumni
      if (alumni.opt_status !== "opted_in") {
        result.contact_email = null;
        result.preferred_contact = "linkedin";
      }
    }

    return result;
  });

  // Sort: current employees first when company/search filter is active
  if (matchTerms.length > 0) {
    processed.sort((a, b) => {
      if (
        companyList.length &&
        a.match_type === "current" &&
        b.match_type !== "current"
      )
        return -1;
      if (
        companyList.length &&
        a.match_type !== "current" &&
        b.match_type === "current"
      )
        return 1;
      const relevance = Number(b.match_score || 0) - Number(a.match_score || 0);
      if (q && relevance) return relevance;
      return String(a.full_name || "").localeCompare(String(b.full_name || ""));
    });
  }

  return NextResponse.json({
    data: processed,
    count,
    viewerOptedIn,
    matchTerms,
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Invalid body");
  } catch {
    return NextResponse.json(
      { error: "Expected a profile object." },
      { status: 400 },
    );
  }

  const parsed = memberProfileUpdate(body);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const updateData = parsed.data!;
  if (
    typeof updateData.contact_email === "string" &&
    isUcsdEmail(updateData.contact_email)
  ) {
    return NextResponse.json(
      {
        error:
          "UCSD emails expire after graduation. Please use a personal email.",
      },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("alumni")
    .update(updateData)
    .eq("auth_id", user.id);

  if (error) {
    console.error("Alumni update error:", error.message);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
