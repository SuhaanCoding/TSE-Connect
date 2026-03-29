import type { ApifyLinkedInProfile } from "./types";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "harvestapi~linkedin-profile-scraper";

function getToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");
  return token;
}

/**
 * Normalize a LinkedIn URL for reliable matching.
 * Strips protocol, www, trailing slashes, query params, and lowercases.
 * "https://www.linkedin.com/in/john-doe/?utm=..." → "linkedin.com/in/john-doe"
 */
export function normalizeLinkedInUrl(url: string): string {
  let normalized = url.trim().toLowerCase();

  // Strip protocol
  normalized = normalized.replace(/^https?:\/\//, "");

  // Strip www.
  normalized = normalized.replace(/^www\./, "");

  // Strip query params and hash
  normalized = normalized.replace(/[?#].*$/, "");

  // Strip trailing slashes
  normalized = normalized.replace(/\/+$/, "");

  return normalized;
}

/**
 * Start an Apify LinkedIn scrape run with the given URLs.
 * Returns the runId and datasetId for tracking.
 */
export async function startScrapeRun(
  linkedinUrls: string[]
): Promise<{ runId: string; datasetId: string }> {
  const token = getToken();

  const response = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileScraperMode: "Profile details no email ($4 per 1k)",
        queries: linkedinUrls,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify start run failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  return {
    runId: result.data.id,
    datasetId: result.data.defaultDatasetId,
  };
}

/**
 * Check the status of an Apify run.
 */
export async function getRunStatus(
  runId: string
): Promise<{ status: string; datasetId: string | null }> {
  const token = getToken();

  const response = await fetch(
    `${APIFY_BASE}/actor-runs/${runId}?token=${token}`
  );

  if (!response.ok) {
    if (response.status === 404) throw new Error("Run not found");
    const text = await response.text();
    throw new Error(`Apify status check failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  return {
    status: result.data.status,
    datasetId: result.data.defaultDatasetId || null,
  };
}

/**
 * Fetch all results from a completed Apify dataset.
 */
export async function getRunResults(
  datasetId: string
): Promise<ApifyLinkedInProfile[]> {
  const token = getToken();

  const response = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json`
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Apify dataset fetch failed (${response.status}): ${text}`
    );
  }

  return response.json();
}

/**
 * Extract the LinkedIn URL from an Apify profile result.
 * The actor may return it in different fields.
 */
export function extractProfileUrl(
  profile: ApifyLinkedInProfile
): string | null {
  const raw = profile.url || profile.profileUrl || profile.linkedInUrl;
  return raw?.trim() || null;
}

/**
 * Register a webhook on an Apify run so it calls back when complete.
 * The webhook includes our secret for verification.
 */
export async function registerWebhook(
  runId: string,
  webhookUrl: string,
  secret: string
): Promise<void> {
  const token = getToken();

  const response = await fetch(
    `${APIFY_BASE}/webhooks?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"],
        condition: { actorRunId: runId },
        requestUrl: webhookUrl,
        payloadTemplate: JSON.stringify({
          runId: "{{resource.id}}",
          datasetId: "{{resource.defaultDatasetId}}",
          status: "{{resource.status}}",
          secret,
        }),
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error(`Failed to register Apify webhook (${response.status}): ${text}`);
    // Non-fatal — the scrape still works, just won't auto-process
  }
}
