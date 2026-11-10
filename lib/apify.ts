import {
  verifyScraperPricing,
  verifyRecoveryPricing,
  isLimitedScrape,
} from "./scrape-guards";
import type { ApifyLinkedInProfile } from "./types";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID =
  process.env.APIFY_ACTOR_ID ||
  "insights_data~linkedin-profile-extractor-enricher";
const ACTOR_BUILD = process.env.APIFY_ACTOR_BUILD || "1.0.6";
const MAX_RUN_CHARGE_USD = 2;
const RECOVERY_ACTOR = "blueskyscraper~linkedin-profile-details-scraper";
type Callback = { url: string; secret: string };

export function webhookOptions(callback: Callback) {
  return {
    eventTypes: [
      "ACTOR.RUN.SUCCEEDED",
      "ACTOR.RUN.FAILED",
      "ACTOR.RUN.ABORTED",
      "ACTOR.RUN.TIMED_OUT",
    ],
    requestUrl: callback.url,
    shouldInterpolateStrings: true,
    doNotRetry: false,
    payloadTemplate: JSON.stringify({
      runId: "{{resource.id}}",
      datasetId: "{{resource.defaultDatasetId}}",
      status: "{{resource.status}}",
      secret: callback.secret,
    }),
  };
}

function callbackParam(callback?: Callback) {
  if (!callback) return undefined;
  return Buffer.from(JSON.stringify([webhookOptions(callback)])).toString(
    "base64",
  );
}

function apiFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
}

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
  callback?: Callback,
): Promise<{ runId: string; datasetId: string }> {
  const token = getToken();

  // Fail closed when the actor changes pricing instead of silently consuming credit.
  const actorResponse = await apiFetch(`${APIFY_BASE}/acts/${ACTOR_ID}`, {
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
  const webhook = callbackParam(callback);
  if (webhook) params.set("webhooks", webhook);
  const response = await apiFetch(
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

/** A single bounded fallback; email enrichment and extra charge events stay off. */
export async function startRecoveryRun(urls: string[], callback?: Callback) {
  const headers = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
  const response = await apiFetch(`${APIFY_BASE}/acts/${RECOVERY_ACTOR}`, {
    headers,
  });
  if (!response.ok)
    throw new Error("Could not verify recovery provider pricing.");
  const { data: actor } = await response.json();
  const pricing = (actor.pricingInfos || [])
    .filter(
      (item: { startedAt?: string }) =>
        !item.startedAt || new Date(item.startedAt).getTime() <= Date.now(),
    )
    .at(-1);
  if (!verifyRecoveryPricing(pricing, urls.length))
    throw new Error(
      "Recovery pricing changed or this retry exceeds the $1 actor-charge cap.",
    );
  const params = new URLSearchParams({
    build: "0.1.36",
    maxTotalChargeUsd: "1",
    timeout: "1800",
  });
  const webhook = callbackParam(callback);
  if (webhook) params.set("webhooks", webhook);
  const runResponse = await apiFetch(
    `${APIFY_BASE}/acts/${RECOVERY_ACTOR}/runs?${params}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        profileUrls: urls,
        includeEmails: false,
        findEmail: false,
        includeCompanyDetails: false,
        includePosts: false,
        concurrency: 3,
      }),
    },
  );
  if (!runResponse.ok)
    throw new Error(
      `Recovery provider could not start (${runResponse.status}).`,
    );
  const { data } = await runResponse.json();
  return {
    runId: data.id as string,
    datasetId: data.defaultDatasetId as string,
  };
}

/**
 * Check the status of an Apify run.
 */
export async function getRunStatus(runId: string): Promise<{
  status: string;
  datasetId: string | null;
  statusMessage: string | null;
}> {
  const token = getToken();

  const response = await apiFetch(`${APIFY_BASE}/actor-runs/${runId}`, {
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

  const response = await apiFetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?format=json`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify dataset fetch failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function getRunInputUrls(runId: string): Promise<string[]> {
  const headers = { Authorization: `Bearer ${getToken()}` };
  const response = await apiFetch(`${APIFY_BASE}/actor-runs/${runId}`, {
    headers,
  });
  if (!response.ok)
    throw new Error("Could not read the original scrape input.");
  const { data: run } = await response.json();
  const inputResponse = await apiFetch(
    `${APIFY_BASE}/key-value-stores/${run.defaultKeyValueStoreId}/records/INPUT`,
    { headers },
  );
  if (!inputResponse.ok)
    throw new Error("Could not recover the original profile URLs.");
  const input = await inputResponse.json();
  const urls = input.urls || input.profileUrls || input.profiles;
  if (!Array.isArray(urls))
    throw new Error("The scrape input has no profile URL list.");
  return urls.filter((url): url is string => typeof url === "string");
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

  const response = await apiFetch(`${APIFY_BASE}/webhooks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...webhookOptions({ url: webhookUrl, secret }),
      condition: { actorRunId: runId },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Could not register the automatic import callback (${response.status}).`,
    );
  }
}
