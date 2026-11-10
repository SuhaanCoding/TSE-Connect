import type { ScrapeOutcome } from "./linkedin-profile";

export function recoveryUrls(results: ScrapeOutcome[]) {
  return results
    .filter(
      (result) => result.status !== "updated" && result.alumniIds.length > 0,
    )
    .map((result) => `https://www.${result.inputUrl}/`);
}

export function summarizeScrape(results: ScrapeOutcome[]) {
  const ids = new Set(
    results
      .filter((result) => result.status === "updated")
      .flatMap((result) => result.alumniIds),
  );
  return {
    matched: results.filter(
      (result) =>
        result.status === "updated" || result.status === "write_failed",
    ).length,
    updated: ids.size,
    skipped_empty: results.filter((result) => result.status === "unavailable")
      .length,
    no_match: results.filter((result) => result.status === "unmatched").length,
    errors: results.filter((result) => result.status === "write_failed").length,
    unresolved_count: results.filter((result) => result.status !== "updated")
      .length,
  };
}

export function isTerminalApifyStatus(status: string) {
  return ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status);
}
