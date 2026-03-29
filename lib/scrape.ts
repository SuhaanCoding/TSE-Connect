import { createServiceClient } from "@/lib/supabase/server";
import {
  getRunResults,
  normalizeLinkedInUrl,
  extractProfileUrl,
} from "@/lib/apify";
import type { ScrapeResult } from "@/lib/types";

/**
 * Process completed Apify scrape results and update the alumni table.
 * Also updates the corresponding scrape_runs row with stats.
 */
export async function processApifyResults(
  datasetId: string,
  scrapeRunId: string
): Promise<ScrapeResult> {
  const serviceClient = await createServiceClient();

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

    // Build update — only set fields that have real data
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
