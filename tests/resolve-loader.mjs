import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
// Test-only resolution for the same @/ aliases Next.js resolves in production.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers")
    return nextResolve("next/headers.js", context);
  if (specifier.startsWith("@/"))
    return {
      url: new URL(`${specifier.slice(2)}.ts`, root).href,
      shortCircuit: true,
    };
  if (specifier.startsWith(".") && context.parentURL?.startsWith(root.href)) {
    const path = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(path)))
      return { url: path.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
