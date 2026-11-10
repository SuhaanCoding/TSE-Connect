// Model artifacts are pinned and served by this application. No resume is sent to a model provider.
export const ENCODER = {
  id: "minilm-l6-v2-q8",
  revision: "751bff37182d3f1213fa05d7196b954e230abad9",
  version: "minilm-751bff3-q8-mean-l2-chunks-v3-tf4.3.2",
  dimensions: 384,
  maxTokens: 256,
  dtype: "q8" as const,
};
export const RESUME_LIMITS = {
  bytes: 5 * 1024 * 1024,
  pages: 10,
  characters: 30000,
};
export const INDEX_LIMITS = {
  documentsPerProfile: 28,
  wordsPerChunk: 110,
  overlapWords: 16,
};
