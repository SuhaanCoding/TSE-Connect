import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  startScrapeRun,
  normalizeLinkedInUrl,
  registerWebhook,
} from "@/lib/apify";

function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * POST /api/admin/scrape/scheduled — Called by pg_cron monthly.
 * Authenticated via x-scrape-secret header (no user session).
 * Starts an Apify run and registers a webhook for auto-processing.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-scrape-secret");
  const expectedSecret = process.env.SYNC_SECRET_KEY;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const serviceClient = await createServiceClient();

  // Check if there's already a running scrape
  const { data: activeRun } = await serviceClient
    .from("scrape_runs")
    .select("id")
    .eq("status", "running")
    .maybeSingle();

  if (activeRun) {
    return NextResponse.json(
      { message: "A scrape is already running", runId: activeRun.id },
      { status: 409 }
    );
  }

  // Fetch all alumni with LinkedIn URLs
  const { data: alumniWithLinkedin, error: fetchError } = await serviceClient
    .from("alumni")
    .select("id, linkedin_url")
    .not("linkedin_url", "is", null);

  if (fetchError) {
    console.error("Scheduled scrape: failed to fetch alumni:", fetchError.message);
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
    return NextResponse.json({ message: "No alumni with LinkedIn URLs" });
  }

  try {
    const { runId, datasetId } = await startScrapeRun(urls);

    // Insert scrape_runs record
    const { data: scrapeRun } = await serviceClient
      .from("scrape_runs")
      .insert({
        status: "running",
        trigger: "scheduled",
        apify_run_id: runId,
        apify_dataset_id: datasetId,
        profile_count: urls.length,
      })
      .select("id")
      .single();

    // Register webhook for auto-processing
    const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
    if (webhookSecret && scrapeRun) {
      const appUrl = getAppUrl();
      await registerWebhook(
        runId,
        `${appUrl}/api/admin/scrape/webhook`,
        webhookSecret
      );
    }

    console.log(`Scheduled scrape started: ${urls.length} profiles, run ${runId}`);

    return NextResponse.json({
      message: "Scheduled scrape started",
      runId,
      profileCount: urls.length,
      scrapeRunId: scrapeRun?.id || null,
    });
  } catch (err) {
    console.error("Scheduled scrape start error:", err);
    return NextResponse.json(
      { error: "Failed to start scrape" },
      { status: 502 }
    );
  }
}
