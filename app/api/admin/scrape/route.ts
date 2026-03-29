import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import {
  startScrapeRun,
  normalizeLinkedInUrl,
  registerWebhook,
} from "@/lib/apify";
import { processApifyResults } from "@/lib/scrape";

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

function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * POST /api/admin/scrape — Start an Apify LinkedIn scrape run.
 * Creates a scrape_runs record and registers an Apify webhook for auto-processing.
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

  // Deduplicate URLs
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

    // Insert scrape_runs record
    const { data: scrapeRun, error: insertError } = await serviceClient
      .from("scrape_runs")
      .insert({
        status: "running",
        trigger: "manual",
        apify_run_id: runId,
        apify_dataset_id: datasetId,
        profile_count: urls.length,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert scrape_runs:", insertError.message);
    }

    // Register Apify webhook for auto-processing
    const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
    if (webhookSecret && scrapeRun) {
      const appUrl = getAppUrl();
      await registerWebhook(
        runId,
        `${appUrl}/api/admin/scrape/webhook`,
        webhookSecret
      );
    }

    return NextResponse.json({
      runId,
      datasetId,
      profileCount: urls.length,
      scrapeRunId: scrapeRun?.id || null,
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
 * GET /api/admin/scrape — Get scrape run history, or check a specific run.
 * Query params:
 *   ?runId=xxx — check specific run status from scrape_runs table
 *   (no params) — return recent scrape run history
 */
export async function GET(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const serviceClient = await createServiceClient();
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (runId) {
    // Check specific run
    const { data, error } = await serviceClient
      .from("scrape_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  }

  // Return recent history
  const { data: runs, error } = await serviceClient
    .from("scrape_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Failed to fetch scrape runs:", error.message);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }

  return NextResponse.json({ runs: runs || [] });
}

/**
 * PUT /api/admin/scrape — Manual fallback to process results.
 * Body: { datasetId, scrapeRunId? }
 */
export async function PUT(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { datasetId, scrapeRunId } = body;

  if (!datasetId) {
    return NextResponse.json(
      { error: "datasetId is required" },
      { status: 400 }
    );
  }

  // If no scrapeRunId provided, create one for tracking
  let runId = scrapeRunId;
  if (!runId) {
    const serviceClient = await createServiceClient();
    const { data } = await serviceClient
      .from("scrape_runs")
      .insert({
        status: "running",
        trigger: "manual",
        apify_dataset_id: datasetId,
      })
      .select("id")
      .single();
    runId = data?.id;
  }

  try {
    const result = await processApifyResults(datasetId, runId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Process results error:", message);
    return NextResponse.json(
      { error: "Failed to process results" },
      { status: 500 }
    );
  }
}
