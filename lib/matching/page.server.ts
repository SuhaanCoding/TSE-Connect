import { createHash } from "node:crypto";
import type { PackedDocument } from "./vectors";
export const INDEX_PAGE_SIZE = 160;
/** A stable order and content revision prevent missing or mixed passages across requests. */
export function indexPage(
  documents: PackedDocument[],
  offset: number,
  expectedRevision: string | null,
) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > documents.length)
    return {
      error: "Couldn’t load that index page. Refresh the network.",
      status: 400,
    } as const;
  const sorted = [...documents].sort((a, b) => a.id.localeCompare(b.id));
  const revision = createHash("sha256")
    .update(JSON.stringify(sorted))
    .digest("hex");
  if (expectedRevision && revision !== expectedRevision)
    return {
      error:
        "Couldn’t finish loading because the network changed. Refresh the network and try again.",
      status: 409,
    } as const;
  return {
    documents: sorted.slice(offset, offset + INDEX_PAGE_SIZE),
    revision,
    documentsTotal: sorted.length,
    nextOffset:
      offset + INDEX_PAGE_SIZE < sorted.length
        ? offset + INDEX_PAGE_SIZE
        : null,
  };
}
