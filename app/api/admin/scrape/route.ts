import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import {
  startScrapeRun,
  getRunStatus,
  getRunResults,
  normalizeLinkedInUrl,
  extractProfileUrl,
} from "@/lib/apify";
import type { ScrapeResult } from "@/lib/types";

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

/**
 * POST /api/admin/scrape — Start an Apify LinkedIn scrape run.
 * Reads all LinkedIn URLs from Supabase, sends them to Apify.
 */
export async function POST() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const serviceClient = await createServiceClient();

  // Fetch all alumni with LinkedIn URLs
  const { data: alumniWithLinkedin, error: fetchError } = await serviceClient
    .from("alumni")
    .select("id, linkedin_url")
    .not("linkedin_url", "is", null);

  if (fetchError) {
    console.error("Failed to fetch alumni for scrape:", fetchError.message);
    return NextResponse.json(
      { error: "Failed to fetch alumni data" },
      { status: 500 }
    );
  }

  // Deduplicate URLs (different alumni might have same URL due to data issues)
  const urlSet = new Set<string>();
  const urls: string[] = [];
  for (const a of alumniWithLinkedin || []) {
    if (!a.linkedin_url) continue;
    const normalized = normalizeLinkedInUrl(a.linkedin_url);
    if (!urlSet.has(normalized)) {
      urlSet.add(normalized);
      urls.push(a.linkedin_url.trim());
    }
  }

  if (urls.length === 0) {
    return NextResponse.json(
      { error: "No alumni with LinkedIn URLs found" },
      { status: 400 }
    );
  }

  try {
    const { runId, datasetId } = await startScrapeRun(urls);
    return NextResponse.json({
      runId,
      datasetId,
      profileCount: urls.length,
    });
  } catch (err) {
    console.error("Apify start error:", err);
    return NextResponse.json(
      { error: "Failed to start Apify scrape" },
      { status: 502 }
    );
  }
}

/**
 * GET /api/admin/scrape?runId=xxx — Check status of an Apify run.
 */
export async function GET(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const { status, datasetId } = await getRunStatus(runId);
    return NextResponse.json({ runId, status, datasetId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    console.error("Apify status check error:", err);
    return NextResponse.json(
      { error: "Failed to check scrape status" },
      { status: 502 }
    );
  }
}

/**
 * PUT /api/admin/scrape — Process completed Apify results and update Supabase.
 * Body: { datasetId }
 */
export async function PUT(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { datasetId } = body;

  if (!datasetId) {
    return NextResponse.json(
      { error: "datasetId is required" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();

  // Fetch Apify results
  let profiles;
  try {
    profiles = await getRunResults(datasetId);
  } catch (err) {
    console.error("Apify results fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch scrape results" },
      { status: 502 }
    );
  }

  // Fetch all alumni with LinkedIn URLs from Supabase
  const { data: allAlumni, error: fetchError } = await serviceClient
    .from("alumni")
    .select("id, linkedin_url, current_role, current_company, past_companies")
    .not("linkedin_url", "is", null);

  if (fetchError) {
    console.error("Failed to fetch alumni:", fetchError.message);
    return NextResponse.json(
      { error: "Failed to fetch alumni data" },
      { status: 500 }
    );
  }

  // Build lookup map: normalized LinkedIn URL → alumni record
  const urlToAlumni = new Map<
    string,
    { id: string; current_role: string | null; current_company: string | null; past_companies: string[] }
  >();
  for (const a of allAlumni || []) {
    if (!a.linkedin_url) continue;
    const normalized = normalizeLinkedInUrl(a.linkedin_url);
    urlToAlumni.set(normalized, {
      id: a.id,
      current_role: a.current_role,
      current_company: a.current_company,
      past_companies: a.past_companies || [],
    });
  }

  // Process each profile result
  const result: ScrapeResult = {
    matched: 0,
    updated: 0,
    skippedEmpty: 0,
    noMatch: 0,
    errors: 0,
  };

  const BATCH_SIZE = 50;
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const profile of profiles) {
    const profileUrl = extractProfileUrl(profile);
    if (!profileUrl) {
      result.noMatch++;
      continue;
    }

    const normalized = normalizeLinkedInUrl(profileUrl);
    const alumni = urlToAlumni.get(normalized);

    if (!alumni) {
      result.noMatch++;
      continue;
    }

    result.matched++;

    // Extract career data from experience
    const experience = profile.experience || [];
    const currentRole = experience[0]?.position?.trim() || "";
    const currentCompany = experience[0]?.companyName?.trim() || "";

    // Deduplicate past companies, excluding current company
    const seen = new Set<string>();
    if (currentCompany) seen.add(currentCompany.toLowerCase());
    const pastCompanies: string[] = [];
    for (let i = 1; i < experience.length; i++) {
      const company = experience[i]?.companyName?.trim();
      if (company && !seen.has(company.toLowerCase())) {
        seen.add(company.toLowerCase());
        pastCompanies.push(company);
      }
    }

    // Build update — only set fields that have real data (never overwrite with empty)
    const updateData: Record<string, unknown> = {
      last_scraped_at: new Date().toISOString(),
    };

    let hasCareerUpdate = false;

    if (currentRole && currentRole.toLowerCase() !== "none") {
      updateData.current_role = currentRole;
      hasCareerUpdate = true;
    }
    if (currentCompany && currentCompany.toLowerCase() !== "none") {
      updateData.current_company = currentCompany;
      hasCareerUpdate = true;
    }
    if (pastCompanies.length > 0) {
      updateData.past_companies = pastCompanies.slice(0, 20);
      hasCareerUpdate = true;
    }

    if (!hasCareerUpdate) {
      result.skippedEmpty++;
    }

    updates.push({ id: alumni.id, data: updateData });
  }

  // Batch update in groups of 50
  let errorCount = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(({ id, data }) =>
        serviceClient.from("alumni").update(data).eq("id", id)
      )
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].error) {
        errorCount++;
        if (errorCount <= 3) {
          console.error(
            `Scrape update failed for ${batch[j].id}:`,
            results[j].error!.message
          );
        }
      } else {
        result.updated++;
      }
    }
  }
  result.errors = errorCount;

  return NextResponse.json(result);
}
