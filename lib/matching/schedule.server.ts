import { after } from "next/server";
export function scheduleMatchingRefresh(ids?: string[]) {
  after(async () => {
    try {
      const { refreshMatchingProfiles } = await import("./cache.server");
      await refreshMatchingProfiles(ids);
    } catch {
      console.error(
        "Background matching index refresh failed; existing matching remains available.",
      );
    }
  });
}
