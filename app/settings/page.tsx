import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import EditProfile from "@/components/profile/EditProfile";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: alumni } = await supabase
    .from("alumni")
    .select("*")
    .eq("auth_id", user.id)
    .single();

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
