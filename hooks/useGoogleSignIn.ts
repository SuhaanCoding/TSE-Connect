"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { detectInAppBrowser } from "@/lib/inAppBrowser";

export function useGoogleSignIn() {
  const [showBrowserModal, setShowBrowserModal] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);

  const handleSignIn = async () => {
    const { isInApp, platform } = detectInAppBrowser();

    if (isInApp) {
      setDetectedPlatform(platform);
      setShowBrowserModal(true);
      return;
    }

    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const closeBrowserModal = () => {
    setShowBrowserModal(false);
  };

  return { handleSignIn, showBrowserModal, detectedPlatform, closeBrowserModal };
}
