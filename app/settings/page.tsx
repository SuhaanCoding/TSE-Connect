import { redirect } from "next/navigation";
import { getCachedUser, getCachedAlumniProfile } from "@/lib/supabase/cached";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import EditProfile from "@/components/profile/EditProfile";

export default async function SettingsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/");

  const alumni = await getCachedAlumniProfile(user.id);
  if (!alumni) redirect("/onboarding");

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16 px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="font-heading font-bold text-3xl tracking-tight mb-8">
            Settings
          </h1>
          <EditProfile alumni={alumni} />
        </div>
      </main>
      <Footer />
    </>
  );
}
