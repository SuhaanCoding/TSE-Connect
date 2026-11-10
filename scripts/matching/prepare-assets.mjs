import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const manifest = JSON.parse(
  await fs.readFile("data/matching-model-manifest.json", "utf8"),
);
const root = "public/models/minilm-l6-v2-q8";
for (const file of manifest.files) {
  const destination = path.join(root, file.path);
  let bytes;
  try {
    bytes = await fs.readFile(destination);
  } catch {}
  if (
    !bytes ||
    createHash("sha256").update(bytes).digest("hex") !== file.sha256
  ) {
    const response = await fetch(
      `https://huggingface.co/${manifest.model}/resolve/${manifest.revision}/${file.path}`,
    );
    if (!response.ok) throw Error(`Model download failed: ${file.path}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw Error("Model checksum mismatch");
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  }
}
await fs.mkdir("public/vendor/matching", { recursive: true });
for (const file of [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
])
  await fs.copyFile(
    path.join("node_modules/onnxruntime-web/dist", file),
    path.join("public/vendor/matching", file),
  );
await fs.copyFile(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "public/vendor/matching/pdf.worker.min.mjs",
);
await fs.copyFile(
  "node_modules/@huggingface/transformers/LICENSE",
  path.join(root, "LICENSE"),
);
await fs.writeFile(
  path.join(root, "ATTRIBUTION.txt"),
  `${manifest.model}\nRevision: ${manifest.revision}\nLicense: Apache-2.0\nhttps://huggingface.co/${manifest.model}\n`,
);
console.log(
  "Pinned matching model, local inference runtime and PDF worker are ready.",
);
