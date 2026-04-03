"use client";

import Link from "next/link";
import Button from "@/components/ui/Button";
import InAppBrowserModal from "@/components/ui/InAppBrowserModal";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";

interface BottomCTAProps {
  isSignedIn: boolean;
  isOnboarded: boolean;
}

export default function BottomCTA({ isSignedIn, isOnboarded }: BottomCTAProps) {
  const { handleSignIn, showBrowserModal, detectedPlatform, closeBrowserModal } =
    useGoogleSignIn();

  return (
    <>
    <InAppBrowserModal
      isOpen={showBrowserModal}
      onClose={closeBrowserModal}
      platform={detectedPlatform}
    />
    <section className="py-24">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="font-heading font-bold text-3xl md:text-4xl tracking-tight mb-6">
          Your network is waiting
        </h2>
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
          <Button
            size="lg"
            onClick={handleSignIn}
            className="rounded-full px-10"
          >
            Join the Network
          </Button>
        )}
      </div>
    </section>
    </>
  );
}
