"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AlumniCard from "./AlumniCard";
import type { Alumni } from "@/lib/types";

export default function ProfileMatches() {
  const [result, setResult] = useState<{
    data: Alumni[];
    hasProfileText: boolean;
    optedIn: boolean;
  } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/alumni/matches", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Matches unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) setResult(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <section
      className="space-y-4"
      aria-labelledby="matches-heading"
      aria-busy={!result && !error}
    >
      <div>
        <h2 id="matches-heading" className="font-heading font-semibold text-xl">
          People with shared interests
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Your bio and keywords matched with alumni bios and LinkedIn
          backgrounds.
        </p>
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-border p-5 text-sm text-text-secondary"
        >
          Couldn’t load matches.{" "}
          <button
            onClick={() => {
              setError(false);
              setRetry((value) => value + 1);
            }}
            className="cursor-pointer rounded text-accent-light underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Try again
          </button>
        </div>
      ) : !result ? (
        <div
          className="flex min-h-28 items-center gap-2 rounded-xl border border-border p-5 text-sm text-text-muted"
          role="status"
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
          />{" "}
          Finding shared interests…
        </div>
      ) : result.data.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {result.data.map((profile, index) => (
            <AlumniCard
              key={profile.id}
              alumni={profile}
              index={index}
              viewerOptedIn={result.optedIn}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-5 text-sm text-text-secondary">
          <p>
            {!result.optedIn
              ? "Opt in to the network to find people with shared interests."
              : !result.hasProfileText
                ? "Add a bio or keywords to find alumni who share your interests."
                : "No shared interests yet. More matches will appear as alumni add bios and keywords."}
          </p>
          <Link
            href="/settings"
            className="mt-3 inline-block rounded text-accent-light hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Edit your profile →
          </Link>
        </div>
      )}
    </section>
  );
}
