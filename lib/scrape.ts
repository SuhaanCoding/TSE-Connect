import { randomUUID } from "node:crypto";
import { createServiceClient as connectProduction } from "@/lib/supabase/server";
import * as apify from "@/lib/apify";
import {
  normalizeLinkedInUrl,
  planProfileImport,
  mergeScrapeOutcomes,
  enrichRecoveryProfiles,
  type ScrapeOutcome,
} from "@/lib/linkedin-profile";
import {
  recoveryUrls,
  summarizeScrape,
  isTerminalApifyStatus,
} from "@/lib/scrape-state";
import type { ScrapeResult } from "@/lib/types";

function canonicalInputs(urls: string[]) {
  return [...new Set(urls.map(normalizeLinkedInUrl).filter(Boolean))].map(
    (url) => `https://www.${url}/`,
  );
}
function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}
function callbackConfig() {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  return secret
    ? { url: `${appUrl()}/api/admin/scrape/webhook`, secret }
    : undefined;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "Scrape processing failed.";
}

type ScrapeDependencies = {
  connect: typeof connectProduction;
  api: Pick<
    typeof apify,
    | "getRunResults"
    | "getRunStatus"
    | "getRunInputUrls"
    | "startScrapeRun"
    | "startRecoveryRun"
  >;
};

/** Injectable boundaries let failure and duplicate-delivery tests run without an account or paid actors. */
export function createScrapeService(
  dependencies: Partial<ScrapeDependencies> = {},
) {
  const createServiceClient = dependencies.connect || connectProduction;
  const {
    getRunResults,
    getRunStatus,
    getRunInputUrls,
    startScrapeRun,
    startRecoveryRun,
  } = dependencies.api || apify;
  /** Reserve the unique active slot BEFORE creating a paid actor run. */
  async function createTrackedScrape(
    urls: string[],
    trigger: string,
    provider: "primary" | "recovery" = "primary",
  ) {
    const db = await createServiceClient();
    const inputUrls = canonicalInputs(urls);
    if (!inputUrls.length)
      throw new Error("No valid LinkedIn profile URLs were supplied.");
    const { data: reservation, error } = await db
      .from("scrape_runs")
      .insert({
        status: "running",
        trigger,
        provider,
        input_urls: inputUrls,
        profile_count: inputUrls.length,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(
        error.code === "23505"
          ? "A scrape is already running. Refresh its progress before starting another."
          : "Could not reserve the scrape run. No actor was started.",
      );
    try {
      const callback = callbackConfig();
      const run = await (provider === "recovery"
        ? startRecoveryRun(inputUrls, callback)
        : startScrapeRun(inputUrls, callback));
      const { error: saveError } = await db
        .from("scrape_runs")
        .update({ apify_run_id: run.runId, apify_dataset_id: run.datasetId })
        .eq("id", reservation.id);
      if (saveError)
        throw new Error(
          `Actor started but tracking could not be saved. Review Apify run ${run.runId} before retrying.`,
        );
      const callbackConfigured = !!callback;
      const warning = callbackConfigured
        ? null
        : "Automatic import callback is not configured. Keep the admin Scrape page open and use Refresh to process this run.";
      await db
        .from("scrape_runs")
        .update({
          callback_configured: callbackConfigured,
          error_message: warning,
        })
        .eq("id", reservation.id);
      return {
        ...run,
        scrapeRunId: reservation.id,
        profileCount: inputUrls.length,
        callbackConfigured,
        warning,
      };
    } catch (err) {
      await db
        .from("scrape_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: message(err),
        })
        .eq("id", reservation.id);
      throw err;
    }
  }

  /** Webhooks and admin polling share a resumable, leased state machine. */
  async function processApifyResults(
    datasetId: string,
    scrapeRunId: string,
  ): Promise<ScrapeResult> {
    const db = await createServiceClient();
    const { data: initial, error: loadError } = await db
      .from("scrape_runs")
      .select("*")
      .eq("id", scrapeRunId)
      .single();
    if (loadError || !initial) throw new Error("Scrape run was not found.");
    if (
      datasetId !== initial.apify_dataset_id &&
      datasetId !== initial.recovery_dataset_id
    )
      throw new Error("Dataset does not belong to this scrape run.");
    const asResult = (
      stats: ReturnType<typeof summarizeScrape>,
    ): ScrapeResult => ({
      matched: stats.matched,
      updated: stats.updated,
      skippedEmpty: stats.skipped_empty,
      noMatch: stats.no_match,
      errors: stats.errors,
    });
    if (initial.status !== "running")
      return asResult(summarizeScrape(initial.profile_results || []));
    const token = randomUUID();
    const { data: locked, error: lockError } = await db
      .from("scrape_runs")
      .update({
        processing_token: token,
        processing_started_at: new Date().toISOString(),
      })
      .eq("id", scrapeRunId)
      .eq("status", "running")
      .or(
        `processing_started_at.is.null,processing_started_at.lt.${new Date(Date.now() - 300_000).toISOString()}`,
      )
      .select("*")
      .maybeSingle();
    if (lockError) throw new Error("Could not acquire the import lease.");
    if (!locked)
      return asResult(summarizeScrape(initial.profile_results || []));
    let receipts: ScrapeOutcome[] = locked.profile_results || [];
    let recoveryWarning: string | null =
      locked.recovery_requested_at && !locked.recovery_run_id
        ? "A prior recovery start was not confirmed. Review Apify before starting another retry."
        : null;
    const persist = async (data: Record<string, unknown>) => {
      const { error: saveError } = await db
        .from("scrape_runs")
        .update(data)
        .eq("id", scrapeRunId)
        .eq("processing_token", token);
      if (saveError)
        throw new Error(
          `Could not persist scrape progress: ${saveError.message}`,
        );
    };
    try {
      const { data: alumni, error: alumniError } = await db
        .from("alumni")
        .select(
          "id,full_name,linkedin_url,graduation_year,current_company,current_role",
        );
      if (alumniError)
        throw new Error(
          "Could not read the alumni roster; no profile updates were attempted.",
        );
      const importPhase = async (
        runId: string,
        phaseDatasetId: string,
        urls: string[],
        source: "primary" | "recovery",
      ) => {
        const state = await getRunStatus(runId);
        if (!isTerminalApifyStatus(state.status)) return null;
        // Terminal failures can contain useful partial rows. Every row still goes
        // through ownership, URL and nonempty-field checks before any write.
        let profiles: unknown[] = await getRunResults(phaseDatasetId);
        if (source === "recovery" && locked.provider !== "recovery")
          profiles = enrichRecoveryProfiles(
            await getRunResults(locked.apify_dataset_id),
            profiles,
          );
        const plan = planProfileImport(
          profiles,
          alumni || [],
          urls,
          source,
          new Date().toISOString(),
        );
        for (let offset = 0; offset < plan.updates.length; offset += 25) {
          await Promise.all(
            plan.updates
              .slice(offset, offset + 25)
              .map(
                async ({
                  id,
                  inputUrl,
                  data,
                  expectedGraduationYear,
                  expectedCareer,
                }) => {
                  let write = db.from("alumni").update(data).eq("id", id);
                  if (expectedCareer) {
                    write =
                      expectedCareer.company === null
                        ? write.is("current_company", null)
                        : write.eq("current_company", expectedCareer.company);
                    write =
                      expectedCareer.role === null
                        ? write.is("current_role", null)
                        : write.eq("current_role", expectedCareer.role);
                  }
                  if (expectedGraduationYear)
                    write = write.eq("graduation_year", expectedGraduationYear);
                  const { data: saved, error: writeError } = await write
                    .select("id")
                    .maybeSingle();
                  if (writeError || !saved) {
                    const receipt = plan.outcomes.find(
                      (item) => item.inputUrl === inputUrl,
                    )!;
                    receipt.status = "write_failed";
                    receipt.reason =
                      "A roster update failed. Existing member-written fields were not changed; retry this profile.";
                  } else {
                    const person = alumni?.find((person) => person.id === id);
                    if (person) Object.assign(person, data);
                  }
                },
              ),
          );
        }
        if (state.status !== "SUCCEEDED")
          for (const item of plan.outcomes)
            if (item.status !== "updated" && item.status !== "write_failed")
              item.reason =
                state.statusMessage || `Provider ended with ${state.status}.`;
        return plan.outcomes;
      };
      let inputs: string[] = locked.input_urls || [];
      if (!inputs.length) {
        inputs = canonicalInputs(await getRunInputUrls(locked.apify_run_id));
        await persist({ input_urls: inputs, profile_count: inputs.length });
      }
      if (!locked.primary_processed_at) {
        const primary = await importPhase(
          locked.apify_run_id,
          locked.apify_dataset_id,
          inputs,
          locked.provider === "recovery" ? "recovery" : "primary",
        );
        if (!primary) return asResult(summarizeScrape(receipts));
        receipts = primary;
        await persist({
          profile_results: receipts,
          primary_processed_at: new Date().toISOString(),
          ...summarizeScrape(receipts),
        });
      }
      const retryUrls = recoveryUrls(receipts);
      let recoveryRunId: string | null = locked.recovery_run_id;
      let recoveryDatasetId: string | null = locked.recovery_dataset_id;
      if (
        locked.provider !== "recovery" &&
        retryUrls.length &&
        !recoveryRunId &&
        !locked.recovery_requested_at
      ) {
        // Reserve the attempt before the external request. An interrupted request
        // is surfaced for review instead of blindly creating duplicate charges.
        await persist({ recovery_requested_at: new Date().toISOString() });
        try {
          const callback = callbackConfig();
          const run = await startRecoveryRun(retryUrls, callback);
          recoveryRunId = run.runId;
          recoveryDatasetId = run.datasetId;
          await persist({
            recovery_run_id: recoveryRunId,
            recovery_dataset_id: recoveryDatasetId,
          });
          await persist({
            callback_configured: !!callback,
            error_message: callback
              ? null
              : "Keep the admin Scrape page open to finish automatic recovery; the import callback is not configured.",
          });
          return asResult(summarizeScrape(receipts));
        } catch (err) {
          recoveryWarning = `Recovery could not be confirmed: ${message(err)} Review the actor before starting another retry.`;
          await persist({ error_message: recoveryWarning });
        }
      }
      if (recoveryRunId && recoveryDatasetId) {
        const recovery = await importPhase(
          recoveryRunId,
          recoveryDatasetId,
          retryUrls,
          "recovery",
        );
        if (!recovery) return asResult(summarizeScrape(receipts));
        receipts = mergeScrapeOutcomes(receipts, recovery);
      }
      const stats = summarizeScrape(receipts);
      await persist({
        profile_results: receipts,
        ...stats,
        status: stats.updated ? "completed" : "failed",
        completed_at: new Date().toISOString(),
        error_message: stats.unresolved_count
          ? `${stats.unresolved_count} of ${inputs.length} profile URLs remain unresolved. ${recoveryWarning || "Open the per-profile results to review or retry them."}`
          : null,
      });
      return asResult(stats);
    } catch (err) {
      // Keep the run resumable after transient I/O failures; the next callback or
      // admin refresh can retry after the lease is released.
      await persist({ error_message: message(err) });
      throw err;
    } finally {
      await db
        .from("scrape_runs")
        .update({ processing_token: null, processing_started_at: null })
        .eq("id", scrapeRunId)
        .eq("processing_token", token);
    }
  }

  return { createTrackedScrape, processApifyResults };
}

export const { createTrackedScrape, processApifyResults } =
  createScrapeService();
