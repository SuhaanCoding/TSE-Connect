"use client";

import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export default function SignInButton({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const handleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <Button size={size} variant="secondary" onClick={handleSignIn}>
      Sign In
    </Button>
  );
}
