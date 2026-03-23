import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/landing/Hero";
import LogoMarquee from "@/components/landing/LogoMarquee";
import Stats from "@/components/landing/Stats";
import HowItWorks from "@/components/landing/HowItWorks";
import BottomCTA from "@/components/landing/BottomCTA";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isOnboarded = false;

  if (user) {
    const { data: alumni } = await supabase
      .from("alumni")
      .select("opt_status")
      .eq("auth_id", user.id)
      .maybeSingle();

    isOnboarded = !!(alumni && alumni.opt_status !== "not_confirmed");

    // Redirect authenticated + onboarded users straight to directory
    if (isOnboarded) {
      redirect("/directory");
    }
  }

  return (
    <>
      <Navbar />
      <main className="pt-14">
        <Hero isSignedIn={!!user} isOnboarded={isOnboarded} />
        <LogoMarquee />
        <Stats />
        <HowItWorks />
        <BottomCTA isSignedIn={!!user} isOnboarded={isOnboarded} />
      </main>
      <Footer />
    </>
  );
}
