import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import DirectoryView from "@/components/directory/DirectoryView";

export default async function DirectoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // Fetch viewer's opt_status
  const { data: viewer } = await supabase
    .from("alumni")
    .select("opt_status")
    .eq("auth_id", user.id)
    .maybeSingle();

  // Must complete onboarding before accessing directory
  if (!viewer || viewer.opt_status === "not_confirmed") {
    redirect("/onboarding");
  }

  const viewerOptedIn = viewer.opt_status === "opted_in";

  // Fetch initial alumni data — ALL alumni
  const { data: alumni, count } = await supabase
    .from("alumni")
    .select("*", { count: "exact" })
    .order("full_name")
    .range(0, 23);

  // Sanitize: only hide contact_email, NOT linkedin (it's public)
  const sanitizedAlumni = (alumni || []).map((a) => {
    if (!viewerOptedIn) {
      return { ...a, contact_email: null, preferred_contact: "linkedin" };
    }
    return a;
  });

  // Fetch distinct years
  const { data: yearData } = await supabase
    .from("alumni")
    .select("graduation_year")
    .not("graduation_year", "is", null);

  // Fetch distinct current companies
  const { data: companyData } = await supabase
    .from("alumni")
    .select("current_company")
    .not("current_company", "is", null);

  // Fetch distinct past companies
  const { data: pastCompanyData } = await supabase
    .from("alumni")
    .select("past_companies")
    .not("past_companies", "eq", "{}");

  const years = [
    ...new Set(yearData?.map((r) => r.graduation_year).filter(Boolean)),
  ].sort((a, b) => b.localeCompare(a)) as string[];

  const currentCompanies = companyData?.map((r) => r.current_company).filter(Boolean) || [];

  // Flatten all past_companies arrays
  const pastCompanyNames = (pastCompanyData || [])
    .flatMap((r) => r.past_companies || [])
    .filter(Boolean);

  // Merge current + past, filter garbage data, deduplicate
  const isValidCompany = (name: string) => {
    if (!name || name.length < 3) return false;
    if (name.startsWith("#")) return false;
    if (/^\d/.test(name)) return false; // Starts with number
    if (/^[\d:]+/.test(name)) return false; // Time-like "8:00 AM"
    return true;
  };

  const companies = [
    ...new Set(
      [...currentCompanies, ...pastCompanyNames].filter(isValidCompany)
    ),
  ].sort() as string[];

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="font-heading font-bold text-3xl md:text-4xl tracking-tight">
              Alumni Directory
            </h1>
            <p className="mt-2 text-text-muted">
              Find TSE alumni at your target companies.
            </p>
          </div>

          <DirectoryView
            initialAlumni={sanitizedAlumni}
            initialCount={count || 0}
            years={years}
            companies={companies}
            viewerOptedIn={viewerOptedIn}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
