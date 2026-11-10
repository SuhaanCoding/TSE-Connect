import { createServiceClient } from "@/lib/supabase/server";
import {
  getRunResults,
  getRunStatus,
  normalizeLinkedInUrl,
  extractProfileUrl,
} from "@/lib/apify";
import {
  careerFromProfile,
  backgroundFromProfile,
} from "@/lib/linkedin-profile";
import type { ScrapeResult } from "@/lib/types";

/**
 * Process completed Apify scrape results and update the alumni table.
 * Also updates the corresponding scrape_runs row with stats.
 */
export async function processApifyResults(
  datasetId: string,
  scrapeRunId: string,
): Promise<ScrapeResult> {
  const serviceClient = await createServiceClient();

  const { data: run } = await serviceClient
    .from("scrape_runs")
    .select("apify_run_id, profile_count")
    .eq("id", scrapeRunId)
    .maybeSingle();
  if (run?.apify_run_id) {
    const status = await getRunStatus(run.apify_run_id);
    if (status.status !== "SUCCEEDED") {
      const message = status.statusMessage || `Apify run is ${status.status}`;
      await serviceClient
        .from("scrape_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: message,
        })
        .eq("id", scrapeRunId);
      throw new Error(message);
    }
  }

  // Fetch Apify results
  const profiles = await getRunResults(datasetId);

  // Fetch all alumni with LinkedIn URLs from Supabase
  const { data: allAlumni, error: fetchError } = await serviceClient
    .from("alumni")
    .select("id, linkedin_url, current_role, current_company, past_companies")
    .not("linkedin_url", "is", null);

  if (fetchError) {
    // Mark run as failed
    await serviceClient
      .from("scrape_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: `Failed to fetch alumni: ${fetchError.message}`,
      })
      .eq("id", scrapeRunId);

    throw new Error(`Failed to fetch alumni: ${fetchError.message}`);
  }

  // Build lookup map: normalized LinkedIn URL -> alumni record
  const urlToAlumni = new Map<string, string[]>();
  for (const a of allAlumni || []) {
    if (!a.linkedin_url) continue;
    const normalized = normalizeLinkedInUrl(a.linkedin_url);
    if (!normalized) continue;
    urlToAlumni.set(normalized, [...(urlToAlumni.get(normalized) || []), a.id]);
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
    const alumniIds = urlToAlumni.get(normalized);

    if (!alumniIds) {
      result.noMatch++;
      continue;
    }

    result.matched++;

    const career = careerFromProfile(profile);
    const background = backgroundFromProfile(profile);
    if (!career && !background.about && !background.background) {
      result.skippedEmpty++;
      continue; // Error/not-found rows must never erase data or look freshly scraped.
    }
    const updateData: Record<string, unknown> = {
      last_scraped_at: new Date().toISOString(),
    };
    if (career?.currentRole) updateData.current_role = career.currentRole;
    if (career?.currentCompany)
      updateData.current_company = career.currentCompany;
    if (career && (career.completeHistory || career.pastCompanies.length))
      updateData.past_companies = career.pastCompanies;
    if (background.about) updateData.linkedin_about = background.about;
    if (background.background)
      updateData.linkedin_background = background.background;
    for (const id of alumniIds) updates.push({ id, data: updateData });
  }

  if (updates.length === 0) {
    const message =
      "No usable career data matched the alumni URLs. Check the actor output before importing.";
    await serviceClient
      .from("scrape_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", scrapeRunId);
    throw new Error(message);
  }

  // Batch update in groups of 50
  let errorCount = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(({ id, data }) =>
        serviceClient.from("alumni").update(data).eq("id", id),
      ),
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].error) {
        errorCount++;
        if (errorCount <= 3) {
          console.error(
            `Scrape update failed for ${batch[j].id}:`,
            results[j].error!.message,
          );
        }
      } else {
        result.updated++;
      }
    }
  }
  result.errors = errorCount;

  result.skippedEmpty += Math.max(
    0,
    (run?.profile_count || 0) - profiles.length,
  );

  // Update scrape_runs row with results
  await serviceClient
    .from("scrape_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      matched: result.matched,
      updated: result.updated,
      skipped_empty: result.skippedEmpty,
      no_match: result.noMatch,
      errors: result.errors,
    })
    .eq("id", scrapeRunId);

  return result;
}
