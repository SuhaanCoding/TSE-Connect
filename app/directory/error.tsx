"use client";

import Button from "@/components/ui/Button";

export default function DirectoryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <h2 className="font-heading font-bold text-xl mb-2">
          Something went wrong
        </h2>
        <p className="text-text-muted text-sm mb-6">
          We couldn&apos;t load the directory. Please try again.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
