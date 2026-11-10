import { cleanMatchText, profileDocuments, queryDocuments } from "./documents";
import { rankHybrid, type VectorDocument } from "./hybrid";
import { unpackVector, type PackedDocument } from "./vectors";
import { ENCODER, RESUME_LIMITS } from "./config";
import { networkRanking, parseNetworkFilters } from "../network";
import { publicDirectoryProfile } from "../directory";
import type { Alumni } from "../types";

export interface MatchInput {
  text: string;
  goal: string;
  lookup: string;
  lexicalOnly: boolean;
}
export function matchingOriginAllowed(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Authenticated non-browser callers still pass normal access checks.
  try {
    const target = new URL(request.url);
    // Next's development URL can normalize 127.0.0.1 to localhost. The routed
    // Host header retains the actual origin the browser requested, including port.
    const host = request.headers.get("host");
    if (host) target.host = host;
    return new URL(origin).origin === target.origin;
  } catch {
    return false;
  }
}
export function parseMatchInput(value: unknown): MatchInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Choose experience or a goal to match.");
  const input = value as Record<string, unknown>;
  for (const [key, limit] of [
    ["text", RESUME_LIMITS.characters],
    ["goal", 600],
    ["lookup", 200],
  ] as const)
    if (
      input[key] !== undefined &&
      (typeof input[key] !== "string" || (input[key] as string).length > limit)
    )
      throw new Error(
        `Check your ${key === "text" ? "experience text (30,000 characters maximum)" : key === "goal" ? "goal (600 characters maximum)" : "search (200 characters maximum)"}.`,
      );
  if (input.lexicalOnly !== undefined && typeof input.lexicalOnly !== "boolean")
    throw new Error("Choose a valid matching mode.");
  return {
    text: cleanMatchText((input.text as string) || ""),
    goal: cleanMatchText((input.goal as string) || ""),
    lookup: cleanMatchText((input.lookup as string) || ""),
    lexicalOnly: input.lexicalOnly === true,
  };
}
interface Dependencies {
  loadIndex: (pool: Alumni[]) => Promise<{
    documents: PackedDocument[];
    ready: number;
    indexUpdatedAt: string | null;
  }>;
  encode: (
    documents: ReturnType<typeof queryDocuments>,
  ) => Promise<VectorDocument[]>;
}
/** The caller must authenticate and provide only the current RLS-visible, distinct roster. */
export async function serverMatch(
  viewer: Alumni,
  pool: Alumni[],
  input: MatchInput,
  dependencies: Dependencies,
) {
  let engine: "semantic" | "lexical" = "lexical";
  let warning = "";
  let ready = 0;
  let updatedAt: string | null = null;
  let documents: VectorDocument[] = pool
    .flatMap(profileDocuments)
    .map((doc) => ({ ...doc, vector: [] }));
  const visible = new Set(pool.map((profile) => profile.id));
  if (!input.lexicalOnly) {
    try {
      const index = await dependencies.loadIndex(pool);
      documents = index.documents
        .filter((doc) => visible.has(doc.profileId))
        .map((doc) => ({ ...doc, vector: unpackVector(doc.vector) }));
      ready = index.ready;
      updatedAt = index.indexUpdatedAt;
    } catch {
      warning =
        "Using word matching for now. Try deeper matching again shortly.";
    }
  }
  const context =
    input.text ||
    cleanMatchText(
      [
        viewer.bio,
        ...(viewer.keywords || []),
        ...(!viewer.bio && !viewer.keywords?.length
          ? [
              viewer.linkedin_about,
              viewer.linkedin_background,
              viewer.current_role,
            ]
          : []),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  const raw = queryDocuments(context, input.goal);
  let query = raw.map((doc) => ({ ...doc, vector: [] as number[] }));
  if (!input.lexicalOnly && documents.some((doc) => doc.vector.length)) {
    try {
      query = raw.length ? await dependencies.encode(raw) : [];
      engine = "semantic";
    } catch {
      warning =
        "Using word matching for now. Try deeper matching again shortly.";
    }
  } else if (!input.lexicalOnly && !warning) {
    warning = "The network is updating. Using word matching for now.";
  }
  const hits = rankHybrid(
    pool,
    documents,
    query,
    { method: engine === "semantic" ? "hybrid" : "bm25" },
    undefined,
    input.lookup,
  ).map((hit) => {
    if (!hit.evidence) return hit;
    // Only stored professional evidence leaves the server, never private query text or vectors.
    let text = hit.evidence.text;
    for (let i = 0; i < 2 && text.startsWith(hit.evidence.label + " "); i++)
      text = text.slice(hit.evidence.label.length + 1);
    text = text || hit.evidence.text;
    return { ...hit, evidence: { ...hit.evidence, text: text.slice(0, 191) } };
  });
  const data = networkRanking(
    viewer,
    pool,
    parseNetworkFilters(new URLSearchParams()),
  ).map((profile) =>
    publicDirectoryProfile(
      { ...profile, linkedin_about: null, linkedin_background: null },
      viewer.opt_status === "opted_in",
    ),
  );
  return {
    index: {
      data,
      poolCount: data.length,
      viewer: {
        id: viewer.id,
        name: viewer.full_name,
        optedIn: viewer.opt_status === "opted_in",
        hasProfileText: !!(viewer.bio || viewer.keywords?.length),
        graduation_year: viewer.graduation_year,
        context: "",
      },
      modelVersion: ENCODER.version,
      semanticReady: ready,
      indexUpdatedAt: updatedAt,
    },
    hits,
    engine,
    warning,
  };
}
export type ServerMatchResult = Awaited<ReturnType<typeof serverMatch>>;
