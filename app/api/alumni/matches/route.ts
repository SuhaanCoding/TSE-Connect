import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { directoryCorpus, publicDirectoryProfile } from "@/lib/directory";
import { profileTokens } from "@/lib/profile-matching";
import { cleanMatchText, profileDocuments } from "@/lib/matching/documents";
import { ENCODER } from "@/lib/matching/config";
import { indexPage } from "@/lib/matching/page.server";
import { scheduleMatchingRefresh } from "@/lib/matching/schedule.server";
import {
  matchingOriginAllowed,
  parseMatchInput,
  serverMatch,
} from "@/lib/matching/server";
export const maxDuration = 300;
export const runtime = "nodejs";
import {
  networkRanking,
  parseNetworkFilters,
  chooseDiscovery,
  uniqueNetworkProfiles,
  companySignals,
  COMPANY_CATEGORIES,
} from "@/lib/network";

const activeMatching = new Set<string>();
const privateHeaders = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  const respond = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: privateHeaders });
  if (!matchingOriginAllowed(request))
    return respond({ error: "Open matching from TSE Connect." }, 403);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return respond({ error: "Sign in again to load your network." }, 401);
  const { data: viewer, error: viewerError } = await supabase
    .from("alumni")
    .select("*")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (viewerError)
    return respond({ error: "Couldn’t load your profile. Try again." }, 500);
  if (!viewer || viewer.opt_status === "not_confirmed")
    return respond(
      { error: "Complete your profile to explore the network." },
      403,
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return respond({ error: "Choose a valid matching request." }, 415);
  let input;
  try {
    // Bound bytes before JSON parsing, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader)
      return respond({ error: "Choose experience or a goal to match." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 256 * 1024) {
          await reader.cancel();
          return respond({ error: "Use 30,000 characters or fewer." }, 413);
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    input = parseMatchInput(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    return respond(
      {
        error:
          "Check your experience (30,000 characters maximum), goal (600), and search (200).",
      },
      400,
    );
  }
  // Bound CPU admission per warm instance. No resume or query is shared between requests.
  if (activeMatching.size >= 2 || activeMatching.has(user.id))
    return NextResponse.json(
      { error: "Matching is busy. Try again in a moment." },
      { status: 429, headers: { ...privateHeaders, "Retry-After": "2" } },
    );
  activeMatching.add(user.id);
  try {
    const { data, error } = await directoryCorpus(supabase);
    if (error)
      return respond({ error: "Couldn’t load your network. Try again." }, 500);
    if (request.signal.aborted)
      return respond({ error: "Matching cancelled." }, 499);
    const pool = uniqueNetworkProfiles(viewer, data);
    const result = await serverMatch(viewer, pool, input, {
      loadIndex: async (profiles) => {
        const { indexForVisibleProfiles } = await import(
          "@/lib/matching/cache.server"
        );
        return indexForVisibleProfiles(profiles);
      },
      encode: async (documents) => {
        let module;
        try {
          module = await import("@/lib/matching/encoder.server");
        } catch (error) {
          // Module setup has no access to the query. Only dependency/path errors are logged.
          console.warn(
            "TSE matching runtime import failed",
            error instanceof Error
              ? error.message.slice(0, 800)
              : "Unknown runtime import error",
          );
          throw error;
        }
        return module.encodeDocuments(documents);
      },
    });
    return respond(result);
  } catch {
    // Never log a request body, private text or an inference error containing input.
    return respond(
      {
        error: "Couldn’t finish matching. Try again or use standard matching.",
      },
      503,
    );
  } finally {
    activeMatching.delete(user.id);
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in again to load your network." },
      { status: 401 },
    );
  const { data: viewer, error: viewerError } = await supabase
    .from("alumni")
    .select("*")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (viewerError)
    return NextResponse.json(
      { error: "Couldn’t load your profile. Try again." },
      { status: 500 },
    );
  if (!viewer || viewer.opt_status === "not_confirmed")
    return NextResponse.json(
      { error: "Complete your profile to explore the network." },
      { status: 403 },
    );
  const { data, error } = await directoryCorpus(supabase);
  if (error)
    return NextResponse.json(
      { error: "Couldn’t load your network. Try again." },
      { status: 500 },
    );
  const params = new URL(request.url).searchParams,
    filters = parseNetworkFilters(params),
    mode = params.get("mode");
  const pool = uniqueNetworkProfiles(viewer, data);
  if (mode === "semantic") {
    const { indexForVisibleProfiles } = await import(
      "@/lib/matching/cache.server"
    );
    try {
      const wordsOnly = params.get("lexical") === "1";
      const index = wordsOnly
        ? {
            documents: pool
              .flatMap(profileDocuments)
              .map((doc) => ({ ...doc, vector: "" })),
            ready: 0,
            modelVersion: ENCODER.version,
            indexUpdatedAt: null,
          }
        : await indexForVisibleProfiles(pool);
      const paged = params.get("format") === "paged-v1";
      const offset = Number(params.get("offset") || 0);
      const chunk = paged
        ? indexPage(index.documents, offset, params.get("revision"))
        : null;
      if (chunk && "error" in chunk)
        return NextResponse.json(
          { error: chunk.error },
          {
            status: chunk.status,
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      const cachedIds = new Set(
        index.documents.filter((doc) => doc.vector).map((doc) => doc.profileId),
      );
      const missing = pool
        .filter(
          (profile) =>
            profileDocuments(profile).length && !cachedIds.has(profile.id),
        )
        .slice(0, 20)
        .map((profile) => profile.id);
      if (!wordsOnly && offset === 0 && missing.length)
        scheduleMatchingRefresh(missing);
      const all =
        paged && offset > 0
          ? []
          : networkRanking(
              viewer,
              pool,
              parseNetworkFilters(new URLSearchParams()),
            );
      return NextResponse.json(
        {
          data: all.map((profile) =>
            publicDirectoryProfile(
              { ...profile, linkedin_about: null, linkedin_background: null },
              viewer.opt_status === "opted_in",
            ),
          ),
          documents: chunk ? chunk.documents : index.documents,
          ...(chunk || {}),
          total: all.length,
          poolCount: all.length,
          viewer: {
            id: viewer.id,
            name: viewer.full_name,
            optedIn: viewer.opt_status === "opted_in",
            hasProfileText: !!(viewer.bio || viewer.keywords?.length),
            graduation_year: viewer.graduation_year,
            context: cleanMatchText(
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
            ),
          },
          modelVersion: index.modelVersion,
          semanticReady: index.ready,
          indexUpdatedAt: index.indexUpdatedAt,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch {
      return NextResponse.json(
        {
          error:
            "Couldn’t prepare on-device matching. Try again, or use standard matching.",
        },
        { status: 503 },
      );
    }
  }
  const ranked = networkRanking(
    viewer,
    pool,
    mode === "shortlist"
      ? {
          ...filters,
          categories: [],
          companies: [],
          year: "",
          optedOnly: false,
          query: "",
        }
      : filters,
  );
  const total = ranked.length,
    pages = Math.max(1, Math.ceil(total / 12));
  const number = Number(params.get("page") || 1);
  const page = Math.max(
    1,
    Math.min(pages, Number.isFinite(number) ? Math.floor(number) : 1),
  );
  const selected =
    mode === "shortlist"
      ? ranked.filter((profile) =>
          params.getAll("id").slice(0, 3).includes(profile.id),
        )
      : mode === "smart" || mode === "wildcard"
        ? chooseDiscovery(ranked, 3, params.getAll("skip").slice(0, 1000), mode)
        : ranked.slice((page - 1) * 12, page * 12);
  const optedIn = viewer.opt_status === "opted_in";
  const employerNames = [
    ...new Set(
      pool.flatMap((profile) => [
        ...(filters.scope !== "past" && profile.current_company
          ? [profile.current_company]
          : []),
        ...(filters.scope !== "current" ? profile.past_companies || [] : []),
      ]),
    ),
  ];
  const taggedNames = new Set(
    pool.flatMap((profile) =>
      companySignals(profile, filters.scope).map((signal) => signal.company),
    ),
  );

  return NextResponse.json(
    {
      data: selected.map((profile) =>
        publicDirectoryProfile(
          { ...profile, linkedin_about: null, linkedin_background: null },
          optedIn,
        ),
      ),
      total,
      page,
      pages,
      poolCount: pool.length,
      companyCoverage: {
        tagged: taggedNames.size,
        total: employerNames.length,
      },
      viewer: {
        id: viewer.id,
        name: viewer.full_name,
        optedIn,
        hasProfileText: !!profileTokens(
          [viewer.bio, ...(viewer.keywords || [])].filter(Boolean).join(" "),
        ).length,
      },
      facets: COMPANY_CATEGORIES.map((category) => ({
        id: category.id,
        count: pool.filter((profile) =>
          companySignals(profile, filters.scope).some(
            (signal) => signal.category === category.id,
          ),
        ).length,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
