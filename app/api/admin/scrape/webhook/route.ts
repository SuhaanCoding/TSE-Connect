import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processApifyResults } from "@/lib/scrape";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!process.env.APIFY_WEBHOOK_SECRET)
    return NextResponse.json(
      { error: "Callback is not configured." },
      { status: 503 },
    );
  let payload: { runId?: string; datasetId?: string; secret?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const supplied = Buffer.from(
    typeof payload.secret === "string" ? payload.secret : "",
  );
  const expected = Buffer.from(process.env.APIFY_WEBHOOK_SECRET);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (
    !/^[a-z0-9]{17}$/i.test(payload.runId || "") ||
    !/^[a-z0-9]{17}$/i.test(payload.datasetId || "")
  )
    return NextResponse.json(
      { error: "Invalid run or dataset." },
      { status: 400 },
    );
  const db = await createServiceClient();
  const { data: run, error } = await db
    .from("scrape_runs")
    .select("id")
    .or(`apify_run_id.eq.${payload.runId},recovery_run_id.eq.${payload.runId}`)
    .maybeSingle();
  if (error || !run)
    return NextResponse.json(
      { error: "Run not tracked yet; retry callback." },
      { status: 404 },
    );
  try {
    const result = await processApifyResults(payload.datasetId!, run.id);
    if (result.updated) {
      const { scheduleMatchingRefresh } = await import(
        "@/lib/matching/schedule.server"
      );
      scheduleMatchingRefresh();
    }
    return NextResponse.json({ message: "Progress processed", ...result });
  } catch (err) {
    console.error(
      "Scrape callback:",
      err instanceof Error ? err.message : "Failed",
    );
    // Non-2xx asks Apify to retry. The lease makes duplicate deliveries safe.
    return NextResponse.json(
      { error: "Import interrupted; retry callback." },
      { status: 503 },
    );
  }
}
