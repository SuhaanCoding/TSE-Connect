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
      progress("Preparing the alumni index…");
      const response = await fetch("/api/alumni/matches?mode=semantic", {
        cache: "no-store",
        signal: AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(25000),
        ]),
      });
      const index = await response.json().catch(() => null);
      if (
        !response.ok ||
        !index ||
        !Array.isArray(index.documents) ||
        !Array.isArray(index.data)
      )
        throw new Error(
          index?.error || "Couldn’t load the alumni index. Try again.",
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
        120000,
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
