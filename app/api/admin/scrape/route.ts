import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { normalizeLinkedInUrl } from "@/lib/linkedin-profile";
import { recoveryUrls } from "@/lib/scrape-state";
import { createTrackedScrape, processApifyResults } from "@/lib/scrape";

export const maxDuration = 300;

async function requireAdmin() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user?.email && (await isAdmin(user.email)) ? user : null;
}
export async function POST(request: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  let body: { test?: boolean; retryFailedFrom?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* Full scrape is the default. */
  }
  const db = await createServiceClient();
  let urls: string[] = [];
  if (body.retryFailedFrom) {
    if (!/^[a-f0-9-]{36}$/i.test(body.retryFailedFrom))
      return NextResponse.json(
        { error: "Invalid scrape run." },
        { status: 400 },
      );
    const { data: previous, error } = await db
      .from("scrape_runs")
      .select("profile_results,status")
      .eq("id", body.retryFailedFrom)
      .maybeSingle();
    if (error || !previous)
      return NextResponse.json(
        { error: "Scrape run not found." },
        { status: 404 },
      );
    if (previous.status === "running")
      return NextResponse.json(
        { error: "This run is still processing." },
        { status: 409 },
      );
    urls = recoveryUrls(previous.profile_results || []);
  } else {
    const { data: alumni, error } = await db
      .from("alumni")
      .select("full_name,linkedin_url")
      .not("linkedin_url", "is", null);
    if (error)
      return NextResponse.json(
        { error: "Could not read alumni." },
        { status: 500 },
      );
    const people = (alumni || []).filter((person) =>
      normalizeLinkedInUrl(person.linkedin_url || ""),
    );
    const sample = people.filter((person) =>
      ["benjamin johnson", "eshaan sharma"].some((name) =>
        person.full_name.toLowerCase().includes(name),
      ),
    );
    urls = (
      body.test ? (sample.length ? sample : people.slice(0, 2)) : people
    ).map((person) => person.linkedin_url!);
  }
  if (!urls.length)
    return NextResponse.json(
      {
        error: body.retryFailedFrom
          ? "No unresolved roster profiles to retry."
          : "No valid LinkedIn profile URLs.",
      },
      { status: 400 },
    );
  try {
    const result = await createTrackedScrape(
      urls,
      body.test ? "manual_test" : "manual",
      body.retryFailedFrom ? "recovery" : "primary",
    );
    return NextResponse.json({ ...result, test: !!body.test });
  } catch (err) {
    const error =
      err instanceof Error ? err.message : "Could not start scrape.";
    return NextResponse.json(
      { error },
      { status: error.includes("already running") ? 409 : 502 },
    );
  }
}
export async function GET(request: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const db = await createServiceClient();
  const id = new URL(request.url).searchParams.get("runId");
  let query = db
    .from("scrape_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(id ? 1 : 20);
  if (id) query = query.eq("id", id);
  const { data: runs, error } = await query;
  if (error)
    return NextResponse.json(
      { error: "Could not load scrape history." },
      { status: 500 },
    );
  for (const run of runs || []) {
    if (
      run.status === "running" &&
      !run.apify_run_id &&
      Date.now() - new Date(run.started_at).getTime() > 600_000
    ) {
      const patch = {
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message:
          "The actor start was not confirmed. Inspect Apify before retrying; no profile data was imported.",
      };
      const { error: saveError } = await db
        .from("scrape_runs")
        .update(patch)
        .eq("id", run.id)
        .is("apify_run_id", null)
        .eq("status", "running");
      if (!saveError) Object.assign(run, patch);
    }
    if (run.status === "running" && run.apify_dataset_id) {
      try {
        await processApifyResults(
          run.recovery_dataset_id || run.apify_dataset_id,
          run.id,
        );
      } catch (err) {
        console.error(
          "Scrape catch-up:",
          err instanceof Error ? err.message : "Failed",
        );
      }
      const { data: fresh } = await db
        .from("scrape_runs")
        .select("*")
        .eq("id", run.id)
        .single();
      if (fresh) Object.assign(run, fresh);
    }
  }
  if (id)
    return runs?.[0]
      ? NextResponse.json(runs[0])
      : NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json({
    runs: runs || [],
    callbackConfigured: !!process.env.APIFY_WEBHOOK_SECRET,
  });
}
