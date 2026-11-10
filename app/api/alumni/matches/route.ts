import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { directoryCorpus, publicDirectoryProfile } from "@/lib/directory";
import { profileTokens } from "@/lib/profile-matching";
import { cleanMatchText, profileDocuments } from "@/lib/matching/documents";
import { scheduleMatchingRefresh } from "@/lib/matching/schedule.server";
export const maxDuration = 300;
import {
  networkRanking,
  parseNetworkFilters,
  chooseDiscovery,
  uniqueNetworkProfiles,
  companySignals,
  COMPANY_CATEGORIES,
} from "@/lib/network";

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
      const index = await indexForVisibleProfiles(pool);
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
      if (missing.length) scheduleMatchingRefresh(missing);
      const all = networkRanking(
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
          documents: index.documents,
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
