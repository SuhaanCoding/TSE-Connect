import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processApifyResults } from "@/lib/scrape";

/**
 * POST /api/admin/scrape/webhook — Called by Apify when a scrape run finishes.
 * Verifies the shared secret, then processes results into the alumni table.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("APIFY_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let payload: { runId?: string; datasetId?: string; status?: string; secret?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify secret
  if (payload.secret !== webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { runId, datasetId, status } = payload;

  if (!runId || !datasetId) {
    return NextResponse.json({ error: "Missing runId or datasetId" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  // Find the scrape_runs row
  const { data: scrapeRun } = await serviceClient
    .from("scrape_runs")
    .select("id, status")
    .eq("apify_run_id", runId)
    .maybeSingle();

  if (!scrapeRun) {
    console.error(`Webhook received for unknown run: ${runId}`);
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Already processed
  if (scrapeRun.status === "completed") {
    return NextResponse.json({ message: "Already processed" });
  }

  // Handle non-success statuses
  if (status !== "SUCCEEDED") {
    await serviceClient
      .from("scrape_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: `Apify run ended with status: ${status}`,
      })
      .eq("id", scrapeRun.id);

    console.error(`Scrape run ${runId} failed with status: ${status}`);
    return NextResponse.json({ message: `Run failed: ${status}` });
  }

  // Process results
  try {
    const result = await processApifyResults(datasetId, scrapeRun.id);
    console.log(`Webhook processed scrape run ${runId}: updated ${result.updated} alumni`);
    return NextResponse.json({ message: "Processed", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook processing failed for run ${runId}:`, message);

    await serviceClient
      .from("scrape_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", scrapeRun.id);

    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
