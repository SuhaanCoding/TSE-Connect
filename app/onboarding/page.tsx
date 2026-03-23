import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: alumni } = await supabase
    .from("alumni")
    .select("*")
    .eq("auth_id", user.id)
    .maybeSingle();

  // Returning users who completed onboarding should use /settings instead
  const isReturning = !!(alumni && alumni.opt_status && alumni.opt_status !== "not_confirmed");
  if (isReturning) {
    redirect("/settings");
  }

  const googleName =
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? "";
  const loginEmail = user.email ?? "";

  return (
    <>
      <Navbar />
      <OnboardingFlow
        alumni={alumni}
        googleName={googleName}
        loginEmail={loginEmail}
        isReturning={false}
      />
    </>
  );
}
