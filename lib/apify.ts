import { verifyScraperPricing, isLimitedScrape } from "./scrape-guards";
import type { ApifyLinkedInProfile } from "./types";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID =
  process.env.APIFY_ACTOR_ID ||
  "insights_data~linkedin-profile-extractor-enricher";
const ACTOR_BUILD = process.env.APIFY_ACTOR_BUILD || "1.0.6";
const MAX_RUN_CHARGE_USD = 2;

export { normalizeLinkedInUrl, extractProfileUrl } from "./linkedin-profile";

function getToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");
  return token;
}

/**
 * Start an Apify LinkedIn scrape run with the given URLs.
 * Returns the runId and datasetId for tracking.
 */
export async function startScrapeRun(
  linkedinUrls: string[],
): Promise<{ runId: string; datasetId: string }> {
  const token = getToken();

  // Fail closed when the actor changes pricing instead of silently consuming credit.
  const actorResponse = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!actorResponse.ok)
    throw new Error("Could not verify Apify actor pricing.");
  const { data: actor } = await actorResponse.json();
  const pricing = (actor.pricingInfos || [])
    .filter(
      (item: { startedAt?: string }) =>
        !item.startedAt || new Date(item.startedAt).getTime() <= Date.now(),
    )
    .at(-1);
  if (!verifyScraperPricing(pricing, linkedinUrls.length, MAX_RUN_CHARGE_USD)) {
    throw new Error(
      "Scraper pricing changed or this run exceeds the $2 free-credit cap. Review the actor before retrying.",
    );
  }
  const params = new URLSearchParams({
    build: ACTOR_BUILD,
    maxTotalChargeUsd: String(MAX_RUN_CHARGE_USD),
    timeout: "1800",
    memory: "1024",
  });
  const response = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs?${params}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ urls: linkedinUrls }),
    },
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
  runId: string,
): Promise<{
  status: string;
  datasetId: string | null;
  statusMessage: string | null;
}> {
  const token = getToken();

  const response = await fetch(`${APIFY_BASE}/actor-runs/${runId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error("Run not found");
    const text = await response.text();
    throw new Error(`Apify status check failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  return {
    status:
      result.data.status === "SUCCEEDED" &&
      isLimitedScrape(result.data.statusMessage)
        ? "FAILED"
        : result.data.status,
    statusMessage: result.data.statusMessage || null,
    datasetId: result.data.defaultDatasetId || null,
  };
}

/**
 * Fetch all results from a completed Apify dataset.
 */
export async function getRunResults(
  datasetId: string,
): Promise<ApifyLinkedInProfile[]> {
  const token = getToken();

  const response = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?format=json`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify dataset fetch failed (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Register a webhook on an Apify run so it calls back when complete.
 * The webhook includes our secret for verification.
 */
export async function registerWebhook(
  runId: string,
  webhookUrl: string,
  secret: string,
): Promise<void> {
  const token = getToken();

  const response = await fetch(`${APIFY_BASE}/webhooks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      eventTypes: [
        "ACTOR.RUN.SUCCEEDED",
        "ACTOR.RUN.FAILED",
        "ACTOR.RUN.ABORTED",
        "ACTOR.RUN.TIMED_OUT",
      ],
      condition: { actorRunId: runId },
      requestUrl: webhookUrl,
      payloadTemplate: JSON.stringify({
        runId: "{{resource.id}}",
        datasetId: "{{resource.defaultDatasetId}}",
        status: "{{resource.status}}",
        secret,
      }),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(
      `Failed to register Apify webhook (${response.status}): ${text}`,
    );
    // Non-fatal — the scrape still works, just won't auto-process
  }
}
