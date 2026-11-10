"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
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
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/alumni/matches?limit=100", { signal: controller.signal })
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="matches-heading"
            className="font-heading font-semibold text-xl"
          >
            People with shared interests
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Based on your bio and keywords, with more weight on specific shared
            interests.
          </p>
        </div>
        {result && result.data.length > 3 && !error && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls="profile-matches-list"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : `Show all ${result.data.length} matches`}
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={expanded ? "rotate-180" : ""}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </Button>
        )}
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
        <div
          id="profile-matches-list"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {(expanded ? result.data : result.data.slice(0, 3)).map(
            (profile, index) => (
              <AlumniCard
                key={profile.id}
                alumni={profile}
                index={index}
                viewerOptedIn={result.optedIn}
              />
            ),
          )}
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
      {result && result.data.length > 3 && !error && (
        <p role="status" className="text-xs text-text-muted">
          Showing {expanded ? result.data.length : 3} of {result.data.length}{" "}
          matches
        </p>
      )}
    </section>
  );
}
