import { refreshMatchingProfiles } from "../../lib/matching/cache.server.ts";
const start = performance.now();
console.log({
  ...(await refreshMatchingProfiles()),
  durationMs: performance.now() - start,
});
