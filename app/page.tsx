import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/landing/Hero";
import LogoMarquee from "@/components/landing/LogoMarquee";
import Stats from "@/components/landing/Stats";
import HowItWorks from "@/components/landing/HowItWorks";
import BottomCTA from "@/components/landing/BottomCTA";
import { getCachedUser, getCachedAlumniProfile } from "@/lib/supabase/cached";

export default async function Home() {
  const user = await getCachedUser();

  let isOnboarded = false;

  if (user) {
    const alumni = await getCachedAlumniProfile(user.id);
    isOnboarded = !!(alumni && alumni.opt_status !== "not_confirmed");

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
