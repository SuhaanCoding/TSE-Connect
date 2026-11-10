import { ENCODER } from "./config";
import { fitTokenBudget, queryDocuments } from "./documents";
import {
  rankHybrid,
  prepareLexical,
  type VectorDocument,
  type MatchIdentity,
} from "./hybrid";
import { unpackVector, type PackedDocument } from "./vectors";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";
interface InitMessage {
  type: "init";
  id: number;
  profiles: MatchIdentity[];
  documents: PackedDocument[];
  lexicalOnly?: boolean;
}
interface RankMessage {
  type: "rank";
  id: number;
  text: string;
  goal: string;
  lookup: string;
}
type Message = InitMessage | RankMessage;
const channel = self as unknown as {
  onmessage: ((event: MessageEvent<Message>) => void) | null;
  postMessage: (value: unknown) => void;
};
let profiles: MatchIdentity[] = [],
  documents: VectorDocument[] = [],
  lexical = prepareLexical([]),
  encoder: FeatureExtractionPipeline | null = null,
  engine: "semantic" | "lexical" = "lexical";
const queryCache = new Map<string, VectorDocument[]>();
let queued: RankMessage | null = null,
  running = false;
async function runLatest() {
  if (running) return;
  running = true;
  while (queued) {
    const request = queued;
    queued = null;
    try {
      const started = performance.now();
      const key = JSON.stringify([request.text, request.goal]);
      let query = queryCache.get(key);
      let encodeMs = 0;
      if (!query) {
        const raw = queryDocuments(request.text, request.goal);
        const passages = encoder
          ? fitTokenBudget(
              raw,
              (text) => encoder!.tokenizer.encode(text).length,
              ENCODER.maxTokens,
            )
          : raw;
        query = [];
        const before = performance.now();
        try {
          for (let i = 0; i < passages.length; i += 8) {
            const batch = passages.slice(i, i + 8);
            const vectors = encoder
              ? ((
                  await encoder(
                    batch.map((doc) => doc.text),
                    { pooling: "mean", normalize: true },
                  )
                ).tolist() as number[][])
              : batch.map(() => []);
            for (let j = 0; j < batch.length; j++)
              query.push({ ...batch[j], vector: vectors[j] });
          }
        } catch {
          // Keep private context usable even if inference fails after model loading.
          encoder = null;
          engine = "lexical";
          queryCache.clear();
          query = raw.map((doc) => ({ ...doc, vector: [] }));
        }
        encodeMs = performance.now() - before;
        if (queryCache.size >= 2) queryCache.clear();
        queryCache.set(key, query);
      }
      const before = performance.now();
      const hits = rankHybrid(
        profiles,
        documents,
        query,
        { method: engine === "semantic" ? "hybrid" : "bm25" },
        lexical,
        request.lookup,
      );
      channel.postMessage({
        id: request.id,
        type: "result",
        hits,
        engine,
        warning:
          engine === "lexical" && !request.text && !request.goal
            ? "Add experience or a goal for a more useful ranking."
            : undefined,
        metrics: {
          encodeMs,
          rankMs: performance.now() - before,
          totalMs: performance.now() - started,
          profiles: profiles.length,
          documents: documents.length,
        },
      });
    } catch {
      channel.postMessage({
        id: request.id,
        type: "error",
        error:
          "On-device matching couldn’t finish. Try again or use standard matching.",
      });
    }
  }
  running = false;
}
channel.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    void (async () => {
      profiles = message.profiles;
      documents = message.documents.map((doc) => ({
        ...doc,
        vector: unpackVector(doc.vector),
      }));
      lexical = prepareLexical(documents);
      let diagnostic = "";
      let warning = "";
      const started = performance.now();
      if (!message.lexicalOnly && documents.some((doc) => doc.vector.length))
        try {
          channel.postMessage({
            type: "progress",
            message: "Loading the on-device matching model…",
          });
          const { pipeline, env } = await import("@huggingface/transformers");
          env.allowRemoteModels = false;
          env.allowLocalModels = true;
          env.localModelPath = "/models/";
          if (env.backends.onnx.wasm) {
            env.backends.onnx.wasm.wasmPaths = "/vendor/matching/";
            env.backends.onnx.wasm.numThreads = 1;
          }
          encoder = (await pipeline("feature-extraction", ENCODER.id, {
            dtype: ENCODER.dtype,
            device: "wasm",
            progress_callback: (progress) => {
              if (
                progress.status === "progress" &&
                progress.file?.endsWith(".onnx")
              )
                channel.postMessage({
                  type: "progress",
                  message: `Loading the matching model · ${Math.round(progress.progress)}%`,
                });
            },
          })) as FeatureExtractionPipeline;
          engine = "semantic";
        } catch (error) {
          if (process.env.NODE_ENV === "development")
            diagnostic = String(error);
          encoder = null;
          engine = "lexical";
          warning =
            "The meaning-based model couldn’t load. Using private on-device word matching instead.";
        }
      if (!documents.some((doc) => doc.vector.length))
        warning =
          "The alumni index is being prepared. Using private word matching for now; refresh the network in a moment.";
      channel.postMessage({
        id: message.id,
        type: "ready",
        engine,
        warning,
        diagnostic,
        loadMs: performance.now() - started,
      });
    })();
  } else {
    if (queued) channel.postMessage({ id: queued.id, type: "cancelled" });
    queued = message;
    void runLatest();
  }
};
