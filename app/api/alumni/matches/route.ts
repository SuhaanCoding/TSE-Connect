import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { directoryCorpus, publicDirectoryProfile } from "@/lib/directory";
import { matchingProfiles, profileTokens } from "@/lib/profile-matching";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: viewer, error: viewerError } = await supabase
    .from("alumni")
    .select("*")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (viewerError)
    return NextResponse.json(
      { error: "Couldn’t load your profile." },
      { status: 500 },
    );
  const hasProfileText = !!profileTokens(
    [viewer?.bio || "", ...(viewer?.keywords || [])].join(" "),
  ).length;
  const optedIn = viewer?.opt_status === "opted_in";
  if (!hasProfileText || !optedIn)
    return NextResponse.json({ data: [], hasProfileText, optedIn });
  const { data, error } = await directoryCorpus(supabase);
  if (error)
    return NextResponse.json(
      { error: "Couldn’t load matches." },
      { status: 500 },
    );
  const parsedLimit = Number(
    new URL(request.url).searchParams.get("limit") || 3,
  );
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(100, Math.floor(parsedLimit)))
    : 3;
  const ranked = matchingProfiles(viewer, data, data.length);
  const matches = ranked.slice(0, limit).map((profile) =>
    // Cards need the reasons, not every person's complete scraped text.
    publicDirectoryProfile(
      { ...profile, linkedin_about: null, linkedin_background: null },
      true,
    ),
  );
  return NextResponse.json({
    data: matches,
    total: ranked.length,
    hasProfileText,
    optedIn,
  });
}
