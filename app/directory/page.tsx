import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedAlumniProfile } from "@/lib/supabase/cached";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { publicDirectoryProfile } from "@/lib/directory";
import DirectoryView from "@/components/directory/DirectoryView";

export default async function DirectoryPage() {
  const user = await getCachedUser();
  if (!user) redirect("/");

  const viewer = await getCachedAlumniProfile(user.id);

  if (!viewer || viewer.opt_status === "not_confirmed") {
    redirect("/onboarding");
  }

  const viewerOptedIn = viewer.opt_status === "opted_in";

  // Parallelize ALL data queries
  const supabase = await createClient();
  const [alumniResult, yearResult, companyResult, pastResult] =
    await Promise.all([
      supabase
        .from("alumni")
        .select("*", { count: "exact" })
        .order("full_name")
        .range(0, 23),
      supabase
        .from("alumni")
        .select("graduation_year")
        .not("graduation_year", "is", null),
      supabase
        .from("alumni")
        .select("current_company")
        .not("current_company", "is", null),
      supabase
        .from("alumni")
        .select("past_companies")
        .not("past_companies", "eq", "{}"),
    ]);

  const { data: alumni, count } = alumniResult;

  // Sanitize contact info based on viewer opt status
  const sanitizedAlumni = (alumni || []).map((profile) =>
    publicDirectoryProfile(profile, viewerOptedIn),
  );

  // Process filter options
  const years = [
    ...new Set(yearResult.data?.map((r) => r.graduation_year).filter(Boolean)),
  ].sort((a, b) => b.localeCompare(a)) as string[];

  const currentCompanies =
    companyResult.data?.map((r) => r.current_company).filter(Boolean) || [];
  const pastCompanyNames = (pastResult.data || [])
    .flatMap((r) => r.past_companies || [])
    .filter(Boolean);

  const isValidCompany = (name: string) => {
    if (!name || name.length < 3) return false;
    if (name.startsWith("#")) return false;
    if (/^\d/.test(name)) return false;
    if (/^[\d:]+/.test(name)) return false;
    return true;
  };

  const companies = [
    ...new Set(
      [...currentCompanies, ...pastCompanyNames].filter(isValidCompany),
    ),
  ].sort() as string[];

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="font-heading font-bold text-3xl md:text-4xl tracking-tight">
              Alumni Directory
            </h1>
          </div>

          <Suspense>
            <DirectoryView
              initialAlumni={sanitizedAlumni}
              initialCount={count || 0}
              years={years}
              companies={companies}
              viewerOptedIn={viewerOptedIn}
            />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}
