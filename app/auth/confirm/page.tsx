"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

export default function AuthConfirmPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleConfirm = async () => {
      // Create a client with implicit flow to detect session from URL hash
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { flowType: "implicit", detectSessionInUrl: true } }
      );

      // The implicit flow puts tokens in the URL hash (#access_token=...)
      // Supabase auto-detects them on init, then we can get the session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setError("Sign-in link expired or invalid. Please try again.");
        return;
      }

      // Now set the session in the SSR-compatible client via the callback route
      // by exchanging the refresh token for a proper server-side session
      const res = await fetch("/api/auth/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(data.redirectTo ?? "/onboarding");
      } else {
        setError("Something went wrong. Please try again.");
      }
    };

    handleConfirm();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center px-6">
        {error ? (
          <>
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <a
              href="/"
              className="text-accent hover:text-accent-light text-sm transition-colors"
            >
              Back to home
            </a>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-text-secondary text-sm">Signing you in...</p>
          </>
        )}
      </div>
    </div>
  );
}
