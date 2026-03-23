"use client";

import Link from "next/link";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

interface HeroProps {
  isSignedIn: boolean;
  isOnboarded: boolean;
}

export default function Hero({ isSignedIn, isOnboarded }: HeroProps) {
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
    <section className="relative min-h-[30vh] flex items-center justify-center overflow-hidden pt-24 pb-16 md:pt-32 md:pb-20">
      {/* Dot grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #FAFAF8 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Subtle radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent/4 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt="TSE"
          className="h-14 md:h-16 w-auto mx-auto mb-6 animate-fade-in-up opacity-90"
        />
        <h1 className="font-heading font-black text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight leading-[1] animate-fade-in-up">
          Your TSE network,
          <br />
          one click away
        </h1>

        <p
          className="mt-6 text-base md:text-lg text-text-secondary max-w-xl mx-auto leading-relaxed animate-fade-in-up"
          style={{ animationDelay: "100ms" }}
        >
          Find TSE alumni across big tech, defense, quant firms, AI startups,
          and more. Get referrals, career advice, and introductions — from
          people across all expertise and industries.
        </p>

        <div
          className="mt-8 flex flex-col items-center gap-3 animate-fade-in-up"
          style={{ animationDelay: "200ms" }}
        >
          {isSignedIn ? (
            isOnboarded ? (
              <Link href="/directory">
                <Button size="lg" className="rounded-full px-10">
                  Go to Directory
                </Button>
              </Link>
            ) : (
              <Link href="/onboarding">
                <Button size="lg" className="rounded-full px-10">
                  Complete Setup
                </Button>
              </Link>
            )
          ) : (
            <>
              <Button
                size="lg"
                onClick={handleSignIn}
                className="rounded-full px-10"
              >
                Join the Network
              </Button>
              <button
                onClick={handleSignIn}
                className="text-sm text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              >
                Already a member? Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
