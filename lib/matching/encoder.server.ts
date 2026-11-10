import path from "node:path";
import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import { ENCODER } from "./config";
import { fitTokenBudget, type MatchDocument } from "./documents";
import type { VectorDocument } from "./hybrid";
let encoder: Promise<FeatureExtractionPipeline> | null = null;
function getEncoder() {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = path.join(process.cwd(), "public/models/");
  return (encoder ??= (
    pipeline("feature-extraction", ENCODER.id, {
      dtype: ENCODER.dtype,
      device: "cpu",
    }) as Promise<FeatureExtractionPipeline>
  ).catch((error) => {
    encoder = null;
    throw error;
  }));
}
export async function encodeDocuments(
  documents: MatchDocument[],
): Promise<VectorDocument[]> {
  const pipe = await getEncoder();
  const expanded = fitTokenBudget(
    documents,
    (text) => pipe.tokenizer.encode(text).length,
    ENCODER.maxTokens,
  );
  const result: VectorDocument[] = [];
  for (let i = 0; i < expanded.length; i += 16) {
    const batch = expanded.slice(i, i + 16),
      output = await pipe(
        batch.map((doc) => doc.text),
        { pooling: "mean", normalize: true },
      ),
      vectors = output.tolist() as number[][];
    for (let j = 0; j < batch.length; j++)
      result.push({ ...batch[j], vector: vectors[j] });
  }
  return result;
}
