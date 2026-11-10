import type { ServerMatchResult } from "./server";
/** Private inputs/results live only in this directory instance, never persistent storage. */
export class ServerMatchClient {
  private progress: (message: string) => void;
  private lexicalOnly: boolean;
  private cache = new Map<string, ServerMatchResult>();
  private active: {
    key: string;
    controller: AbortController;
    promise: Promise<ServerMatchResult>;
  } | null = null;
  constructor(progress: (message: string) => void, lexicalOnly = false) {
    this.progress = progress;
    this.lexicalOnly = lexicalOnly;
  }
  async rank(text: string, goal: string, lookup: string, signal: AbortSignal) {
    const key = JSON.stringify([text, goal, lookup]);
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (this.active && this.active.key !== key) {
      this.active.controller.abort();
      this.active = null;
    }
    if (!this.active) {
      const controller = new AbortController();
      this.progress("Matching your experience…");
      const promise = (async () => {
        const response = await fetch("/api/alumni/matches", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(90000),
          ]),
          body: JSON.stringify({
            text,
            goal,
            lookup,
            lexicalOnly: this.lexicalOnly,
          }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.index || !Array.isArray(result.hits))
          throw new Error(
            result?.error || "Couldn’t finish matching. Try again.",
          );
        if (controller.signal.aborted)
          throw new DOMException("Cancelled", "AbortError");
        if (this.cache.size >= 2) this.cache.clear();
        this.cache.set(key, result);
        return result as ServerMatchResult;
      })();
      this.active = { key, controller, promise };
      void promise
        .finally(() => {
          if (this.active?.promise === promise) this.active = null;
        })
        .catch(() => {});
    }
    const result = await this.active.promise;
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    return result;
  }
  dispose() {
    this.active?.controller.abort();
    this.active = null;
    this.cache.clear();
  }
}
