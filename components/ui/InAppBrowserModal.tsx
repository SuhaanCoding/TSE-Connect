"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { getPlatformInstructions } from "@/lib/inAppBrowser";

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
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: prompt user to copy manually
      window.prompt("Copy this link and open it in your browser:", window.location.href);
    }
  };

  const browserName = platform ? `${platform}'s in-app browser` : "this in-app browser";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl max-w-md w-full p-6 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* External link icon */}
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
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </div>
        </div>

        <h2 className="font-heading font-bold text-xl text-center mb-2">
          Open in Your Browser
        </h2>

        <p className="text-text-secondary text-sm text-center mb-5">
          Google sign-in isn&apos;t supported in {browserName}. Open this page
          in Safari or Chrome to continue.
        </p>

        <Button
          onClick={handleCopyLink}
          className="w-full rounded-lg mb-3"
          size="md"
        >
          {copied ? (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy Link
            </>
          )}
        </Button>

        <p className="text-text-muted text-xs text-center">
          {getPlatformInstructions(platform)}
        </p>

        <button
          onClick={onClose}
          className="mt-4 w-full text-sm text-text-secondary hover:text-foreground transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
}
