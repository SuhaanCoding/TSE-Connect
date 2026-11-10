import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
const root = process.cwd();
const trace = resolve(
  root,
  ".next/server/app/api/alumni/matches/route.js.nft.json",
);
const files = new Set(
  JSON.parse(readFileSync(trace, "utf8")).files.map((file) =>
    resolve(dirname(trace), file),
  ),
);
const required = [
  "node_modules/onnxruntime-node/package.json",
  "node_modules/onnxruntime-node/dist/index.js",
  "node_modules/onnxruntime-common/package.json",
  "node_modules/onnxruntime-common/dist/cjs/index.js",
  "node_modules/onnxruntime-common/dist/cjs/package.json",
  "node_modules/onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node",
  "node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime.so.1",
  "public/models/minilm-l6-v2-q8/config.json",
  "public/models/minilm-l6-v2-q8/tokenizer.json",
  "public/models/minilm-l6-v2-q8/tokenizer_config.json",
  "public/models/minilm-l6-v2-q8/onnx/model_quantized.onnx",
].map((file) => resolve(root, file));
const missing = required.filter(
  (file) => !files.has(file) || !existsSync(file),
);
if (missing.length)
  throw new Error(
    "Server matching bundle is incomplete: " +
      missing.map((file) => relative(root, file)).join(", "),
  );
const gpu = [...files].filter((file) =>
  /onnxruntime_providers_(cuda|tensorrt)\.so$/.test(file),
);
if (gpu.length)
  throw new Error(
    "Unused GPU libraries must not enter the CPU matching function.",
  );
console.log(
  "Server matching bundle verified: model, JavaScript loaders and Linux CPU runtime.",
);
