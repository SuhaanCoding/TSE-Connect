import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { createTrackedScrape } from "@/lib/scrape";

export async function POST(request: Request) {
  const supplied = Buffer.from(request.headers.get("x-scrape-secret") || "");
  const expected = Buffer.from(process.env.SYNC_SECRET_KEY || "");
  if (
    !expected.length ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const db = await createServiceClient();
  const { data: alumni, error } = await db
    .from("alumni")
    .select("linkedin_url")
    .not("linkedin_url", "is", null);
  if (error)
    return NextResponse.json(
      { error: "Could not read alumni." },
      { status: 500 },
    );
  try {
    const run = await createTrackedScrape(
      (alumni || []).map((person) => person.linkedin_url!),
      "scheduled",
    );
    return NextResponse.json({ message: "Scheduled scrape started", ...run });
  } catch (err) {
    const error =
      err instanceof Error ? err.message : "Could not start scheduled scrape.";
    return NextResponse.json(
      { error },
      { status: error.includes("already running") ? 409 : 502 },
    );
  }
}
