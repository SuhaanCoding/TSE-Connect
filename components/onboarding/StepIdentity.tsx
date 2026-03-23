"use client";

import { useState, useEffect, useCallback } from "react";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import { debounce } from "@/lib/utils";

interface SearchResult {
  id: string;
  full_name: string;
  graduation_year: string | null;
  current_company: string | null;
  current_role: string | null;
}

interface StepIdentityProps {
  googleName: string;
  onClaim: (alumniId: string) => Promise<boolean>;
}

export default function StepIdentity({ googleName, onClaim }: StepIdentityProps) {
  const [suggestedMatch, setSuggestedMatch] = useState<SearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNotFound, setShowNotFound] = useState(false);

  // Load initial data: try auto-match + load all results
  useEffect(() => {
    async function init() {
      try {
        // Try auto-match with Google name
        const matchRes = await fetch(
          `/api/alumni/search?q=${encodeURIComponent(googleName)}`
        );
        const matchData = await matchRes.json();

        if (matchData.data && matchData.data.length === 1) {
          setSuggestedMatch(matchData.data[0]);
        }

        // Load all unclaimed profiles
        const allRes = await fetch("/api/alumni/search?q=");
        const allData = await allRes.json();
        setSearchResults(allData.data || []);
      } catch {
        // Silently fail, user can still search
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [googleName]);

  const searchAlumni = useCallback(
    debounce(async (query: string) => {
      const res = await fetch(
        `/api/alumni/search?q=${encodeURIComponent(query)}`
      );
      const { data } = await res.json();
      setSearchResults(data || []);
    }, 300),
    []
  );

  useEffect(() => {
    if (!loading) {
      searchAlumni(searchQuery);
    }
  }, [searchQuery, loading, searchAlumni]);

  const handleClaim = async (alumniId: string) => {
    // Prevent double-click
    if (claiming) return;
    setClaiming(alumniId);
    setError(null);
    const success = await onClaim(alumniId);
    if (!success) {
      // Error is now set by OnboardingFlow via setError
    }
    setClaiming(null);
  };

  if (showNotFound) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-heading font-bold text-2xl md:text-3xl tracking-tight">
            We couldn&apos;t find you
          </h2>
          <p className="mt-3 text-text-secondary leading-relaxed">
            Your name isn&apos;t in our TSE member directory yet.
            This could be because our records haven&apos;t been updated.
          </p>
        </div>

        <Card className="space-y-3">
          <p className="text-sm font-medium">Need help?</p>
          <p className="text-sm text-text-muted">
            Please reach out to{" "}
            <a
              href="mailto:suhaankhurana@gmail.com"
              className="text-accent hover:text-accent-light transition-colors"
            >
              suhaankhurana@gmail.com
            </a>{" "}
            and we&apos;ll get you added to the network.
          </p>
        </Card>

        <button
          onClick={() => setShowNotFound(false)}
          className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          Back to search
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-2xl md:text-3xl tracking-tight">
          Find your profile
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Select your name from the TSE member directory to claim your profile.
        </p>
      </div>

      {/* Suggested match */}
      {suggestedMatch && !searchQuery.trim() && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-accent uppercase tracking-wider">
            Suggested match
          </p>
          <Card
            hoverable
            className={`cursor-pointer flex items-center justify-between border-accent/30 ${
              claiming === suggestedMatch.id ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={() => handleClaim(suggestedMatch.id)}
          >
            <div>
              <p className="font-heading font-semibold text-sm">
                {suggestedMatch.full_name}
              </p>
              {(suggestedMatch.current_role || suggestedMatch.current_company) && (
                <p className="text-xs text-text-secondary">
                  {suggestedMatch.current_role}
                  {suggestedMatch.current_role && suggestedMatch.current_company && " @ "}
                  {suggestedMatch.current_company}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {suggestedMatch.graduation_year && (
                <span className="text-xs text-text-muted">
                  {suggestedMatch.graduation_year}
                </span>
              )}
              {claiming === suggestedMatch.id && (
                <svg className="animate-spin h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Search input */}
      <Input
        id="name-search"
        placeholder="Search by name..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Results list */}
      <div className="max-h-64 overflow-y-auto space-y-2">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-surface border border-border animate-pulse" />
            ))}
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-text-muted text-sm">No matching profiles found.</p>
          </div>
        ) : (
          searchResults
            .filter((r) => r.id !== suggestedMatch?.id || searchQuery.trim())
            .map((result) => (
              <Card
                key={result.id}
                hoverable
                className={`cursor-pointer flex items-center justify-between ${
                  claiming === result.id ? "opacity-60 pointer-events-none" : ""
                }`}
                onClick={() => handleClaim(result.id)}
              >
                <div>
                  <p className="font-medium text-sm">{result.full_name}</p>
                  {(result.current_role || result.current_company) && (
                    <p className="text-xs text-text-muted">
                      {result.current_role}
                      {result.current_role && result.current_company && " @ "}
                      {result.current_company}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {result.graduation_year && (
                    <span className="text-xs text-text-muted">
                      {result.graduation_year}
                    </span>
                  )}
                  {claiming === result.id && (
                    <svg className="animate-spin h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                </div>
              </Card>
            ))
        )}
      </div>

      <button
        onClick={() => setShowNotFound(true)}
        className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
      >
        I can&apos;t find my name
      </button>
    </div>
  );
}
