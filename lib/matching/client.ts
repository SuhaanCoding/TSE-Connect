import { ENCODER } from "./config";
import type { PackedDocument } from "./vectors";
import type { HybridHit } from "./hybrid";
import type { IndexMetadata } from "./result";
export interface MatchingIndex extends IndexMetadata {
  documents: PackedDocument[];
}
interface WorkerResult {
  id: number;
  type: string;
  hits?: HybridHit[];
  engine?: "semantic" | "lexical";
  warning?: string;
  error?: string;
  loadMs?: number;
  diagnostic?: string;
  metrics?: {
    encodeMs: number;
    rankMs: number;
    totalMs: number;
    profiles: number;
    documents: number;
  };
}
export class LocalMatchClient {
  private worker: Worker | null = null;
  private controller = new AbortController();
  private pending = new Map<
    number,
    {
      resolve: (value: WorkerResult) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private sequence = 0;
  private start: Promise<{
    index: MatchingIndex;
    engine: "semantic" | "lexical";
    warning: string;
  }>;
  constructor(progress: (message: string) => void, lexicalOnly = false) {
    this.start = (async () => {
      progress("Preparing your matches…");
      const query = new URLSearchParams({
        mode: "semantic",
        format: "paged-v1",
      });
      if (lexicalOnly) query.set("lexical", "1");
      const download = async (offset = 0, revision?: string) => {
        const params = new URLSearchParams(query);
        if (offset) params.set("offset", String(offset));
        if (revision) params.set("revision", revision);
        const response = await fetch(`/api/alumni/matches?${params}`, {
          cache: "no-store",
          signal: AbortSignal.any([
            this.controller.signal,
            AbortSignal.timeout(60000),
          ]),
        });
        let page;
        try {
          page = await response.json();
        } catch (error) {
          if (this.controller.signal.aborted)
            throw new DOMException("Cancelled", "AbortError");
          console.warn(
            "TSE matching index download failed",
            JSON.stringify({
              status: response.status,
              error: error instanceof Error ? error.name : "unknown",
            }),
          );
          throw new Error(
            "Couldn’t finish downloading the alumni index. Try again or use private word matching.",
          );
        }
        if (!response.ok || !page || !Array.isArray(page.documents))
          throw new Error(
            page?.error || "Couldn’t load the alumni index. Try again.",
          );
        return page;
      };
      const index = await download();
      if (!Array.isArray(index.data))
        throw new Error("Couldn’t load the alumni index. Try again.");
      let next = index.nextOffset;
      const seen = new Set<number>();
      while (next !== null && next !== undefined) {
        if (!Number.isSafeInteger(next) || next <= 0 || seen.has(next))
          throw new Error(
            "Couldn’t finish loading the index. Refresh the network.",
          );
        seen.add(next);
        progress(
          `Loading matches · ${Math.round((index.documents.length / index.documentsTotal) * 100)}%`,
        );
        const page = await download(next, index.revision);
        if (
          page.revision !== index.revision ||
          page.modelVersion !== index.modelVersion
        )
          throw new Error(
            "The matching index changed. Refresh the network and try again.",
          );
        index.documents.push(...page.documents);
        next = page.nextOffset;
      }
      if (
        index.documentsTotal !== undefined &&
        index.documents.length !== index.documentsTotal
      )
        throw new Error(
          "Couldn’t finish loading the index. Refresh the network.",
        );
      if (index.modelVersion !== ENCODER.version)
        throw new Error(
          "The matching model changed. Reload this page to get the latest version.",
        );
      if (this.controller.signal.aborted)
        throw new DOMException("Cancelled", "AbortError");
      this.worker = new Worker(
        new URL("./matching.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (event) => {
        const value = event.data as WorkerResult & { message?: string };
        if (value.type === "progress") {
          progress(value.message || "Preparing local matching…");
          return;
        }
        const pending = this.pending.get(value.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(value.id);
        if (value.type === "error")
          pending.reject(
            new Error(value.error || "On-device matching failed."),
          );
        else if (value.type === "cancelled")
          pending.reject(new DOMException("Cancelled", "AbortError"));
        else pending.resolve(value);
      };
      this.worker.onerror = () => {
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(
            new Error(
              "Your browser couldn’t start local matching. Try on-device word matching instead.",
            ),
          );
        }
        this.pending.clear();
      };
      const ready = await this.call(
        {
          type: "init",
          profiles: index.data.map(
            (profile: MatchingIndex["data"][number]) => ({
              id: profile.id,
              full_name: profile.full_name,
              current_company: profile.current_company,
              past_companies: profile.past_companies,
            }),
          ),
          documents: index.documents,
          lexicalOnly,
        },
        600000,
      );
      if (process.env.NODE_ENV === "development")
        console.info(
          "TSE local model ready",
          JSON.stringify({
            loadMs: ready.loadMs,
            engine: ready.engine,
            diagnostic: ready.diagnostic,
          }),
        );
      return {
        index: index as MatchingIndex,
        engine: ready.engine || "lexical",
        warning: ready.warning || "",
      };
    })();
  }
  private call(
    message: Record<string, unknown>,
    timeout = 45000,
  ): Promise<WorkerResult> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "Local matching took too long. Try private word matching or use a shorter passage.",
          ),
        );
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ ...message, id });
    });
  }
  async rank(text: string, goal: string, lookup: string, signal: AbortSignal) {
    const ready = await this.start;
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const result = await this.call({
      type: "rank",
      text: text || ready.index.viewer.context,
      goal,
      lookup,
    });
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (process.env.NODE_ENV === "development")
      console.info("TSE local match timing", JSON.stringify(result.metrics));
    return {
      ...ready,
      hits: result.hits || [],
      engine: result.engine || ready.engine,
      warning:
        result.warning ||
        (ready.engine === "semantic" && result.engine === "lexical"
          ? "Meaning-based matching couldn’t finish. Using private word matching instead; your resume stays on this device."
          : ready.warning),
    };
  }
  dispose() {
    this.controller.abort();
    this.worker?.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new DOMException("Cancelled", "AbortError"));
    }
    this.pending.clear();
  }
}
