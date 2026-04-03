"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@supabase/supabase-js";
import { isUcsdEmail } from "@/lib/utils";

interface InAppBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: string | null;
}

export default function InAppBrowserModal({
  isOpen,
  onClose,
  platform,
}: InAppBrowserModalProps) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) return;

    if (isUcsdEmail(trimmed)) {
      setError(
        "UCSD emails expire after graduation. Please use a personal email."
      );
      return;
    }

    setSending(true);
    // Use implicit flow (not PKCE) so the magic link works when opened
    // in the system browser, which won't have the PKCE code_verifier
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { flowType: "implicit" } }
    );
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    setSending(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setSent(true);
  };

  const browserName = platform ?? "this app";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-24"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl max-w-md w-full p-6 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mail icon */}
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
        </div>

        {sent ? (
          <>
            <h2 className="font-heading font-bold text-xl text-center mb-2">
              Check your email
            </h2>
            <p className="text-text-secondary text-sm text-center mb-2">
              We sent a sign-in link to{" "}
              <span className="text-foreground font-medium">{email}</span>
            </p>
            <p className="text-text-muted text-xs text-center mb-5">
              Tap the link in the email to sign in. It will open in your
              browser automatically.
            </p>
            <button
              onClick={onClose}
              className="w-full text-sm text-text-secondary hover:text-foreground transition-colors cursor-pointer"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h2 className="font-heading font-bold text-xl text-center mb-2">
              Sign in with email
            </h2>
            <p className="text-text-secondary text-sm text-center mb-5">
              Google sign-in isn&apos;t available in {browserName}.
              We&apos;ll send you a sign-in link instead.
            </p>

            <form onSubmit={handleSendLink} className="space-y-3">
              <Input
                type="email"
                placeholder="you@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={error ?? undefined}
                autoFocus
                required
              />
              <Button
                type="submit"
                loading={sending}
                className="w-full rounded-lg"
                size="md"
              >
                Send Sign-in Link
              </Button>
            </form>

            <button
              onClick={onClose}
              className="mt-4 w-full text-sm text-text-secondary hover:text-foreground transition-colors cursor-pointer"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
