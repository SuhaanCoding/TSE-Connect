"use client";

import Button from "@/components/ui/Button";
import InAppBrowserModal from "@/components/ui/InAppBrowserModal";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";

export default function SignInButton({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const { handleSignIn, showBrowserModal, detectedPlatform, closeBrowserModal } =
    useGoogleSignIn();

  return (
    <>
      <Button size={size} variant="secondary" onClick={handleSignIn}>
        Sign In
      </Button>
      <InAppBrowserModal
        isOpen={showBrowserModal}
        onClose={closeBrowserModal}
        platform={detectedPlatform}
      />
    </>
  );
}
