import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import {
  startScrapeRun,
  getRunStatus,
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
 * Body: { test?: boolean } — if test is true, only scrape 5 random profiles.
 */
export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let test = false;
  try {
    const body = await request.json();
    test = !!body.test;
  } catch {
    // No body is fine — defaults to full scrape
  }

  const serviceClient = await createServiceClient();

  // Fetch all alumni with LinkedIn URLs
  const { data: alumniWithLinkedin, error: fetchError } = await serviceClient
    .from("alumni")
    .select("id, full_name, linkedin_url")
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

  // Test mode: scrape specific test profiles
  let finalUrls = urls;
  if (test) {
    const testNames = ["benjamin johnson", "eshaan sharma"];
    const testUrls = (alumniWithLinkedin || [])
      .filter((a) => {
        const name = a.full_name?.toLowerCase() || "";
        return testNames.some((t) => name.includes(t));
      })
      .map((a) => a.linkedin_url!.trim())
      .filter(Boolean);
    finalUrls = testUrls.length > 0 ? testUrls : urls.slice(0, 2);
  }

  const trigger = test ? "manual_test" : "manual";

  try {
    const { runId, datasetId } = await startScrapeRun(finalUrls);

    // Insert scrape_runs record
    const { data: scrapeRun, error: insertError } = await serviceClient
      .from("scrape_runs")
      .insert({
        status: "running",
        trigger,
        apify_run_id: runId,
        apify_dataset_id: datasetId,
        profile_count: finalUrls.length,
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
      profileCount: finalUrls.length,
      scrapeRunId: scrapeRun?.id || null,
      test,
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
 * GET /api/admin/scrape — Get scrape run history.
 * Also catches up any "running" runs by checking Apify's actual status.
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

  // Catch-up: check any "running" runs against Apify's actual status
  const runningRuns = (runs || []).filter(
    (r) => r.status === "running" && r.apify_run_id
  );

  for (const run of runningRuns) {
    try {
      const { status: apifyStatus } = await getRunStatus(run.apify_run_id);

      if (apifyStatus === "SUCCEEDED" && run.apify_dataset_id) {
        // Apify finished — process results now
        try {
          await processApifyResults(run.apify_dataset_id, run.id);
          // Re-fetch the updated run
          const { data: updated } = await serviceClient
            .from("scrape_runs")
            .select("*")
            .eq("id", run.id)
            .single();
          if (updated) {
            const idx = runs!.findIndex((r) => r.id === run.id);
            if (idx !== -1) runs![idx] = updated;
          }
        } catch (err) {
          console.error(`Catch-up processing failed for run ${run.id}:`, err);
        }
      } else if (
        apifyStatus === "FAILED" ||
        apifyStatus === "ABORTED" ||
        apifyStatus === "TIMED-OUT"
      ) {
        // Mark as failed
        await serviceClient
          .from("scrape_runs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: `Apify run ${apifyStatus}`,
          })
          .eq("id", run.id);

        const idx = runs!.findIndex((r) => r.id === run.id);
        if (idx !== -1) {
          runs![idx] = { ...runs![idx], status: "failed", error_message: `Apify run ${apifyStatus}` };
        }
      }
      // If still RUNNING/READY on Apify's side, leave as-is
    } catch (err) {
      console.error(`Failed to check Apify status for run ${run.apify_run_id}:`, err);
    }
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
